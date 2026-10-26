<p align="center">
  <img src="site/public/favicon.svg" alt="" width="72" height="72" />
</p>

# Pulse

Health and activity across [jbouder](https://github.com/jbouder)’s projects:
commits, stars, releases, repo traffic and app requests, collected every
morning and shown as a dashboard on Cloudflare Workers.

Pulse is modeled on [nebari-dev/pulse](https://github.com/nebari-dev/pulse)
(the same collector-commits-CSV design), with the look, feel and motion of
[Holocron](https://github.com/jbouder/holocron) and
[Datapad](https://github.com/jbouder/datapad): Oxanium and JetBrains Mono,
square base-lyra components, System, Light and Dark themes, a rail on the
desktop and a tab bar on the phone.

## What it tracks

Every project in [`sources.yaml`](sources.yaml), in three groups:

| Group | Projects |
|---|---|
| Apps | Holocron, Datapad, Holotable, Acolyte, johnnybouder.com, Music Visualizer, Punchlist |
| Claude Code | Skills, Claude plugins, Jean-Claude, Agent Quest |
| Labs | Chaos Lab, Motion Lab, Pulse |

Each project has a page with its description, links (app, docs, demo,
repo), stack, languages, license, latest commit and release, plus its
history: commits per week, repo traffic, stars, Worker requests, releases.

## Dashboard

| Page | What it shows |
|---|---|
| `/` Overview | Commits in 30 days, active projects, stars, repo views or Worker requests; a year of commits as a heatmap; featured projects; latest commits and releases. |
| `/projects` | Every project as cards by group, or as a sortable table. Group, layout and sort live in the URL. |
| `/projects/:id` | One project in full (see above). |
| `/releases` | Release cadence per project and every release, newest first. |
| `/traffic` | Repo views, visitors and clones on GitHub; requests to each app’s Cloudflare Workers. |
| `/about` | Where every number comes from and what it can’t tell you. |

## How it works

A GitHub Action runs `pulse collect` every day at 06:20 UTC. It asks GitHub
(GraphQL and REST) and Cloudflare (Workers analytics) about each project,
upserts the answers into CSV under `data/`, rebuilds the dashboard’s JSON,
commits it, and redeploys the site. The repo is the database: GitHub keeps
14 days of traffic and Cloudflare about 30 days of Worker analytics, so
history exists only because Pulse snapshots it.

```
sources.yaml        the projects: repo, group, words, links, Worker scripts
pulse/              collector (Python 3.12, stdlib + pyyaml)
  sources/github.py       metadata, health, commits, stars, releases, traffic
  sources/cloudflare.py   Worker requests per script
  summary.py              builds the dashboard JSON (the contract)
data/
  repos/meta|health|commits|stars|releases|traffic/<owner>__<repo>.*
  apps/requests/<script>.csv
  summary.json            every project: words, metadata, stats, short series
  projects/<id>.json      one project's full daily history
site/               dashboard (Vite, React 19, Tailwind 4, base-lyra, Recharts)
```

## Running it locally

```sh
uv sync
uv run pulse check                                  # validate sources.yaml
GITHUB_TOKEN=$(gh auth token) uv run pulse -v collect --dry-run
GITHUB_TOKEN=$(gh auth token) uv run pulse collect   # update data/
uv run pytest && uv run ruff check .

cd site
npm install
npm run dev        # http://localhost:5173, reads ../data
npm run build && npm test && npx biome ci .
```

## Secrets

| Secret | Used for | Without it |
|---|---|---|
| `PULSE_GITHUB_TOKEN` | Repo traffic: a fine-grained PAT for the tracked repos with *Administration: Read-only*, or a classic PAT with `repo`. | Traffic is skipped with a note; everything else works with the Actions token. |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ANALYTICS_TOKEN` | Worker requests: a token with *Account Analytics: Read*. | Worker requests are skipped and the pages say so. |
| `CLOUDFLARE_API_TOKEN` (and `CLOUDFLARE_ACCOUNT_ID`) | Deploying the `pulse` Worker. | The deploy job is skipped and the run stays green. |

## Adding a project

Add an entry to `sources.yaml` with an `id`, `name`, `repo`, `group`, a
`tagline` and an `about` paragraph, its `stack`, `links`, and any Worker
script names under `workers`. Run `uv run pulse check`, open a PR, and the
next collection picks it up.

## License

MIT
