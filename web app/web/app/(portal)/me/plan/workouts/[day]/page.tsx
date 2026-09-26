import { notFound } from 'next/navigation';

import { PlanDay } from '@/components/portal/PlanDay';
import { getPortalProgram, getPortalSessions } from '@/lib/portal/api';
import { requirePortal } from '@/lib/portal/guard';
import { PLAN_WINDOW_MS, buildPlan } from '@/lib/portal/plan';
import { DAY_MS, startOfDay } from '@/lib/today/time';

export const dynamic = 'force-dynamic';

/**
 * §4 · Plan → Workouts → one day.
 *
 * ── THE PARAMETER IS AN ORDINAL, AND IT IS VALIDATED ────────────────────────
 *
 * `[day]` is `program_exercise.day_of_week`, which V24's law says is a SLOT and
 * not a weekday — *"Day 1 is the first day this program trains"* — so it is a
 * small integer and needs no encoding.
 *
 * It is checked against the program's own days rather than trusted, which is the
 * rule History's `?month=` already follows: *"a `?month=` typed by hand is
 * checked against the list rather than trusted."* Two ways to miss:
 *
 *   · **not a number**, or a number this program does not train — a 404, and
 *     the only way to reach it is a hand-typed or stale URL;
 *   · **no program at all** — also a 404 rather than an empty day, because a
 *     client with nothing assigned is told so on the two tabs above, and a third
 *     screen apologising is the duplication this whole pass is about.
 */
export async function generateMetadata(props: { params: Promise<{ day: string }> }) {
  const result = await requirePortal();
  if (!result.ok) return { title: 'Plan · InclineYou' };
  const { day } = await props.params;
  const program = await getPortalProgram();
  const found = program?.days.find((d) => String(d.templateDay) === day);
  return { title: `${found?.label ?? 'Workout'} · Plan · InclineYou` };
}

export default async function Page(props: { params: Promise<{ day: string }> }) {
  const result = await requirePortal();
  if (!result.ok) return null;
  const { me, now } = result;

  const { day } = await props.params;

  const [sessions, program] = await Promise.all([
    getPortalSessions(startOfDay(now) - DAY_MS, startOfDay(now) + PLAN_WINDOW_MS),
    getPortalProgram(),
  ]);

  if (!program) notFound();

  const found = program.days.find((d) => String(d.templateDay) === day);
  if (!found) notFound();

  const data = buildPlan(me, sessions, program, now);
  const summary = data.days.find((d) => d.templateDay === found.templateDay) ?? null;

  return (
    <div className="body">
      <PlanDay me={me} program={program} day={found} summary={summary} />
    </div>
  );
}
