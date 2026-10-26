/**
 * The collector's files, as the dashboard reads them. These types mirror
 * the shapes in the docstring at the top of `pulse/summary.py` exactly;
 * change both together. `null` always means "the upstream did not say"
 * (shown as a dash), never zero.
 */

export interface Point {
  date: string;
  count: number;
}

export interface Group {
  id: string;
  name: string;
}

export interface Language {
  name: string;
  color: string | null;
  share: number;
}

export interface Meta {
  description: string | null;
  homepage: string | null;
  created_at: string | null;
  archived: boolean;
  license: string | null;
  language: string | null;
  languages: Language[];
  topics: string[];
  default_branch: string | null;
  total_commits: number | null;
  last_commit: { sha: string; date: string; message: string } | null;
  latest_release: { tag: string; date: string } | null;
}

export interface Health {
  date: string;
  pushed_at: string | null;
  stars: number | null;
  forks: number | null;
  subscribers: number | null;
  open_issues: number | null;
  open_prs: number | null;
  merged_prs_30d: number | null;
  issues_opened_30d: number | null;
  issues_closed_30d: number | null;
}

export interface Stats {
  commits_30d: number;
  commits_prev_30d: number;
  commits_365d: number;
  active_days_30d: number;
  first_commit: string | null;
  last_commit: string | null;
  authors_30d: number;
  stars_gained_30d: number | null;
  releases_90d: number;
  views_14d: number | null;
  views_prev_14d: number | null;
  unique_views_14d: number | null;
  clones_14d: number | null;
  unique_clones_14d: number | null;
  requests_30d: number | null;
  requests_prev_30d: number | null;
}

export interface Release {
  tag: string;
  date: string;
  prerelease: boolean;
}

export interface Project {
  id: string;
  name: string;
  repo: string;
  group: string;
  featured: boolean;
  tagline: string;
  about: string;
  stack: string[];
  links: Record<string, string>;
  workers: string[];
  meta: Meta | null;
  health: Health | null;
  stats: Stats;
  weekly_commits: Point[];
  recent_views: Point[];
  recent_requests: Point[];
  releases: Release[];
}

export interface Summary {
  generated_at: string;
  owner: string;
  groups: Group[];
  sources: {
    traffic: { repos: number; since: string | null };
    apps: { workers: number; collected: number; since: string | null };
  };
  activity: Point[];
  projects: Project[];
}

export interface ProjectDetail {
  generated_at: string;
  id: string;
  commits: Point[];
  authors: { author: string; commits: number; last: string }[];
  stars: { date: string; stars: number }[];
  health: {
    date: string;
    stars: number | null;
    open_issues: number | null;
    open_prs: number | null;
  }[];
  traffic: {
    date: string;
    views: number;
    unique_views: number;
    clones: number;
    unique_clones: number;
  }[];
  requests: { date: string; requests: number; errors: number }[];
}

export const SUMMARY_URL = '/data/summary.json';
export const projectUrl = (id: string) =>
  `/data/projects/${encodeURIComponent(id)}.json`;

/**
 * One promise per URL for the life of the page: the files are static per
 * deploy, so they are fetched once and `use()`d by every component that
 * needs them. A failed fetch is forgotten so a retry fetches again.
 */
const cache = new Map<string, Promise<unknown>>();

export function load<T>(url: string): Promise<T> {
  let promise = cache.get(url) as Promise<T> | undefined;
  if (!promise) {
    promise = fetch(url).then((res) => {
      if (!res.ok)
        throw new Error(`Could not load ${url} (HTTP ${res.status})`);
      return res.json() as Promise<T>;
    });
    promise.catch(() => cache.delete(url));
    cache.set(url, promise);
  }
  return promise;
}

export function forget(url: string) {
  cache.delete(url);
}

export function repoUrl(repo: string): string {
  return `https://github.com/${repo}`;
}

export function releaseUrl(repo: string, tag: string): string {
  return `${repoUrl(repo)}/releases/tag/${encodeURIComponent(tag)}`;
}

export function commitUrl(repo: string, sha: string): string {
  return `${repoUrl(repo)}/commit/${sha}`;
}
