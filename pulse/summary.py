"""Build the dashboard's data files from data/.

`build()` assembles everything; `write_all()` splits it into the files the
dashboard fetches, so a page loads only what it shows:

    data/summary.json         every project with its words, repo metadata,
                              latest health, headline stats and short
                              series. Overview, Projects, Activity,
                              Releases and Traffic need nothing else.
    data/projects/<id>.json   one project's full daily history, loaded by
                              its page.

Index shape (summary.json):
    {
      "generated_at": "YYYY-MM-DD",
      "owner": "jbouder",
      "groups": [{"id", "name"}],
      "sources": {"traffic": {"repos": N, "since": date|null},
                  "apps": {"workers": N, "collected": N, "since": date|null}},
      "activity": [{"date", "count"}],     # commits per day, every project,
                                           # the last 53 weeks, zero-filled
      "projects": [
        {"id", "name", "repo", "group", "featured", "tagline", "about",
         "stack": [str], "links": {name: url}, "workers": [str],
         "meta": {"description", "homepage", "created_at", "archived",
                  "license", "language",
                  "languages": [{"name", "color", "share"}],
                  "topics": [str], "default_branch", "total_commits",
                  "last_commit": {"sha", "date", "message"} | null,
                  "latest_release": {"tag", "date"} | null} | null,
         "health": {"date", "stars", "forks", "subscribers", "open_issues",
                    "open_prs", "merged_prs_30d", "issues_opened_30d",
                    "issues_closed_30d", "pushed_at"} | null,
         "stats": {"commits_30d", "commits_prev_30d", "commits_365d",
                   "active_days_30d", "first_commit", "last_commit",
                   "authors_30d", "stars_gained_30d",
                   "releases_90d",
                   "views_14d", "views_prev_14d", "unique_views_14d",
                   "clones_14d", "unique_clones_14d",
                   "requests_30d", "requests_prev_30d"},
         "weekly_commits": [{"date", "count"}],   # 26 Monday-dated weeks
         "recent_views": [{"date", "count"}],     # last 28 complete days, or []
         "recent_requests": [{"date", "count"}],  # last 30 complete days, or []
         "releases": [{"tag", "date", "prerelease"}]}   # newest first
      ]
    }

Project shape (projects/<id>.json):
    {"generated_at", "id",
     "commits": [{"date", "count"}],              # days with commits only
     "authors": [{"author", "commits", "last"}],  # most commits first
     "stars": [{"date", "stars"}],                # cumulative, dates that changed
     "health": [{"date", "stars", "open_issues", "open_prs"}],
     "traffic": [{"date", "views", "unique_views", "clones", "unique_clones"}],
     "requests": [{"date", "requests", "errors"}]}   # summed over its Workers

Rules:
- A number the upstream did not answer is null, never 0; the dashboard
  shows a dash.
- A "prev" value is null when collected data does not cover the whole
  previous window, so a source that started mid-way never reads as a surge.
- Traffic and requests windows end yesterday: today is still filling.

The TypeScript types in site/src/lib/data.ts mirror these shapes.
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

from . import store
from .config import Config, Project

INDEX_FILE = "summary.json"
PROJECTS_DIR = "projects"
ACTIVITY_WEEKS = 53
WEEKLY_WEEKS = 26

HEALTH_INTS = (
    "stars",
    "forks",
    "subscribers",
    "open_issues",
    "open_prs",
    "merged_prs_30d",
    "issues_opened_30d",
    "issues_closed_30d",
)


def build(cfg: Config, data_dir: Path, today: date) -> dict:
    projects = []
    details = {}
    activity: dict[str, int] = defaultdict(int)
    traffic_repos = 0
    traffic_since: str | None = None
    workers_collected = 0
    requests_since: str | None = None

    for p in cfg.projects:
        commit_rows = store.read(store.path_for(data_dir, "repos", "commits", p.repo))
        commits = _sum_by_date(commit_rows, "commits")
        for d, n in commits.items():
            activity[d] += n

        traffic = _traffic(data_dir, p.repo)
        if traffic:
            traffic_repos += 1
            traffic_since = _min(traffic_since, traffic[0]["date"])

        requests, collected = _requests(data_dir, p)
        workers_collected += collected
        if requests:
            requests_since = _min(requests_since, requests[0]["date"])

        health_rows = sorted(
            store.read(store.path_for(data_dir, "repos", "health", p.repo)),
            key=lambda r: r["date"],
        )
        stars = _stars(data_dir, p.repo)
        releases = _releases(data_dir, p.repo)

        projects.append(
            {
                "id": p.id,
                "name": p.name,
                "repo": p.repo,
                "group": p.group,
                "featured": p.featured,
                "tagline": p.tagline,
                "about": p.about,
                "stack": list(p.stack),
                "links": p.links,
                "workers": list(p.workers),
                "meta": _meta(data_dir, p.repo),
                "health": _health(health_rows),
                "stats": _stats(commit_rows, commits, stars, releases, traffic, requests, today),
                "weekly_commits": weekly(commits, today, WEEKLY_WEEKS),
                "recent_views": _recent(traffic, "views", today, 28),
                "recent_requests": _recent(requests, "requests", today, 30),
                "releases": releases,
            }
        )
        details[p.id] = {
            "generated_at": today.isoformat(),
            "id": p.id,
            "commits": [{"date": d, "count": commits[d]} for d in sorted(commits)],
            "authors": _authors(commit_rows),
            "stars": stars,
            "health": [
                {
                    "date": r["date"],
                    "stars": _int_or_none(r.get("stars")),
                    "open_issues": _int_or_none(r.get("open_issues")),
                    "open_prs": _int_or_none(r.get("open_prs")),
                }
                for r in health_rows
            ],
            "traffic": traffic,
            "requests": requests,
        }

    start = _week_start(today) - timedelta(weeks=ACTIVITY_WEEKS - 1)
    return {
        "index": {
            "generated_at": today.isoformat(),
            "owner": cfg.owner,
            "groups": [{"id": g.id, "name": g.name} for g in cfg.groups],
            "sources": {
                "traffic": {"repos": traffic_repos, "since": traffic_since},
                "apps": {
                    "workers": len(cfg.workers()),
                    "collected": workers_collected,
                    "since": requests_since,
                },
            },
            "activity": _fill(activity, start, today),
            "projects": projects,
        },
        "projects": details,
    }


def write_all(built: dict, data_dir: Path) -> list[Path]:
    written = [_write(data_dir / INDEX_FILE, built["index"])]
    out = data_dir / PROJECTS_DIR
    for pid, detail in built["projects"].items():
        written.append(_write(out / f"{pid}.json", detail))
    # A project removed from sources.yaml should not keep a stale page.
    if out.exists():
        for f in out.glob("*.json"):
            if f.stem not in built["projects"]:
                f.unlink()
    return written


def _write(path: Path, payload: dict) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n")
    return path


# ---- per project ------------------------------------------------------------


def _meta(data_dir: Path, repo: str) -> dict | None:
    path = data_dir / "repos" / "meta" / f"{store.slug(repo)}.json"
    return json.loads(path.read_text()) if path.exists() else None


def _health(rows: list[store.Row]) -> dict | None:
    if not rows:
        return None
    last = rows[-1]
    out: dict = {"date": last["date"], "pushed_at": last.get("pushed_at") or None}
    for col in HEALTH_INTS:
        out[col] = _int_or_none(last.get(col))
    return out


def _stats(
    commit_rows: list[store.Row],
    commits: dict[str, int],
    stars: list[dict],
    releases: list[dict],
    traffic: list[dict],
    requests: list[dict],
    today: date,
) -> dict:
    last30 = _window(today, 30)
    prev30 = _window(today - timedelta(days=30), 30)
    year = _window(today, 365)
    yesterday = today - timedelta(days=1)
    t14, tprev14 = _window(yesterday, 14), _window(yesterday - timedelta(days=14), 14)
    r30, rprev30 = _window(yesterday, 30), _window(yesterday - timedelta(days=30), 30)

    def total(series: dict[str, int], window: tuple[str, str]) -> int:
        return sum(n for d, n in series.items() if window[0] <= d <= window[1])

    views = {r["date"]: r for r in traffic}
    reqs = {r["date"]: r["requests"] for r in requests}
    first_view = traffic[0]["date"] if traffic else None
    first_req = requests[0]["date"] if requests else None

    def traffic_sum(col: str, window: tuple[str, str]) -> int:
        return sum(r[col] for d, r in views.items() if window[0] <= d <= window[1])

    return {
        "commits_30d": total(commits, last30),
        "commits_prev_30d": total(commits, prev30),
        "commits_365d": total(commits, year),
        "active_days_30d": sum(1 for d in commits if last30[0] <= d <= last30[1]),
        "first_commit": min(commits) if commits else None,
        "last_commit": max(commits) if commits else None,
        "authors_30d": len({r["author"] for r in commit_rows if r["date"] >= last30[0]}),
        "stars_gained_30d": _stars_gained(stars, today, 30),
        "releases_90d": sum(
            1 for r in releases if not r["prerelease"] and r["date"] >= _window(today, 90)[0]
        ),
        "views_14d": traffic_sum("views", t14) if traffic else None,
        "views_prev_14d": (
            traffic_sum("views", tprev14) if first_view and first_view <= tprev14[0] else None
        ),
        "unique_views_14d": traffic_sum("unique_views", t14) if traffic else None,
        "clones_14d": traffic_sum("clones", t14) if traffic else None,
        "unique_clones_14d": traffic_sum("unique_clones", t14) if traffic else None,
        "requests_30d": total(reqs, r30) if requests else None,
        "requests_prev_30d": (
            total(reqs, rprev30) if first_req and first_req <= rprev30[0] else None
        ),
    }


def _stars_gained(stars: list[dict], today: date, days: int) -> int | None:
    """Stars now minus stars at the start of the window (0 before the first star)."""
    if not stars:
        return None
    start = _window(today, days)[0]
    before = [s["stars"] for s in stars if s["date"] < start]
    return stars[-1]["stars"] - (before[-1] if before else 0)


def _stars(data_dir: Path, repo: str) -> list[dict]:
    rows = sorted(
        store.read(store.path_for(data_dir, "repos", "stars", repo)), key=lambda r: r["date"]
    )
    return [{"date": r["date"], "stars": int(r["stars"])} for r in rows if r.get("stars")]


def _releases(data_dir: Path, repo: str) -> list[dict]:
    out = [
        {"tag": r["tag"], "date": r["published_at"], "prerelease": r.get("prerelease") == "true"}
        for r in store.read(store.path_for(data_dir, "repos", "releases", repo))
        if r.get("published_at")
    ]
    out.sort(key=lambda r: (r["date"], r["tag"]), reverse=True)
    return out


def _traffic(data_dir: Path, repo: str) -> list[dict]:
    rows = store.read(store.path_for(data_dir, "repos", "traffic", repo))
    return [
        {
            "date": r["date"],
            "views": int(r["views"] or 0),
            "unique_views": int(r["unique_views"] or 0),
            "clones": int(r["clones"] or 0),
            "unique_clones": int(r["unique_clones"] or 0),
        }
        for r in sorted(rows, key=lambda r: r["date"])
    ]


def _requests(data_dir: Path, p: Project) -> tuple[list[dict], int]:
    """Daily requests summed over the project's Workers, and how many of its
    Workers have any data at all."""
    by_date: dict[str, list[int]] = {}
    collected = 0
    for script in p.workers:
        rows = store.read(store.path_for(data_dir, "apps", "requests", script))
        if rows:
            collected += 1
        for r in rows:
            acc = by_date.setdefault(r["date"], [0, 0])
            acc[0] += int(r["requests"] or 0)
            acc[1] += int(r["errors"] or 0)
    series = [{"date": d, "requests": v[0], "errors": v[1]} for d, v in sorted(by_date.items())]
    return series, collected


def _authors(rows: list[store.Row]) -> list[dict]:
    totals: dict[str, int] = defaultdict(int)
    last: dict[str, str] = {}
    for r in rows:
        totals[r["author"]] += int(r["commits"] or 0)
        last[r["author"]] = max(last.get(r["author"], ""), r["date"])
    return [
        {"author": a, "commits": n, "last": last[a]}
        for a, n in sorted(totals.items(), key=lambda kv: (-kv[1], kv[0]))
    ]


def _recent(series: list[dict], col: str, today: date, days: int) -> list[dict]:
    if not series:
        return []
    end = today - timedelta(days=1)
    start = end - timedelta(days=days - 1)
    values = {r["date"]: r[col] for r in series}
    first = series[0]["date"]
    out = []
    d = max(start, date.fromisoformat(first))
    while d <= end:
        out.append({"date": d.isoformat(), "count": values.get(d.isoformat(), 0)})
        d += timedelta(days=1)
    return out


# ---- series helpers ---------------------------------------------------------


def weekly(series: dict[str, int], today: date, weeks: int) -> list[dict]:
    """Monday-dated weekly sums for the last `weeks` weeks, this one included."""
    first = _week_start(today) - timedelta(weeks=weeks - 1)
    buckets = {(first + timedelta(weeks=i)).isoformat(): 0 for i in range(weeks)}
    for d, n in series.items():
        key = _week_start(date.fromisoformat(d)).isoformat()
        if key in buckets:
            buckets[key] += n
    return [{"date": d, "count": n} for d, n in buckets.items()]


def _fill(series: dict[str, int], start: date, end: date) -> list[dict]:
    out = []
    d = start
    while d <= end:
        out.append({"date": d.isoformat(), "count": series.get(d.isoformat(), 0)})
        d += timedelta(days=1)
    return out


def _sum_by_date(rows: list[store.Row], col: str) -> dict[str, int]:
    out: dict[str, int] = defaultdict(int)
    for r in rows:
        out[r["date"]] += int(r[col] or 0)
    return dict(out)


def _window(end: date, days: int) -> tuple[str, str]:
    """Inclusive ISO bounds of the `days` days ending on `end`."""
    return (end - timedelta(days=days - 1)).isoformat(), end.isoformat()


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _min(a: str | None, b: str) -> str:
    return b if a is None or b < a else a


def _int_or_none(value: str | None) -> int | None:
    return int(value) if value not in (None, "") else None
