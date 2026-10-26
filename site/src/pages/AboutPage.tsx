import { use } from 'react';
import { PageHeader, Panel } from '@/components/Page';
import { load, SUMMARY_URL, type Summary } from '@/lib/data';
import { day, plural } from '@/lib/format';

const SOURCES: { name: string; what: string; keeps: string; notes: string }[] =
  [
    {
      name: 'Repo metadata and health',
      what: 'Description, languages, topics, license, last commit; stars, forks, open issues and PRs, PRs merged in 30 days.',
      keeps: 'Today only; Pulse keeps a row per day.',
      notes: 'One GitHub GraphQL query for every repo, each morning.',
    },
    {
      name: 'Commits',
      what: 'Commits per author per day on the default branch.',
      keeps: 'All history.',
      notes:
        'Backfilled once, then the latest month refetched each run. Bots (dependabot, the Pulse bot) are left out.',
    },
    {
      name: 'Stars',
      what: 'Stars over time.',
      keeps: 'All history, from the time of each star.',
      notes:
        'Backfilled once from the stargazers list, then the daily count, so unstars show too.',
    },
    {
      name: 'Releases',
      what: 'Every published release tag and its date.',
      keeps: 'All history.',
      notes: 'Drafts are skipped. Cadence counts stable releases only.',
    },
    {
      name: 'Repo traffic',
      what: 'Views and clones per day, with GitHub’s per-day unique counts.',
      keeps: 'GitHub keeps 14 days; Pulse keeps everything it has seen.',
      notes:
        'Needs a token with push access to each repo. Today is still filling and is skipped.',
    },
    {
      name: 'Worker requests',
      what: 'Requests and errors per day for each app’s Cloudflare Worker scripts.',
      keeps:
        'Cloudflare keeps about 30 days; Pulse keeps everything it has seen.',
      notes:
        'Counts Worker invocations, not page views: static assets served without running the Worker are not counted.',
    },
  ];

export function AboutPage() {
  const summary = use(load<Summary>(SUMMARY_URL));
  const { traffic, apps } = summary.sources;
  return (
    <>
      <PageHeader
        title="About the data"
        description="Where every number comes from, how far back it reaches, and what it can’t tell you."
      />
      <div className="flex max-w-[78ch] flex-col gap-6">
        <Panel title="How Pulse works">
          <div className="flex flex-col gap-3 text-pretty">
            <p>
              A GitHub Action runs every morning at 06:20 UTC. It asks GitHub
              and Cloudflare about each project in{' '}
              <code className="bg-muted px-1 font-mono text-[0.88em]">
                sources.yaml
              </code>
              , upserts the answers into CSV files under{' '}
              <code className="bg-muted px-1 font-mono text-[0.88em]">
                data/
              </code>
              , and commits them. The repo is the database: most upstreams keep
              only a short window, so history exists because Pulse snapshots it.
            </p>
            <p>
              This page was built from the collection of{' '}
              <strong>{day(summary.generated_at)}</strong>. Repo traffic covers{' '}
              {plural(traffic.repos, 'repo')}
              {traffic.since ? ` since ${day(traffic.since)}` : ''}. Worker
              requests cover {apps.collected} of{' '}
              {plural(apps.workers, 'Worker')}
              {apps.since ? ` since ${day(apps.since)}` : ''}.
            </p>
            <p>
              A dash means the upstream did not say, never zero. A change is
              shown only when the previous period is fully covered by data, so a
              source that started mid-way never reads as a surge.
            </p>
          </div>
        </Panel>

        <Panel title="Sources" bodyClassName="p-0">
          <dl className="divide-y">
            {SOURCES.map((s) => (
              <div
                key={s.name}
                className="flex flex-col gap-1 px-4 py-3 text-sm"
              >
                <dt className="font-heading font-semibold">{s.name}</dt>
                <dd className="flex flex-col gap-1">
                  <span>{s.what}</span>
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">
                      History:{' '}
                    </span>
                    {s.keeps}
                  </span>
                  <span className="text-muted-foreground">{s.notes}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Statuses">
          <ul className="flex flex-col gap-1.5 text-sm">
            <li>
              <strong>Active</strong>: a commit in the last 14 days.
            </li>
            <li>
              <strong>Steady</strong>: a commit in the last 90 days.
            </li>
            <li>
              <strong>Quiet</strong>: no commit in 90 days.
            </li>
            <li>
              <strong>Archived</strong>: archived on GitHub.
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
