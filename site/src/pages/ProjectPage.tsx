import { ArrowSquareOutIcon, GithubLogoIcon } from '@phosphor-icons/react';
import { type ReactNode, Suspense, use, useMemo } from 'react';
import { fillDays } from '@/components/charts';
import { Empty, PageHeader, Panel, StatTile } from '@/components/Page';
import { LanguageBar } from '@/components/ProjectCard';
import { StatusDot } from '@/components/StatusDot';
import { TrendChart } from '@/components/TrendChart';
import { buttonVariants } from '@/components/ui/button';
import {
  commitUrl,
  load,
  type Point,
  type Project,
  type ProjectDetail,
  projectUrl,
  releaseUrl,
  repoUrl,
  SUMMARY_URL,
  type Summary,
} from '@/lib/data';
import { linkLabel, medianGap, projectById, statusOf } from '@/lib/derive';
import { addDays, ago, day, num, plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function ProjectPage({ id }: { id: string }) {
  const summary = use(load<Summary>(SUMMARY_URL));
  const project = projectById(summary, id);
  if (!project) return <NotFoundPage what="project" />;
  const asOf = summary.generated_at;
  const group = summary.groups.find((g) => g.id === project.group);
  const links = Object.entries(project.links);

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-x-2">
            <span>{group?.name}</span>
            <span aria-hidden>·</span>
            <span className="font-mono">{project.repo}</span>
          </span>
        }
        title={project.name}
        description={project.tagline}
        actions={
          <>
            {links.map(([name, url], i) => (
              <a
                key={name}
                href={url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  buttonVariants({ variant: i === 0 ? 'default' : 'outline' }),
                  'press h-11 desk:h-8',
                )}
              >
                {linkLabel(name)}
                <ArrowSquareOutIcon data-icon="inline-end" />
              </a>
            ))}
            <a
              href={repoUrl(project.repo)}
              target="_blank"
              rel="noreferrer"
              className={cn(
                buttonVariants({
                  variant: links.length ? 'outline' : 'default',
                }),
                'press h-11 desk:h-8',
              )}
            >
              <GithubLogoIcon data-icon="inline-start" />
              Repository
            </a>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          {project.about && (
            <p className="enter max-w-[68ch] text-pretty">{project.about}</p>
          )}
          <Stats project={project} />
          <Suspense fallback={<div className="h-72 animate-pulse bg-muted" />}>
            <History project={project} asOf={asOf} />
          </Suspense>
          <Releases project={project} asOf={asOf} />
        </div>
        <Facts project={project} asOf={asOf} />
      </div>
    </>
  );
}

function Stats({ project }: { project: Project }) {
  const { stats, health } = project;
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatTile
        index={0}
        label="Commits, 30 days"
        value={stats.commits_30d}
        previous={stats.commits_prev_30d}
      />
      <StatTile
        index={1}
        label="Active days, 30 days"
        value={stats.active_days_30d}
        hint={`${num(stats.commits_365d)} commits this year`}
      />
      <StatTile
        index={2}
        label="Stars"
        value={health?.stars ?? null}
        hint={
          stats.stars_gained_30d
            ? `+${num(stats.stars_gained_30d)} in 30 days`
            : undefined
        }
      />
      {stats.requests_30d !== null ? (
        <StatTile
          index={3}
          label="Worker requests, 30 days"
          value={stats.requests_30d}
          previous={stats.requests_prev_30d}
        />
      ) : (
        <StatTile
          index={3}
          label="Repo views, 14 days"
          value={stats.views_14d}
          previous={stats.views_prev_14d}
        />
      )}
    </div>
  );
}

/** Weekly sums of a daily series, Monday-dated, zero-filled. */
function weeklyOf(points: Point[], from: string, to: string): Point[] {
  const monday = (iso: string) => {
    const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
    return addDays(iso, -dow);
  };
  const out = new Map<string, number>();
  for (let d = monday(from); d <= to; d = addDays(d, 7)) out.set(d, 0);
  for (const p of points) {
    const w = monday(p.date);
    if (out.has(w)) out.set(w, (out.get(w) ?? 0) + p.count);
  }
  return [...out].map(([date, count]) => ({ date, count }));
}

function History({ project, asOf }: { project: Project; asOf: string }) {
  const detail = use(load<ProjectDetail>(projectUrl(project.id)));

  const commits = useMemo(() => {
    if (detail.commits.length === 0) return [];
    // Since the first commit, at most two years back.
    const from = [detail.commits[0].date, addDays(asOf, -728)].sort()[1];
    return weeklyOf(detail.commits, from, asOf);
  }, [detail.commits, asOf]);

  const stars = useMemo(() => {
    if (detail.stars.length === 0) return [];
    // Carry the count forward to today so the line ends at the present.
    const last = detail.stars[detail.stars.length - 1];
    return last.date < asOf
      ? [...detail.stars, { date: asOf, stars: last.stars }]
      : detail.stars;
  }, [detail.stars, asOf]);

  const requests = useMemo(
    () =>
      detail.requests.length
        ? fillDays(
            detail.requests.map((r) => ({ date: r.date, count: r.requests })),
            detail.requests[0].date,
            detail.requests[detail.requests.length - 1].date,
          ).map((p) => ({ date: p.date, requests: p.count }))
        : [],
    [detail.requests],
  );

  const total = commits.reduce((a, p) => a + p.count, 0);
  const viewsTotal = detail.traffic.reduce((a, r) => a + r.views, 0);

  return (
    <>
      <Panel
        title="Commits per week"
        info={
          <p>
            Commits on the default branch per week (Monday to Sunday), since the
            first commit or for the last two years. Bot commits are left out.
          </p>
        }
      >
        {commits.length ? (
          <TrendChart
            kind="bar"
            weekly
            data={commits}
            series={[{ key: 'count', label: 'Commits' }]}
            summary={`${plural(total, 'commit')} over ${plural(commits.length, 'week')}.`}
          />
        ) : (
          <Empty title="No commits yet">
            The repo’s default branch has no commits Pulse could read.
          </Empty>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Repo traffic"
          info={
            <p>
              Daily views of the repo on GitHub and unique visitors. GitHub
              keeps only 14 days, so this history exists because Pulse snapshots
              it every morning.
            </p>
          }
        >
          {detail.traffic.length ? (
            <TrendChart
              kind="area"
              height={180}
              data={detail.traffic}
              series={[
                { key: 'views', label: 'Views' },
                { key: 'unique_views', label: 'Unique visitors', dashed: true },
              ]}
              summary={`${plural(viewsTotal, 'view')} since ${day(detail.traffic[0].date)}.`}
            />
          ) : (
            <Empty title="No traffic collected">
              Traffic needs a token with push access to the repo.
            </Empty>
          )}
        </Panel>

        {stars.length > 1 ? (
          <Panel title="Stars over time">
            <TrendChart
              kind="line"
              height={180}
              data={stars}
              series={[{ key: 'stars', label: 'Stars' }]}
              summary={`${plural(stars[stars.length - 1].stars, 'star')} today.`}
            />
          </Panel>
        ) : project.workers.length ? null : (
          <Panel title="Stars over time">
            <Empty
              title={stars.length ? 'One data point so far' : 'No stars yet'}
            >
              The line starts once there is a star to draw.
            </Empty>
          </Panel>
        )}

        {project.workers.length > 0 && (
          <Panel
            title="Worker requests"
            info={
              <p>
                Requests per day to {project.workers.join(', ')} on Cloudflare
                Workers. Static assets served without running the Worker are not
                counted, so compare a project with itself over time rather than
                with other projects.
              </p>
            }
          >
            {requests.length ? (
              <TrendChart
                kind="bar"
                height={180}
                data={requests}
                series={[{ key: 'requests', label: 'Requests' }]}
                summary={`Worker requests per day since ${day(requests[0].date)}.`}
              />
            ) : (
              <Empty title="No Worker analytics yet">
                Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ANALYTICS_TOKEN to the
                repo’s secrets and the next morning’s run fills this in.
              </Empty>
            )}
          </Panel>
        )}
      </div>

      {detail.authors.length > 1 && (
        <Panel title="Authors" bodyClassName="p-0">
          <ul className="divide-y text-sm">
            {detail.authors.slice(0, 8).map((a) => (
              <li
                key={a.author}
                className="flex items-baseline gap-3 px-4 py-2"
              >
                <span className="min-w-0 flex-1 truncate">
                  {a.author.startsWith('email:')
                    ? 'An author without a GitHub account'
                    : a.author}
                </span>
                <span className="tabular-nums">
                  {plural(a.commits, 'commit')}
                </span>
                <span className="w-28 text-right text-xs text-muted-foreground">
                  {ago(a.last, asOf)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

function Releases({ project, asOf }: { project: Project; asOf: string }) {
  if (project.releases.length === 0) return null;
  const gap = medianGap(project.releases, asOf);
  return (
    <Panel
      title="Releases"
      bodyClassName="p-0"
      actions={
        gap !== null ? (
          <span className="text-xs text-muted-foreground">
            every {plural(gap, 'day')}, median
          </span>
        ) : undefined
      }
    >
      <ul className="divide-y">
        {project.releases.slice(0, 10).map((r) => (
          <li
            key={r.tag}
            className="flex items-baseline gap-2 px-4 py-2 text-sm"
          >
            <a
              href={releaseUrl(project.repo, r.tag)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs hover:underline"
            >
              {r.tag}
            </a>
            {r.prerelease && (
              <span className="border border-dashed px-1 text-[11px] text-muted-foreground">
                pre
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {day(r.date, asOf)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Facts({ project, asOf }: { project: Project; asOf: string }) {
  const { meta, health } = project;
  const rows: [string, ReactNode][] = [
    [
      'Status',
      <StatusDot key="s" status={statusOf(project, asOf)} withLabel />,
    ],
    ['Created', day(meta?.created_at)],
    ['License', meta?.license ?? 'None'],
    ['Commits', num(meta?.total_commits)],
    [
      'Latest release',
      meta?.latest_release ? (
        <a
          key="r"
          href={releaseUrl(project.repo, meta.latest_release.tag)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs hover:underline"
        >
          {meta.latest_release.tag}
        </a>
      ) : (
        'None'
      ),
    ],
    ['Open issues', num(health?.open_issues)],
    ['Open pull requests', num(health?.open_prs)],
    ['Merged PRs, 30 days', num(health?.merged_prs_30d)],
    ['Forks', num(health?.forks)],
    ['Watchers', num(health?.subscribers)],
  ];
  return (
    <aside className="flex min-w-0 flex-col gap-6" aria-label="About the repo">
      <Panel title="At a glance" bodyClassName="p-0">
        <dl className="divide-y text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-3 px-4 py-2">
              <dt className="flex-1 text-muted-foreground">{k}</dt>
              <dd className="text-right tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      {meta?.last_commit && (
        <Panel title="Last commit">
          <a
            href={commitUrl(project.repo, meta.last_commit.sha)}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col gap-1 hover:underline"
          >
            <span className="text-sm">{meta.last_commit.message}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {meta.last_commit.sha} · {ago(meta.last_commit.date, asOf)}
            </span>
          </a>
        </Panel>
      )}

      {meta && meta.languages.length > 0 && (
        <Panel title="Languages">
          <LanguageBar languages={meta.languages} />
        </Panel>
      )}

      {(project.stack.length > 0 || (meta?.topics.length ?? 0) > 0) && (
        <Panel title="Built with">
          <div className="flex flex-col gap-3">
            {project.stack.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {project.stack.map((s) => (
                  <li key={s} className="border bg-muted px-2 py-0.5 text-xs">
                    {s}
                  </li>
                ))}
              </ul>
            )}
            {meta && meta.topics.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Topics">
                {meta.topics.map((t) => (
                  <li
                    key={t}
                    className="border border-dashed px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      )}
    </aside>
  );
}
