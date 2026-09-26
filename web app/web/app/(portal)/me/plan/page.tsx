import { PlanSchedule } from '@/components/portal/PlanSchedule';
import { getPortalProgram, getPortalSessions } from '@/lib/portal/api';
import { requirePortal } from '@/lib/portal/guard';
import { PLAN_WINDOW_MS, buildPlan } from '@/lib/portal/plan';
import { DAY_MS, startOfDay } from '@/lib/today/time';

export const metadata = { title: 'Plan · InclineYou' };

/**
 * §4 · Plan → Schedule. The BARE route, never a redirect to a `/schedule`
 * child — `CLIENT_PRIMARY` in `nav.tsx` points at `/me/plan` and a redirect on
 * the way would cost a round trip on every visit. `progress-tabs.ts` states the
 * rule; `plan-tabs.ts` repeats it.
 *
 * Two requests, and the window is forward-only.
 *
 * This is still the one portal screen that does not look backwards — §4 is
 * about *"the anxiety of not knowing what's coming"*, and what has already
 * happened is Progress' subject. The *Past plans* tab is not a counter-example:
 * a finished BLOCK is a fact about the plan, not a record of sessions, and it
 * carries no attendance figure for exactly that reason.
 *
 * One day of slack on the near end, so a session earlier today is still drawn —
 * a client checking at six in the evening should see the morning they went to
 * rather than an empty diary.
 *
 * The chrome — the bar, the header and the tab strip — is `layout.tsx`'s. This
 * returns `<div className="body">` and nothing else.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const result = await requirePortal();
  if (!result.ok) return null;
  const { me, now } = result;

  const [sessions, program] = await Promise.all([
    getPortalSessions(startOfDay(now) - DAY_MS, startOfDay(now) + PLAN_WINDOW_MS),
    /* `cache()`d, and the layout has already asked for it — so this is free and
       the two cannot disagree about which week it is. */
    getPortalProgram(),
  ]);

  const data = buildPlan(me, sessions, program, now);

  return (
    <div className="body">
      <PlanSchedule me={me} data={data} />
    </div>
  );
}
