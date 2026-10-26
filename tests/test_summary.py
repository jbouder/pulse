import json
from datetime import date

from pulse import store, summary
from pulse.config import Config, Group, Project

TODAY = date(2026, 10, 26)  # a Monday


def cfg(**kw) -> Config:
    project = Project(id="one", name="One", repo="me/one", group="apps", **kw)
    return Config(owner="me", groups=(Group("apps", "Apps"),), projects=(project,))


def put(data_dir, family, source, ref, columns, rows):
    store.upsert(store.path_for(data_dir, family, source, ref), columns, columns[:1], rows)


def commits(data_dir, rows):
    store.upsert(
        store.path_for(data_dir, "repos", "commits", "me/one"),
        ["date", "author", "commits"],
        ["date", "author"],
        rows,
    )


def test_empty_data_dir_builds_nulls_not_zeros(tmp_path):
    built = summary.build(cfg(), tmp_path, TODAY)
    p = built["index"]["projects"][0]
    assert p["meta"] is None and p["health"] is None
    assert p["stats"]["views_14d"] is None
    assert p["stats"]["requests_30d"] is None
    assert p["stats"]["stars_gained_30d"] is None
    assert p["recent_views"] == []
    assert len(p["weekly_commits"]) == summary.WEEKLY_WEEKS
    assert built["index"]["sources"]["apps"] == {"workers": 0, "collected": 0, "since": None}


def test_commit_windows_activity_and_authors(tmp_path):
    commits(
        tmp_path,
        [
            {"date": "2026-10-26", "author": "me", "commits": 3},
            {"date": "2026-10-26", "author": "you", "commits": 1},
            {"date": "2026-10-01", "author": "me", "commits": 2},
            {"date": "2026-09-20", "author": "me", "commits": 5},  # previous 30 days
            {"date": "2024-01-01", "author": "old", "commits": 9},  # outside the year
        ],
    )
    built = summary.build(cfg(), tmp_path, TODAY)
    st = built["index"]["projects"][0]["stats"]
    assert st["commits_30d"] == 6
    assert st["commits_prev_30d"] == 5
    assert st["commits_365d"] == 11
    assert st["active_days_30d"] == 2
    assert st["authors_30d"] == 2
    assert st["first_commit"] == "2024-01-01" and st["last_commit"] == "2026-10-26"

    weekly = built["index"]["projects"][0]["weekly_commits"]
    assert weekly[-1] == {"date": "2026-10-26", "count": 4}

    activity = built["index"]["activity"]
    assert activity[-1] == {"date": "2026-10-26", "count": 4}
    assert activity[0]["date"] == "2025-10-27"  # Monday, 53 weeks back

    detail = built["projects"]["one"]
    assert detail["authors"][0] == {"author": "me", "commits": 10, "last": "2026-10-26"}
    assert detail["commits"][0] == {"date": "2024-01-01", "count": 9}


def test_traffic_prev_window_needs_full_coverage(tmp_path):
    cols = ["date", "views", "unique_views", "clones", "unique_clones"]
    rows = [
        {
            "date": f"2026-10-{d:02d}",
            "views": 10,
            "unique_views": 2,
            "clones": 1,
            "unique_clones": 1,
        }
        for d in range(12, 26)
    ]
    put(tmp_path, "repos", "traffic", "me/one", cols, rows)
    st = summary.build(cfg(), tmp_path, TODAY)["index"]["projects"][0]["stats"]
    assert st["views_14d"] == 140
    assert st["unique_views_14d"] == 28
    assert st["views_prev_14d"] is None  # data starts inside the previous window

    rows.append(
        {"date": "2026-09-28", "views": 5, "unique_views": 1, "clones": 0, "unique_clones": 0}
    )
    put(tmp_path, "repos", "traffic", "me/one", cols, rows)
    st = summary.build(cfg(), tmp_path, TODAY)["index"]["projects"][0]["stats"]
    assert st["views_prev_14d"] == 5


def test_requests_sum_over_workers(tmp_path):
    cols = ["date", "requests", "errors"]
    put(
        tmp_path,
        "apps",
        "requests",
        "a",
        cols,
        [{"date": "2026-10-25", "requests": 7, "errors": 1}],
    )
    put(
        tmp_path,
        "apps",
        "requests",
        "b",
        cols,
        [{"date": "2026-10-25", "requests": 3, "errors": 0}],
    )
    built = summary.build(cfg(workers=("a", "b", "c")), tmp_path, TODAY)
    p = built["index"]["projects"][0]
    assert p["stats"]["requests_30d"] == 10
    assert built["projects"]["one"]["requests"] == [
        {"date": "2026-10-25", "requests": 10, "errors": 1}
    ]
    assert built["index"]["sources"]["apps"] == {
        "workers": 3,
        "collected": 2,
        "since": "2026-10-25",
    }


def test_stars_gained_and_releases(tmp_path):
    put(
        tmp_path,
        "repos",
        "stars",
        "me/one",
        ["date", "stars"],
        [{"date": "2026-01-01", "stars": 4}, {"date": "2026-10-20", "stars": 6}],
    )
    store.upsert(
        store.path_for(tmp_path, "repos", "releases", "me/one"),
        ["tag", "published_at", "prerelease"],
        ["tag"],
        [
            {"tag": "v1", "published_at": "2026-10-01", "prerelease": "false"},
            {"tag": "v2-rc", "published_at": "2026-10-10", "prerelease": "true"},
            {"tag": "v0", "published_at": "2025-01-01", "prerelease": "false"},
        ],
    )
    p = summary.build(cfg(), tmp_path, TODAY)["index"]["projects"][0]
    assert p["stats"]["stars_gained_30d"] == 2
    assert p["stats"]["releases_90d"] == 1
    assert [r["tag"] for r in p["releases"]] == ["v2-rc", "v1", "v0"]


def test_write_all_removes_stale_project_files(tmp_path):
    (tmp_path / "projects").mkdir()
    (tmp_path / "projects" / "gone.json").write_text("{}")
    summary.write_all(summary.build(cfg(), tmp_path, TODAY), tmp_path)
    assert sorted(f.name for f in (tmp_path / "projects").iterdir()) == ["one.json"]
    index = json.loads((tmp_path / "summary.json").read_text())
    assert index["owner"] == "me"
