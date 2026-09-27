'use server';

import { revalidatePath } from 'next/cache';

import { ScheduleApiError, del, post, put } from './api';
/* WriteResult and the three constants live in ./result for the rule in
   lib/today/hold.ts: a 'use server' module may export only async functions. */
import type { WriteResult } from './result';

/**
 * THE FOUR THINGS THIS SCREEN WRITES, AND ONE RULE THEY ALL SHARE.
 *
 * Book, move, cancel, mark done. Every one of them goes straight to the server —
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

/** Every failure a trainer can be told about, in the words that fit the verb. */
function readFailure(error: unknown, subject: string): WriteResult {
  if (error instanceof ScheduleApiError) {
    if (error.status === null) {
      return { ok: false, message: `${subject} could not reach the server. Nothing changed.` };
    }
    if (error.status === 401 || error.status === 403) {
      return { ok: false, message: 'Your session expired. Sign in again.' };
    }
    if (error.status === 404) {
      return { ok: false, message: `${subject} is no longer there. Reload the week.` };
    }
    if (error.status === 409) {
      return { ok: false, message: `${subject} was refused — something else has that slot.` };
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
 * Book one session.
 *
 * `scheduledAt` is an absolute instant and not a date plus a minute, because the
 * server stores `scheduled_at` as epoch milliseconds and any split representation
 * is a timezone argument waiting to happen. The browser composes it from the day
 * it clicked and the minute it chose, both local, which is the same arithmetic
 * `atMinute` does on the phone.
 *
 * `deliveryMode` is sent only when the trainer changed it. Null means "use
 * whatever this client usually does" — `API.md` says so, and the alternative
 * freezes a client's default onto every row booked before they switched to
 * remote, so the day would keep drawing them on the floor forever.
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
    // api-contract Today A1 (1.1). `workoutId: null` lets the server pick the next
    // workout in the client's active program, which replaces the old `programId`.
    const res = await post<SessionWire>('/v1/sessions', {
      id: input.requestId ?? crypto.randomUUID(),
      clientId: input.clientId,
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      workoutId: null,
      deliveryMode: input.deliveryMode ?? null,
      notes: input.notes ?? null,
    });
    refresh();
    return { ok: true, sessionId: res?.id };
  } catch (error) {
    return readFailure(error, 'The booking');
  }
}

/**
 * Move or re-shape one session.
 *
 * A single `PUT` for both, because they are one edit on the wire —
 * `PUT /v1/sessions/{id}` takes `scheduledAt`, `status`, `durationMinutes`,
 * `notes` and `deliveryMode` together — and because they are one edit to a
 * trainer: dragging a block's edge changes its length, dragging its body changes
 * its start, and both are "I changed this session".
 *
 * Every field is sent on every call, including the ones that did not change. That
 * is not laziness, it is the shape of the endpoint: `PUT` replaces, so omitting
 * `durationMinutes` on a move would reset a 90-minute session to the default. The
 * caller holds the whole row and hands the whole row back.
 */
export async function updateSession(input: {
  id: string;
  scheduledAt: number;
  durationMinutes: number;
  status?: string;
  deliveryMode?: 'floor' | 'remote' | null;
  notes?: string | null;
}): Promise<WriteResult> {
  try {
    await put(`/v1/sessions/${input.id}`, {
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      status: input.status,
      deliveryMode: input.deliveryMode ?? null,
      notes: input.notes ?? null,
    });
    refresh();
    return { ok: true, sessionId: input.id };
  } catch (error) {
    return readFailure(error, 'The move');
  }
}

/**
 * Mark a booked session delivered — the bridge from *planned* to *logged*.
 *
 * `POST /v1/sessions/{id}/done` and not a `PUT` to `status: 'done'`, and the
 * difference is a side effect the schedule must not skip: the endpoint creates
 * the corresponding `workout_session` row AND decrements the client's session
 * pack. A status flip would mark the grid green and leave the pack at 6 of 12
 * forever, so the money book and the calendar would disagree about how many
 * sessions a client had used — which is the one disagreement a trainer settles
 * with a client in person.
 */
export async function markDone(id: string): Promise<WriteResult> {
  try {
    await post(`/v1/sessions/${id}/done`, {});
    refresh();
    return { ok: true, sessionId: id };
  } catch (error) {
    return readFailure(error, 'Marking it done');
  }
}

/**
 * Record a no-show, and settle the pack in the same write.
 *
 * A `PUT`, not `/done`, and the two are not interchangeable: a no-show is a
 * session that did not happen, so there is no workout to create.
 *
 * ── `costsASession` IS A PARAMETER, NOT A RULE ──────────────────────────────
 *
 * Whether a missed session burns one off the pack is a commercial decision the
 * trainer makes with the client, and it stays theirs — the caller passes what
 * the trainer chose on the sheet. What has changed is that the answer is now
 * SAYABLE: until `packDelta` landed on `PUT /v1/sessions/{id}` (28 Aug 2026),
 * `POST /v1/sessions/{id}/done` was the only endpoint anywhere that touched
 * `package.sessions_remaining`, so this wrote a status and the trainer was told
 * to go and edit the pack by hand in the money book. There was no package
 * `PATCH` to do it with either.
 *
 * The server settles it from what this session has ALREADY taken, not from
 * zero — so calling this twice costs one session, and calling it again with
 * `false` gives the session back. That is what makes re-deciding safe, and it is
 * the same four-quadrant rule the phone's `settlePack` has always used.
 *
 * `-1` and `0` are the only values the endpoint accepts; a delta it does not
 * recognise is a 400, deliberately. A paused pack is never charged.
 *
 * Duration and start are re-sent for `updateSession`'s reason: `PUT` replaces.
 */
export async function markNoShow(input: {
  id: string;
  scheduledAt: number;
  durationMinutes: number;
  costsASession: boolean;
}): Promise<WriteResult> {
  try {
    await put(`/v1/sessions/${input.id}`, {
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      status: 'no_show',
      packDelta: input.costsASession ? -1 : 0,
    });
    refresh();
    return { ok: true, sessionId: input.id };
  } catch (error) {
    return readFailure(error, 'Marking the no-show');
  }
}

/**
 * Cancel one booking.
 *
 * `DELETE`, which the backend tombstones with `deleted_at` rather than removing —
 * "soft delete — the row is tombstoned so sync can propagate the removal". That
 * matters here for a reason the API doc does not state: the trainer's phone holds
 * this row in SQLite, and a hard delete on the server is a row the phone would
 * never hear about and would keep drawing. The schema law applies to rows as well
 * as columns.
 *
 * This is the one verb on the screen that has no undo, so it is the one verb
 * behind a confirm. Ten seconds would be the wrong shape: a cancel usually
 * follows a phone call, so the trainer is certain and the delay is friction —
 * whereas a drag is a gesture, which is why the drag is what gets the ten seconds.
 */
export async function cancelSession(id: string): Promise<WriteResult> {
  try {
    await del(`/v1/sessions/${id}`);
    refresh();
    return { ok: true, sessionId: id };
  } catch (error) {
    return readFailure(error, 'The cancellation');
  }
}
