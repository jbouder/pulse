"""GitHub activity, health, releases and traffic for every project's repo.

Files under data/repos/, one per repo (`<owner>__<name>`):

    meta/<repo>.json    the repo as it is today: description, homepage,
                        languages, topics, license, created date, the
                        latest commit and the total commit count on the
                        default branch. Overwritten each run.
    health/<repo>.csv   one snapshot row per day: stars, forks, watchers,
                        open issues, open PRs, 30-day throughput, last push.
                        Fetched with meta in one GraphQL query for all repos.
    releases/<repo>.csv one row per release tag with its publish date.
    traffic/<repo>.csv  daily views and clones (unique too). GitHub keeps
                        only 14 days, so the history exists because we
                        snapshot it. Needs push access to the repo.
    stars/<repo>.csv    cumulative stars per date. Backfilled once from the
                        stargazers API, then kept current from health.
    commits/<repo>.csv  commits per (date, author) on the default branch,
                        bots excluded. Backfilled once, then refreshed from
                        the start of the latest month seen.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import date, timedelta
from pathlib import Path

from .. import store
from ..config import Config
from ..http import HttpError, get_json, github_headers, github_token, post_json
from . import CollectResult

log = logging.getLogger(__name__)

API = "https://api.github.com"
GRAPHQL = "https://api.github.com/graphql"
HEALTH_COLUMNS = [
    "date",
    "stars",
    "forks",
    "subscribers",
    "open_issues",
    "open_prs",
    "merged_prs_30d",
    "issues_opened_30d",
    "issues_closed_30d",
    "pushed_at",
]
RELEASE_COLUMNS = ["tag", "published_at", "prerelease"]
TRAFFIC_COLUMNS = ["date", "views", "unique_views", "clones", "unique_clones"]
STARS_COLUMNS = ["date", "stars"]
COMMIT_COLUMNS = ["date", "author", "commits"]
STAR_HEADERS = {"Accept": "application/vnd.github.star+json"}

# GraphQL aliases must be identifiers; one per repo, position-based.
REPO_FRAGMENT = """
%(alias)s: repository(owner: "%(owner)s", name: "%(name)s") {
  description homepageUrl createdAt pushedAt isArchived
  stargazerCount forkCount
  watchers { totalCount }
  issues(states: OPEN) { totalCount }
  pullRequests(states: OPEN) { totalCount }
  licenseInfo { spdxId name }
  primaryLanguage { name color }
  languages(first: 8, orderBy: {field: SIZE, direction: DESC}) {
    totalSize edges { size node { name color } }
  }
  repositoryTopics(first: 20) { nodes { topic { name } } }
  latestRelease { tagName publishedAt }
  defaultBranchRef {
    name
    target {
      ... on Commit { oid committedDate messageHeadline messageBody history { totalCount } }
    }
  }
}
%(alias)s_merged: search(type: ISSUE,
  query: "repo:%(repo)s is:pr is:merged merged:>=%(since)s") { issueCount }
%(alias)s_opened: search(type: ISSUE,
  query: "repo:%(repo)s is:issue created:>=%(since)s") { issueCount }
%(alias)s_closed: search(type: ISSUE,
  query: "repo:%(repo)s is:issue is:closed closed:>=%(since)s") { issueCount }
"""
BATCH = 10  # repos per GraphQL query; each costs 4 fields, keep well under limits


def collect(cfg: Config, data_dir: Path, today: date) -> CollectResult:
    result = CollectResult(source="github")
    repos = cfg.repos()
    if not repos:
        return result

    stars_today = _collect_health(repos, data_dir, today, result)
    _collect_releases(repos, data_dir, result)
    _collect_traffic(repos, data_dir, today, result)
    _collect_stars(repos, data_dir, today, stars_today, result)
    _collect_commits(repos, data_dir, result)
    result.artifacts = len(repos)
    return result


# ---- meta and health --------------------------------------------------------


def _collect_health(
    repos: list[str], data_dir: Path, today: date, result: CollectResult
) -> dict[str, int]:
    """Snapshot every repo; returns today's star count per repo for the stars file."""
    stars: dict[str, int] = {}
    if not github_token():
        result.errors.append("health: GITHUB_TOKEN not set; GraphQL needs a token")
        return stars
    since = (today - timedelta(days=30)).isoformat()
    for start in range(0, len(repos), BATCH):
        batch = repos[start : start + BATCH]
        query = "query {" + "".join(_fragment(i, repo, since) for i, repo in enumerate(batch)) + "}"
        try:
            payload = post_json(GRAPHQL, {"query": query}, headers=github_headers())
        except HttpError as e:
            result.errors.append(f"health batch {start // BATCH}: {e}")
            continue
        data = payload.get("data") or {}
        for err in payload.get("errors") or []:
            log.warning("graphql: %s", err.get("message"))
        for i, repo in enumerate(batch):
            node = data.get(f"r{i}")
            if not node:
                result.errors.append(f"health {repo}: not found or no access")
                continue
            row = {
                "date": today.isoformat(),
                "stars": node["stargazerCount"],
                "forks": node["forkCount"],
                "subscribers": node["watchers"]["totalCount"],
                "open_issues": node["issues"]["totalCount"],
                "open_prs": node["pullRequests"]["totalCount"],
                "merged_prs_30d": (data.get(f"r{i}_merged") or {}).get("issueCount", ""),
                "issues_opened_30d": (data.get(f"r{i}_opened") or {}).get("issueCount", ""),
                "issues_closed_30d": (data.get(f"r{i}_closed") or {}).get("issueCount", ""),
                "pushed_at": (node.get("pushedAt") or "")[:10],
            }
            path = store.path_for(data_dir, "repos", "health", repo)
            result.rows_changed += store.upsert(path, HEALTH_COLUMNS, ["date"], [row])
            _write_meta(data_dir, repo, meta_of(node))
            stars[repo] = int(node["stargazerCount"])
            log.info("health %s: %s stars, %s open issues", repo, row["stars"], row["open_issues"])
    return stars


def meta_of(node: dict) -> dict:
    """The repo as it is today, from one GraphQL `repository` node."""
    langs = node.get("languages") or {}
    total = langs.get("totalSize") or 0
    head = ((node.get("defaultBranchRef") or {}).get("target")) or {}
    release = node.get("latestRelease") or None
    license_info = node.get("licenseInfo") or {}
    return {
        "description": node.get("description") or None,
        "homepage": node.get("homepageUrl") or None,
        "created_at": (node.get("createdAt") or "")[:10] or None,
        "archived": bool(node.get("isArchived")),
        # GitHub's NOASSERTION means a LICENSE file it could not identify.
        "license": (
            license_info.get("spdxId")
            if license_info.get("spdxId") not in (None, "NOASSERTION")
            else license_info.get("name")
        )
        or None,
        "language": (node.get("primaryLanguage") or {}).get("name"),
        "languages": [
            {
                "name": e["node"]["name"],
                "color": e["node"].get("color"),
                "share": round(e["size"] / total, 4) if total else 0,
            }
            for e in langs.get("edges") or []
        ],
        "topics": [
            n["topic"]["name"] for n in (node.get("repositoryTopics") or {}).get("nodes", [])
        ],
        "default_branch": (node.get("defaultBranchRef") or {}).get("name"),
        "total_commits": (head.get("history") or {}).get("totalCount"),
        "last_commit": (
            {
                "sha": head["oid"][:7],
                "date": (head.get("committedDate") or "")[:10],
                "message": commit_title(head.get("messageHeadline"), head.get("messageBody")),
            }
            if head.get("oid")
            else None
        ),
        "latest_release": (
            {"tag": release["tagName"], "date": (release.get("publishedAt") or "")[:10]}
            if release
            else None
        ),
    }


MERGE_HEADLINE = re.compile(r"^Merge pull request (#\d+) from \S+$")


def commit_title(headline: str | None, body: str | None) -> str:
    """The commit's first line, whole. GitHub cuts a long headline with "…"
    and starts the body with "…" and the rest of it. A merge commit's
    headline only names the branch, so its pull request's title (the body's
    next paragraph) stands in for it."""
    headline = headline or ""
    lines = (body or "").strip().splitlines()
    if headline.endswith("…") and lines and lines[0].startswith("…"):
        headline = headline[:-1] + lines[0][1:]
        lines = lines[1:]
    m = MERGE_HEADLINE.match(headline)
    title = next((line.strip() for line in lines if line.strip()), "")
    if not (m and title):
        return headline
    return title if "(#" in title else f"{title} ({m.group(1)})"


def _write_meta(data_dir: Path, repo: str, meta: dict) -> None:
    path = data_dir / "repos" / "meta" / f"{store.slug(repo)}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(meta, indent=1, ensure_ascii=False) + "\n")


def _fragment(i: int, repo: str, since: str) -> str:
    owner, name = repo.split("/", 1)
    return REPO_FRAGMENT % {
        "alias": f"r{i}",
        "owner": owner,
        "name": name,
        "repo": repo,
        "since": since,
    }


# ---- releases ---------------------------------------------------------------


def _all_releases(repo: str) -> list[dict]:
    out: list[dict] = []
    page = 1
    while True:
        batch = get_json(
            f"{API}/repos/{repo}/releases?per_page=100&page={page}", headers=github_headers()
        )
        out.extend(batch)
        if len(batch) < 100:
            return out
        page += 1


def _collect_releases(repos: list[str], data_dir: Path, result: CollectResult) -> None:
    for repo in repos:
        try:
            releases = _all_releases(repo)
        except HttpError as e:
            result.errors.append(f"releases {repo}: {e}")
            continue
        rows = [
            {
                "tag": rel["tag_name"],
                "published_at": (rel.get("published_at") or rel.get("created_at") or "")[:10],
                "prerelease": "true" if rel.get("prerelease") else "false",
            }
            for rel in releases
            if not rel.get("draft")
        ]
        if rows:
            path = store.path_for(data_dir, "repos", "releases", repo)
            result.rows_changed += store.upsert(path, RELEASE_COLUMNS, ["tag"], rows)
        log.info("releases %s: %d", repo, len(rows))


# ---- traffic ----------------------------------------------------------------


def _collect_traffic(repos: list[str], data_dir: Path, today: date, result: CollectResult) -> None:
    denied: list[str] = []
    reason: str | None = None
    for repo in repos:
        try:
            views = get_json(f"{API}/repos/{repo}/traffic/views", headers=github_headers())
            clones = get_json(f"{API}/repos/{repo}/traffic/clones", headers=github_headers())
        except HttpError as e:
            if e.status in (401, 403, 404):
                denied.append(repo)
                # GitHub's message says whether the token is the wrong kind
                # or lacks the permission.
                reason = reason or str(e)
            else:
                result.errors.append(f"traffic {repo}: {e}")
            continue
        by_date: dict[str, dict[str, int]] = {}
        for v in views.get("views", []):
            d = v["timestamp"][:10]
            by_date.setdefault(d, {})
            by_date[d].update(views=v["count"], unique_views=v["uniques"])
        for c in clones.get("clones", []):
            d = c["timestamp"][:10]
            by_date.setdefault(d, {})
            by_date[d].update(clones=c["count"], unique_clones=c["uniques"])
        # Today's bucket is still filling; keep only complete days.
        rows = [
            {"date": d, "views": 0, "unique_views": 0, "clones": 0, "unique_clones": 0, **v}
            for d, v in sorted(by_date.items())
            if d < today.isoformat()
        ]
        path = store.path_for(data_dir, "repos", "traffic", repo)
        result.rows_changed += store.upsert(path, TRAFFIC_COLUMNS, ["date"], rows)
        log.info("traffic %s: %d days", repo, len(rows))
    if denied:
        result.notes["traffic_denied"] = denied
        result.notes["traffic_reason"] = reason
        log.warning(
            "traffic: denied for %d repo(s) using %s; first answer: %s",
            len(denied),
            "PULSE_GITHUB_TOKEN" if os.environ.get("PULSE_GITHUB_TOKEN") else "GITHUB_TOKEN",
            reason,
        )


# ---- stars -------------------------------------------------------------------


def _collect_stars(
    repos: list[str],
    data_dir: Path,
    today: date,
    stars_today: dict[str, int],
    result: CollectResult,
) -> None:
    for repo in repos:
        path = store.path_for(data_dir, "repos", "stars", repo)
        rows: list[store.Row] = []
        if not path.exists():
            try:
                rows = _backfill_stars(repo)
            except HttpError as e:
                result.errors.append(f"stars {repo}: {e}")
                continue
            log.info("stars %s: backfilled %d dates", repo, len(rows))
        if repo in stars_today:
            rows.append({"date": today.isoformat(), "stars": stars_today[repo]})
        if rows:
            result.rows_changed += store.upsert(path, STARS_COLUMNS, ["date"], rows)


def _backfill_stars(repo: str) -> list[store.Row]:
    """Cumulative stars per date from every star's `starred_at`. Unstars are
    invisible here, so the last value may exceed today's count; the daily
    snapshot row written afterwards corrects the present."""
    per_day: dict[str, int] = {}
    page = 1
    while True:
        batch = get_json(
            f"{API}/repos/{repo}/stargazers?per_page=100&page={page}",
            headers={**github_headers(), **STAR_HEADERS},
        )
        for star in batch:
            d = (star.get("starred_at") or "")[:10]
            if d:
                per_day[d] = per_day.get(d, 0) + 1
        if len(batch) < 100:
            break
        page += 1
    total = 0
    rows = []
    for d in sorted(per_day):
        total += per_day[d]
        rows.append({"date": d, "stars": total})
    return rows


# ---- commits -----------------------------------------------------------------


def _collect_commits(repos: list[str], data_dir: Path, result: CollectResult) -> None:
    for repo in repos:
        path = store.path_for(data_dir, "repos", "commits", repo)
        existing = store.read(path)
        since = None
        if existing:
            latest = max(r["date"] for r in existing)
            since = f"{latest[:7]}-01T00:00:00Z"  # refetch the latest month
        try:
            rows = _commits_by_author(repo, since)
        except HttpError as e:
            # An empty repo answers 409 to the commits list.
            if e.status == 409:
                log.info("commits %s: empty repository", repo)
                continue
            result.errors.append(f"commits {repo}: {e}")
            continue
        if rows:
            result.rows_changed += store.upsert(path, COMMIT_COLUMNS, ["date", "author"], rows)
        log.info(
            "commits %s: %d author-days%s", repo, len(rows), " (backfill)" if not since else ""
        )


def _commits_by_author(repo: str, since: str | None) -> list[store.Row]:
    counts: dict[tuple[str, str], int] = {}
    page = 1
    while True:
        url = f"{API}/repos/{repo}/commits?per_page=100&page={page}"
        if since:
            url += f"&since={since}"
        batch = get_json(url, headers=github_headers())
        for c in batch:
            author = commit_author(c)
            if author is None:
                continue
            d = (c.get("commit", {}).get("author", {}).get("date") or "")[:10]
            if d:
                counts[(d, author)] = counts.get((d, author), 0) + 1
        if len(batch) < 100:
            break
        page += 1
    return [{"date": d, "author": a, "commits": n} for (d, a), n in sorted(counts.items())]


# Placeholder accounts GitHub attributes commits to when it cannot match
# the author; they are not people.
GHOSTS = {"invalid-email-address", "ghost"}


def commit_author(commit: dict) -> str | None:
    """A stable author key, or None for bots."""
    user = commit.get("author") or {}
    login = user.get("login")
    if login:
        if user.get("type") == "Bot" or login.endswith("[bot]") or login in GHOSTS:
            return None
        return login
    email = (commit.get("commit", {}).get("author", {}).get("email") or "").strip().lower()
    if not email or "[bot]" in email or email.endswith("noreply.github.com"):
        return None
    return f"email:{email}"
