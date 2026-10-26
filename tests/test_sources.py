from datetime import date

from pulse import store
from pulse.config import Config, Group, Project
from pulse.sources import cloudflare, github


def test_meta_of_graphql_node():
    node = {
        "description": "A thing",
        "homepageUrl": "",
        "createdAt": "2026-01-02T03:04:05Z",
        "isArchived": False,
        "licenseInfo": {"spdxId": "NOASSERTION", "name": "Other"},
        "primaryLanguage": {"name": "TypeScript", "color": "#3178c6"},
        "languages": {
            "totalSize": 400,
            "edges": [
                {"size": 300, "node": {"name": "TypeScript", "color": "#3178c6"}},
                {"size": 100, "node": {"name": "CSS", "color": None}},
            ],
        },
        "repositoryTopics": {"nodes": [{"topic": {"name": "retro"}}]},
        "latestRelease": None,
        "defaultBranchRef": {
            "name": "main",
            "target": {
                "oid": "abcdef0123",
                "committedDate": "2026-10-20T10:00:00Z",
                "messageHeadline": "fix: it",
                "history": {"totalCount": 42},
            },
        },
    }
    meta = github.meta_of(node)
    assert meta["homepage"] is None
    assert meta["created_at"] == "2026-01-02"
    assert meta["license"] == "Other"
    assert meta["languages"][0] == {"name": "TypeScript", "color": "#3178c6", "share": 0.75}
    assert meta["topics"] == ["retro"]
    assert meta["total_commits"] == 42
    assert meta["last_commit"] == {"sha": "abcdef0", "date": "2026-10-20", "message": "fix: it"}
    assert meta["latest_release"] is None


def test_meta_of_empty_repo():
    meta = github.meta_of({"defaultBranchRef": None, "languages": {"totalSize": 0, "edges": []}})
    assert meta["last_commit"] is None and meta["total_commits"] is None
    assert meta["languages"] == []


def test_commit_title_prefers_the_pull_request_title():
    assert (
        github.commit_title("Merge pull request #12 from me/feat-x", "Add the thing\n\nMore")
        == "Add the thing (#12)"
    )
    assert github.commit_title("Merge pull request #12 from me/feat-x", "") == (
        "Merge pull request #12 from me/feat-x"
    )
    assert github.commit_title("fix: it", "body") == "fix: it"
    # GitHub's cut of a long headline, carried on in the body.
    assert github.commit_title("feat: a long …", "…headline\n\nbody") == "feat: a long headline"
    assert (
        github.commit_title(
            "Merge pull request #221 from me/dependabot/npm_and_ya…",
            "…rn/vite-8\n\nBump vite to 8",
        )
        == "Bump vite to 8 (#221)"
    )
    # A squash title that already names its PR is not numbered twice.
    assert github.commit_title("Merge pull request #9 from me/x", "Docs (#8)") == "Docs (#8)"


def test_commit_author_skips_bots():
    assert github.commit_author({"author": {"login": "me", "type": "User"}}) == "me"
    assert github.commit_author({"author": {"login": "dependabot[bot]", "type": "Bot"}}) is None
    assert github.commit_author({"author": {"login": "invalid-email-address"}}) is None
    noreply = {
        "commit": {"author": {"email": "41898282+github-actions[bot]@users.noreply.github.com"}}
    }
    assert github.commit_author({"author": None, **noreply}) is None
    plain = {"author": None, "commit": {"author": {"email": "Me@Example.com"}}}
    assert github.commit_author(plain) == "email:me@example.com"


def test_per_script_sums_groups():
    groups = [
        {
            "sum": {"requests": 5, "errors": 1},
            "dimensions": {"date": "2026-10-01", "scriptName": "a"},
        },
        {
            "sum": {"requests": 2, "errors": 0},
            "dimensions": {"date": "2026-10-01", "scriptName": "a"},
        },
        {
            "sum": {"requests": 9, "errors": 0},
            "dimensions": {"date": "2026-10-02", "scriptName": "b"},
        },
        {"sum": {"requests": 1}, "dimensions": {"date": "2026-10-02"}},
    ]
    assert cloudflare.per_script(groups) == {
        "a": {"2026-10-01": (7, 1)},
        "b": {"2026-10-02": (9, 0)},
    }


def test_cloudflare_skips_without_credentials(tmp_path, monkeypatch):
    for var in ("CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_ANALYTICS_TOKEN", "CLOUDFLARE_API_TOKEN"):
        monkeypatch.delenv(var, raising=False)
    cfg = Config(
        owner="me",
        groups=(Group("apps", "Apps"),),
        projects=(Project(id="a", name="A", repo="me/a", group="apps", workers=("a",)),),
    )
    res = cloudflare.collect(cfg, tmp_path, date(2026, 10, 26))
    assert "not set" in res.notes["skipped"]
    assert res.artifacts == 1 and not res.errors
    assert not (tmp_path / "apps").exists()


def test_cloudflare_writes_zero_days(tmp_path, monkeypatch):
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "acct")
    monkeypatch.setenv("CLOUDFLARE_ANALYTICS_TOKEN", "tok")
    payload = {
        "data": {
            "viewer": {
                "accounts": [
                    {
                        "workersInvocationsAdaptive": [
                            {
                                "sum": {"requests": 4, "errors": 0},
                                "dimensions": {"date": "2026-10-25", "scriptName": "a"},
                            }
                        ]
                    }
                ]
            }
        }
    }
    monkeypatch.setattr(cloudflare, "post_json", lambda *a, **k: payload)
    cfg = Config(
        owner="me",
        groups=(Group("apps", "Apps"),),
        projects=(Project(id="a", name="A", repo="me/a", group="apps", workers=("a",)),),
    )
    res = cloudflare.collect(cfg, tmp_path, date(2026, 10, 26))
    assert res.artifacts == 1 and not res.errors
    rows = store.read(store.path_for(tmp_path, "apps", "requests", "a"))
    assert len(rows) == cloudflare.DAYS
    assert rows[-1] == {"date": "2026-10-25", "requests": "4", "errors": "0"}
    assert rows[0]["requests"] == "0"
