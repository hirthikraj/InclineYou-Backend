import { LoadFailed } from '@/components/portal/LoadFailed';
import { ProgressView } from '@/components/portal/plan/ProgressView';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle, type ProgressWire } from '@/lib/portal/plan-api';

export const metadata = { title: 'Progress · InclineYou' };

/**
 * `/me/progress` — am I getting somewhere? Strength first, then consistency (api-contract 1.2, pp-l3). The window is the URL's.
 *
 * Three windows, four weeks by default. AGENTS.md's *the range control's default is `all`* was the mock's: this backend refuses
 * `windowDays` outside 7–365, so there is no "since you started" to offer and the shortest bounded window is the honest default.
 */
export const dynamic = 'force-dynamic';

const WINDOWS = [28, 90, 365];

export default async function Page({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const { window: raw } = await searchParams;
  const days = WINDOWS.includes(Number(raw)) ? Number(raw) : 28;
  const progress = settle(await portalGet<ProgressWire>(`/v1/portal/progress?windowDays=${days}`));
  if (!progress) return <LoadFailed what="your progress" retryHref={days === 28 ? '/me/progress' : `/me/progress?window=${days}`} />;
  return (
    <div className="body">
      <ProgressView
        progress={progress}
        windows={WINDOWS}
        trainerFirstName={(session.me.trainer?.name ?? 'Your trainer').split(' ')[0]}
        zone={session.me.myDetails?.timezone ?? 'Asia/Kolkata'}
      />
    </div>
  );
}
