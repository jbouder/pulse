import { ArrowRightIcon } from '@phosphor-icons/react';
import { use, useMemo } from 'react';
import { Heatmap } from '@/components/charts';
import { Empty, PageHeader, Panel, StatTile } from '@/components/Page';
import { ProjectCard } from '@/components/ProjectCard';
import {
  commitUrl,
  load,
  releaseUrl,
  SUMMARY_URL,
  type Summary,
} from '@/lib/data';
import {
  releaseFeed,
  statusOf,
  streaks,
  sumKnown,
  sumPrevious,
} from '@/lib/derive';
import { ago, day, num, plural } from '@/lib/format';
import { linkProps } from '@/lib/router';

export function OverviewPage() {
  const summary = use(load<Summary>(SUMMARY_URL));
  const { projects, generated_at: asOf } = summary;

  const totals = useMemo(() => {
    const active = projects.filter((p) => statusOf(p, asOf) === 'active');
    return {
      commits: sumKnown(projects, (p) => p.stats.commits_30d),
      commitsPrev: sumKnown(projects, (p) => p.stats.commits_prev_30d),
      active: active.length,
      stars: sumKnown(projects, (p) => p.health?.stars),
      starsGained: sumKnown(projects, (p) => p.stats.stars_gained_30d),
      views: sumKnown(projects, (p) => p.stats.views_14d),
      viewsPrev: sumPrevious(
        projects,
        (p) => p.stats.views_14d,
        (p) => p.stats.views_prev_14d,
      ),
      requests: sumKnown(projects, (p) => p.stats.requests_30d),
      requestsPrev: sumPrevious(
        projects,
        (p) => p.stats.requests_30d,
        (p) => p.stats.requests_prev_30d,
      ),
    };
  }, [projects, asOf]);

  const year = streaks(summary.activity);
  const yearTotal = summary.activity.reduce((a, p) => a + p.count, 0);
  const featured = projects.filter((p) => p.featured);
  const latest = projects
    .filter((p) => p.meta?.last_commit)
    .sort((a, b) =>
      (b.meta?.last_commit?.date ?? '').localeCompare(
        a.meta?.last_commit?.date ?? '',
      ),
    )
    .slice(0, 6);
  const releases = releaseFeed(projects).slice(0, 6);

  return (
    <>
      <PageHeader
        eyebrow={`${summary.owner} · ${plural(projects.length, 'project')}`}
        title="Pulse"
        description="Health and activity across the projects: commits, stars, releases and traffic, collected every morning."
      />

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            index={0}
            label="Commits, 30 days"
            value={totals.commits}
            previous={totals.commitsPrev}
          />
          <StatTile
            index={1}
            label="Active projects"
            value={totals.active}
            hint={`of ${projects.length}, a commit in 14 days`}
          />
          <StatTile
            index={2}
            label="Stars"
            value={totals.stars}
            hint={
              totals.starsGained !== null
                ? `${totals.starsGained >= 0 ? '+' : ''}${num(totals.starsGained)} in 30 days`
                : undefined
            }
          />
          {totals.requests !== null ? (
            <StatTile
              index={3}
              label="Worker requests, 30 days"
              value={totals.requests}
              previous={totals.requestsPrev}
            />
          ) : (
            <StatTile
              index={3}
              label="Repo views, 14 days"
              value={totals.views}
              previous={totals.viewsPrev}
            />
          )}
        </div>

        <Panel
          title="Commits, the last year"
          info={
            <p>
              Commits per day on each project’s default branch, every project
              together, Monday at the top of each column. Bots are left out.
              Darker means more, split at the quartiles of the year’s active
              days so one big day does not wash out the rest.
            </p>
          }
        >
          <Heatmap
            points={summary.activity}
            summary={`${plural(yearTotal, 'commit')} over the last year, on ${plural(year.active, 'day')}; the longest run was ${plural(year.longest, 'day')} in a row.`}
          />
          <p className="mt-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">
              {num(yearTotal)}
            </span>{' '}
            commits on {plural(year.active, 'day')}. Longest streak{' '}
            {plural(year.longest, 'day')}.
          </p>
        </Panel>

        <section aria-labelledby="featured" className="flex flex-col gap-3">
          <div className="flex items-center">
            <h2
              id="featured"
              className="flex-1 font-heading text-lg font-semibold"
            >
              Featured
            </h2>
            <a
              {...linkProps({ name: 'projects' })}
              className="press flex min-h-11 items-center gap-1 text-sm text-muted-foreground outline-ring/50 hover:text-foreground focus-visible:outline-2 desk:min-h-8"
            >
              All projects <ArrowRightIcon aria-hidden />
            </a>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {featured.map((p, i) => (
              <ProjectCard key={p.id} project={p} asOf={asOf} index={i} />
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Latest commits" bodyClassName="p-0">
            <ul className="divide-y">
              {latest.map((p) => {
                const c = p.meta?.last_commit;
                if (!c) return null;
                return (
                  <li key={p.id} className="flex flex-col gap-0.5 px-4 py-2.5">
                    <div className="flex items-baseline gap-2 text-sm">
                      <a
                        {...linkProps({ name: 'project', id: p.id })}
                        className="font-medium hover:underline"
                      >
                        {p.name}
                      </a>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {ago(c.date, asOf)}
                      </span>
                    </div>
                    <a
                      href={commitUrl(p.repo, c.sha)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-w-0 items-baseline gap-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <code className="shrink-0 font-mono text-xs">
                        {c.sha}
                      </code>
                      <span className="truncate">{c.message}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel title="Recent releases" bodyClassName="p-0">
            {releases.length === 0 ? (
              <Empty title="No releases yet" className="m-4">
                Releases published on GitHub show up here.
              </Empty>
            ) : (
              <ul className="divide-y">
                {releases.map((r) => (
                  <li
                    key={`${r.project.id}:${r.tag}`}
                    className="flex items-baseline gap-2 px-4 py-2.5 text-sm"
                  >
                    <a
                      {...linkProps({ name: 'project', id: r.project.id })}
                      className="font-medium hover:underline"
                    >
                      {r.project.name}
                    </a>
                    <a
                      href={releaseUrl(r.project.repo, r.tag)}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate font-mono text-xs text-muted-foreground hover:text-foreground"
                    >
                      {r.tag}
                    </a>
                    {r.prerelease && (
                      <span className="border border-dashed px-1 text-[11px] text-muted-foreground">
                        pre
                      </span>
                    )}
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {day(r.date, asOf)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
