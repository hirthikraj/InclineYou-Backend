import { AccountMe } from '@/components/portal/AccountMe';
import { getPortalMessages, getPortalPackages, getPortalPayments } from '@/lib/portal/api';
import { requirePortal } from '@/lib/portal/guard';

export const metadata = { title: 'Me · InclineYou' };

/**
 * §5 · Me, tab one — the trainer, the arrangement, the package, the notes.
 *
 * **The bare route, never a redirect to `/me/account/me`.** `CLIENT_PRIMARY` in
 * `nav.tsx` points here and a redirect on the way would cost a round trip on
 * every visit — `plan-tabs.ts`'s second rule, unchanged.
 *
 * The three reads are this tab's own. `Settings` and `Privacy` make none: they
 * are rendered from `me`, which the layout's guard has already fetched.
 * `getPortalPackages` is `cache()`d, so the copy the header took is the copy
 * this page reads.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const result = await requirePortal();
  if (!result.ok) return null;
  const { me, now } = result;

  const [packages, payments, messages] = await Promise.all([
    getPortalPackages(),
    getPortalPayments(),
    getPortalMessages(),
  ]);

  return (
    <div className="body">
      <AccountMe
        me={me}
        packages={packages}
        payments={payments}
        messages={messages}
        now={now}
      />
    </div>
  );
}
