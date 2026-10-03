import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';

import { SessionLogApiError, getConsoleData, getFinishData } from './api';
import type { ConsoleDataX, FinishDataX } from './api';

/**
 * THE GUARD FOR THE SCREENS THAT READ A LOG AFTER IT WAS WRITTEN — Finish (5b),
 * Bests (2a) and the read-only record of a session.
 *
 * The same four answers every guard on this half gives: a refusal and an
 * unreachable server are answers a screen can draw, a 401/403 is a signed-out
 * browser, and anything else is a bug that must not be swallowed. It lives here
 * rather than beside the console's guard because the console's has a fifth answer
 * (`not_started`, where it offers to start the log) that these screens do not
 * have: a booking with no log behind it has nothing to finish and no top sets to
 * judge, so for them it is simply "not found" — which is what the old `getFinish`
 * (no workout → null) and `requireConsole` (`not_started` → `notFound()`) both
 * ended up as on these routes.
 */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

export async function guard<T>(load: () => Promise<T | null>): Promise<Result<T>> {
  if (!(await getToken())) redirect('/sign-in');

  let data: T | null;
  try {
    data = await load();
  } catch (error) {
    if (error instanceof SessionLogApiError) {
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      if (error.status === 404) return { ok: false, kind: 'not_found' };
      return error.status === null
        ? { ok: false, kind: 'unreachable' }
        : { ok: false, kind: 'refused', status: error.status };
    }
    throw error;
  }

  if (data === null) return { ok: false, kind: 'not_found' };
  return { ok: true, data };
}

/** Frame 5b — `/sessions/:id/finish`. */
export function requireFinish(id: string): Promise<Result<FinishDataX>> {
  return guard(async () => {
    const data = await getFinishData(id);
    return data && data.view.started ? data : null;
  });
}

/** Frame 2a — `/sessions/:id/bests`. */
export function requireBests(id: string): Promise<Result<ConsoleDataX>> {
  return guard(async () => {
    const data = await getConsoleData(id);
    return data && data.view.started ? data : null;
  });
}
