/**
 * Pure helpers over summary.json: status, totals across projects, the
 * release feed, heatmap levels. No React; tested in test/derive.test.ts.
 */
import type { Point, Project, Release, Summary } from '@/lib/data';
import { addDays, diffDays } from '@/lib/format';

export type Status = 'active' | 'steady' | 'quiet' | 'archived';

export const STATUS_LABEL: Record<Status, string> = {
  active: 'Active',
  steady: 'Steady',
  quiet: 'Quiet',
  archived: 'Archived',
};

export const STATUS_HINT: Record<Status, string> = {
  active: 'A commit in the last 14 days',
  steady: 'A commit in the last 90 days',
  quiet: 'No commit in 90 days',
  archived: 'Archived on GitHub',
};

/** Where a project stands, from its last commit on the default branch. */
export function statusOf(p: Project, asOf: string): Status {
  if (p.meta?.archived) return 'archived';
  const last = p.stats.last_commit ?? p.health?.pushed_at ?? null;
  if (!last) return 'quiet';
  const days = diffDays(last, asOf);
  if (days <= 14) return 'active';
  if (days <= 90) return 'steady';
  return 'quiet';
}

/** Sum a field over projects; null when no project knows it. */
export function sumKnown(
  projects: Project[],
  pick: (p: Project) => number | null | undefined,
): number | null {
  let total: number | null = null;
  for (const p of projects) {
    const v = pick(p);
    if (v !== null && v !== undefined) total = (total ?? 0) + v;
  }
  return total;
}

/**
 * A previous-period total across projects, only when every project that
 * has a current value also has a previous one; otherwise a source that
 * started mid-way would read as a surge.
 */
export function sumPrevious(
  projects: Project[],
  current: (p: Project) => number | null,
  previous: (p: Project) => number | null,
): number | null {
  let total = 0;
  for (const p of projects) {
    if (current(p) === null) continue;
    const prev = previous(p);
    if (prev === null) return null;
    total += prev;
  }
  return total;
}

export interface ReleaseItem extends Release {
  project: Project;
}

/** Every release across projects, newest first. */
export function releaseFeed(
  projects: Project[],
  { prereleases = true } = {},
): ReleaseItem[] {
  return projects
    .flatMap((project) =>
      project.releases
        .filter((r) => prereleases || !r.prerelease)
        .map((r) => ({ ...r, project })),
    )
    .sort((a, b) =>
      a.date === b.date
        ? a.project.name.localeCompare(b.project.name)
        : a.date > b.date
          ? -1
          : 1,
    );
}

/** Median days between stable releases in the year before `asOf`. */
export function medianGap(releases: Release[], asOf: string): number | null {
  const since = addDays(asOf, -364);
  const dates = releases
    .filter((r) => !r.prerelease && r.date >= since)
    .map((r) => r.date)
    .sort();
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    gaps.push(diffDays(dates[i - 1], dates[i]));
  }
  // Two releases make one gap, which is not yet a cadence.
  if (gaps.length < 2) return null;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2
    ? gaps[mid]
    : Math.round((gaps[mid - 1] + gaps[mid]) / 2);
}

/**
 * Heatmap level 0–4 for a day's count. Levels split the non-zero days at
 * their quartiles, so one huge day does not wash the rest of the year out.
 */
export function levels(points: Point[]): (count: number) => 0 | 1 | 2 | 3 | 4 {
  const values = points
    .map((p) => p.count)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const q = (f: number) =>
    values.length ? values[Math.floor((values.length - 1) * f)] : 0;
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  return (count) => {
    if (count <= 0) return 0;
    if (count <= q1) return 1;
    if (count <= q2) return 2;
    if (count <= q3) return 3;
    return 4;
  };
}

/** Days with at least one commit, and the longest run of them, in a series. */
export function streaks(points: Point[]): { active: number; longest: number } {
  let active = 0;
  let longest = 0;
  let run = 0;
  for (const p of points) {
    if (p.count > 0) {
      active++;
      run++;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  return { active, longest };
}

export function projectById(summary: Summary, id: string): Project | undefined {
  return summary.projects.find((p) => p.id === id);
}

/** Link labels in the order they appear on a project. */
export const LINK_LABEL: Record<string, string> = {
  app: 'Open app',
  docs: 'Docs',
  demo: 'Demo',
};

export function linkLabel(name: string): string {
  return LINK_LABEL[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
}
