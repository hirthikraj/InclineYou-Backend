import { AccountTabs } from '@/components/portal/AccountTabs';
import { TopBar } from '@/components/shell/TopBar';
import { PageHeader } from '@/web-components/ui/PageHeader';

/** The Me section's frame: a title and its three tabs. Each tab makes its own read, so the frame makes none. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar crumb="Me" title="Me" />
      <main className="main" id="main-content">
        <PageHeader className="ph--portal" title="Me">
          <AccountTabs />
        </PageHeader>
        {children}
      </main>
    </>
  );
}
