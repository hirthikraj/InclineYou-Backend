import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import { startOfDay } from '@/lib/today/time';
import { getSchedule, ScheduleApiError, type ScheduleData } from './api';
import type { ScheduleView } from './view';

/**
 * The same three-way result `lib/today/guard.ts` settled on, for the same reason
 * and with the same argument behind it: an EXPECTED failure is data, not a throw.
 *
 * `TodayResult`'s docstring carries the full reasoning — a request that never got
 * an answer, a request that was refused, and a bug are three different problems
 * with three different things to do about them, and throwing collapses them into
 * one sentence a trainer cannot act on. It is not restated here; it is the same
 * decision, and `components/today/Unavailable.tsx` renders both halves of it.
 *
 * One thing IS different, and it is the reason this is a separate guard rather
 * than a shared one: this screen takes arguments. A view and an anchor come from
 * the URL, so they are parsed before the guard and passed in — a guard that read
 * `searchParams` itself would be a second place the URL's grammar is written down,
 * and `lib/schedule/view.ts` is the first.
 */
export type ScheduleResult =
  | { ok: true; data: ScheduleData }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

/**
 * `anchor` is nullable, and resolving the null is this function's job.
 *
 * `/schedule` with no `d` means "the week I am in", and answering that needs a
 * clock. A page component may not read one — React's purity rule — so the page
 * hands the raw parse through and the request-scoped guard supplies today.
 */
export async function requireSchedule(
  view: ScheduleView,
  anchor: number | null,
): Promise<ScheduleResult> {
  if (!(await getToken())) redirect('/sign-in');

  const at = anchor ?? startOfDay(Date.now());

  let data: ScheduleData;
  try {
    data = await getSchedule(view, at);
  } catch (error) {
    if (error instanceof ScheduleApiError) {
      // Outside the branch below because `redirect()` throws and must not be
      // caught: a token the server no longer accepts belongs at sign-in, not on
      // a week drawn from nothing.
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      return error.status === null
        ? { ok: false, kind: 'unreachable' }
        : { ok: false, kind: 'refused', status: error.status };
    }
    /*
     * Not swallowed into an empty week, and here the stake is higher than on
     * Today. An empty Today reads as a quiet morning; an empty SCHEDULE reads as
     * a free week, and a trainer who believes it books over five people. This is
     * the screen where failing visibly is not merely safer, it is the only safe
     * option.
     */
    throw error;
  }

  // A profile mid-setup has no working hours, so every day would be unhatched,
  // every gap unpriced and the utilisation figure a division by zero. `/setup`
  // redirects a finished trainer back, so the two guards close the loop.
  if (!data.trainer.setupComplete) redirect('/setup');

  return { ok: true, data };
}
