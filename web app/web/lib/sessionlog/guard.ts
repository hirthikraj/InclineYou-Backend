import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import type { PickView } from '@/lib/log/log';

import { getConsoleData, getLogWire, getPickerView, getStartPreview, SessionLogApiError, type ConsoleDataX } from './api';
import { guard, type Result } from './finish-guard';

/**
 * THE CONSOLE'S GUARD — the same four answers every guard on this half gives
 * (`lib/log/guard.ts`'s, which this replaces for this screen), over the new read.
 *
 * `not_started` is this file's fifth and is not a failure. A booking with no log
 * behind it is the ordinary state of every session before six in the morning, and
 * the console offers to start one. In v1 the log read answers a PLAN PREVIEW for
 * such a session (ids null, `startedAt` null), so "is there a log?" is a question
 * about `startedAt`, not about a 404 — which is why this reads the log first and
 * only builds the console from it when it has been opened.
 */
export type ConsoleResult =
  | { ok: true; data: ConsoleDataX }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number }
  | { ok: false; kind: 'not_started'; start: NonNullable<Awaited<ReturnType<typeof getStartPreview>>> };

export async function requireConsole(sessionId: string): Promise<ConsoleResult> {
  if (!(await getToken())) redirect('/sign-in');

  try {
    const log = await getLogWire(sessionId);
    if (!log) return { ok: false, kind: 'not_found' };

    if (log.session.startedAt === null) {
      const start = await getStartPreview(sessionId);
      return start ? { ok: false, kind: 'not_started', start } : { ok: false, kind: 'not_found' };
    }

    const data = await getConsoleData(sessionId);
    return data ? { ok: true, data } : { ok: false, kind: 'not_found' };
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
}

/**
 * Frame 5a — the picker's guard, the same one the old `lib/log/guard.ts` had, over the
 * new `GET /v1/sessions/pick`. The generic `guard` (and its four answers) lives in
 * `finish-guard.ts`, beside the screens that have no fifth answer.
 */
export function requirePicker(): Promise<Result<PickView>> {
  return guard(() => getPickerView());
}
