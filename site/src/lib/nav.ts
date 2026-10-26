import {
  ChartLineIcon,
  FoldersIcon,
  type Icon,
  RocketLaunchIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
import type { Route } from '@/lib/router';

/** The top-level sections, in rail and tab-bar order. */
export interface NavItem {
  route: Route;
  label: string;
  icon: Icon;
}

export const NAV: NavItem[] = [
  { route: { name: 'overview' }, label: 'Overview', icon: ChartLineIcon },
  { route: { name: 'projects' }, label: 'Projects', icon: FoldersIcon },
  { route: { name: 'releases' }, label: 'Releases', icon: RocketLaunchIcon },
  { route: { name: 'traffic' }, label: 'Traffic', icon: UsersThreeIcon },
];

/** The section a route belongs to: a project page sits under Projects. */
export function sectionOf(route: Route): Route['name'] {
  return route.name === 'project' ? 'projects' : route.name;
}

export function titleOf(route: Route, projectName?: string): string {
  switch (route.name) {
    case 'overview':
      return 'Overview';
    case 'projects':
      return 'Projects';
    case 'project':
      return projectName ?? 'Project';
    case 'releases':
      return 'Releases';
    case 'traffic':
      return 'Traffic';
    case 'about':
      return 'About the data';
    case 'notFound':
      return 'Not found';
  }
}
