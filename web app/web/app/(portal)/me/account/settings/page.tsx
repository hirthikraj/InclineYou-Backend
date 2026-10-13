import { PrefsForm } from '@/components/portal/account/PrefsForm';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle } from '@/lib/portal/plan-api';
import type { PrefsWire } from '@/lib/portal/settings-api';
import { Message } from '@/web-components/ui/Message';

export const metadata = { title: 'Settings · InclineYou' };

/** `/me/account/settings` — the workout player, what is sent to you and where, and a nominee (api-contract 1.2, ps-l1). Each switch saves as it is tapped. */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const prefs = settle(await portalGet<PrefsWire>('/v1/portal/prefs'));
  if (!prefs) return <div className="body"><Message tone="warn">We couldn’t load your settings just now. Reload in a moment.</Message></div>;
  return <div className="body"><PrefsForm prefs={prefs} trainerFirstName={(session.me.trainer?.name ?? 'Your trainer').split(' ')[0]} vapidKey={session.me.push.vapidPublicKey} /></div>;
}
