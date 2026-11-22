import { notFound } from 'next/navigation';

import { MoneyView, type MoneyWire } from '@/components/portal/money/MoneyView';
import { TopBar } from '@/components/shell/TopBar';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle } from '@/lib/portal/plan-api';
import { Message } from '@/web-components/ui/Message';
import { PageHeader } from '@/web-components/ui/PageHeader';

export const metadata = { title: 'Payments · InclineYou' };

/**
 * `/me/payments` — what is owed and what has been paid, read-only (api-contract 1.2, pm-l2). When the trainer has switched money off for this
 * client the read is exactly `{visible:false}` and this route is not there: a tab the screen hides, not an error to apologise for.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const { cursor } = await searchParams;
  const money = settle(await portalGet<MoneyWire>(`/v1/portal/money?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`));
  if (money && !money.visible) notFound();
  return (
    <>
      <TopBar crumb="Payments" title="Me" titleHref="/me/account" />
      <main className="main" id="main-content">
        <PageHeader className="ph--portal" title="Payments" />
        <div className="body">
          {/* In the portal's centred column (22 Nov 2026): without `.portal` this screen sat flush left on a desk while its title, which reads the column, sat centred — measured at 1568px, the content began 238px left of the heading. */}
          <div className="portal">
          {money ? <MoneyView money={money} trainerFirstName={(session.me.trainer?.name ?? 'Your trainer').split(' ')[0]} /> : <Message tone="warn">We couldn’t load this just now. Reload in a moment.</Message>}
          </div>
        </div>
      </main>
    </>
  );
}
