import { PrivacyView } from '@/components/portal/account/PrivacyView';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle } from '@/lib/portal/plan-api';
import type { PrivacyWire } from '@/lib/portal/settings-api';
import { LoadFailed } from '@/components/portal/LoadFailed';

export const metadata = { title: 'Privacy · InclineYou' };

/** `/me/account/privacy` — what your trainer can see, your data, and the ways out: leave a trainer, or delete the account (api-contract 1.2, ps-l2). */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const privacy = settle(await portalGet<PrivacyWire>('/v1/portal/privacy'));
  if (!privacy) return <LoadFailed what="your privacy settings" retryHref="/me/account/privacy" />;
  return <div className="body"><PrivacyView privacy={privacy} zone={session.me.myDetails?.timezone ?? 'Asia/Kolkata'} /></div>;
}
