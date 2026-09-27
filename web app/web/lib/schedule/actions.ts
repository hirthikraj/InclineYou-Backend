'use server';

import { revalidatePath } from 'next/cache';

import { api, ApiError } from '@/lib/http/client';
import { fetchWindow, ScheduleApiError } from './api';
import type { SessionWire as DiaryRow } from './rows';
import type { ScheduleView } from './view';
/* WriteResult and the three constants live in ./result for the rule in
   lib/today/hold.ts: a 'use server' module may export only async functions. */
import type { WriteResult } from './result';

/**
 * THE FOUR THINGS THIS SCREEN WRITES, AND ONE RULE THEY ALL SHARE.
 *
 * Book, move, edit, mark done or no-show, cancel, reopen — and undo a booking. Every one of them goes straight to the server —
 * the web half is online-only, which `AGENTS.md` states as the rule that reverses
 * a doc, and a calendar is where the temptation to queue is strongest and the
 * cost highest. A booking held in a browser is a booking that exists for one
 * person: the trainer sees it on the grid, the client's portal does not, and the
 * clash it would have caused is not detected until it is somebody's Tuesday.
 *
 * ── THE ONE THING THAT IS HELD, AND IT IS NOT A QUEUE ────────────────────────
 *
 * A MOVE waits ten seconds in the browser before this module is called at all —
 * see `MOVE_HOLD_SECONDS` in `./result` for why the whole write waits rather than
 * just the message. That is an undo window, not an offline queue: nothing is
 * persisted anywhere, the tab is the only place it lives, and closing the tab
 * inside the ten seconds means the move never happened. Which is the honest
 * reading of an undo that has not expired.
 *
 * ── WHAT THE SERVER OWNS AND THIS FILE DOES NOT SECOND-GUESS ─────────────────
 *
 * Clash detection is drawn on this screen and enforced nowhere, and that is
 * deliberate on both halves: `WorkingHoursScreen` states the rule on itself —
 * working hours constrain what a CLIENT can self-book and have never constrained
 * the trainer. So a trainer may book two people into one hour, may book outside
 * their own hours, and the screen's job is to make both impossible to do by
 * accident rather than impossible to do. The ghost turns danger, the read-out
 * names who, and then it books.
 */

/**
 * Every failure a trainer can be told about, in the words that fit the verb.
 * Branches on the problem's `code`, never on the prose (api-contract *Errors*).
 */
function readFailure(error: unknown, subject: string): WriteResult {
  if (error instanceof ApiError) {
    if (error.status === null) {
      return { ok: false, message: `${subject} could not reach the server. Nothing changed.` };
    }
    if (error.status === 401 || error.status === 403) {
      return { ok: false, message: 'Your session expired. Sign in again.' };
    }
    if (error.status === 404) {
      return { ok: false, message: `${subject} is no longer there. Reload the week.` };
    }
    if (error.status === 412) {
      return { ok: false, stale: true, message: 'This session changed elsewhere. It has been reloaded — check it and try again.' };
    }
    switch (error.problem.code) {
      case 'SESSION_CLIENT_TIME_TAKEN':
        return { ok: false, message: `${subject} was refused — this client already has a session at that time.` };
      case 'CLIENT_NOT_BOOKABLE':
        return { ok: false, message: `${subject} was refused — ${error.problem.detail ?? 'this client can’t be booked right now.'}` };
      case 'SESSION_NOT_STARTED':
        return { ok: false, message: 'This session hasn’t started yet. Mark it once its start time has passed.' };
      case 'SESSION_SETTLED':
      case 'SESSION_DONE':
      case 'SESSION_CANCELLED':
        return { ok: false, message: error.problem.detail ?? `${subject} was refused.` };
    }
    return { ok: false, message: `${subject} did not go through. Nothing changed.` };
  }
  return { ok: false, message: `${subject} did not go through. Nothing changed.` };
}

/**
 * Both the schedule and Today are revalidated after every write, and that is not
 * belt-and-braces.
 *
 * Today's hero, its day ribbon, its week card and its rail badge are all derived
 * from the same `scheduled_session` rows this screen edits. A trainer who books a
 * 17:00 from here and then clicks *Today* in the rail would otherwise land on a
 * cached day that does not have it — and the one screen a trainer trusts to be
 * current would be the one screen that is stale.
 */
function refresh(): void {
  revalidatePath('/schedule');
  revalidatePath('/today');
}

interface SessionWire {
  id: string;
}

/**
 * Book one session — api-contract Today A1.
 *
 * `scheduledAt` is an absolute instant and not a date plus a minute, because any
 * split representation is a timezone argument waiting to happen.
 *
 * `deliveryMode` is sent only when the trainer changed it. Null means "use
 * whatever this client usually does"; freezing a client's default onto every row
 * would keep drawing them on the floor after they switched to remote.
 */
export async function bookSession(input: {
  /**
   * The browser's attempt id (1.1: a client-minted id, and a replay answers 200
   * with the first booking). Kept by the panel across retries of the same
   * booking — minted here, a retry after a timeout would be a second booking
   * and a 409 SESSION_CLIENT_TIME_TAKEN.
   */
  requestId?: string;
  clientId: string;
  scheduledAt: number;
  durationMinutes: number;
  programId?: string | null;
  deliveryMode?: 'floor' | 'remote' | null;
  notes?: string | null;
}): Promise<WriteResult> {
  try {
    // `workoutId: null` lets the server pick the next workout in the client's
    // active program.
    const res = await api<SessionWire>('/v1/sessions', {
      method: 'POST',
      body: {
        id: input.requestId ?? crypto.randomUUID(),
        clientId: input.clientId,
        scheduledAt: input.scheduledAt,
        durationMinutes: input.durationMinutes,
        workoutId: null,
        deliveryMode: input.deliveryMode ?? null,
        notes: input.notes ?? null,
      },
    });
    refresh();
    return { ok: true, sessionId: res?.id };
  } catch (error) {
    return readFailure(error, 'The booking');
  }
}

/**
 * Take back a booking just made by mistake — `DELETE /v1/sessions/{id}`, the
 * booking receipt's Undo and nothing else (R12). The server allows it only
 * while the session is untouched; anything with a history is cancelled instead.
 * A retried Undo is harmless: a row already removed answers 204 again.
 */
export async function undoBooking(id: string): Promise<WriteResult> {
  try {
    await api(`/v1/sessions/${id}`, { method: 'DELETE' });
    refresh();
    return { ok: true, sessionId: id };
  } catch (error) {
    return readFailure(error, 'Undoing the booking');
  }
}

/**
 * Move a session, or change its length, mode or note —
 * `PATCH /v1/sessions/{id}` with ONLY what changed (R14). A move sends
 * `{scheduledAt}`; a panel save sends the dirty fields. `status` is never sent:
 * it changes only through the verbs below.
 *
 * `version` goes out as If-Match when the caller has one — the panel's Save sends
 * it, so a panel left open cannot undo a move made in another tab; a 412 comes
 * back as `stale` and the caller reloads (R69). The held move doesn't need it:
 * it only sends the start.
 */
export async function updateSession(input: {
  id: string;
  version?: string;
  scheduledAt?: number;
  durationMinutes?: number;
  deliveryMode?: 'floor' | 'remote' | null;
  notes?: string | null;
}): Promise<WriteResult> {
  const { id, version, ...fields } = input;
  const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  try {
    await api(`/v1/sessions/${id}`, {
      method: 'PATCH',
      body,
      headers: version ? { 'if-match': `"${version}"` } : undefined,
    });
    refresh();
    return { ok: true, sessionId: id };
  } catch (error) {
    if (error instanceof ApiError && error.status === 412) refresh();
    return readFailure(error, 'scheduledAt' in body ? 'The move' : 'The change');
  }
}

/** One mark's outcome — `SessionWriteService.MarkResult`, the batch's item shape. */
interface MarkWire {
  outcome: 'done' | 'already_done' | 'not_charged';
  packageId?: string;
  sessionsRemaining?: number;
  reason?: 'NO_PACKAGE' | 'PACKAGE_PAUSED' | 'PACKAGE_EMPTY';
}

/**
 * Mark a session delivered — `POST /v1/sessions/{id}/done`, the same code as
 * Today's batch mark. It charges the pack when one should pay; a session with no
 * live pack is still marked, and `message` says it wasn't charged. Only once the
 * start time has passed (R15): before that the server answers
 * SESSION_NOT_STARTED.
 */
export async function markDone(id: string): Promise<WriteResult> {
  try {
    const res = await api<MarkWire>(`/v1/sessions/${id}/done`, { method: 'POST', body: {} });
    refresh();
    return {
      ok: true,
      sessionId: id,
      message: res?.outcome === 'not_charged' ? notChargedLine(res.reason) : undefined,
      sessionsRemaining: res?.sessionsRemaining ?? null,
    };
  } catch (error) {
    return readFailure(error, 'Marking it done');
  }
}

function notChargedLine(reason: MarkWire['reason']): string {
  return reason === 'PACKAGE_PAUSED' ? 'No session was taken — their pack is paused.'
    : reason === 'PACKAGE_EMPTY' ? 'No session was taken — their pack has none left.'
    : 'No session was taken — there is no running pack for it.';
}

/**
 * Record a no-show — `POST /v1/sessions/{id}/no-show {charge}` (R13).
 *
 * Whether a missed session burns one off the pack is a commercial decision the
 * trainer makes with the client, so it is a parameter: the diary's button sends
 * true, the finish screen lets the trainer untick it. The server settles against
 * what the session already carries, so asking twice costs one session and asking
 * again with `false` gives it back. A paused pack is never charged.
 */
export async function markNoShow(input: {
  id: string;
  costsASession: boolean;
}): Promise<WriteResult> {
  try {
    const res = await api<{ charged: boolean; sessionsRemaining?: number; reason?: MarkWire['reason'] }>(
      `/v1/sessions/${input.id}/no-show`,
      { method: 'POST', body: { charge: input.costsASession } },
    );
    refresh();
    return {
      ok: true,
      sessionId: input.id,
      charged: res?.charged ?? false,
      message: input.costsASession && res && !res.charged ? notChargedLine(res.reason) : undefined,
      sessionsRemaining: res?.sessionsRemaining ?? null,
    };
  } catch (error) {
    return readFailure(error, 'Marking the no-show');
  }
}

/**
 * Cancel one booking — `POST /v1/sessions/{id}/cancel`. The row stays in the
 * diary as cancelled, the client's start time is freed, and nobody is told.
 * `reason` is `trainer` (the default) or `client`. Undo is `reopenSession`.
 */
export async function cancelSession(id: string, reason: 'trainer' | 'client' = 'trainer'): Promise<WriteResult> {
  try {
    await api(`/v1/sessions/${id}/cancel`, { method: 'POST', body: { reason } });
    refresh();
    return { ok: true, sessionId: id };
  } catch (error) {
    return readFailure(error, 'The cancellation');
  }
}

/**
 * Take back a done, no-show or cancel — `POST /v1/sessions/{id}/reopen` (R69).
 * The session is booked again, its log is kept, and a pack charge is reversed
 * (never deleted). The Undo on every settle receipt, and Reopen on a settled
 * session's panel.
 */
export async function reopenSession(id: string): Promise<WriteResult> {
  try {
    const res = await api<{ effects: { chargeReversed: boolean; sessionsRemaining?: number } }>(
      `/v1/sessions/${id}/reopen`,
      { method: 'POST', body: {} },
    );
    refresh();
    return {
      ok: true,
      sessionId: id,
      message: res?.effects?.chargeReversed ? 'The session is back on their pack.' : undefined,
      sessionsRemaining: res?.effects?.sessionsRemaining ?? null,
    };
  } catch (error) {
    return readFailure(error, 'Reopening it');
  }
}

/**
 * *Message {name}* on a move's receipt (R11): nobody is told about a move in v1,
 * so the trainer decides. Drafts `session_reminder` for the moved session —
 * `POST /v1/clients/{id}/nudges`, which logs `reason = session` and returns the
 * wa.me link; nothing is sent from here.
 */
export async function messageAboutSession(
  clientId: string,
  sessionId: string,
  requestId: string,
): Promise<{ ok: boolean; whatsappUrl?: string; message?: string }> {
  try {
    const res = await api<{ whatsappUrl: string }>(`/v1/clients/${encodeURIComponent(clientId)}/nudges`, {
      method: 'POST',
      body: { id: requestId, template: 'session_reminder', sessionId },
    });
    revalidatePath('/today');
    return { ok: true, whatsappUrl: res?.whatsappUrl };
  } catch (error) {
    if (error instanceof ApiError && error.problem.code === 'CLIENT_NO_PHONE') {
      return { ok: false, message: 'This client has no phone number on file. Add one in their file first.' };
    }
    if (error instanceof ApiError && error.status === 429) {
      return { ok: false, message: 'Too many messages in a minute. Wait a moment and try again.' };
    }
    return readFailure(error, 'The message');
  }
}

/**
 * A view switch — Day · Week · Month, ‹ ›, swipe, a day in the month — asks for
 * the new window of the diary and nothing else (api-contract *Schedule*: L4 is
 * fetched again with the new window). The page already holds the roster, the
 * hours, the packs and the trainer, none of which depend on the view, so the
 * browser maps these rows against them (`lib/schedule/rows.ts`). A write still
 * refreshes the whole page, because it can change any of the five.
 *
 * Read-only, so it revalidates nothing.
 */
export async function loadWindow(view: ScheduleView, anchor: number): Promise<
  | { ok: true; from: number; to: number; rows: DiaryRow[] }
  | { ok: false; status: number | null }
> {
  try {
    return { ok: true, ...(await fetchWindow(view, anchor)) };
  } catch (error) {
    if (error instanceof ScheduleApiError) return { ok: false, status: error.status };
    throw error;
  }
}
