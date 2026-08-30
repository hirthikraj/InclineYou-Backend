import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import { getToday, TodayApiError, type TodayData } from './api';

/**
 * What `/today` is allowed to render, and the reason it is a RESULT rather than
 * a throw.
 *
 * ── THE FIRST VERSION THREW, AND THE SCREEN WAS USELESS ──────────────────────
 *
 * It let every failure reach `app/today/error.tsx`, which said "We could not read
 * your day" and offered a retry. Then the API was stopped for twenty seconds
 * during a deploy, and that is exactly what a trainer got — with no way to tell
 * whether the server was down, their session had expired, or the screen was
 * broken. Three different problems, three different things to do about them, one
 * sentence.
 *
 * `TodayApiError` already carries the distinction: `status: null` means the
 * request never got an answer, a number means it got a refusal. Throwing
 * discarded it, and it could not be recovered on the other side — Next redacts a
 * server error's message in production and hands the boundary a digest.
 *
 * So an EXPECTED failure is data. `lib/auth/api.ts` reached the same conclusion
 * for the same reason and says so: "A `200` keeps a network error
 * distinguishable from a taken number." The error boundary stays for what it is
 * for — a bug nobody predicted.
 */
export type TodayResult =
  | { ok: true; data: TodayData }
  /** The request never got an answer: the API is down, or nothing can reach it. */
  | { ok: false; kind: 'unreachable' }
  /** It answered, and said no. `status` is the code — 500, 429, 404. */
  | { ok: false; kind: 'refused'; status: number };

export async function requireToday(): Promise<TodayResult> {
  if (!(await getToken())) redirect('/sign-in');

  let data: TodayData;
  try {
    data = await getToday();
  } catch (error) {
    if (error instanceof TodayApiError) {
      // A token the server no longer accepts — expired, or minted before a
      // redeploy. Landing a signed-out browser on a screen whose every module is
      // empty is worse than sending it back to sign in. Outside the branch below
      // because `redirect()` throws and must not be caught.
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      return error.status === null
        ? { ok: false, kind: 'unreachable' }
        : { ok: false, kind: 'refused', status: error.status };
    }
    /*
     * Anything that is not a `TodayApiError` is a bug in this code rather than a
     * fact about the network, and it belongs to the error boundary.
     *
     * Deliberately NOT swallowed into an empty deck. A Today drawn from nothing
     * looks exactly like a quiet morning — no sessions, nobody owing, no money —
     * and a trainer would believe it, then miss a session. This is the one screen
     * where failing visibly is the safe behaviour.
     */
    throw error;
  }

  /*
   * A trainer who still owes setup does not belong here.
   *
   * Every module is derived from clients, sessions and payments, and a profile
   * mid-setup has no working hours — so the day would have no shape, the gaps no
   * price and the money card no split. `/setup` redirects a finished trainer to
   * `/today`, so the two guards close the loop in both directions.
   *
   * The test is on the PROFILE, not on the data: "no sessions today" is a
   * legitimate state for a finished trainer and must not bounce them out. And it
   * is read off the profile `getToday` already fetched, so this costs no request.
   */
  if (!data.trainer.setupComplete) redirect('/setup');

  return { ok: true, data };
}
