import { ProgressView } from '@/components/portal/plan/ProgressView';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle, type ProgressWire } from '@/lib/portal/plan-api';
import { Message } from '@/web-components/ui/Message';

export const metadata = { title: 'Progress · InclineYou' };

/** `/me/progress` — am I getting somewhere? Strength first, then consistency (api-contract 1.2, pp-l3). The window is the URL's. */
export const dynamic = 'force-dynamic';

const WINDOWS = [28, 90, 365];

export default async function Page({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const { window: raw } = await searchParams;
  const days = WINDOWS.includes(Number(raw)) ? Number(raw) : 28;
  const progress = settle(await portalGet<ProgressWire>(`/v1/portal/progress?windowDays=${days}`));
  if (!progress) return <div className="body"><Message tone="warn">We couldn’t load your progress just now. Reload in a moment.</Message></div>;
  return (
    <div className="body">
      <ProgressView progress={progress} windows={WINDOWS} trainerFirstName={(session.me.trainer?.name ?? 'Your trainer').split(' ')[0]} />
    </div>
  );
}
