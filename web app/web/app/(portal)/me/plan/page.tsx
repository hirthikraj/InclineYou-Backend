import { PlanView } from '@/components/portal/plan/PlanView';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle, type PlanWire } from '@/lib/portal/plan-api';
import { Message } from '@/web-components/ui/Message';

export const metadata = { title: 'Plan · InclineYou' };

/** `/me/plan` — what is coming: the trainer's sessions of the next fortnight and the arc of the plan (api-contract 1.2, pp-l1). */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const plan = settle(await portalGet<PlanWire>('/v1/portal/plan'));
  if (!plan) return <div className="body"><Message tone="warn">We couldn’t load your plan just now. Reload in a moment — nothing has been lost.</Message></div>;
  return (
    <div className="body">
      <PlanView plan={plan} zone={session.me.myDetails?.timezone ?? 'Asia/Kolkata'} trainerFirstName={(session.me.trainer?.name ?? 'Your trainer').split(' ')[0]} />
    </div>
  );
}
