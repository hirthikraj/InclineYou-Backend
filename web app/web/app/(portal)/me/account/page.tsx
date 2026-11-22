import { AccountOverview } from '@/components/portal/account/AccountOverview';
import { requirePortalSession } from '@/lib/portal/session';

export const metadata = { title: 'Me · InclineYou' };

/** `/me/account` — the Me tab's overview: your trainer, then the doors to what is yours. `AccountOverview` carries the why. */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  return (
    <div className="body">
      <AccountOverview me={session.me} />
    </div>
  );
}
