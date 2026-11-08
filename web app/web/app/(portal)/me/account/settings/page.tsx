import { SignedInDevices } from '@/components/devices/SignedInDevices';
import { PrefsForm } from '@/components/portal/account/PrefsForm';
import { listDevices } from '@/lib/devices/api';
import { Card } from '@/web-components/ui/Card';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle } from '@/lib/portal/plan-api';
import type { PrefsWire } from '@/lib/portal/settings-api';
import { Message } from '@/web-components/ui/Message';

export const metadata = { title: 'Settings · InclineYou' };

/** `/me/account/settings` — the workout player, what is sent to you and where, a nominee (api-contract 1.2, ps-l1), and the browsers you are signed in on (ps-a5). Each switch saves as it is tapped. */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const [read, devices] = await Promise.all([portalGet<PrefsWire>('/v1/portal/prefs'), listDevices()]);
  const prefs = settle(read);
  if (!prefs) return <div className="body"><Message tone="warn">We couldn’t load your settings just now. Reload in a moment.</Message></div>;
  // Signed-in devices (UC-CP-38): the same routes and component as the trainer's Settings → Account.
  const devicesCard = (
    <Card>
      <Card.Head title="Signed-in devices" level={3} />
      <Card.Body>
        <SignedInDevices initial={devices} />
      </Card.Body>
    </Card>
  );
  return <div className="body"><PrefsForm prefs={prefs} trainerFirstName={(session.me.trainer?.name ?? 'Your trainer').split(' ')[0]} vapidKey={session.me.push.vapidPublicKey} after={devicesCard} /></div>;
}
