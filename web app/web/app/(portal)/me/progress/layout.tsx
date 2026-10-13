import { ProgressTabs } from '@/components/portal/ProgressTabs';
import { TopBar } from '@/components/shell/TopBar';
import { PageHeader } from '@/web-components/ui/PageHeader';

/** The Progress section's frame: a title and its tabs. Each tab makes its own read, so the frame makes none. */
export default function ProgressLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar crumb="Progress" />
      <main className="main" id="main-content">
        <PageHeader className="ph--portal" title="Your progress">
          <ProgressTabs />
        </PageHeader>
        {children}
      </main>
    </>
  );
}
