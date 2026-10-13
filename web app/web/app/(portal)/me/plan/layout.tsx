import { PlanTabs } from '@/components/portal/PlanTabs';
import { TopBar } from '@/components/shell/TopBar';
import { PageHeader } from '@/web-components/ui/PageHeader';

/** The Plan section's frame: a title and its two tabs. What is coming is the first tab's own read, so the frame makes none. */
export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar crumb="Plan" />
      <main className="main" id="main-content">
        <PageHeader className="ph--portal" title="Your plan">
          <PlanTabs />
        </PageHeader>
        {children}
      </main>
    </>
  );
}
