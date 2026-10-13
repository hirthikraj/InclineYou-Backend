import { redirect } from 'next/navigation';

import { HomeView } from '@/components/portal/HomeView';
import { TopBar } from '@/components/shell/TopBar';
import { PortalHomeError, getPortalHome } from '@/lib/portal/home-api';
import { requirePortalSession } from '@/lib/portal/session';
import { Message } from '@/web-components/ui/Message';
import { PageHeader } from '@/web-components/ui/PageHeader';

export const metadata = { title: 'Today · InclineYou' };

/**
 * `/me/today` — the client's home, on `GET /v1/portal/home` (api-contract 1.2, p-a2). The layout has already turned a paused or removed
 * client into their wall; a refusal that arrives here anyway (their arrangement changed between the two reads) does the same.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await requirePortalSession();
  // The layout has already drawn a failure in place of the shell; this is the type's other half, not a path.
  if (!session.ok) return null;

  let home;
  try {
    home = await getPortalHome();
  } catch (e) {
    if (!(e instanceof PortalHomeError)) throw e;
    if (e.code === 'PORTAL_PAUSED') redirect('/sign-in/paused');
    if (e.code === 'PORTAL_REMOVED') redirect('/sign-in/removed');
    if (e.status === 401) redirect('/sign-in');
    return (
      <>
        <TopBar crumb="Today" title="Today" />
        <main className="main" id="main-content">
          <PageHeader title="Today" />
          <div className="body">
            <Message tone="warn">We couldn’t load your day just now. Reload in a moment — nothing has been lost.</Message>
          </div>
        </main>
      </>
    );
  }

  const first = (session.me.myDetails?.name ?? '').split(' ')[0] || 'there';
  return (
    <>
      <TopBar crumb="Today" title="Today" />
      <main className="main" id="main-content">
        <PageHeader title={`Hi ${first}`} sub={`You’re training with ${home.trainer.name}`} />
        <div className="body">
          <HomeView home={home} />
        </div>
      </main>
    </>
  );
}
