'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';

import { getToken } from '@/lib/auth/session';
import type { WriteResult } from '@/lib/log/result';
import type { PlanExerciseWire, PlanProgramWire, PlanWorkoutWire } from '@/lib/programs/wire';

import { fullLibrary, SessionLogApiError, searchLibrary, send } from './api';
import type {
  ExerciseWritten,
  LogWritten,
  SetAddedWritten,
  SetDeletedWritten,
  SetWritten,
  Written,
} from './result';
import type {
  ExerciseWire,
  ExercisePatch,
  LogWire,
  SessionRowWire,
  SetAdd,
  SetAddedWire,
  SetDeletedWire,
  SetPatch,
  SetWriteWire,
  SwapReason,
  SwapScopeV1,
} from './wire';

/**
 * THE LOG'S WRITES — the eleven routes of api-contract v1.1 *Log session*, and the
 * old console's own action names on top of them.
 *
 * ── TWO FAMILIES, ONE SET OF ROUTES ─────────────────────────────────────────
 *
 * The first family (`startSession` … `exerciseSearch`) is the NEW surface: typed,
 * keyed on the ids the log read carries (`sxId`, set id), and answering the small
 * bodies the contract specifies so the console can update in place. Nothing in
 * it revalidates a page — a tap must not re-read the log, which is the whole
 * point of the one-tap path (R41).
 *
 * The second family (`startLog`, `logSet`, `updateSet`, `deleteSet`,
 * `saveWorkoutNotes`, `closeLog`, `addExercise`, `removeExercise`, `swapExercise`,
 * `setRest`) is the OLD console's contract, kept name for name and argument for
 * argument so the screens migrate by changing an import path rather than a call
 * site ("the UI stays the same"). They address things the way the old console
 * did — by exercise id and set NUMBER — and resolve the ids the new routes want
 * from hints the caller can pass (`planSetId`, `sxId`, which the adapter puts on
 * every row) or, failing that, from one read of the log: correct, and slower, so
 * a later pass passes the hints and the read disappears.
 *
 * ── THE ONE TRUTH ABOUT IDS ─────────────────────────────────────────────────
 *
 * There is ONE id throughout (R2/R40): the route's `:id` is the session, a
 * walk-in's id is its session's id, and the old `workoutId` parameter is simply
 * the same value again.
 */

const NOT_SIGNED_IN = 'Your session expired. Sign in again.';

/** A refusal with a cause the trainer can act on gets a sentence of its own. */
const BY_CODE: Record<string, string> = {
  SESSION_NOT_STARTED: 'Start the log first, then log sets.',
  SESSION_CANCELLED: 'This session was cancelled, so it cannot be logged. Put it back on the diary first.',
  SESSION_NO_SHOW: 'This session was marked no-show, so it cannot be logged. Put it back on the diary first.',
  CLIENT_NOT_BOOKABLE: 'They are paused, archived or removed, so they cannot be booked. Bring them back first.',
  SESSION_CLIENT_TIME_TAKEN: 'They already have a session starting this minute. Open that one instead.',
  SET_NEEDS_VALUE: 'That set has nothing to copy. Enter what was done.',
  SET_PLANNED: 'A planned set cannot be deleted. Skip it instead.',
  SET_LIMIT: 'That exercise already has 50 sets.',
  EXERCISE_REMOVED: 'That exercise was taken out of today. Put it back first.',
  ID_CONFLICT: 'That could not be saved. Reload the session and try again.',
  PROGRAM_REVISED: 'Their program was changed somewhere else. Reload the session, then try again.',
};

function failure(error: unknown, subject: string): { ok: false; message: string; code?: string; needsValue?: boolean } {
  if (error instanceof SessionLogApiError) {
    if (error.status === 401 || error.status === 403) return { ok: false, message: NOT_SIGNED_IN };
    if (error.status === null) return { ok: false, message: `${subject} could not reach the server. Nothing was written.` };
    if (error.code && BY_CODE[error.code]) {
      return { ok: false, message: BY_CODE[error.code], code: error.code, needsValue: error.code === 'SET_NEEDS_VALUE' || undefined };
    }
    if (error.status === 404) return { ok: false, message: `${subject} is no longer there. Reload the session.`, code: 'NOT_FOUND' };
    if (error.status === 412) return { ok: false, message: BY_CODE.PROGRAM_REVISED, code: 'PRECONDITION_FAILED' };
    // A 400 is written for this screen: it names the field ("rpe: goes up in halves").
    if (error.status === 400 && error.detail) return { ok: false, message: error.detail, code: error.code ?? 'VALIDATION' };
  }
  return { ok: false, message: `${subject} did not go through. Nothing was written.` };
}

async function write<T>(subject: string, work: () => Promise<T>): Promise<Written<T>> {
  if (!(await getToken())) return { ok: false, message: NOT_SIGNED_IN };
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    return failure(error, subject);
  }
}

/** The pages that read `started_at` / `ended_at`: Today's open-log band and the diary's *In session*. */
function revalidateDiary(sessionId: string): void {
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath(`/sessions/${sessionId}/log`);
  revalidatePath(`/sessions/${sessionId}/finish`);
  revalidatePath(`/sessions/${sessionId}/bests`);
  revalidatePath('/sessions/new');
  revalidatePath('/today');
  revalidatePath('/schedule');
}

const base = (sessionId: string) => `/v1/sessions/${encodeURIComponent(sessionId)}`;

/* ═══════════════════════════════════════════════ the new surface ═════════ */

/** Open the log and lay the plan down. Idempotent: an already-started session answers its log unchanged. */
export async function startSession(sessionId: string, startedAt?: number | null): Promise<LogWritten> {
  const out = await write('Starting the log', () =>
    send<LogWire>(`${base(sessionId)}/start`, { method: 'POST', body: { startedAt: startedAt ?? null } }));
  if (out.ok) revalidateDiary(sessionId);
  return out;
}

/** Log someone with no booking: book now and start, in one write. The id is minted by the caller so a retry replays. */
export async function startWalkIn(input: {
  id?: string;
  clientId: string;
  durationMinutes?: number | null;
  workoutId?: string | null;
}): Promise<Written<{ id: string; log: LogWire }>> {
  const id = input.id ?? randomUUID();
  const out = await write('Starting the log', async () => ({
    id,
    log: await send<LogWire>('/v1/sessions/walk-in', {
      method: 'POST',
      body: {
        id,
        clientId: input.clientId,
        ...(input.durationMinutes != null ? { durationMinutes: input.durationMinutes } : {}),
        workoutId: input.workoutId ?? null,
      },
    }),
  }));
  if (out.ok) revalidateDiary(out.data.id);
  return out;
}

/** Close the log. Idempotent. It does not mark the session done or charge the pack — Finish does. */
export async function endSession(sessionId: string, endedAt?: number | null): Promise<Written<SessionRowWire>> {
  const out = await write('Closing the log', () =>
    send<SessionRowWire>(`${base(sessionId)}/end`, { method: 'POST', body: { endedAt: endedAt ?? null } }));
  if (out.ok) revalidateDiary(sessionId);
  return out;
}

/**
 * THE HOT PATH. `{done: true}` logs a set as prescribed (actuals copied from the
 * targets), values log what actually happened, `{done: false}` un-logs or skips.
 * Mints nothing, revalidates nothing: the answer is {set, totals, isBest} and the
 * console merges it with `applySetWrite`. `needsValue: true` on a refusal means
 * *open the panel* — the set had nothing to copy.
 */
export async function patchSet(sessionId: string, setId: string, patch: SetPatch): Promise<SetWritten> {
  return write('The set', () =>
    send<SetWriteWire>(`${base(sessionId)}/sets/${encodeURIComponent(setId)}`, { method: 'PATCH', body: patch }));
}

/** An extra set at the next position. The id is the caller's; a replay answers the same row. */
export async function addSet(sessionId: string, sxId: string, set: SetAdd): Promise<SetAddedWritten> {
  return write('The extra set', () =>
    send<SetAddedWire>(`${base(sessionId)}/exercises/${encodeURIComponent(sxId)}/sets`, { method: 'POST', body: set }));
}

/** Delete an EXTRA set. A planned set is skipped with `patchSet(…, {done: false})`, never deleted. */
export async function removeSet(sessionId: string, setId: string): Promise<SetDeletedWritten> {
  return write('Deleting the set', () =>
    send<SetDeletedWire>(`${base(sessionId)}/sets/${encodeURIComponent(setId)}`, { method: 'DELETE' }));
}

/** Add an exercise mid-session. `sets` lays down that many empty rows (default 0). */
export async function addExerciseRow(
  sessionId: string,
  input: { id: string; exerciseId: string; position?: number; sets?: number },
): Promise<ExerciseWritten> {
  return write('Adding the exercise', () =>
    send<ExerciseWire>(`${base(sessionId)}/exercises`, { method: 'POST', body: input }));
}

/** Remove · undo · note · rest. `onPlan: true` writes the client's plan too (R44). */
export async function patchExerciseRow(sessionId: string, sxId: string, patch: ExercisePatch): Promise<ExerciseWritten> {
  return write('The exercise', () =>
    send<ExerciseWire>(`${base(sessionId)}/exercises/${encodeURIComponent(sxId)}`, { method: 'PATCH', body: patch }));
}

/** Swap a movement: today only, or also from the next session on in their plan. */
export async function swapExerciseRow(
  sessionId: string,
  sxId: string,
  input: { toExerciseId: string; planRowId?: string | null; reason: SwapReason; scope: SwapScopeV1 },
): Promise<ExerciseWritten> {
  const out = await write('The swap', () =>
    send<ExerciseWire>(`${base(sessionId)}/exercises/${encodeURIComponent(sxId)}/swap`, {
      method: 'POST',
      body: { ...input, planRowId: input.planRowId ?? null },
    }));
  if (out.ok && input.scope === 'program') {
    revalidatePath('/clients');
    revalidatePath('/programs');
  }
  return out;
}

/** The session's note (Schedule A3). */
export async function saveSessionNote(sessionId: string, notes: string): Promise<Written<SessionRowWire>> {
  return write('The note', () =>
    send<SessionRowWire>(base(sessionId), { method: 'PATCH', body: { notes } }));
}

/** Typed-ahead library search for the add and swap panels — never the whole library. */
export async function exerciseSearch(q: string): Promise<Written<Awaited<ReturnType<typeof searchLibrary>>>> {
  const term = q.trim();
  if (term.length < 1) return { ok: true, data: [] };
  return write('The search', () => searchLibrary(term));
}

/** The whole library for the add and swap panels, fetched once by the console after it is up (see `fullLibrary`). */
export async function exerciseLibrary(): Promise<Written<Awaited<ReturnType<typeof fullLibrary>>>> {
  return write('The library', () => fullLibrary());
}

/* ═══════════════════════════════════ the old console's contract, kept ═════ */

function oldFailure(error: unknown, subject: string): WriteResult {
  const f = failure(error, subject);
  return { ok: false, message: f.message };
}

function refresh(routeId: string): void {
  revalidateDiary(routeId);
}

/**
 * An id on a row that does not exist yet. Before start the log read is a plan
 * PREVIEW whose exercise and set ids are null; a write that needs one means the
 * log was never opened, which the server would answer SESSION_NOT_STARTED to.
 */
function started(id: string | null): string {
  if (id === null) throw new SessionLogApiError(409, 'SESSION_NOT_STARTED', null);
  return id;
}

async function readLog(sessionId: string): Promise<LogWire> {
  return send<LogWire>(`${base(sessionId)}/log`);
}

/** The exercise's `session_exercise` and its sets, found by movement — one read, only when the caller gave no hint. */
async function resolveExercise(sessionId: string, exerciseId: string, sxId?: string): Promise<ExerciseWire | null> {
  const log = await readLog(sessionId);
  return (
    log.exercises.find((e) => (sxId ? e.id === sxId : e.exerciseId === exerciseId && e.removedAt === null)) ?? null
  );
}

export interface SetInput {
  routeId: string;
  workoutId: string;
  exerciseId: string;
  setNumber: number;
  loadKg: number | null;
  reps: number | null;
  rpe: number | null;
  notes: string | null;
  /** The slot's `set_log` id when the caller has it (`LogSetRowX.planSetId`): skips the resolving read. */
  planSetId?: string | null;
  /** The exercise's `session_exercise` id (`LogExerciseViewX.sxId`). */
  sxId?: string | null;
}

/** The numbers a set write carries: only what was typed — a missing key is "leave it", never a clear. */
function actuals(input: { loadKg: number | null; reps: number | null; rpe: number | null; notes?: string | null }): SetPatch {
  const patch: SetPatch = {};
  if (input.loadKg !== null) patch.loadValue = input.loadKg;
  if (input.reps !== null) patch.effortValue = input.reps;
  if (input.rpe !== null) patch.rpe = input.rpe;
  // The backend takes a set note since 3 Oct (≤ 200): sent when there is one, left alone when there is not.
  if (input.notes) patch.notes = input.notes.slice(0, 200);
  return patch;
}

/** Start a log — an existing booking, or a walk-in when there is none. Answers the SESSION id, the one id of the log. */
export async function startLog(input: {
  clientId: string;
  sessionId: string | null;
  programId: string | null;
  sessionDate: string;
}): Promise<WriteResult> {
  if (!(await getToken())) return { ok: false, message: NOT_SIGNED_IN };
  try {
    if (input.sessionId) {
      await send(`${base(input.sessionId)}/start`, { method: 'POST', body: { startedAt: null } });
      revalidateDiary(input.sessionId);
      return { ok: true, id: input.sessionId };
    }
    const id = randomUUID();
    await send('/v1/sessions/walk-in', { method: 'POST', body: { id, clientId: input.clientId, workoutId: null } });
    revalidateDiary(id);
    return { ok: true, id };
  } catch (error) {
    return oldFailure(error, 'Starting the log');
  }
}

/**
 * Log a set. With a hint it is one PATCH. Without one: the slot's row is found in
 * the log and logged, and a set number beyond the card becomes an extra set.
 * A set's NOTE rides along (`notes`, ≤ 200) now that the backend accepts it.
 */
export async function logSet(input: SetInput): Promise<WriteResult> {
  if (!(await getToken())) return { ok: false, message: NOT_SIGNED_IN };
  try {
    const values = actuals(input);
    if (input.planSetId) {
      const res = await send<SetWriteWire>(`${base(input.routeId)}/sets/${encodeURIComponent(input.planSetId)}`, {
        method: 'PATCH',
        body: { done: true, ...values },
      });
      refresh(input.routeId);
      return { ok: true, id: res.set.id ?? undefined };
    }
    const exercise = await resolveExercise(input.routeId, input.exerciseId, input.sxId ?? undefined);
    if (!exercise) return { ok: false, message: 'That exercise is no longer on today’s card. Reload the session.' };
    const slot = exercise.sets.find((s) => s.position === input.setNumber);
    if (slot) {
      const res = await send<SetWriteWire>(`${base(input.routeId)}/sets/${encodeURIComponent(started(slot.id))}`, {
        method: 'PATCH',
        body: { done: true, ...values },
      });
      refresh(input.routeId);
      return { ok: true, id: res.set.id ?? undefined };
    }
    const res = await send<SetAddedWire>(`${base(input.routeId)}/exercises/${encodeURIComponent(started(exercise.id))}/sets`, {
      method: 'POST',
      body: { id: randomUUID(), ...values, done: true } satisfies SetAdd,
    });
    refresh(input.routeId);
    return { ok: true, id: res.set.id ?? undefined };
  } catch (error) {
    return oldFailure(error, 'The set');
  }
}

/** Correct a logged set: values only, `done_at` untouched (the server keeps the first time). */
export async function updateSet(input: SetInput & { setId: string; clientId?: string }): Promise<WriteResult> {
  if (!(await getToken())) return { ok: false, message: NOT_SIGNED_IN };
  try {
    await send(`${base(input.routeId)}/sets/${encodeURIComponent(input.setId)}`, {
      method: 'PATCH',
      body: actuals(input),
    });
    refresh(input.routeId);
    if (input.clientId) {
      revalidatePath(`/clients/${input.clientId}/exercises/${input.exerciseId}`);
      revalidatePath(`/clients/${input.clientId}/progress`);
    }
    return { ok: true, id: input.setId };
  } catch (error) {
    return oldFailure(error, 'The correction');
  }
}

/**
 * Delete a set — the old route's two outcomes through the new routes' one rule:
 * an extra set is deleted; a planned one is SKIPPED (`done: false`, row kept), so
 * "3 of 4 planned sets" stays true afterwards.
 */
export async function deleteSet(input: { routeId: string; workoutId: string; setId: string }): Promise<WriteResult> {
  if (!(await getToken())) return { ok: false, message: NOT_SIGNED_IN };
  try {
    try {
      await send(`${base(input.routeId)}/sets/${encodeURIComponent(input.setId)}`, { method: 'DELETE' });
    } catch (error) {
      if (error instanceof SessionLogApiError && error.code === 'SET_PLANNED') {
        await send(`${base(input.routeId)}/sets/${encodeURIComponent(input.setId)}`, { method: 'PATCH', body: { done: false } });
      } else {
        throw error;
      }
    }
    refresh(input.routeId);
    return { ok: true };
  } catch (error) {
    return oldFailure(error, 'Deleting the set');
  }
}

/** The note on the log — the session's own `notes` (Schedule A3). */
export async function saveWorkoutNotes(input: { routeId: string; workoutId: string; notes: string }): Promise<WriteResult> {
  if (!(await getToken())) return { ok: false, message: NOT_SIGNED_IN };
  try {
    await send(base(input.routeId), { method: 'PATCH', body: { notes: input.notes } });
    refresh(input.routeId);
    return { ok: true };
  } catch (error) {
    return oldFailure(error, 'The note');
  }
}

/** Close the log: sets `ended_at`, nothing else — marking done is Finish's job. */
export async function closeLog(input: { routeId: string; workoutId: string; endedAt?: number }): Promise<WriteResult> {
  if (!(await getToken())) return { ok: false, message: NOT_SIGNED_IN };
  try {
    await send(`${base(input.routeId)}/end`, { method: 'POST', body: { endedAt: input.endedAt ?? null } });
    refresh(input.routeId);
    return { ok: true };
  } catch (error) {
    return oldFailure(error, 'Closing the log');
  }
}

/** Add an exercise to today's card. */
export async function addExercise(input: {
  routeId: string;
  workoutId: string;
  exerciseId: string;
  orderIndex: number;
}): Promise<WriteResult> {
  if (!(await getToken())) return { ok: false, message: NOT_SIGNED_IN };
  try {
    const row = await send<ExerciseWire>(`${base(input.routeId)}/exercises`, {
      method: 'POST',
      body: { id: randomUUID(), exerciseId: input.exerciseId, position: input.orderIndex, sets: 0 },
    });
    refresh(input.routeId);
    return { ok: true, id: row.id ?? undefined };
  } catch (error) {
    return oldFailure(error, 'Adding the exercise');
  }
}

/** Take an exercise out of today, or put it back (`restore`). `rowId` is the exercise's `sxId`. */
export async function removeExercise(input: {
  routeId: string;
  workoutId: string;
  rowId: string;
  restore?: boolean;
}): Promise<WriteResult> {
  if (!(await getToken())) return { ok: false, message: NOT_SIGNED_IN };
  try {
    await send(`${base(input.routeId)}/exercises/${encodeURIComponent(input.rowId)}`, {
      method: 'PATCH',
      body: { removed: !input.restore },
    });
    refresh(input.routeId);
    return { ok: true };
  } catch (error) {
    return oldFailure(error, input.restore ? 'Putting it back' : 'Removing the exercise');
  }
}

export type SwapScope = 'today' | 'program' | 'template';

/**
 * Swap a movement in one of the console's THREE scopes (frame 3b).
 *
 *   today    → `POST …/swap {scope: 'today'}`
 *   program  → `POST …/swap {scope: 'program'}` — the server swaps the client's
 *              plan from the next session on and bumps `program.revised_at` in the
 *              same transaction, so a builder tab open on it gets 412 PROGRAM_REVISED
 *   template → the new swap route has no template scope (R44 dropped it from the
 *              contract), but the console still offers it, so it is done through
 *              the PROGRAMS routes: read the template, replace the movement in its
 *              tree, PUT it back conditional on the version just read. A stale
 *              version is the server's own 412, shown as a sentence.
 */
export async function swapExercise(input: {
  routeId: string;
  scope: SwapScope;
  fromExerciseId: string;
  toExerciseId: string;
  programId: string | null;
  templateId: string | null;
  workoutId: string;
  card: unknown;
  sxId?: string | null;
  planRowId?: string | null;
  reason?: SwapReason;
}): Promise<WriteResult> {
  if (!(await getToken())) return { ok: false, message: NOT_SIGNED_IN };
  try {
    if (input.scope === 'template') {
      if (!input.templateId) return { ok: false, message: 'The program did not come from a template.' };
      const template = await send<PlanProgramWire>(`/v1/programs/${encodeURIComponent(input.templateId)}`);
      const swapped = (e: PlanExerciseWire): PlanExerciseWire => ({
        ...e,
        exerciseId: e.exerciseId === input.fromExerciseId ? input.toExerciseId : e.exerciseId,
      });
      const workouts: PlanWorkoutWire[] = (template.workouts ?? []).map((w) => ({
        ...w,
        exercises: w.exercises.map(swapped),
      }));
      await send(`/v1/programs/${encodeURIComponent(input.templateId)}`, {
        method: 'PUT',
        ifMatch: template.version,
        body: {
          name: template.name, goal: template.goal, description: template.description,
          weeks: template.weeks, days: template.days, workouts,
        },
      });
      revalidatePath('/programs/templates');
      refresh(input.routeId);
      return { ok: true };
    }
    const exercise = await resolveExercise(input.routeId, input.fromExerciseId, input.sxId ?? undefined);
    if (!exercise) return { ok: false, message: 'That exercise is no longer on today’s card. Reload the session.' };
    await send(`${base(input.routeId)}/exercises/${encodeURIComponent(started(exercise.id))}/swap`, {
      method: 'POST',
      body: {
        toExerciseId: input.toExerciseId,
        planRowId: input.planRowId ?? null,
        reason: input.reason ?? 'unavailable',
        scope: input.scope,
      },
    });
    if (input.scope === 'program') {
      revalidatePath('/clients');
      revalidatePath('/programs');
    }
    refresh(input.routeId);
    return { ok: true };
  } catch (error) {
    return oldFailure(error, 'The swap');
  }
}

/** Change an exercise's rest: for the rest of today's not-done sets, and (`onPlan`) in the client's plan too. */
export async function setRest(input: {
  routeId: string;
  programId: string | null;
  exerciseId: string;
  restSeconds: number;
  workoutId: string;
  card: unknown;
  onPlan: boolean;
  sxId?: string | null;
}): Promise<WriteResult> {
  if (!(await getToken())) return { ok: false, message: NOT_SIGNED_IN };
  try {
    const exercise = await resolveExercise(input.routeId, input.exerciseId, input.sxId ?? undefined);
    if (!exercise) return { ok: false, message: 'That exercise is no longer on today’s card. Reload the session.' };
    await send(`${base(input.routeId)}/exercises/${encodeURIComponent(started(exercise.id))}`, {
      method: 'PATCH',
      body: { restSeconds: input.restSeconds, onPlan: input.onPlan && input.programId !== null },
    });
    refresh(input.routeId);
    return { ok: true };
  } catch (error) {
    return oldFailure(error, 'The rest');
  }
}
