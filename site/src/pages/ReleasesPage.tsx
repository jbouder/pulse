import { use } from 'react';
import { Empty, PageHeader, Panel, StatTile } from '@/components/Page';
import { Switch } from '@/components/ui/switch';
import { load, releaseUrl, SUMMARY_URL, type Summary } from '@/lib/data';
import { medianGap, releaseFeed } from '@/lib/derive';
import { ago, day, num, plural } from '@/lib/format';
import { linkProps, setQuery, useQuery } from '@/lib/router';

export function ReleasesPage() {
  const summary = use(load<Summary>(SUMMARY_URL));
  const query = useQuery();
  const asOf = summary.generated_at;
  const prereleases = query.get('pre') !== '0';

  const feed = releaseFeed(summary.projects, { prereleases });
  const releasing = summary.projects
    .filter((p) => p.releases.some((r) => !r.prerelease))
    .map((p) => {
      const stable = p.releases.filter((r) => !r.prerelease);
      return {
        project: p,
        latest: stable[0],
        gap: medianGap(p.releases, asOf),
      };
    })
    .sort((a, b) => b.latest.date.localeCompare(a.latest.date));
  const stable90 = summary.projects.reduce(
    (a, p) => a + p.stats.releases_90d,
    0,
  );

  return (
    <>
      <PageHeader
        title="Releases"
        description="Tagged releases on GitHub across every project, newest first."
      />
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatTile
            index={0}
            label="Releases, 90 days"
            value={stable90}
            hint="stable only"
          />
          <StatTile
            index={1}
            label="Projects that release"
            value={releasing.length}
            hint={`of ${summary.projects.length}`}
          />
          <StatTile
            index={2}
            label="Latest release"
            value={feed.length ? 0 : null}
            format={() => (feed[0] ? ago(feed[0].date, asOf) : '–')}
            hint={
              feed[0] ? `${feed[0].project.name} ${feed[0].tag}` : undefined
            }
          />
        </div>

        {releasing.length > 0 && (
          <Panel
            title="Cadence"
            bodyClassName="p-0"
            info={
              <p>
                Stable releases only. The median gap is measured over the last
                year, so a project that was busy long ago and is quiet now does
                not look healthy.
              </p>
            }
          >
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-4 py-2 font-medium">
                      Project
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Latest
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2 text-right font-medium"
                    >
                      Released
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2 text-right font-medium"
                    >
                      90 days
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2 text-right font-medium"
                    >
                      Median gap
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {releasing.map(({ project, latest, gap }) => (
                    <tr key={project.id} className="row">
                      <th scope="row" className="px-4 text-left font-medium">
                        <a
                          {...linkProps({ name: 'project', id: project.id })}
                          className="hover:underline"
                        >
                          {project.name}
                        </a>
                      </th>
                      <td className="px-4 font-mono text-xs">{latest.tag}</td>
                      <td className="px-4 text-right text-muted-foreground">
                        {ago(latest.date, asOf)}
                      </td>
                      <td className="px-4 text-right tabular-nums">
                        {num(project.stats.releases_90d)}
                      </td>
                      <td className="px-4 text-right tabular-nums">
                        {gap === null ? '–' : plural(gap, 'day')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        <Panel
          title="All releases"
          bodyClassName="p-0"
          actions={
            <span className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground desk:min-h-8">
              <span aria-hidden>Prereleases</span>
              <Switch
                aria-label="Show prereleases"
                checked={prereleases}
                onCheckedChange={(on) => setQuery({ pre: on ? null : '0' })}
              />
            </span>
          }
        >
          {feed.length === 0 ? (
            <Empty title="No releases yet" className="m-4">
              Publish a release on GitHub and it shows up here the next morning.
            </Empty>
          ) : (
            <ol className="divide-y">
              {feed.map((r) => (
                <li
                  key={`${r.project.id}:${r.tag}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm"
                >
                  <time
                    dateTime={r.date}
                    className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums"
                  >
                    {day(r.date, asOf)}
                  </time>
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
                    className="font-mono text-xs text-muted-foreground hover:text-foreground"
                  >
                    {r.tag}
                  </a>
                  {r.prerelease && (
                    <span className="border border-dashed px-1 text-[11px] text-muted-foreground">
                      prerelease
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </>
  );
}
