from pathlib import Path

import pytest

from pulse import config

ROOT = Path(__file__).resolve().parent.parent

BASE = """
owner: me
groups:
  - id: apps
    name: Apps
projects:
"""


def write(tmp_path: Path, projects: str) -> Path:
    path = tmp_path / "sources.yaml"
    path.write_text(BASE + projects)
    return path


def test_repo_sources_yaml_loads():
    cfg = config.load(ROOT / "sources.yaml")
    assert cfg.owner == "jbouder"
    ids = [p.id for p in cfg.projects]
    assert len(ids) == len(set(ids))
    assert {"holocron", "datapad", "website"} <= set(ids)


def test_loads_a_project(tmp_path):
    cfg = config.load(
        write(
            tmp_path,
            """
  - id: one
    name: One
    repo: me/one
    group: apps
    featured: true
    about: >-
      Two
      lines.
    workers: [one, one-docs]
    links: {app: "https://one.example.com"}
""",
        )
    )
    (p,) = cfg.projects
    assert p.featured and p.about == "Two lines."
    assert cfg.workers() == [(p, "one"), (p, "one-docs")]


@pytest.mark.parametrize(
    "projects, message",
    [
        ("  - {id: a, repo: me/a, group: nope}\n", "group"),
        ("  - {id: a, repo: nope, group: apps}\n", "owner/name"),
        ("  - {id: a, repo: me/a, group: apps}\n  - {id: b, repo: me/a, group: apps}\n", "both"),
        ("  - {id: A, repo: me/a, group: apps}\n", "malformed"),
        (
            "  - {id: a, repo: me/a, group: apps, workers: [w]}\n"
            "  - {id: b, repo: me/b, group: apps, workers: [w]}\n",
            "worker",
        ),
        ("  - {id: a, repo: me/a, group: apps, links: {app: 'http://x'}}\n", "https"),
    ],
)
def test_rejects(tmp_path, projects, message):
    with pytest.raises(config.ConfigError, match=message):
        config.load(write(tmp_path, projects))
