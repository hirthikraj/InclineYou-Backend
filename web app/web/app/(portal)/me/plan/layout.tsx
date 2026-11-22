import { PlanTabs } from '@/components/portal/PlanTabs';
import { TopBar } from '@/components/shell/TopBar';
import { PageHeader } from '@/web-components/ui/PageHeader';

/** The Plan section's frame: a title and its two tabs. What is coming is the first tab's own read, so the frame makes none. */
export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar crumb="Plan" />
      <main className="main" id="main-content">
        {/* ONE TITLE ON A PHONE (22 Nov 2026): the bar already says the screen's name, so the <h1> stands down below the
            shell's line (`.ph--named`, the trainer half's rule — hidden, not dropped: it is the document's heading and the
            bar's title is aria-hidden). And one NAME: the bottom bar says this word too, so the heading does as well. */}
        <PageHeader className="ph--portal ph--named" title="Plan">
          <PlanTabs />
        </PageHeader>
        {children}
      </main>
    </>
  );
}
