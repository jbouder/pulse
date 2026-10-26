"""One module per upstream. Each exposes:

    collect(cfg, data_dir, today) -> CollectResult

and writes through `store.upsert`, so re-running a day replaces rows
rather than duplicating them.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class CollectResult:
    source: str
    artifacts: int = 0
    rows_changed: int = 0
    errors: list[str] = field(default_factory=list)
    notes: dict[str, object] = field(default_factory=dict)
