# AGENTS.md — Pulse

Guidance for AI agents working in this repository. Read it before making
changes.

## What this is

A daily collector (`pulse/`) that snapshots GitHub and Cloudflare data for
the projects in `sources.yaml` into CSV under `data/`, and a static
dashboard (`site/`) that reads the JSON the collector writes. Derived from
nebari-dev/pulse; styled as a sibling of holocron and datapad.

## Commands

```sh
uv sync
uv run pulse check
GITHUB_TOKEN=$(gh auth token) uv run pulse -v collect --dry-run
uv run pytest && uv run ruff check . && uv run ruff format --check .

cd site && npm install
npm run dev
npm run build && npm test && npx biome ci .
```

**After every change to the collector**, run pytest, ruff and a `--dry-run`
collect. **After every change to the site**, run build, test and Biome. CI
runs the same.

## The contract

`pulse/summary.py`’s docstring is the shape of `data/summary.json` and
`data/projects/<id>.json`; `site/src/lib/data.ts` mirrors it exactly.
Change both together, and keep changes additive: the site and the data
deploy separately.

## Rules the collector relies on

- **Upserts, never appends.** `store.upsert` keys rows so re-running a day
  replaces it. Files are rewritten sorted so diffs stay small.
- **Blank means unknown, not zero.** It surfaces as `null` and the
  dashboard shows a dash.
- **Today is never written for sources still filling** (traffic, Worker
  requests).
- **A change is withheld** when the previous window is not fully covered by
  collected data.
- **Partial failure is a warning, total failure is an error.** A source
  that collects nothing exits 1 so the run goes red. Missing optional
  credentials are a skip with a note, not a failure.
- **No personal data on the page.** Commit authors without a GitHub login
  are stored by email (as in nebari pulse) but never shown.

## Site conventions

Holocron’s and datapad’s, carried over:

- Tokens only: every color is a semantic token in `src/index.css`, defined
  for Light (`:root`) and Dark (`.dark`). `test/themes.test.ts` fails if a
  text pair drops below 4.5:1 or a chart color below 3:1 on a card.
- Oxanium for UI and headings, JetBrains Mono for repo names, tags and
  SHAs. Square corners (base-lyra). Phosphor icons.
- One breakpoint, 820px (`desk:`): rail above, tab bar below. 44px touch
  targets below it. Nothing only on hover.
- Motion through `src/lib/motion.ts`: `page` and `theme` view transitions,
  `filter` for Projects’ filters, `.enter` for arriving blocks, `.press` for
  anything pressable. Counts never animate. Motion and reduced motion are
  respected everywhere, charts included.
- State never by color alone: status dots carry a label, changes carry a
  sign, charts carry a text summary.
- Copy: sentence case, typographic quotes, “–” for unknown, empty states
  say what is missing and what fills it.
- Recharts loads only with the pages that use it (`ProjectPage`,
  `TrafficPage`); keep the overview free of it.

## Commits

Conventional prefixes (`feat:`, `fix:`, `ci:`, `data:`). Data commits are
made by the Action; do not hand-edit CSVs except to delete a wrong file.
