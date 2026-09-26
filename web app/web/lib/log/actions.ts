'use server';

import { revalidatePath } from 'next/cache';

import { getToken } from '@/lib/auth/session';
import { LogApiError } from './api';
import type { SwapScope, WriteResult } from './result';

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

/**
 * START A LOG — AND NOT `POST /v1/sessions/{id}/done`.
 *
 * The two look interchangeable and are not. `/done` creates the workout row AND
 * decrements the client's session pack, and §09 names this screen as the one
 * most likely to break the rule it would break: **finishing the log does not
 * move the pack. A pack moves on done or no-show, never on booked.** Starting
 * one certainly does not.
 *
 * So a log is created directly, carrying `scheduledSessionId` so the booking and
 * the log stay joined, and the pack is left alone until somebody presses *Mark
 * the session done* on frame 5b. `markDone` reuses a log that already exists
 * against the booking, so the two never make a second row.
 */
export async function startLog(input: {
  clientId: string;
  sessionId: string | null;
  programId: string | null;
  sessionDate: string;
}): Promise<WriteResult> {
  try {
    const res = await send<{ id: string }>('POST', '/v1/workouts', {
      clientId: input.clientId,
      sessionDate: input.sessionDate,
      programId: input.programId,
      scheduledSessionId: input.sessionId,
      notes: null,
    });
    revalidatePath('/today');
    revalidatePath('/programs/workouts');
    return { ok: true, id: res?.id };
  } catch (error) {
    return readFailure(error, 'Starting the log');
  }
}

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

export async function logSet(input: SetInput): Promise<WriteResult> {
  try {
    const res = await send<{ id: string }>('POST', `/v1/workouts/${input.workoutId}/sets`, {
      exerciseId: input.exerciseId,
      setNumber: input.setNumber,
      loadKg: input.loadKg,
      reps: input.reps,
      rpe: input.rpe,
      notes: input.notes,
    });
    refresh(input.routeId);
    return { ok: true, id: res?.id };
  } catch (error) {
    return readFailure(error, 'The set');
  }
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

export async function deleteSet(input: {
  routeId: string;
  workoutId: string;
  setId: string;
}): Promise<WriteResult> {
  try {
    await send('DELETE', `/v1/workouts/${input.workoutId}/sets/${input.setId}`);
    refresh(input.routeId);
    return { ok: true };
  } catch (error) {
    return readFailure(error, 'Deleting the set');
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

/**
 * A `workout_exercise` row, as this half sends one.
 *
 * **The POST REPLACES the row's fields**, because it is an upsert on
 * `(workout_session_id, exercise_id)` — the table's unique index is partial and
 * a second insert would otherwise be a 500, so the endpoint made adding an
 * exercise that is already there mean "this is what the card is now". The
 * consequence is that a caller must send the WHOLE card every time, exactly as
 * `updateSet` does and for the same reason: sending only `restSeconds` would
 * clear the targets.
 *
 * The console holds all of it — it is drawing the card — so this is cheap. It is
 * still a footgun, which is why it is one type with every field on it rather
 * than an options bag that can be partly filled in.
 */
export interface CardInput {
  exerciseId: string;
  orderIndex: number;
  /** 'planned' | 'unplanned' — the quiet tag, and nothing else reads it. */
  source: 'planned' | 'unplanned';
  swappedFromExerciseId: string | null;
  targetSets: number | null;
  targetReps: number | null;
  restSeconds: number | null;
}

/** Writes the card and returns its row id. Idempotent on the exercise. */
async function putCard(workoutId: string, card: CardInput): Promise<string> {
  const row = await send<{ id: string }>('POST', `/v1/workouts/${workoutId}/exercises`, card);
  return row.id;
}

/**
 * Put an exercise in today's grid — frame 3a.
 *
 * It used to be a query parameter. `workout_exercise` had no REST route, so a
 * card added before its first set had nowhere to live and rode in the URL as
 * `?plus=` until something was typed into it. That was honest and it was also
 * lossy: the card existed in one browser tab and nowhere else, so a trainer who
 * added three exercises and reloaded lost all three, and the panel's foot had to
 * say *today's log only* partly because it could not have meant anything wider.
 *
 * `restSeconds` is null on purpose: the plan's value is the default and a null
 * here means "the plan's, or none". Frame 3a does not ask for rest.
 */
export async function addExercise(input: {
  routeId: string;
  workoutId: string;
  exerciseId: string;
  orderIndex: number;
}): Promise<WriteResult> {
  try {
    await putCard(input.workoutId, {
      exerciseId: input.exerciseId,
      orderIndex: input.orderIndex,
      source: 'unplanned',
      swappedFromExerciseId: null,
      targetSets: null,
      targetReps: null,
      restSeconds: null,
    });
    refresh(input.routeId);
    return { ok: true };
  } catch (error) {
    return readFailure(error, 'Adding the exercise');
  }
}

/**
 * Take a card out of today — and `removedAt`, never `DELETE`.
 *
 * The row stays as the record that the trainer decided against this, and the
 * toast's Undo needs something to put back; `DELETE` tombstones a row that
 * should never have existed, which is a different claim. Restoring is
 * `removedAt: 0`, which the endpoint reads as "clear it".
 */
export async function removeExercise(input: {
  routeId: string;
  workoutId: string;
  rowId: string;
  restore?: boolean;
}): Promise<WriteResult> {
  try {
    await send('PUT', `/v1/workouts/${input.workoutId}/exercises/${input.rowId}`, {
      removedAt: input.restore ? 0 : Date.now(),
    });
    refresh(input.routeId);
    return { ok: true };
  } catch (error) {
    return readFailure(error, input.restore ? 'Putting it back' : 'Removing the exercise');
  }
}

/* ────────────────────────────────────────────────────────── the swap ── */

interface TemplateExercise {
  exerciseId: string;
  [key: string]: unknown;
}

/**
 * A SWAP, AND THE THREE THINGS IT CAN MEAN.
 *
 * `today` · `program` · `template` — three different decisions, and every
 * competitor in the teardown collapses them into one. Each states its own blast
 * radius before the tap, including the one that reaches five people, because a
 * change that size should never be discovered afterwards.
 *
 * **All three are writes now.** `today` used to have nothing to write to — the
 * grid was reconstructed from the plan and the set logs, so "swapping for today"
 * meant typing into the replacement instead and leaving the original with no
 * sets. That read as a SKIP, which is the one thing a swap is not: the rack was
 * busy, the bench press was not abandoned. `POST /v1/workouts/{id}/exercises`
 * carries `swappedFromExerciseId`, so it says so.
 *
 * `today` writes **two rows, because two things happened** — the replacement
 * carrying what it replaced, and the original marked out of today. Never a moved
 * `exercise_id`, which would silently re-attribute any set already logged. It is
 * the same pair the phone's `swapExercise` writes.
 *
 * `program` is a `PUT` on one `program_exercises` row. `template` is a `PUT` on
 * the whole template, because the structure travels as one JSON document — and
 * it is the one that rewrites Push A for every client on it.
 */
export async function swapExercise(input: {
  routeId: string;
  scope: SwapScope;
  fromExerciseId: string;
  toExerciseId: string;
  programId: string | null;
  templateId: string | null;
  /** The log, and the card being replaced — `today` writes against both. */
  workoutId: string;
  /* The whole card, `swappedFromExerciseId` included: it is set explicitly on
     each of the two rows below and the field is here so the type says what is
     actually sent rather than letting an extra property ride through. */
  card: Omit<CardInput, 'exerciseId'>;
}): Promise<WriteResult> {
  if (input.scope === 'today') {
    try {
      /* The replacement takes the original's place in the order and its targets,
         because it is standing in for it — a swap that reset the card to three
         sets of nothing would lose what was prescribed. */
      await putCard(input.workoutId, {
        ...input.card,
        exerciseId: input.toExerciseId,
        swappedFromExerciseId: input.fromExerciseId,
      });
      /* And the original goes out of today. Written rather than deleted: it is
         still the record that this was on the plan and did not happen, which is
         what stops adherence reading a swap as a skip. `buildRows` keeps it on
         screen anyway if sets are logged against it, so this cannot orphan
         anything. */
      const originalId = await putCard(input.workoutId, {
        ...input.card,
        exerciseId: input.fromExerciseId,
        swappedFromExerciseId: null,
      });
      await send('PUT', `/v1/workouts/${input.workoutId}/exercises/${originalId}`, {
        removedAt: Date.now(),
      });
      refresh(input.routeId);
      return { ok: true };
    } catch (error) {
      return readFailure(error, 'The swap');
    }
  }

  try {
    if (input.scope === 'program') {
      if (!input.programId) return { ok: false, message: 'This client has no live program to change.' };
      const rows = await send<{ id: string; exerciseId: string; sets: number | null; reps: number | null; restSeconds: number | null; targetLoad: number | null; notes: string | null; dayOfWeek: number | null; week: number | null; orderIndex: number }[]>(
        'GET',
        `/v1/programs/${input.programId}/exercises`,
      );
      const row = (rows ?? []).find((r) => r.exerciseId === input.fromExerciseId);
      if (!row) return { ok: false, message: 'That exercise is not on the program.' };
      await send('PUT', `/v1/programs/${input.programId}/exercises/${row.id}`, {
        exerciseId: input.toExerciseId,
        sets: row.sets,
        reps: row.reps,
        restSeconds: row.restSeconds,
        targetLoad: row.targetLoad,
        notes: row.notes,
        dayOfWeek: row.dayOfWeek,
        week: row.week,
        orderIndex: row.orderIndex,
      });
      revalidatePath(`/clients`);
      /* The COPY was rewritten, so it is the list of copies that is stale —
         `/programs` since 22 Sep 2026. The blueprint was not touched. */
      revalidatePath('/programs');
    } else {
      if (!input.templateId) return { ok: false, message: 'The program did not come from a template.' };
      const template = await send<{ name: string; goal: string | null; description: string | null; exercises: TemplateExercise[]; dayLabels: Record<string, string> }>(
        'GET',
        `/v1/templates/${input.templateId}`,
      );
      await send('PUT', `/v1/templates/${input.templateId}`, {
        name: template.name,
        goal: template.goal,
        description: template.description,
        dayLabels: template.dayLabels,
        exercises: (template.exercises ?? []).map((e) =>
          e.exerciseId === input.fromExerciseId ? { ...e, exerciseId: input.toExerciseId } : e,
        ),
      });
      /* The BLUEPRINT was rewritten here, which is the other branch's mirror:
         the shelf is at `/programs/templates` now. */
      revalidatePath('/programs/templates');
    }

    refresh(input.routeId);
    return { ok: true };
  } catch (error) {
    return readFailure(error, 'The swap');
  }
}

/**
 * Rest is per exercise, not per trainer — and now per exercise even off-plan.
 *
 * 90 seconds after a bench set and 20 after a curl is one trainer, not two
 * preferences, and every app that made rest a single global number made it a
 * number people turn off.
 *
 * **Two places it can live, and which one is not a preference.** The program row
 * is where a planned exercise keeps it, and that is an edit to the plan: it is
 * still 90 seconds next Tuesday. `workout_exercise.rest_seconds` is TODAY's, and
 * V13 put it there precisely so a card that is not on the plan can hold one.
 * Until that table had a route, an off-plan exercise had nowhere to keep a rest
 * at all and the console said so rather than offering a control that would not
 * persist.
 *
 * So: on the plan and there is a program to edit → the plan. Otherwise → today's
 * card. Not a fallback, a different answer to a different question, and the
 * console's strip says which one it just wrote.
 */
export async function setRest(input: {
  routeId: string;
  programId: string | null;
  exerciseId: string;
  restSeconds: number;
  /** Today's card, for an exercise the plan does not have. */
  workoutId: string;
  card: Omit<CardInput, 'restSeconds' | 'exerciseId'>;
  onPlan: boolean;
}): Promise<WriteResult> {
  if (!input.onPlan || !input.programId) {
    try {
      await putCard(input.workoutId, {
        ...input.card,
        exerciseId: input.exerciseId,
        restSeconds: input.restSeconds,
      });
      refresh(input.routeId);
      return { ok: true };
    } catch (error) {
      return readFailure(error, 'The rest');
    }
  }

  try {
    const rows = await send<{ id: string; exerciseId: string; sets: number | null; reps: number | null; targetLoad: number | null; notes: string | null; dayOfWeek: number | null; week: number | null; orderIndex: number }[]>(
      'GET',
      `/v1/programs/${input.programId}/exercises`,
    );
    const row = (rows ?? []).find((r) => r.exerciseId === input.exerciseId);
    if (!row) return { ok: false, message: 'That exercise is not on the program.' };
    await send('PUT', `/v1/programs/${input.programId}/exercises/${row.id}`, {
      exerciseId: row.exerciseId,
      sets: row.sets,
      reps: row.reps,
      restSeconds: input.restSeconds,
      targetLoad: row.targetLoad,
      notes: row.notes,
      dayOfWeek: row.dayOfWeek,
      week: row.week,
      orderIndex: row.orderIndex,
    });
    refresh(input.routeId);
    return { ok: true };
  } catch (error) {
    return readFailure(error, 'The rest');
  }
}
