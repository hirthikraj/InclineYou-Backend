import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import { getExerciseHistory, getProgress, LogApiError } from './api';
import type { HistoryView, ProgressRange, ProgressView } from './log';

/**
 * The same shape every other guard on this half uses, and the same predicate
 * behind it: a refusal and an unreachable server are answers a screen can draw,
 * and anything else is a bug that must not be swallowed into "the server said
 * no". `/today`'s error path is where that lesson was learned.
 *
 * The console's guard (and its `not_started` answer) moved to
 * `lib/sessionlog/guard.ts` with the console; what is left here is the Progress
 * pass's.
 */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

async function guard<T>(load: () => Promise<T | null>): Promise<Result<T>> {
  if (!(await getToken())) redirect('/sign-in');

  let data: T | null;
  try {
    data = await load();
  } catch (error) {
    if (error instanceof LogApiError) {
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

export function requireExerciseHistory(
  clientId: string,
  exerciseId: string,
): Promise<Result<HistoryView>> {
  return guard(() => getExerciseHistory(clientId, exerciseId));
}

export function requireProgress(
  clientId: string,
  range: ProgressRange,
  focus: string | null,
): Promise<Result<ProgressView>> {
  return guard(() => getProgress(clientId, range, focus));
}
