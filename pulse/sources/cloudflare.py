"""App traffic: requests to each project's Cloudflare Workers.

One CSV per Worker script under data/apps/requests/<script>.csv with
`date,requests,errors`, from the account-level Workers analytics dataset
(`workersInvocationsAdaptive`). Fetched for the last 30 days on every run
(about what Cloudflare retains) and upserted; today is still filling and
is skipped.

These are Worker invocations, not page views. A Worker that serves static
assets without running its script first (holocron, for one, runs only for
its API and WebSocket routes) is invoked for less than every request, so
the numbers compare a project with itself over time, not projects with
each other.

Needs CLOUDFLARE_ACCOUNT_ID and an API token with Account Analytics:Read:
CLOUDFLARE_ANALYTICS_TOKEN, or the deploy token CLOUDFLARE_API_TOKEN if it
carries that permission too. Without them the source is skipped with a
note and the dashboard says so.
"""

from __future__ import annotations

import logging
import os
from datetime import date, timedelta
from pathlib import Path

from .. import store
from ..config import Config
from ..http import HttpError, post_json
from . import CollectResult

log = logging.getLogger(__name__)

GRAPHQL = "https://api.cloudflare.com/client/v4/graphql"
COLUMNS = ["date", "requests", "errors"]
DAYS = 30

QUERY = """
query ($account: String!, $start: Date!, $end: Date!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      workersInvocationsAdaptive(
        limit: 10000
        filter: { date_geq: $start, date_leq: $end }
      ) {
        sum { requests errors }
        dimensions { date scriptName }
      }
    }
  }
}
"""


def token() -> str | None:
    return (
        os.environ.get("CLOUDFLARE_ANALYTICS_TOKEN")
        or os.environ.get("CLOUDFLARE_API_TOKEN")
        or None
    )


def collect(cfg: Config, data_dir: Path, today: date) -> CollectResult:
    result = CollectResult(source="cloudflare")
    pairs = cfg.workers()
    if not pairs:
        return result
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID")
    tok = token()
    if not account or not tok:
        missing = [
            name
            for name, value in (
                ("CLOUDFLARE_ACCOUNT_ID", account),
                ("CLOUDFLARE_ANALYTICS_TOKEN", tok),
            )
            if not value
        ]
        result.notes["skipped"] = f"{' and '.join(missing)} not set"
        log.warning("cloudflare: skipped, %s", result.notes["skipped"])
        # Skipping is not a failure: count the scripts so the run stays green.
        result.artifacts = len(pairs)
        return result

    end = today - timedelta(days=1)
    start = today - timedelta(days=DAYS)
    try:
        payload = post_json(
            GRAPHQL,
            {
                "query": QUERY,
                "variables": {
                    "account": account,
                    "start": start.isoformat(),
                    "end": end.isoformat(),
                },
            },
            headers={"Authorization": f"Bearer {tok}"},
        )
    except HttpError as e:
        result.errors.append(f"workers analytics: {e}")
        return result
    errors = payload.get("errors") or []
    if errors:
        result.errors.extend(f"workers analytics: {e.get('message')}" for e in errors)
        return result

    accounts = ((payload.get("data") or {}).get("viewer") or {}).get("accounts") or []
    groups = accounts[0].get("workersInvocationsAdaptive", []) if accounts else []
    by_script = per_script(groups)

    for _, script in pairs:
        days = by_script.get(script, {})
        # Every day in the window gets a row: a Worker that answered nothing
        # on a day had zero requests, which is known, not missing.
        rows = []
        d = start
        while d <= end:
            req, err = days.get(d.isoformat(), (0, 0))
            rows.append({"date": d.isoformat(), "requests": req, "errors": err})
            d += timedelta(days=1)
        path = store.path_for(data_dir, "apps", "requests", script)
        result.rows_changed += store.upsert(path, COLUMNS, ["date"], rows)
        result.artifacts += 1
        log.info(
            "worker %s: %d requests in %d days", script, sum(r[0] for r in days.values()), DAYS
        )

    unknown = sorted(set(by_script) - {s for _, s in pairs})
    if unknown:
        result.notes["untracked_workers"] = unknown
    return result


def per_script(groups: list[dict]) -> dict[str, dict[str, tuple[int, int]]]:
    """script -> date -> (requests, errors), summed over any other dimension."""
    out: dict[str, dict[str, tuple[int, int]]] = {}
    for g in groups:
        dims = g.get("dimensions") or {}
        script, d = dims.get("scriptName"), dims.get("date")
        if not script or not d:
            continue
        s = g.get("sum") or {}
        req, err = out.setdefault(script, {}).get(d, (0, 0))
        out[script][d] = (req + int(s.get("requests") or 0), err + int(s.get("errors") or 0))
    return out
