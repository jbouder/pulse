"""Load and validate sources.yaml."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

ID = re.compile(r"^[a-z0-9][a-z0-9-]*$")


@dataclass(frozen=True)
class Group:
    id: str
    name: str


@dataclass(frozen=True)
class Project:
    id: str
    name: str
    repo: str
    group: str
    featured: bool = False
    tagline: str = ""
    about: str = ""
    stack: tuple[str, ...] = ()
    links: dict[str, str] = field(default_factory=dict)
    """Cloudflare Worker script names whose requests are this project's app traffic."""
    workers: tuple[str, ...] = ()


@dataclass(frozen=True)
class Config:
    owner: str
    groups: tuple[Group, ...]
    projects: tuple[Project, ...]

    def repos(self) -> list[str]:
        return [p.repo for p in self.projects]

    def workers(self) -> list[tuple[Project, str]]:
        """All (project, worker script) pairs, in config order."""
        return [(p, w) for p in self.projects for w in p.workers]


class ConfigError(ValueError):
    pass


def load(path: Path) -> Config:
    raw = yaml.safe_load(path.read_text())
    if not isinstance(raw, dict) or "projects" not in raw:
        raise ConfigError(f"{path}: expected a top-level 'projects' list")

    groups: list[Group] = []
    for entry in raw.get("groups") or []:
        gid = entry.get("id")
        if not gid or not ID.match(gid) or any(g.id == gid for g in groups):
            raise ConfigError(f"group id missing, malformed or duplicated: {gid!r}")
        groups.append(Group(id=gid, name=entry.get("name", gid)))
    group_ids = {g.id for g in groups}

    projects: list[Project] = []
    seen_ids: set[str] = set()
    seen_repos: dict[str, str] = {}
    seen_workers: dict[str, str] = {}
    for entry in raw["projects"] or []:
        pid = entry.get("id")
        if not pid or not ID.match(pid) or pid in seen_ids:
            raise ConfigError(f"project id missing, malformed or duplicated: {pid!r}")
        seen_ids.add(pid)

        repo = entry.get("repo")
        if not isinstance(repo, str) or repo.count("/") != 1:
            raise ConfigError(f"{pid}.repo: expected 'owner/name', got {repo!r}")
        if repo in seen_repos:
            raise ConfigError(f"repo {repo!r} listed under both {seen_repos[repo]} and {pid}")
        seen_repos[repo] = pid

        group = entry.get("group")
        if group not in group_ids:
            raise ConfigError(f"{pid}.group: expected one of {sorted(group_ids)}, got {group!r}")

        workers = entry.get("workers") or []
        if not isinstance(workers, list) or not all(isinstance(w, str) for w in workers):
            raise ConfigError(f"{pid}.workers: expected a list of Worker script names")
        for w in workers:
            if w in seen_workers:
                raise ConfigError(f"worker {w!r} listed under both {seen_workers[w]} and {pid}")
            seen_workers[w] = pid

        links = entry.get("links") or {}
        if not isinstance(links, dict) or not all(
            isinstance(v, str) and v.startswith("https://") for v in links.values()
        ):
            raise ConfigError(f"{pid}.links: expected a mapping of name -> https:// URL")

        stack = entry.get("stack") or []
        if not isinstance(stack, list) or not all(isinstance(s, str) for s in stack):
            raise ConfigError(f"{pid}.stack: expected a list of strings")

        projects.append(
            Project(
                id=pid,
                name=entry.get("name", pid),
                repo=repo,
                group=group,
                featured=bool(entry.get("featured", False)),
                tagline=(entry.get("tagline") or "").strip(),
                about=" ".join((entry.get("about") or "").split()),
                stack=tuple(stack),
                links=dict(links),
                workers=tuple(workers),
            )
        )

    return Config(owner=raw.get("owner", ""), groups=tuple(groups), projects=tuple(projects))
