import { PlanWorkouts } from '@/components/portal/PlanWorkouts';
import { getPortalProgram, getPortalSessions } from '@/lib/portal/api';
import { requirePortal } from '@/lib/portal/guard';
import { PLAN_WINDOW_MS, buildPlan } from '@/lib/portal/plan';
import { DAY_MS, startOfDay } from '@/lib/today/time';

export const metadata = { title: 'Workouts · Plan · InclineYou' };

/**
 * §4 · Plan → **Workouts** — the training days, and the block they belong to.
 *
 * ── IT READS THE DIARY, AND THAT IS NOT WASTE ───────────────────────────────
 *
 * A day list looks like it needs the program and nothing else, and it needs the
 * sessions for two things a client asks of it: **how long a day runs** — the
 * BOOKED length, because `PlanDaySummary.minutes` refuses to derive one from
 * sets and rest times — and **when it next happens**, which is what makes
 * *Upper A* a day of somebody's week rather than a label.
 *
 * Both are the same read the *Schedule* tab makes, on the same 28-day window,
 * so a client moving between the two tabs is not looking at two diaries.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const result = await requirePortal();
  if (!result.ok) return null;
  const { me, now } = result;

  const [sessions, program] = await Promise.all([
    getPortalSessions(startOfDay(now) - DAY_MS, startOfDay(now) + PLAN_WINDOW_MS),
    getPortalProgram(),
  ]);

  const data = buildPlan(me, sessions, program, now);

  return (
    <div className="body">
      <PlanWorkouts me={me} data={data} />
    </div>
  );
}
