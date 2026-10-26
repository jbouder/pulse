"""Tiny stdlib HTTP client with retries. No third-party deps on purpose."""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from typing import Any

log = logging.getLogger(__name__)

USER_AGENT = "jbouder-pulse/0.1 (+https://github.com/jbouder/pulse)"
RETRY_STATUSES = {429, 500, 502, 503, 504}


class HttpError(RuntimeError):
    def __init__(self, url: str, status: int | None, body: str = ""):
        super().__init__(f"{url}: HTTP {status} {body[:200]}")
        self.url = url
        self.status = status


def get_json(url: str, headers: dict[str, str] | None = None, retries: int = 3) -> Any:
    return request_json(url, headers=headers, retries=retries)


def post_json(
    url: str, payload: Any, headers: dict[str, str] | None = None, retries: int = 3
) -> Any:
    body = json.dumps(payload).encode()
    return request_json(
        url,
        headers={"Content-Type": "application/json", **(headers or {})},
        retries=retries,
        data=body,
    )


def request_json(
    url: str,
    headers: dict[str, str] | None = None,
    retries: int = 3,
    data: bytes | None = None,
) -> Any:
    req_headers = {"User-Agent": USER_AGENT, "Accept": "application/json", **(headers or {})}
    delay = 2.0
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, headers=req_headers, data=data)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace") if e.fp else ""
            if e.code in RETRY_STATUSES and attempt < retries:
                retry_after = e.headers.get("Retry-After")
                wait = float(retry_after) if retry_after and retry_after.isdigit() else delay
                log.warning("%s -> %s, retrying in %.0fs", url, e.code, wait)
                time.sleep(wait)
                delay *= 2
                continue
            raise HttpError(url, e.code, body) from e
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < retries:
                log.warning("%s -> %s, retrying in %.0fs", url, e, delay)
                time.sleep(delay)
                delay *= 2
                continue
            raise HttpError(url, None, str(e)) from e
    raise AssertionError("unreachable")


def github_token() -> str | None:
    """PULSE_GITHUB_TOKEN (a PAT that can read traffic on the tracked repos)
    wins over GITHUB_TOKEN (the Actions token, scoped to this repo only)."""
    return os.environ.get("PULSE_GITHUB_TOKEN") or os.environ.get("GITHUB_TOKEN") or None


def github_headers() -> dict[str, str]:
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    token = github_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers
