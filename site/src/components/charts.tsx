import { useId, useMemo } from 'react';
import type { Point } from '@/lib/data';
import { levels } from '@/lib/derive';
import { addDays, day, month, plural } from '@/lib/format';

/**
 * A row of tiny bars, plain SVG: for tables and cards, where a full chart
 * would be noise. Decorative; the number beside it carries the meaning.
 */
export function Sparkline({
  points,
  className,
  height = 24,
}: {
  points: Point[];
  className?: string;
  height?: number;
}) {
  const max = Math.max(1, ...points.map((p) => p.count));
  const n = Math.max(points.length, 1);
  const gap = n > 20 ? 1 : 2;
  const barW = 4;
  const width = n * (barW + gap) - gap;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ height }}
      aria-hidden
    >
      {points.map((p, i) => {
        const h = p.count > 0 ? Math.max(2, (p.count / max) * height) : 1;
        return (
          <rect
            key={p.date}
            x={i * (barW + gap)}
            y={height - h}
            width={barW}
            height={h}
            fill={p.count > 0 ? 'var(--chart-1)' : 'var(--border)'}
          />
        );
      })}
    </svg>
  );
}

const CELL = 11;
const GAP = 3;
const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

/**
 * The year of commits as a grid: a column per week (Monday first), a
 * square per day, five levels on the chart ramp. Scrolls inside itself on
 * narrow screens; never the page.
 */
export function Heatmap({
  points,
  summary,
}: {
  /** Daily, zero-filled, starting on a Monday. */
  points: Point[];
  summary: string;
}) {
  const id = useId();
  const level = useMemo(() => levels(points), [points]);
  const weeks = Math.ceil(points.length / 7);
  const left = 28;
  const top = 16;
  const width = left + weeks * (CELL + GAP);
  const height = top + 7 * (CELL + GAP);

  // A month label over the first week that starts in it.
  const months: { x: number; label: string }[] = [];
  for (let w = 0; w < weeks; w++) {
    const first = points[w * 7];
    if (!first) continue;
    const prev = w > 0 ? points[(w - 1) * 7] : undefined;
    if (!prev || month(prev.date) !== month(first.date)) {
      const x = left + w * (CELL + GAP);
      // Skip a label that would collide with the one before (a partial
      // first month) or run off the end.
      const last = months[months.length - 1];
      if (w < weeks - 2 && (!last || x - last.x >= 3 * (CELL + GAP))) {
        months.push({ x, label: month(first.date) });
      }
    }
  }

  return (
    <figure className="m-0 flex flex-col gap-2">
      <div className="scrollbar-thin overflow-x-auto pb-1">
        <svg
          role="img"
          aria-labelledby={id}
          width={width}
          height={height}
          className="block"
        >
          <title id={id}>{summary}</title>
          {months.map((m) => (
            <text
              key={`${m.x}`}
              x={m.x}
              y={10}
              className="fill-muted-foreground text-[10px]"
            >
              {m.label}
            </text>
          ))}
          {WEEKDAYS.map((d, i) =>
            d ? (
              <text
                key={d}
                x={0}
                y={top + i * (CELL + GAP) + CELL - 2}
                className="fill-muted-foreground text-[10px]"
              >
                {d}
              </text>
            ) : null,
          )}
          {points.map((p, i) => (
            <rect
              key={p.date}
              className="heat"
              data-level={level(p.count)}
              x={left + Math.floor(i / 7) * (CELL + GAP)}
              y={top + (i % 7) * (CELL + GAP)}
              width={CELL}
              height={CELL}
            >
              <title>
                {`${p.count === 0 ? 'No commits' : plural(p.count, 'commit')} on ${day(p.date)}`}
              </title>
            </rect>
          ))}
        </svg>
      </div>
      <div
        aria-hidden
        className="flex items-center gap-1.5 self-end text-[11px] text-muted-foreground"
      >
        Less
        <svg aria-hidden width={5 * (CELL + GAP)} height={CELL}>
          {[0, 1, 2, 3, 4].map((l) => (
            <rect
              key={l}
              className="heat"
              data-level={l}
              x={l * (CELL + GAP)}
              width={CELL}
              height={CELL}
            />
          ))}
        </svg>
        More
      </div>
    </figure>
  );
}

/** Zero-fill a sparse daily series between two dates, inclusive. */
export function fillDays(points: Point[], from: string, to: string): Point[] {
  const values = new Map(points.map((p) => [p.date, p.count]));
  const out: Point[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    out.push({ date: d, count: values.get(d) ?? 0 });
  }
  return out;
}
