import { use, useMemo } from 'react';
import { Sparkline } from '@/components/charts';
import { Empty, PageHeader, Panel, StatTile } from '@/components/Page';
import { TrendChart } from '@/components/TrendChart';
import { load, type Project, SUMMARY_URL, type Summary } from '@/lib/data';
import { sumKnown, sumPrevious } from '@/lib/derive';
import { change, day, num, plural } from '@/lib/format';
import { linkProps } from '@/lib/router';
import { cn } from '@/lib/utils';

/** Daily totals across projects of one of their recent series. */
function together(
  projects: Project[],
  pick: (p: Project) => { date: string; count: number }[],
) {
  const by = new Map<string, number>();
  for (const p of projects) {
    for (const pt of pick(p))
      by.set(pt.date, (by.get(pt.date) ?? 0) + pt.count);
  }
  return [...by]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

function Change({
  current,
  previous,
}: {
  current: number | null;
  previous: number | null;
}) {
  const c = change(current, previous);
  if (!c) return <span className="text-muted-foreground">–</span>;
  return (
    <span className={cn('tabular-nums', c.pct > 0 && 'text-ok')}>
      {c.label}
    </span>
  );
}

export function TrafficPage() {
  const summary = use(load<Summary>(SUMMARY_URL));
  const { projects } = summary;

  const repo = useMemo(
    () =>
      projects
        .filter((p) => p.stats.views_14d !== null)
        .sort((a, b) => (b.stats.views_14d ?? 0) - (a.stats.views_14d ?? 0)),
    [projects],
  );
  const apps = useMemo(
    () =>
      projects
        .filter((p) => p.workers.length > 0)
        .sort(
          (a, b) => (b.stats.requests_30d ?? -1) - (a.stats.requests_30d ?? -1),
        ),
    [projects],
  );
  const views = together(projects, (p) => p.recent_views);
  const viewsTotal = sumKnown(projects, (p) => p.stats.views_14d);
  const appsCollected = summary.sources.apps.collected > 0;

  return (
    <>
      <PageHeader
        title="Traffic"
        description="Who is looking: repo views and clones on GitHub, and requests to the apps on Cloudflare Workers."
      />
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            index={0}
            label="Repo views, 14 days"
            value={viewsTotal}
            previous={sumPrevious(
              projects,
              (p) => p.stats.views_14d,
              (p) => p.stats.views_prev_14d,
            )}
          />
          <StatTile
            index={1}
            label="Unique visitors, 14 days"
            value={sumKnown(projects, (p) => p.stats.unique_views_14d)}
            hint="summed per day"
          />
          <StatTile
            index={2}
            label="Clones, 14 days"
            value={sumKnown(projects, (p) => p.stats.clones_14d)}
            hint={`${num(sumKnown(projects, (p) => p.stats.unique_clones_14d))} unique`}
          />
          <StatTile
            index={3}
            label="Worker requests, 30 days"
            value={sumKnown(projects, (p) => p.stats.requests_30d)}
            previous={sumPrevious(
              projects,
              (p) => p.stats.requests_30d,
              (p) => p.stats.requests_prev_30d,
            )}
          />
        </div>

        <Panel
          title="Repo views per day"
          info={
            <p>
              Views of every tracked repo on GitHub, together. GitHub keeps 14
              days of traffic; Pulse has kept every day since{' '}
              {day(summary.sources.traffic.since)}. Unique visitors are counted
              per day by GitHub, so a person who comes back on two days counts
              twice.
            </p>
          }
        >
          {views.length ? (
            <TrendChart
              kind="bar"
              height={200}
              data={views}
              series={[{ key: 'count', label: 'Views' }]}
              summary={`Repo views per day over the last ${plural(views.length, 'day')}.`}
            />
          ) : (
            <Empty title="No traffic collected yet">
              Repo traffic needs PULSE_GITHUB_TOKEN with push access to the
              tracked repos.
            </Empty>
          )}
        </Panel>

        <Panel title="By repo" bodyClassName="p-0">
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">
                    Project
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Views
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Change
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Visitors
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Clones
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    <span className="sr-only">Views, 28 days</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {repo.map((p) => (
                  <tr key={p.id} className="row">
                    <th scope="row" className="px-4 text-left font-medium">
                      <a
                        {...linkProps({ name: 'project', id: p.id })}
                        className="hover:underline"
                      >
                        {p.name}
                      </a>
                    </th>
                    <td className="px-4 text-right tabular-nums">
                      {num(p.stats.views_14d)}
                    </td>
                    <td className="px-4 text-right">
                      <Change
                        current={p.stats.views_14d}
                        previous={p.stats.views_prev_14d}
                      />
                    </td>
                    <td className="px-4 text-right tabular-nums">
                      {num(p.stats.unique_views_14d)}
                    </td>
                    <td className="px-4 text-right tabular-nums">
                      {num(p.stats.clones_14d)}
                    </td>
                    <td className="w-36 px-4">
                      <Sparkline
                        points={p.recent_views}
                        className="w-32"
                        height={18}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Apps on Cloudflare Workers"
          bodyClassName="p-0"
          info={
            <p>
              Requests per Worker script, from Cloudflare’s Workers analytics. A
              Worker that serves static assets without running first is invoked
              for less than every request, so compare each app with itself over
              time.
            </p>
          }
        >
          {!appsCollected && (
            <Empty title="Not collected yet" className="m-4">
              Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ANALYTICS_TOKEN (Account
              Analytics: Read) to the repo’s secrets; the next morning’s run
              fills this table in.
            </Empty>
          )}
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">
                    Project
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Workers
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Requests, 30d
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Change
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    <span className="sr-only">Requests, 30 days</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {apps.map((p) => (
                  <tr key={p.id} className="row">
                    <th scope="row" className="px-4 text-left font-medium">
                      <a
                        {...linkProps({ name: 'project', id: p.id })}
                        className="hover:underline"
                      >
                        {p.name}
                      </a>
                    </th>
                    <td className="px-4 font-mono text-xs text-muted-foreground">
                      {p.workers.join(', ')}
                    </td>
                    <td className="px-4 text-right tabular-nums">
                      {num(p.stats.requests_30d)}
                    </td>
                    <td className="px-4 text-right">
                      <Change
                        current={p.stats.requests_30d}
                        previous={p.stats.requests_prev_30d}
                      />
                    </td>
                    <td className="w-36 px-4">
                      {p.recent_requests.length > 0 && (
                        <Sparkline
                          points={p.recent_requests}
                          className="w-32"
                          height={18}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
