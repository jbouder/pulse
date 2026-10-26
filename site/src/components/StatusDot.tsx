import { STATUS_HINT, STATUS_LABEL, type Status } from '@/lib/derive';
import { cn } from '@/lib/utils';

const DOT: Record<Status, string> = {
  active: 'bg-ok',
  steady: 'bg-muted-foreground',
  quiet: 'border border-muted-foreground',
  archived: 'border border-dashed border-muted-foreground',
};

/**
 * A project's status as a dot, never by color alone: the label is there
 * for screen readers and as a tooltip, and `withLabel` writes it out.
 */
export function StatusDot({
  status,
  withLabel = false,
  className,
}: {
  status: Status;
  withLabel?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      title={STATUS_HINT[status]}
    >
      <span aria-hidden className={cn('size-2 shrink-0', DOT[status])} />
      <span className={withLabel ? 'text-xs text-muted-foreground' : 'sr-only'}>
        {STATUS_LABEL[status]}
      </span>
    </span>
  );
}
