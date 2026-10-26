"""CSV-backed storage under data/.

One CSV per (source, artifact). Rows are keyed so that re-running the
collector for the same day is an upsert, never a duplicate. Files are
rewritten fully sorted, which keeps git diffs to appended/changed rows.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path

Row = dict[str, str]


def slug(ref: str) -> str:
    """Filesystem-safe name for an artifact ref like 'nebari/charts/foo'."""
    return re.sub(r"[^A-Za-z0-9._-]+", "__", ref).strip("_")


def path_for(data_dir: Path, family: str, source: str, ref: str) -> Path:
    return data_dir / family / source / f"{slug(ref)}.csv"


def read(path: Path) -> list[Row]:
    if not path.exists():
        return []
    with path.open(newline="") as f:
        return list(csv.DictReader(f))


def upsert(path: Path, columns: list[str], key: list[str], rows: list[Row]) -> int:
    """Merge rows into the CSV at path. Returns number of rows added or changed."""
    existing = {tuple(r[k] for k in key): r for r in read(path)}
    changed = 0
    for row in rows:
        row = {c: str(row.get(c, "")) for c in columns}
        k = tuple(row[c] for c in key)
        if existing.get(k) != row:
            changed += 1
        existing[k] = row
    if not changed and path.exists():
        return 0
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns, lineterminator="\n")
        w.writeheader()
        for k in sorted(existing):
            w.writerow(existing[k])
    return changed
