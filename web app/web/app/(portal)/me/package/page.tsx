import { PackageView, type PackageWire } from '@/components/portal/money/PackageView';
import { TopBar } from '@/components/shell/TopBar';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle } from '@/lib/portal/plan-api';
import { Message } from '@/web-components/ui/Message';
import { PageHeader } from '@/web-components/ui/PageHeader';

export const metadata = { title: 'Your package · InclineYou' };

/** `/me/package` — sessions left and when it ends (api-contract 1.2, pm-l1). Quiet and factual: no price here, whatever the trainer's money switch says. */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const pack = settle(await portalGet<PackageWire>('/v1/portal/package'));
  return (
    <>
      <TopBar crumb="Your package" title="Your package" />
      <main className="main" id="main-content">
        <PageHeader className="ph--portal" title="Your package" />
        <div className="body">
          {pack ? <PackageView pack={pack} trainerFirstName={(session.me.trainer?.name ?? 'Your trainer').split(' ')[0]} moneyVisible={session.me.moneyVisible} /> : <Message tone="warn">We couldn’t load your package just now. Reload in a moment.</Message>}
        </div>
      </main>
    </>
  );
}
