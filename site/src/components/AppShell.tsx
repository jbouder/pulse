import { lazy, Suspense, use, useCallback, useEffect, useState } from 'react';
import { PageErrorBoundary, PageSkeleton } from '@/components/Page';
import { Rail } from '@/components/Rail';
import { TabBar } from '@/components/TabBar';
import { TopBar } from '@/components/TopBar';
import {
  forget,
  load,
  projectUrl,
  SUMMARY_URL,
  type Summary,
} from '@/lib/data';
import { withViewTransition } from '@/lib/motion';
import { titleOf } from '@/lib/nav';
import { type Route, setRouteTransition, useRoute } from '@/lib/router';
import { AboutPage } from '@/pages/AboutPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { OverviewPage } from '@/pages/OverviewPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { ReleasesPage } from '@/pages/ReleasesPage';
import { useMotion } from '@/providers/MotionProvider';

/**
 * The rail (desktop) or tab bar (phone), the top bar, and one page. Route
 * changes run inside a `page` view transition: only `.page` has a
 * transition name, so the page lifts out and the next settles in while the
 * rail, top bar and tab bar hold still. DOM order is rail → top bar →
 * main, which is the tab order.
 */
export function AppShell() {
  const route = useRoute();
  const { active } = useMotion();
  // Bumped by "Try again" so the boundary remounts and refetches.
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    forget(SUMMARY_URL);
    if (route.name === 'project') forget(projectUrl(route.id));
    setAttempt((n) => n + 1);
  }, [route]);

  useEffect(() => {
    setRouteTransition((update) => withViewTransition(update, active, 'page'));
  }, [active]);

  const key = pageKey(route);
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-background focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <Rail route={route} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense
          fallback={
            <TopBar route={route} title={titleOf(route)} pageKey={key} />
          }
        >
          <TitledTopBar route={route} pageKey={key} />
        </Suspense>
        {/* Keyed by page so each mounts fresh and its entrances replay. */}
        <main
          id="main"
          key={`${key}:${attempt}`}
          className="page mx-auto flex w-full max-w-(--content-max) min-w-0 flex-1 flex-col px-4 pt-6 pb-[calc(2rem+var(--tabbar-height)+env(safe-area-inset-bottom))] sm:px-6"
        >
          <PageErrorBoundary onRetry={retry}>
            <Suspense fallback={<PageSkeleton />}>
              <Page route={route} />
            </Suspense>
          </PageErrorBoundary>
        </main>
      </div>
      <TabBar route={route} />
    </div>
  );
}

/** The top bar with the project's name once the summary has loaded. */
function TitledTopBar({ route, pageKey }: { route: Route; pageKey: string }) {
  const summary = use(load<Summary>(SUMMARY_URL));
  const name =
    route.name === 'project'
      ? summary.projects.find((p) => p.id === route.id)?.name
      : undefined;
  const title = titleOf(route, name);
  useEffect(() => {
    document.title = route.name === 'overview' ? 'Pulse' : `${title} · Pulse`;
  }, [route.name, title]);
  return <TopBar route={route} title={title} pageKey={pageKey} />;
}

// The two pages with full charts load Recharts on first visit, so the
// overview does not wait for it.
const ProjectPage = lazy(() =>
  import('@/pages/ProjectPage').then((m) => ({ default: m.ProjectPage })),
);
const TrafficPage = lazy(() =>
  import('@/pages/TrafficPage').then((m) => ({ default: m.TrafficPage })),
);

function pageKey(route: Route): string {
  return route.name === 'project' ? `project:${route.id}` : route.name;
}

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'overview':
      return <OverviewPage />;
    case 'projects':
      return <ProjectsPage />;
    case 'project':
      return <ProjectPage id={route.id} />;
    case 'releases':
      return <ReleasesPage />;
    case 'traffic':
      return <TrafficPage />;
    case 'about':
      return <AboutPage />;
    case 'notFound':
      return <NotFoundPage />;
  }
}
