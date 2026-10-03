'use server';

import { revalidatePath } from 'next/cache';

import { getToken } from '@/lib/auth/session';
import { LogApiError } from './api';
import type { WriteResult } from './result';

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

/**
 * EVERY TICK IS A REQUEST, AND THAT IS THE WHOLE DIFFERENCE FROM THE PHONE.
 *
 * On the floor a tick writes to SQLite and returns in the same frame, because
 * the free-weights room is a level below the road and 4G does not reach it. The
 * web half is online-only (`AGENTS.md`, 23 Aug 2026): there is no local database
 * to queue into, so a set is logged when the server says it is.
 *
 * Three things follow, and all three are visible on the screen rather than
 * argued for in a comment:
 *
 *   · **The row shows its own failure.** No pill in the corner, no amber ring —
 *     `.sets tr.queued` is not used on this half at all, because it means "on
 *     this machine and not yet on the server" and nothing here can be.
 *   · **The tick is optimistic and reverts.** `useOptimistic` paints it on the
 *     press so the grid keeps up with a keyboard; a refusal puts it back and
 *     says so in the row.
 *   · **Delete has no confirm.** §09 forbids it — twenty confirmations a session
 *     is a different app — so it goes straight through with `UNDO_SECONDS`
 *     behind it, and Undo re-posts the set rather than cancelling anything.
 */

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  if (!token) throw new LogApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new LogApiError(null);
  }
  if (!res.ok) throw new LogApiError(res.status);

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Every failure a trainer can be told about, in the words that fit the verb. */
function readFailure(error: unknown, subject: string): WriteResult {
  if (error instanceof LogApiError) {
    if (error.status === null) {
      return { ok: false, message: `${subject} could not reach the server. Nothing was written.` };
    }
    if (error.status === 401 || error.status === 403) {
      return { ok: false, message: 'Your session expired. Sign in again.' };
    }
    if (error.status === 404) {
      return { ok: false, message: `${subject} is no longer there. Reload the session.` };
    }
    return { ok: false, message: `${subject} did not go through. Nothing was written.` };
  }
  return { ok: false, message: `${subject} did not go through. Nothing was written.` };
}

/**
 * The console, Today and the diary, after every write.
 *
 * Today's hero is `buildRunning`, which finds a scheduled session whose log has
 * not ended — so a log started here changes what Today says about the morning,
 * and a trainer who logs a set and then clicks *Today* would otherwise land on a
 * cached day that does not know the session began.
 */
function refresh(routeId: string): void {
  revalidatePath(`/sessions/${routeId}/log`);
  revalidatePath(`/sessions/${routeId}/bests`);
  revalidatePath(`/sessions/${routeId}/finish`);
  revalidatePath('/today');
  revalidatePath('/schedule');
}

/* ────────────────────────────────────────────────── starting a log ── */

/* ───────────────────────────────────────────────────────── one set ── */

export interface SetInput {
  routeId: string;
  workoutId: string;
  exerciseId: string;
  setNumber: number;
  loadKg: number | null;
  reps: number | null;
  rpe: number | null;
  notes: string | null;
}

/**
 * Correct a set — which is frame 7a as much as it is frame 1b.
 *
 * `PUT` replaces, so every field goes on every call. The caller holds the whole
 * row and hands the whole row back, exactly as the schedule's `updateSession`
 * does and for the same reason: omitting `rpe` on a note edit would erase it.
 *
 * `revalidatePath` on the client's own pages is not belt-and-braces here. A
 * record is computed on read, so changing one load re-judges every session after
 * it — which is the whole argument of frame 7a and would be invisible if the
 * history page it was corrected from kept serving a cached answer.
 */
export async function updateSet(
  input: SetInput & { setId: string; clientId?: string },
): Promise<WriteResult> {
  try {
    await send('PUT', `/v1/workouts/${input.workoutId}/sets/${input.setId}`, {
      exerciseId: input.exerciseId,
      setNumber: input.setNumber,
      loadKg: input.loadKg,
      reps: input.reps,
      rpe: input.rpe,
      notes: input.notes,
    });
    refresh(input.routeId);
    if (input.clientId) {
      revalidatePath(`/clients/${input.clientId}/exercises/${input.exerciseId}`);
      revalidatePath(`/clients/${input.clientId}/progress`);
    }
    return { ok: true, id: input.setId };
  } catch (error) {
    return readFailure(error, 'The correction');
  }
}

/* ─────────────────────────────────────────────── the note on the log ── */

export async function saveWorkoutNotes(input: {
  routeId: string;
  workoutId: string;
  notes: string;
}): Promise<WriteResult> {
  try {
    await send('PUT', `/v1/workouts/${input.workoutId}`, { notes: input.notes });
    refresh(input.routeId);
    return { ok: true };
  } catch (error) {
    return readFailure(error, 'The note');
  }
}

/* ──────────────────────────────────────────────────── closing the log ── */

/**
 * FINISHING THE LOG, WHICH IS NOT MARKING THE SESSION DONE.
 *
 * Two different facts, and keeping them apart is the whole reason this exists
 * as its own verb. `POST /v1/sessions/{id}/done` closes the MONEY — it is what
 * moves the pack. This closes the LOG: the trainer has stopped typing.
 *
 * Until 28 Aug 2026 nothing on the wire could say it. `PUT /v1/workouts/{id}`
 * wrote `notes` and nothing else, and `SyncService.pushWorkoutSessions` was the
 * only writer of `ended_at` anywhere — so this half closed logs by posting a
 * whole row back through the sync envelope, on an app that does not otherwise
 * speak it. `endedAt` is on the request now and this is one field.
 *
 * **`notes` is deliberately not sent.** The endpoint treats both fields as
 * conditional, so omitting it leaves the note alone — which is the point, and
 * the exact trap the sync-envelope version had to send the whole row to avoid.
 *
 * Why it matters that it can be said at all: `buildRunning`, on both halves,
 * decides *in session* by finding a scheduled session whose log has not ended. A
 * log that could never be closed read as permanently open, so Today said **In
 * session** on Sunday for a session logged on Tuesday.
 */
export async function closeLog(input: {
  routeId: string;
  workoutId: string;
  /** Epoch ms. The caller's clock, so a log closed at 06:52 says 06:52. */
  endedAt?: number;
}): Promise<WriteResult> {
  try {
    await send('PUT', `/v1/workouts/${input.workoutId}`, {
      endedAt: input.endedAt ?? Date.now(),
    });
    /* `refresh` already covers this log's three views plus `/today` and
       `/schedule`, which are the two that read `ended_at`: Today's open-log band
       and the diary's *In session*. The session detail is the one it does not
       cover, and it prints the close time. */
    refresh(input.routeId);
    revalidatePath(`/sessions/${input.routeId}`);
    return { ok: true };
  } catch (error) {
    return readFailure(error, 'Closing the log');
  }
}

/* ─────────────────────────────────────────────── today's card list ── */

/** Writes the card and returns its row id. Idempotent on the exercise. */

/* ────────────────────────────────────────────────────────── the swap ── */
