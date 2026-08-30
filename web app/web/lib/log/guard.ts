import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import {
  getConsole, getExerciseHistory, getFinish, getPicker, getProgress, getUnstarted, LogApiError,
} from './api';
import type { ConsoleData, FinishData } from './api';
import type { HistoryView, PickView, ProgressRange, ProgressView } from './log';

/**
 * The same shape every other guard on this half uses, and the same predicate
 * behind it: a refusal and an unreachable server are answers a screen can draw,
 * and anything else is a bug that must not be swallowed into "the server said
 * no". `/today`'s error path is where that lesson was learned.
 *
 * `not_started` is this file's own fourth answer, and it is not a failure. A
 * booking with no log behind it is the ordinary state of every session before
 * six in the morning; the console offers to start one.
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

export type ConsoleResult =
  | Result<ConsoleData>
  | { ok: false; kind: 'not_started'; start: Awaited<ReturnType<typeof getUnstarted>> };

export async function requireConsole(routeId: string): Promise<ConsoleResult> {
  const result = await guard(() => getConsole(routeId));
  if (result.ok || result.kind !== 'not_found') return result;

  /* No log against this id. Either it is a booking nobody has started, or it is
     nothing at all — and the two are different screens. */
  const unstarted = await guard(() => getUnstarted(routeId));
  if (!unstarted.ok) return unstarted;
  return { ok: false, kind: 'not_started', start: unstarted.data };
}

export function requireFinish(routeId: string): Promise<Result<FinishData>> {
  return guard(() => getFinish(routeId));
}

export function requirePicker(): Promise<Result<PickView>> {
  return guard(() => getPicker());
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
