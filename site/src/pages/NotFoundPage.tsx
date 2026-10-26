import { PageHeader } from '@/components/Page';
import { buttonVariants } from '@/components/ui/button';
import { linkProps } from '@/lib/router';

export function NotFoundPage({ what = 'page' }: { what?: string }) {
  return (
    <>
      <PageHeader
        title="Not found"
        description={`There is no ${what} at this address. It may have been renamed or removed from sources.yaml.`}
      />
      <a
        {...linkProps(
          what === 'project' ? { name: 'projects' } : { name: 'overview' },
        )}
        className={buttonVariants({ variant: 'outline' })}
      >
        {what === 'project' ? 'See all projects' : 'Go to the overview'}
      </a>
    </>
  );
}
