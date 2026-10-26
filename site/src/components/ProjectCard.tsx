import { GitCommitIcon, StarIcon } from '@phosphor-icons/react';
import { Sparkline } from '@/components/charts';
import { StatusDot } from '@/components/StatusDot';
import type { Language, Project } from '@/lib/data';
import { statusOf } from '@/lib/derive';
import { ago, num } from '@/lib/format';
import { linkProps } from '@/lib/router';
import { cn } from '@/lib/utils';

/**
 * A project at a glance: name and status, tagline, 26 weeks of commits,
 * and the three facts that change most (commits, stars, last commit). The
 * whole card is the link to the project page.
 */
export function ProjectCard({
  project,
  asOf,
  index = 0,
}: {
  project: Project;
  asOf: string;
  index?: number;
}) {
  const status = statusOf(project, asOf);
  return (
    <a
      {...linkProps({ name: 'project', id: project.id })}
      className="enter press group flex min-w-0 flex-col gap-3 border bg-card p-4 outline-ring/50 hover:bg-accent/60 focus-visible:outline-2 focus-visible:-outline-offset-2"
      style={{ '--i': index } as React.CSSProperties}
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="truncate font-heading text-lg leading-tight font-semibold">
            {project.name}
          </h3>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {project.repo}
          </p>
        </div>
        <StatusDot status={status} withLabel className="pt-1" />
      </div>
      <p className="line-clamp-2 min-h-[2.9em] text-sm text-muted-foreground">
        {project.tagline || project.meta?.description}
      </p>
      <Sparkline points={project.weekly_commits} className="w-full" />
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <dt>
            <GitCommitIcon aria-hidden />
            <span className="sr-only">Commits in 30 days</span>
          </dt>
          <dd className="tabular-nums text-foreground">
            {num(project.stats.commits_30d)}
            <span className="text-muted-foreground"> in 30d</span>
          </dd>
        </div>
        <div className="flex items-center gap-1">
          <dt>
            <StarIcon aria-hidden />
            <span className="sr-only">Stars</span>
          </dt>
          <dd className="tabular-nums text-foreground">
            {num(project.health?.stars)}
          </dd>
        </div>
        <div className="ml-auto">
          <dt className="sr-only">Last commit</dt>
          <dd>{ago(project.stats.last_commit, asOf)}</dd>
        </div>
      </dl>
    </a>
  );
}

/** The repo's languages as one bar plus a legend, GitHub's colors. */
export function LanguageBar({
  languages,
  className,
}: {
  languages: Language[];
  className?: string;
}) {
  // Slivers under 1% are invisible in the bar; fold them into "Other".
  const shown = languages.filter((l) => l.share >= 0.01);
  const other = 1 - shown.reduce((a, l) => a + l.share, 0);
  const parts =
    other > 0.005
      ? [...shown, { name: 'Other', color: null, share: other }]
      : shown;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div aria-hidden className="flex h-2 w-full overflow-hidden bg-muted">
        {parts.map((l) => (
          <span
            key={l.name}
            style={{
              width: `${l.share * 100}%`,
              background: l.color ?? 'var(--muted-foreground)',
            }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {parts.map((l) => (
          <li key={l.name} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2"
              style={{ background: l.color ?? 'var(--muted-foreground)' }}
            />
            <span>{l.name}</span>
            <span className="tabular-nums text-muted-foreground">
              {(l.share * 100).toFixed(l.share < 0.1 ? 1 : 0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
