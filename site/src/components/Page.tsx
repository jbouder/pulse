import { InfoIcon } from '@phosphor-icons/react';
import { Component, type ReactNode, useId } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { change, num } from '@/lib/format';
import { cn } from '@/lib/utils';

/** The page's h1, an optional line under it, and actions on the right. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="enter flex flex-col gap-3 pb-6 sm:flex-row sm:items-end">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {eyebrow && (
          <div className="text-xs font-medium text-muted-foreground">
            {eyebrow}
          </div>
        )}
        <h1 className="text-page-title">{title}</h1>
        {description && (
          <p className="text-state max-w-[60ch] text-pretty">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}

/** "How to read this": an (i) that opens a short explanation. */
export function Info({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="press -my-1 size-11 text-muted-foreground sm:size-7"
          />
        }
      >
        <InfoIcon />
        <span className="sr-only">About {label}</span>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** A titled, bordered block of the page: a chart, a table, a list. */
export function Panel({
  title,
  info,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  info?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn('enter flex min-w-0 flex-col border bg-card', className)}
    >
      <div className="flex min-h-11 items-center gap-2 border-b px-4 py-1.5">
        <h2 id={id} className="flex-1 font-heading text-sm font-semibold">
          {title}
        </h2>
        {actions}
        {info && <Info label={title}>{info}</Info>}
      </div>
      <div className={cn('min-w-0 p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * One headline number, what it counts, and its change against the period
 * before when that can be stated. A change is never shown by color alone:
 * the sign is written out and the comparison is in words for screen
 * readers.
 */
export function StatTile({
  label,
  value,
  previous,
  hint,
  format = num,
  index = 0,
}: {
  label: string;
  value: number | null;
  /** The previous period, for the change; omit for no change line. */
  previous?: number | null;
  hint?: ReactNode;
  format?: (n: number | null) => string;
  index?: number;
}) {
  const delta = previous === undefined ? undefined : change(value, previous);
  return (
    <div
      className="enter flex min-w-0 flex-col gap-1 border bg-card px-4 py-3"
      style={{ '--i': index } as React.CSSProperties}
    >
      <div className="truncate text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <div className="text-stat">{format(value)}</div>
      <div className="flex min-h-4 flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
        {delta !== undefined &&
          (delta ? (
            <span
              className={cn(
                'font-medium tabular-nums',
                delta.pct > 0 && 'text-ok',
              )}
            >
              {delta.label}
              <span className="sr-only"> against the period before</span>
            </span>
          ) : (
            <span title="Not enough history to compare">no comparison yet</span>
          ))}
        {hint && <span className="truncate">{hint}</span>}
      </div>
    </div>
  );
}

/** What is missing and what would fill it, in one quiet block. */
export function Empty({
  title,
  children,
  className,
}: {
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-1 border border-dashed px-4 py-6 text-sm',
        className,
      )}
    >
      <p className="font-medium">{title}</p>
      {children && <div className="text-muted-foreground">{children}</div>}
    </div>
  );
}

/** Placeholder blocks shaped like a page while its data loads. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading…</span>
      <div className="h-10 w-56 animate-pulse bg-muted" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse bg-muted" />
        ))}
      </div>
      <div className="h-64 animate-pulse bg-muted" />
    </div>
  );
}

/** A page whose data failed to load says so in one line, with a retry. */
export class PageErrorBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex flex-col items-start gap-3 py-12">
        <h1 className="text-page-title">Couldn’t load the data</h1>
        <p className="text-muted-foreground">
          {this.state.error.message}. Check your connection and try again.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            this.props.onRetry();
            this.setState({ error: null });
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
}
