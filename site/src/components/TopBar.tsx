import { GithubLogoIcon, QuestionIcon } from '@phosphor-icons/react';
import { useRef } from 'react';
import { PreferencesMenu } from '@/components/PreferencesMenu';
import { PulseMark } from '@/components/PulseMark';
import { buttonVariants } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useHeadingScrolledPast } from '@/hooks/useHeadingScrolledPast';
import { linkProps, type Route } from '@/lib/router';
import { cn } from '@/lib/utils';

/**
 * The current title on the left once the page's own h1 has scrolled away
 * (with the brand on phones, where there is no rail), then the source
 * repo, About the data, and Preferences.
 */
export function TopBar({
  route,
  title,
  pageKey,
}: {
  route: Route;
  title: string;
  /** Changes when the page does, so the h1 is found again. */
  pageKey: string;
}) {
  const bar = useRef<HTMLElement>(null);
  const showTitle = useHeadingScrolledPast(bar, pageKey);
  const icon = cn(
    buttonVariants({ variant: 'ghost', size: 'icon' }),
    'press size-11 sm:size-9',
  );
  return (
    <header
      ref={bar}
      className="sticky top-0 z-30 border-b bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur supports-backdrop-filter:bg-background/70"
    >
      <div className="flex h-14 w-full items-center gap-2 px-4 sm:px-6">
        <a
          {...linkProps({ name: 'overview' })}
          className="press -ml-1.5 flex size-11 shrink-0 items-center justify-center outline-ring/50 focus-visible:outline-2 desk:hidden"
        >
          <PulseMark className="size-6" />
          <span className="sr-only">Pulse, Overview</span>
        </a>
        {/* The page's h1 names it for assistive tech; this is the visual echo,
            shown only once that h1 has scrolled under the bar. */}
        <p
          aria-hidden
          data-shown={showTitle || undefined}
          className="min-w-0 flex-1 translate-y-1 truncate font-heading text-base font-semibold tracking-tight opacity-0 transition-[opacity,translate] duration-(--duration-base) ease-(--ease-standard) data-shown:translate-y-0 data-shown:opacity-100"
        >
          {title}
        </p>

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <a
                  href="https://github.com/jbouder/pulse"
                  target="_blank"
                  rel="noreferrer"
                  className={icon}
                />
              }
            >
              <GithubLogoIcon weight="bold" />
              <span className="sr-only">Pulse on GitHub</span>
            </TooltipTrigger>
            <TooltipContent>Pulse on GitHub</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                // A real link (role link), styled as an icon button.
                <a
                  {...linkProps({ name: 'about' })}
                  aria-current={route.name === 'about' ? 'page' : undefined}
                  className={cn(
                    buttonVariants({
                      variant: route.name === 'about' ? 'secondary' : 'ghost',
                      size: 'icon',
                    }),
                    'press size-11 sm:size-9',
                  )}
                />
              }
            >
              <QuestionIcon weight="bold" />
              <span className="sr-only">About the data</span>
            </TooltipTrigger>
            <TooltipContent>About the data</TooltipContent>
          </Tooltip>
          <PreferencesMenu />
        </div>
      </div>
    </header>
  );
}
