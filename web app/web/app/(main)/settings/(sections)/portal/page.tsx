import { PortalPanel } from '@/components/settings/PortalPanel';
import { getPortalSettings } from '@/lib/settings/portal-api';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Client portal · Settings · InclineYou' };

/**
 * THE CLIENT PORTAL SETTINGS — two decisions, each made once (api-contract 1.2, tr-a10, UC-SET-12 and 13).
 *
 * One request: `GET /v1/trainers/me`, which carries the `clientPortal` block. It draws no bar, title or back link; it is a tab,
 * and `(sections)/layout.tsx` owns all three.
 */
export default async function Page() {
  const settings = await getPortalSettings();

  return (
    <div className="body">
      <PortalPanel initial={settings} />
    </div>
  );
}
