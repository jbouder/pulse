import { useSyncExternalStore } from 'react';

/**
 * A small `history.pushState` router, holocron's and datapad's. Route
 * changes go through `runTransition`, which the app shell points at
 * `withViewTransition` so navigation animates as a page transition.
 *
 * The query string is separate state (`useQuery` / `setQuery`): filters
 * and sorts live there so the back button restores them and any view can
 * be shared as a link, and changing one is not a page change.
 */

export type Route =
  | { name: 'overview' }
  | { name: 'projects' }
  | { name: 'project'; id: string }
  | { name: 'releases' }
  | { name: 'traffic' }
  | { name: 'about' }
  | { name: 'notFound' };

export type RouteName = Route['name'];

export function parse(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { name: 'overview' };
  if (path === '/projects') return { name: 'projects' };
  const project = /^\/projects\/([a-z0-9-]+)$/.exec(path);
  if (project) return { name: 'project', id: project[1] };
  if (path === '/releases') return { name: 'releases' };
  if (path === '/traffic') return { name: 'traffic' };
  if (path === '/about') return { name: 'about' };
  return { name: 'notFound' };
}

export function pathFor(route: Route): string {
  switch (route.name) {
    case 'overview':
      return '/';
    case 'project':
      return `/projects/${route.id}`;
    case 'notFound':
      return window.location.pathname;
    default:
      return `/${route.name}`;
  }
}

/** Two routes are the same page: same name, same project. */
export function samePage(a: Route, b: Route): boolean {
  return (
    a.name === b.name &&
    (a.name !== 'project' || a.id === (b as { id: string }).id)
  );
}

function here(): string {
  return (
    window.location.pathname + window.location.search + window.location.hash
  );
}

let current: Route = parse(window.location.pathname);
let search = window.location.search;
const listeners = new Set<() => void>();

type Transition = (update: () => void) => void;
let runTransition: Transition = (update) => update();

/** The app shell installs the view-transition wrapper here. */
export function setRouteTransition(transition: Transition) {
  runTransition = transition;
}

function notify() {
  for (const listener of listeners) listener();
}

function commit(next: Route, nextSearch: string) {
  const update = () => {
    current = next;
    search = nextSearch;
    notify();
  };
  if (samePage(next, current)) {
    update();
    return;
  }
  runTransition(update);
  // A new page starts at the top, as a full page load would.
  window.scrollTo({ top: 0 });
}

export function navigate(
  route: Route,
  options: { replace?: boolean; query?: string } = {},
) {
  const query = options.query ? `?${options.query.replace(/^\?/, '')}` : '';
  const path = pathFor(route) + query;
  if (options.replace) {
    window.history.replaceState(null, '', path);
  } else if (path !== here()) {
    window.history.pushState(null, '', path);
  }
  commit(route, query);
}

window.addEventListener('popstate', () => {
  commit(parse(window.location.pathname), window.location.search);
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => current);
}

/** The current query string (`?a=b`, or empty). */
export function useQuery(): URLSearchParams {
  const value = useSyncExternalStore(subscribe, () => search);
  return new URLSearchParams(value);
}

/**
 * Change query parameters on the current page; `null` or `''` removes
 * one. Replaces the history entry by default: a sort or filter is a view
 * of this page, not a new place to go back to.
 */
export function setQuery(
  changes: Record<string, string | null>,
  options: { transition?: Transition } = {},
) {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
  }
  const text = params.toString();
  const next = text ? `?${text}` : '';
  if (next === search) return;
  window.history.replaceState(
    null,
    '',
    window.location.pathname + next + window.location.hash,
  );
  const update = () => {
    search = next;
    notify();
  };
  (options.transition ?? ((u: () => void) => u()))(update);
}

/** For real anchors: middle-click and "open in new tab" keep working. */
export function linkProps(route: Route, query?: string) {
  const href = pathFor(route) + (query ? `?${query.replace(/^\?/, '')}` : '');
  return {
    href,
    onClick(event: React.MouseEvent<HTMLAnchorElement>) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      navigate(route, { query });
    },
  };
}
