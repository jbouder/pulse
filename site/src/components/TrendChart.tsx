import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { day, num, shortDay } from '@/lib/format';
import { useMotion } from '@/providers/MotionProvider';

/**
 * Charts on the theme's tokens: one series is --chart-1, a second is
 * --chart-3, and everything else (axes, grid, tooltip) comes from the same
 * tokens as the rest of the page, so Light and Dark read alike. Every
 * chart has a text alternative: `summary` is announced in place of the
 * SVG.
 */

export interface SeriesDef {
  key: string;
  label: string;
  /** A CSS color; defaults by position on the chart ramp. */
  color?: string;
  dashed?: boolean;
}

const RAMP = ['var(--chart-1)', 'var(--chart-3)', 'var(--chart-2)'];

export function TrendChart<Row extends { date: string }>({
  kind,
  data,
  series,
  summary,
  height = 220,
  weekly = false,
  stacked = false,
}: {
  kind: 'bar' | 'line' | 'area';
  data: Row[];
  series: SeriesDef[];
  /** One sentence for screen readers: what the chart shows. */
  summary: string;
  height?: number;
  /** Dates are Monday week starts: the tooltip says "Week of". */
  weekly?: boolean;
  stacked?: boolean;
}) {
  const { active } = useMotion();
  const animate = active && data.length < 400;
  const common = { data, margin: { top: 8, right: 8, bottom: 0, left: 0 } };
  const axes = (
    <>
      <CartesianGrid vertical={false} strokeDasharray="2 4" />
      <XAxis
        dataKey="date"
        tickFormatter={shortDay}
        tickLine={false}
        axisLine={false}
        minTickGap={24}
        tickMargin={6}
      />
      <YAxis
        tickFormatter={(v: number) => num(v)}
        tickLine={false}
        axisLine={false}
        allowDecimals={false}
        width={40}
      />
      <Tooltip
        cursor={kind === 'bar' ? true : { stroke: 'var(--border)' }}
        isAnimationActive={false}
        content={({ active: shown, payload, label }) =>
          shown && payload?.length ? (
            <div className="border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
              <div className="mb-1 font-medium">
                {weekly ? `Week of ${day(String(label))}` : day(String(label))}
              </div>
              {payload.map((item) => (
                <div
                  key={String(item.dataKey)}
                  className="flex items-center gap-2 tabular-nums"
                >
                  <span
                    aria-hidden
                    className="size-2"
                    style={{ background: String(item.color) }}
                  />
                  <span className="flex-1 text-muted-foreground">
                    {item.name}
                  </span>
                  <span className="font-medium">
                    {num(item.value as number)}
                  </span>
                </div>
              ))}
            </div>
          ) : null
        }
      />
    </>
  );

  const colorOf = (s: SeriesDef, i: number) => s.color ?? RAMP[i % RAMP.length];

  return (
    <figure className="chart m-0" style={{ height }}>
      <figcaption className="sr-only">{summary}</figcaption>
      <div aria-hidden className="size-full">
        <ResponsiveContainer width="100%" height="100%">
          {kind === 'bar' ? (
            <BarChart {...common} barCategoryGap="20%">
              {axes}
              {series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={colorOf(s, i)}
                  stackId={stacked ? 'stack' : undefined}
                  isAnimationActive={animate}
                  animationDuration={350}
                />
              ))}
            </BarChart>
          ) : kind === 'line' ? (
            <LineChart {...common}>
              {axes}
              {series.map((s, i) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  type="stepAfter"
                  stroke={colorOf(s, i)}
                  strokeWidth={2}
                  strokeDasharray={s.dashed ? '4 4' : undefined}
                  dot={false}
                  connectNulls
                  isAnimationActive={animate}
                  animationDuration={350}
                />
              ))}
            </LineChart>
          ) : (
            <AreaChart {...common}>
              {axes}
              {series.map((s, i) => (
                <Area
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  type="monotone"
                  stroke={colorOf(s, i)}
                  fill={colorOf(s, i)}
                  fillOpacity={i === 0 ? 0.12 : 0}
                  strokeWidth={2}
                  strokeDasharray={s.dashed ? '4 4' : undefined}
                  isAnimationActive={animate}
                  animationDuration={350}
                />
              ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
