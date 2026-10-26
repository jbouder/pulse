import { InfoIcon } from '@phosphor-icons/react';
import { Suspense, use } from 'react';
import { PulseMark } from '@/components/PulseMark';
import { StatusDot } from '@/components/StatusDot';
import { load, SUMMARY_URL, type Summary } from '@/lib/data';
import { statusOf } from '@/lib/derive';
import { day } from '@/lib/format';
import { NAV, sectionOf } from '@/lib/nav';
import { linkProps, type Route } from '@/lib/router';
import { cn } from '@/lib/utils';

const ITEM =
  'press flex items-center px-2 text-sm outline-ring/50 hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:-outline-offset-2';
const CURRENT =
  'bg-sidebar-accent font-semibold text-sidebar-accent-foreground';

/**
 * The desktop rail (≥ 820px): the brand, the sections, every project by
 * group with its status dot, and a footer with the collection date.
 * Hidden below 820px; the tab bar takes over.
 */
export function Rail({ route }: { route: Route }) {
  const section = sectionOf(route);
  return (
    <aside
      aria-label="Pulse"
      className="sticky top-0 hidden h-dvh w-(--rail-width) shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground desk:flex"
    >
      <a
        {...linkProps({ name: 'overview' })}
        className="press flex h-14 shrink-0 items-center gap-2.5 px-4 outline-ring/50 focus-visible:outline-2 focus-visible:-outline-offset-2"
      >
        <PulseMark className="size-6" />
        <span className="font-heading text-base font-semibold tracking-tight">
          Pulse
        </span>
      </a>

      <nav
        aria-label="Sections"
        className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-4"
      >
        <ul className="flex flex-col">
          {NAV.map(({ route: to, label, icon: Icon }) => {
            const current = section === to.name;
            return (
              <li key={to.name}>
                <a
                  {...linkProps(to)}
                  aria-current={current ? 'page' : undefined}
                  className={cn(ITEM, 'h-9 gap-2.5', current && CURRENT)}
                >
                  <Icon weight={current ? 'fill' : 'regular'} aria-hidden />
                  <span className="flex-1">{label}</span>
                </a>
              </li>
            );
          })}
        </ul>
        <Suspense fallback={null}>
          <RailProjects route={route} />
        </Suspense>
      </nav>

      <footer className="flex flex-col gap-1 border-t px-2 py-2">
        <a
          {...linkProps({ name: 'about' })}
          aria-current={route.name === 'about' ? 'page' : undefined}
          className={cn(
            ITEM,
            'h-8 gap-2.5 text-muted-foreground',
            route.name === 'about' && CURRENT,
          )}
        >
          <InfoIcon aria-hidden />
          <span className="flex-1">About the data</span>
        </a>
        <Suspense fallback={null}>
          <Collected />
        </Suspense>
      </footer>
    </aside>
  );
}

function RailProjects({ route }: { route: Route }) {
  const summary = use(load<Summary>(SUMMARY_URL));
  return summary.groups.map((g) => {
    const projects = summary.projects.filter((p) => p.group === g.id);
    if (projects.length === 0) return null;
    return (
      <section key={g.id} aria-labelledby={`rail-${g.id}`}>
        <h2
          id={`rail-${g.id}`}
          className="px-2 pb-1 text-xs font-medium text-muted-foreground"
        >
          {g.name}
        </h2>
        <ul className="flex flex-col">
          {projects.map((p) => {
            const current = route.name === 'project' && route.id === p.id;
            return (
              <li key={p.id}>
                <a
                  {...linkProps({ name: 'project', id: p.id })}
                  aria-current={current ? 'page' : undefined}
                  className={cn(ITEM, 'h-8 gap-2', current && CURRENT)}
                >
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <StatusDot status={statusOf(p, summary.generated_at)} />
                </a>
              </li>
            );
          })}
        </ul>
      </section>
    );
  });
}

function Collected() {
  const summary = use(load<Summary>(SUMMARY_URL));
  return (
    <p className="px-2 text-xs text-muted-foreground">
      Collected {day(summary.generated_at)}
    </p>
  );
}
