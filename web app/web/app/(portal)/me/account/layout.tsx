import { AccountTabs } from '@/components/portal/AccountTabs';
import { TopBar } from '@/components/shell/TopBar';
import { PageHeader } from '@/web-components/ui/PageHeader';

/** The Me section's frame: a title and its three tabs. Each tab makes its own read, so the frame makes none. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar crumb="Me" title="Me" />
      <main className="main" id="main-content">
        {/* ONE TITLE ON A PHONE (22 Nov 2026): the bar already says the screen's name, so the <h1> stands down below the
            shell's line (`.ph--named`, the trainer half's rule — hidden, not dropped: it is the document's heading and the
            bar's title is aria-hidden). And one NAME: the bottom bar says this word too, so the heading does as well. */}
        <PageHeader className="ph--portal ph--named" title="Me">
          <AccountTabs />
        </PageHeader>
        {children}
      </main>
    </>
  );
}
