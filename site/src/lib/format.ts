/**
 * Numbers and dates as the dashboard writes them. Every function takes the
 * collector's "today" (`asOf`) rather than the clock, so a page reads the
 * same however long after the last collection it is opened.
 */

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const whole = new Intl.NumberFormat('en-US');

/** A dash for unknown; compact above 10,000 (12.3K), grouped below. */
export function num(value: number | null | undefined): string {
  if (value === null || value === undefined) return '–';
  return Math.abs(value) >= 10_000
    ? compact.format(value)
    : whole.format(value);
}

/** Change against the previous period, or null when it cannot be stated. */
export function change(
  current: number | null,
  previous: number | null,
): { pct: number; label: string } | null {
  if (current === null || previous === null) return null;
  if (previous === 0) return current === 0 ? { pct: 0, label: '0%' } : null;
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct);
  return { pct, label: `${rounded > 0 ? '+' : ''}${rounded}%` };
}

const DAY = 86_400_000;

function utc(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

export function diffDays(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / DAY);
}

export function addDays(iso: string, days: number): string {
  return new Date(utc(iso) + days * DAY).toISOString().slice(0, 10);
}

/** "today", "yesterday", "3 days ago", "5 weeks ago", "2 years ago". */
export function ago(iso: string | null | undefined, asOf: string): string {
  if (!iso) return '–';
  const days = diffDays(iso, asOf);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 730) return `${Math.round(days / 30.44)} months ago`;
  return `${Math.round(days / 365.25)} years ago`;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "Oct 26, 2026"; without the year when it matches `asOf`'s. */
export function day(iso: string | null | undefined, asOf?: string): string {
  if (!iso) return '–';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const base = `${MONTHS[m - 1]} ${d}`;
  return asOf?.startsWith(String(y)) ? base : `${base}, ${y}`;
}

/** "Oct 26" for chart axes. */
export function shortDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** "Oct" for month ticks. */
export function month(iso: string): string {
  return MONTHS[Number(iso.slice(5, 7)) - 1];
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${num(n)} ${n === 1 ? one : many}`;
}
