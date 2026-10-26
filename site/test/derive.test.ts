import { describe, expect, it } from 'vitest';
import type { Project } from '../src/lib/data';
import {
  levels,
  medianGap,
  releaseFeed,
  statusOf,
  streaks,
  sumKnown,
  sumPrevious,
} from '../src/lib/derive';
import { ago, change, day, num } from '../src/lib/format';

const AS_OF = '2026-10-26';

function project(over: Partial<Project> & { id: string }): Project {
  return {
    name: over.id,
    repo: `me/${over.id}`,
    group: 'apps',
    featured: false,
    tagline: '',
    about: '',
    stack: [],
    links: {},
    workers: [],
    meta: null,
    health: null,
    weekly_commits: [],
    recent_views: [],
    recent_requests: [],
    releases: [],
    ...over,
    stats: {
      commits_30d: 0,
      commits_prev_30d: 0,
      commits_365d: 0,
      active_days_30d: 0,
      first_commit: null,
      last_commit: null,
      authors_30d: 0,
      stars_gained_30d: null,
      releases_90d: 0,
      views_14d: null,
      views_prev_14d: null,
      unique_views_14d: null,
      clones_14d: null,
      unique_clones_14d: null,
      requests_30d: null,
      requests_prev_30d: null,
      ...over.stats,
    },
  };
}

describe('statusOf', () => {
  it.each([
    ['2026-10-20', 'active'],
    ['2026-09-01', 'steady'],
    ['2026-01-01', 'quiet'],
  ])('a last commit on %s is %s', (last, status) => {
    const p = project({ id: 'a', stats: { last_commit: last } as never });
    expect(statusOf(p, AS_OF)).toBe(status);
  });

  it('archived wins over recent commits', () => {
    const p = project({
      id: 'a',
      meta: { archived: true } as never,
      stats: { last_commit: AS_OF } as never,
    });
    expect(statusOf(p, AS_OF)).toBe('archived');
  });

  it('no commits at all is quiet', () => {
    expect(statusOf(project({ id: 'a' }), AS_OF)).toBe('quiet');
  });
});

describe('sums across projects', () => {
  const a = project({
    id: 'a',
    stats: { views_14d: 10, views_prev_14d: 5 } as never,
  });
  const b = project({
    id: 'b',
    stats: { views_14d: 4, views_prev_14d: null } as never,
  });
  const c = project({ id: 'c' });

  it('sumKnown skips unknowns and is null when nothing is known', () => {
    expect(sumKnown([a, b, c], (p) => p.stats.views_14d)).toBe(14);
    expect(sumKnown([c], (p) => p.stats.views_14d)).toBeNull();
  });

  it('sumPrevious withholds a comparison any current value cannot back', () => {
    const cur = (p: Project) => p.stats.views_14d;
    const prev = (p: Project) => p.stats.views_prev_14d;
    expect(sumPrevious([a, c], cur, prev)).toBe(5);
    expect(sumPrevious([a, b], cur, prev)).toBeNull();
  });
});

describe('releases', () => {
  const p = project({
    id: 'a',
    releases: [
      { tag: 'v3-rc', date: '2026-10-20', prerelease: true },
      { tag: 'v3', date: '2026-10-10', prerelease: false },
      { tag: 'v2', date: '2026-09-10', prerelease: false },
      { tag: 'v1', date: '2026-08-01', prerelease: false },
      { tag: 'v0', date: '2024-01-01', prerelease: false },
    ],
  });

  it('feeds newest first, optionally without prereleases', () => {
    expect(releaseFeed([p]).map((r) => r.tag)[0]).toBe('v3-rc');
    expect(releaseFeed([p], { prereleases: false }).map((r) => r.tag)[0]).toBe(
      'v3',
    );
  });

  it('measures the median gap over the last year of stable releases', () => {
    // v1 → v2 is 40 days, v2 → v3 is 30; v0 is too old to count.
    expect(medianGap(p.releases, AS_OF)).toBe(35);
    expect(medianGap([], AS_OF)).toBeNull();
  });
});

describe('activity', () => {
  const pts = [0, 1, 2, 3, 4, 0, 8, 100].map((count, i) => ({
    date: `2026-10-0${i + 1}`,
    count,
  }));

  it('levels split active days at their quartiles', () => {
    const level = levels(pts);
    expect(level(0)).toBe(0);
    expect(level(1)).toBe(1);
    expect(level(100)).toBe(4);
  });

  it('streaks count active days and the longest run', () => {
    expect(streaks(pts)).toEqual({ active: 6, longest: 4 });
  });
});

describe('format', () => {
  it('writes unknown as a dash and big numbers compactly', () => {
    expect(num(null)).toBe('–');
    expect(num(1234)).toBe('1,234');
    expect(num(12_345)).toBe('12.3K');
  });

  it('withholds a change it cannot state', () => {
    expect(change(10, null)).toBeNull();
    expect(change(10, 0)).toBeNull();
    expect(change(15, 10)?.label).toBe('+50%');
    expect(change(5, 10)?.label).toBe('-50%');
  });

  it('dates relative to the collection, not the clock', () => {
    expect(ago(AS_OF, AS_OF)).toBe('today');
    expect(ago('2026-10-25', AS_OF)).toBe('yesterday');
    expect(ago('2026-10-12', AS_OF)).toBe('2 weeks ago');
    expect(day('2026-03-04', AS_OF)).toBe('Mar 4');
    expect(day('2025-03-04', AS_OF)).toBe('Mar 4, 2025');
  });
});
