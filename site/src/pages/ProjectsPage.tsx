import {
  CaretDownIcon,
  CaretUpIcon,
  ListIcon,
  SquaresFourIcon,
} from '@phosphor-icons/react';
import { use } from 'react';
import { Sparkline } from '@/components/charts';
import { PageHeader } from '@/components/Page';
import { ProjectCard } from '@/components/ProjectCard';
import { StatusDot } from '@/components/StatusDot';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { load, type Project, SUMMARY_URL, type Summary } from '@/lib/data';
import { type Status, statusOf } from '@/lib/derive';
import { ago, num } from '@/lib/format';
import { withViewTransition } from '@/lib/motion';
import { linkProps, setQuery, useQuery } from '@/lib/router';
import { cn } from '@/lib/utils';
import { useMotion } from '@/providers/MotionProvider';

type SortKey =
  | 'name'
  | 'status'
  | 'commits'
  | 'last'
  | 'stars'
  | 'views'
  | 'requests';

const STATUS_ORDER: Record<Status, number> = {
  active: 0,
  steady: 1,
  quiet: 2,
  archived: 3,
};

interface Column {
  key: SortKey;
  label: string;
  numeric?: boolean;
  /** Higher-is-first by default for numbers and dates. */
  value: (p: Project, asOf: string) => string | number | null;
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Project', value: (p) => p.name.toLowerCase() },
  {
    key: 'status',
    label: 'Status',
    value: (p, asOf) => STATUS_ORDER[statusOf(p, asOf)],
  },
  {
    key: 'commits',
    label: 'Commits, 30d',
    numeric: true,
    value: (p) => p.stats.commits_30d,
  },
  {
    key: 'last',
    label: 'Last commit',
    numeric: true,
    value: (p) => p.stats.last_commit,
  },
  {
    key: 'stars',
    label: 'Stars',
    numeric: true,
    value: (p) => p.health?.stars ?? null,
  },
  {
    key: 'views',
    label: 'Views, 14d',
    numeric: true,
    value: (p) => p.stats.views_14d,
  },
  {
    key: 'requests',
    label: 'Requests, 30d',
    numeric: true,
    value: (p) => p.stats.requests_30d,
  },
];

function sortProjects(
  projects: Project[],
  key: SortKey,
  dir: 'asc' | 'desc',
  asOf: string,
): Project[] {
  const col = COLUMNS.find((c) => c.key === key) ?? COLUMNS[2];
  const sign = dir === 'asc' ? 1 : -1;
  return [...projects].sort((a, b) => {
    const va = col.value(a, asOf);
    const vb = col.value(b, asOf);
    // Unknown sorts last whichever way the column runs.
    if (va === null && vb === null) return a.name.localeCompare(b.name);
    if (va === null) return 1;
    if (vb === null) return -1;
    if (va === vb) return a.name.localeCompare(b.name);
    return (va < vb ? -1 : 1) * sign;
  });
}

export function ProjectsPage() {
  const summary = use(load<Summary>(SUMMARY_URL));
  const { active } = useMotion();
  const query = useQuery();
  const asOf = summary.generated_at;

  const group = summary.groups.some((g) => g.id === query.get('group'))
    ? (query.get('group') as string)
    : 'all';
  const view = query.get('view') === 'table' ? 'table' : 'cards';
  const sort = (COLUMNS.find((c) => c.key === query.get('sort'))?.key ??
    'commits') as SortKey;
  const defaultDir = sort === 'name' || sort === 'status' ? 'asc' : 'desc';
  const dir =
    query.get('dir') === 'asc' || query.get('dir') === 'desc'
      ? (query.get('dir') as 'asc' | 'desc')
      : defaultDir;

  const hasRequests = summary.sources.apps.collected > 0;
  const columns = COLUMNS.filter((c) => c.key !== 'requests' || hasRequests);
  const filtered = summary.projects.filter(
    (p) => group === 'all' || p.group === group,
  );

  const change = (changes: Record<string, string | null>) =>
    setQuery(changes, {
      transition: (u) => withViewTransition(u, active, 'filter'),
    });

  return (
    <>
      <PageHeader
        title="Projects"
        description="Every tracked repo: what it is, where it stands, and how busy it has been."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ToggleGroup
          aria-label="Group"
          variant="outline"
          value={[group]}
          onValueChange={(v: string[]) => {
            const next = v[0];
            if (next) change({ group: next === 'all' ? null : next });
          }}
        >
          <ToggleGroupItem value="all" className="h-11 px-3 desk:h-8">
            All
          </ToggleGroupItem>
          {summary.groups.map((g) => (
            <ToggleGroupItem
              key={g.id}
              value={g.id}
              className="h-11 px-3 desk:h-8"
            >
              {g.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          aria-label="Layout"
          variant="outline"
          className="ml-auto"
          value={[view]}
          onValueChange={(v: string[]) => {
            const next = v[0];
            if (next) change({ view: next === 'cards' ? null : next });
          }}
        >
          <ToggleGroupItem
            value="cards"
            aria-label="Cards"
            className="size-11 desk:size-8"
          >
            <SquaresFourIcon />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="table"
            aria-label="Table"
            className="size-11 desk:size-8"
          >
            <ListIcon />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="vt-list">
        {view === 'cards' ? (
          <div className="flex flex-col gap-8">
            {summary.groups
              .filter((g) => group === 'all' || g.id === group)
              .map((g) => {
                const items = filtered.filter((p) => p.group === g.id);
                if (items.length === 0) return null;
                return (
                  <section
                    key={g.id}
                    aria-labelledby={`group-${g.id}`}
                    className="flex flex-col gap-3"
                  >
                    <h2
                      id={`group-${g.id}`}
                      className="flex items-baseline gap-2 font-heading text-lg font-semibold"
                    >
                      {g.name}
                      <span className="text-xs font-normal text-muted-foreground tabular-nums">
                        {items.length}
                      </span>
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {items.map((p, i) => (
                        <ProjectCard
                          key={p.id}
                          project={p}
                          asOf={asOf}
                          index={i}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
          </div>
        ) : (
          <div className="scrollbar-thin overflow-x-auto border bg-card">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  {columns.map((c) => {
                    const sorted = sort === c.key;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={
                          sorted
                            ? dir === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : undefined
                        }
                        className={cn(
                          'px-3 font-medium',
                          c.numeric && 'text-right',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const natural =
                              c.key === 'name' || c.key === 'status'
                                ? 'asc'
                                : 'desc';
                            const next = sorted
                              ? dir === 'asc'
                                ? 'desc'
                                : 'asc'
                              : natural;
                            change({
                              sort: c.key === 'commits' ? null : c.key,
                              dir: next === natural ? null : next,
                            });
                          }}
                          className={cn(
                            'press inline-flex min-h-11 items-center gap-1 outline-ring/50 hover:text-foreground focus-visible:outline-2 desk:min-h-9',
                            sorted && 'text-foreground',
                          )}
                        >
                          {c.label}
                          {sorted &&
                            (dir === 'asc' ? (
                              <CaretUpIcon aria-hidden />
                            ) : (
                              <CaretDownIcon aria-hidden />
                            ))}
                        </button>
                      </th>
                    );
                  })}
                  <th scope="col" className="px-3 font-medium">
                    <span className="sr-only">Commits, 26 weeks</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortProjects(filtered, sort, dir, asOf).map((p) => (
                  <tr key={p.id} className="row hover:bg-muted/50">
                    <th
                      scope="row"
                      className="px-3 py-1.5 text-left font-normal"
                    >
                      <a
                        {...linkProps({ name: 'project', id: p.id })}
                        className="flex flex-col outline-ring/50 hover:underline focus-visible:outline-2"
                      >
                        <span className="font-medium">{p.name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {p.meta?.language ?? '–'}
                        </span>
                      </a>
                    </th>
                    <td className="px-3">
                      <StatusDot status={statusOf(p, asOf)} withLabel />
                    </td>
                    <td className="px-3 text-right tabular-nums">
                      {num(p.stats.commits_30d)}
                    </td>
                    <td className="px-3 text-right text-muted-foreground">
                      {ago(p.stats.last_commit, asOf)}
                    </td>
                    <td className="px-3 text-right tabular-nums">
                      {num(p.health?.stars)}
                    </td>
                    <td className="px-3 text-right tabular-nums">
                      {num(p.stats.views_14d)}
                    </td>
                    {hasRequests && (
                      <td className="px-3 text-right tabular-nums">
                        {num(p.stats.requests_30d)}
                      </td>
                    )}
                    <td className="w-32 px-3">
                      <Sparkline
                        points={p.weekly_commits}
                        className="w-28"
                        height={18}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
