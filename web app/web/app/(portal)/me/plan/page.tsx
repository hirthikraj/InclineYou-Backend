import { LoadFailed } from '@/components/portal/LoadFailed';
import { PlanView } from '@/components/portal/plan/PlanView';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, serverNow, settle, type PlanWire } from '@/lib/portal/plan-api';

export const metadata = { title: 'Plan · InclineYou' };

/** `/me/plan` — what is coming: the trainer's booked sessions, then the plan week by week (api-contract 1.2, pp-l1). */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const plan = settle(await portalGet<PlanWire>('/v1/portal/plan'));
  if (!plan) return <LoadFailed what="your plan" retryHref="/me/plan" />;
  return (
    <div className="body">
      <PlanView
        plan={plan}
        zone={session.me.myDetails?.timezone ?? 'Asia/Kolkata'}
        trainerFirstName={(session.me.trainer?.name ?? 'Your trainer').split(' ')[0]}
        whatsappUrl={session.me.trainer?.whatsappUrl ?? null}
        now={serverNow()}
      />
    </div>
  );
}
