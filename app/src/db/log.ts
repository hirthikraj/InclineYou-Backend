/**
 * Workout log writes — screen 17 · FR-4 · FR-5.
 *
 * Every function here is a local SQLite write that returns in the same frame
 * and then kicks a best-effort sync. That is not a performance choice, it is
 * §09's first rule: **a set tick never blocks on the network.** The gym this was
 * designed for has its free-weights floor a level below the road, and a spinner
 * between a trainer and a logged set is the one bug that loses the account.
 *
 * ── What is deliberately not in this file ─────────────────────────────────
 *
 * **Nothing writes a personal record.** There is no `savePr`, no `pr` column,
 * no cache. Records are computed from the sets every time the screen is read —
 * see `log/log.ts` — so correcting a set from November fixes every record that
 * depended on it in the same frame. A stored PR is a second copy of the truth
 * and second copies drift. Strava is the only platform in the teardown that got
 * this right, and it is the one idea worth taking from it.
 *
 * **Nothing here moves a pack.** Finishing the log stamps `ended_at` and stops
 * there. A pack moves on `done` or `no_show` and never on `booked` — that rule
 * belongs to the diary, it is enforced in `db/diary.ts` and `db/sessions.ts`,
 * and this screen must not quietly break it by charging for a log.
 *
 * ── Two ways a set stops being logged, and why they differ ────────────────
 *
 * `untickSet` removes the set log and leaves a hole: sets 1 and 3 stay numbered
 * 1 and 3, and the screen draws an empty slot between them. `deleteSet` removes
 * it and closes the numbers up. That matches what the two gestures mean — a tick
 * tapped by mistake is one row wrong, and a set swiped away was never a set.
 */

import { Q } from '@nozbe/watermelondb';
import { database } from './index';
import WorkoutSessionModel from './models/WorkoutSession';
import WorkoutExerciseModel from './models/WorkoutExercise';
import SetLogModel from './models/SetLog';
import ProgramExerciseModel from './models/ProgramExercise';
import TemplateModel from './models/Template';
import ProgramModel from './models/Program';
import { refreshPending, syncDatabase } from './sync';
import { currentProgramWeek, fetchProgramExercisesForDay } from './programs';

export const workoutsCollection = database.get<WorkoutSessionModel>('workout_sessions');
export const workoutExercisesCollection =
  database.get<WorkoutExerciseModel>('workout_exercises');
export const setLogsCollection = database.get<SetLogModel>('set_logs');
export const programExercisesCollection =
  database.get<ProgramExerciseModel>('program_exercises');
export const programsCollection = database.get<ProgramModel>('programs');
export const templatesCollection = database.get<TemplateModel>('templates');

/** Where an exercise in today's log came from. A tag, never an adherence signal. */
export type ExerciseSource = 'planned' | 'unplanned';

/** How far a swap reaches. Three different decisions, and every competitor collapses them into one. */
export type SwapScope = 'today' | 'program' | 'template';

function after(reason: string) {
  void refreshPending();
  void syncDatabase(reason);
}

/* ------------------------------------------------------------------ reading */

export function observeLogExercises(workoutId: string) {
  return workoutExercisesCollection
    .query(Q.where('workout_session_id', workoutId), Q.sortBy('order_index', Q.asc))
    .observe();
}

async function rowsFor(workoutId: string): Promise<WorkoutExerciseModel[]> {
  return workoutExercisesCollection
    .query(Q.where('workout_session_id', workoutId), Q.sortBy('order_index', Q.asc))
    .fetch();
}

async function setsFor(workoutId: string, exerciseId: string): Promise<SetLogModel[]> {
  const rows = await setLogsCollection
    .query(Q.where('workout_session_id', workoutId), Q.where('exercise_id', exerciseId))
    .fetch();
  return rows.sort((a, b) => a.setNumber - b.setNumber);
}

/* -------------------------------------------------------------- opening it */

/**
 * The program this log's exercises should come from.
 *
 * The booking names one, usually. When it does not — and in real data plenty do
 * not, because a session booked before a program was assigned never went back to
 * pick one up — the client's live program is the answer. A client with one
 * active program has an unambiguous plan, and refusing to read it because a
 * foreign key is null would show "nothing planned" to a trainer looking at a
 * client who plainly has a plan.
 *
 * Ambiguity is the one case this declines: two live programs and it returns
 * nothing rather than guessing which one this morning belongs to.
 */
async function planFor(
  workoutId: string,
  hinted: string | null | undefined,
): Promise<string | null> {
  if (hinted) return hinted;

  const workout = await workoutsCollection.find(workoutId).catch(() => null);
  if (!workout) return null;
  if (workout.programId) return workout.programId;

  const live = await programsCollection
    .query(Q.where('client_id', workout.clientId), Q.where('status', 'active'))
    .fetch();
  return live.length === 1 ? live[0].id : null;
}

/**
 * Puts the plan into today's log, once.
 *
 * Idempotent, and it has to be: this runs on every mount of the log screen, and
 * a trainer who backs out to check a phone number and comes back must not find
 * the bench press twice. The guard is "does this log already have any exercises
 * at all" rather than a per-exercise check — the second is what would put a
 * swiped-away exercise back on the next visit, which is the whole reason
 * `removed_at` is soft.
 *
 * The prescription is **copied**, not joined. Editing the client's program next
 * week must not rewrite what was asked for this morning, for the same reason
 * assigning a program copies it.
 *
 * **Which week** is worked out from the program's start date rather than asked
 * for, because the session does not know: a booking carries the day it belongs
 * to and always has. A week the trainer never authored falls back to week 1,
 * which is what a program with one week's shape has always meant.
 */
export async function seedLogFromPlan(
  workoutId: string,
  hintedProgramId: string | null | undefined,
  templateDay: number | null | undefined,
): Promise<void> {
  const existing = await rowsFor(workoutId);
  if (existing.length) return;
  if (templateDay == null) return;

  const programId = await planFor(workoutId, hintedProgramId);
  if (!programId) return;

  const program = await programsCollection.find(programId).catch(() => null);
  const planned = await fetchProgramExercisesForDay(
    programId,
    templateDay,
    currentProgramWeek(program?.startDate),
  );
  if (!planned.length) return;

  await database.write(async () => {
    await database.batch(
      ...planned.map((pe, i) =>
        workoutExercisesCollection.prepareCreate((row) => {
          row.workoutSessionId = workoutId;
          row.exerciseId = pe.exerciseId;
          row.orderIndex = i;
          row.source = 'planned';
          row.targetSets = pe.sets ?? null;
          row.targetReps = pe.reps ?? null;
          row.restSeconds = pe.restSeconds ?? null;
        }),
      ),
    );
  });

  after('seed-log');
}

/* --------------------------------------------------- a log with no booking */

/** Local `YYYY-MM-DD`. `toISOString` would move an evening session a day back. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** ISO weekday, 1 = Monday — the same numbering templates key their days by. */
function weekday(): number {
  return ((new Date().getDay() + 6) % 7) + 1;
}

export interface OpenedLog {
  workoutId: string;
  programId: string | null;
  templateDay: number | null;
}

/**
 * Opens a log for somebody who is not booked in.
 *
 * The + button's promise. A client turns up on a Wednesday she does not
 * normally train, or the booking was never made because the trainer was on the
 * floor — and §06 of screen 17 is explicit that **logging is allowed to happen
 * before programming exists**, which is doubly true of booking. `startSession`
 * cannot serve this: it takes a scheduled session and there isn't one.
 *
 * ── Which day of the plan ─────────────────────────────────────────────────
 *
 * Today's weekday. Templates key their blueprint by weekday — "3" means
 * Wednesday — so a client in on a Wednesday gets the Wednesday she was
 * programmed, and a client in on a day her plan says nothing about gets an
 * empty log, which is 6c and already handled. No guessing "the next day she
 * owes"; a trainer who wanted a different day can add the exercises.
 *
 * Idempotent per client per day for the same reason `startSession` is: tapping
 * + twice in a morning must not make two logs.
 */
export async function startUnbookedLog(
  trainerId: string,
  clientId: string,
): Promise<OpenedLog> {
  const day = today();

  const mine = await workoutsCollection
    .query(Q.where('client_id', clientId), Q.where('session_date', day))
    .fetch();
  // An open one from earlier this morning, if there is one. A log the trainer
  // already finished is not reopened — that would put "Later" back to running.
  const open = mine.find((w) => !w.endedAt && !w.scheduledSessionId);

  const live = await programsCollection
    .query(Q.where('client_id', clientId), Q.where('status', 'active'))
    .fetch();
  const programId = live.length === 1 ? live[0].id : null;

  if (open) return { workoutId: open.id, programId: open.programId ?? programId, templateDay: weekday() };

  const created = await database.write(() =>
    workoutsCollection.create((w) => {
      w.trainerId = trainerId;
      w.clientId = clientId;
      if (programId) w.programId = programId;
      w.loggedBy = 'trainer';
      w.sessionDate = day;
    }),
  );

  after('start-unbooked-log');
  return { workoutId: created.id, programId, templateDay: weekday() };
}

/* ----------------------------------------------------------------- the sets */

export interface SetValues {
  loadKg?: number | null;
  reps?: number | null;
  rpe?: number | null;
  notes?: string | null;
}

/**
 * Writes a set and returns it.
 *
 * `setNumber` is the caller's, because the screen already knows which slot the
 * tick was in and re-deriving it here would renumber a hole shut. Passing the
 * slot is what makes "un-tick set 2, then tick it again" put it back at 2.
 */
export async function logSet(
  workoutId: string,
  exerciseId: string,
  setNumber: number,
  values: SetValues,
): Promise<SetLogModel> {
  const row = await database.write(() =>
    setLogsCollection.create((s) => {
      s.workoutSessionId = workoutId;
      s.exerciseId = exerciseId;
      s.setNumber = setNumber;
      if (values.loadKg != null) s.loadKg = values.loadKg;
      if (values.reps != null) s.reps = values.reps;
      if (values.rpe != null) s.rpe = values.rpe;
      if (values.notes) s.notes = values.notes;
    }),
  );
  after('log-set');
  return row;
}

export async function updateSet(setId: string, values: SetValues): Promise<void> {
  const row = await setLogsCollection.find(setId);
  await database.write(() =>
    row.update((s) => {
      if (values.loadKg !== undefined) s.loadKg = values.loadKg as number;
      if (values.reps !== undefined) s.reps = values.reps as number;
      // RPE is optional and stays optional — tapping the selected value clears
      // it, and `null` here is that tap, not a missing argument.
      if (values.rpe !== undefined) s.rpe = values.rpe as number;
      if (values.notes !== undefined) s.notes = (values.notes ?? '') as string;
    }),
  );
  after('update-set');
}

/**
 * Un-ticks: the set stops being logged and the numbers do not move.
 *
 * Set 3 stays set 3 with a hole where set 2 was, because that is what the
 * trainer sees and what they will type back into.
 */
export async function untickSet(setId: string): Promise<void> {
  const row = await setLogsCollection.find(setId);
  await database.write(() => row.markAsDeleted());
  after('untick-set');
}

/**
 * Deletes a set and closes the numbers up behind it.
 *
 * Also drops the exercise's target by one, or the screen would draw an empty
 * slot where the deleted set used to be and the delete would look like it had
 * not worked.
 */
export async function deleteSet(setId: string): Promise<void> {
  const row = await setLogsCollection.find(setId);
  const workoutId = row.workoutSessionId;
  const exerciseId = row.exerciseId;
  const gone = row.setNumber;

  const siblings = await setsFor(workoutId, exerciseId);
  const below = siblings.filter((s) => s.id !== setId && s.setNumber > gone);
  const [target] = await workoutExercisesCollection
    .query(Q.where('workout_session_id', workoutId), Q.where('exercise_id', exerciseId))
    .fetch();

  await database.write(async () => {
    await database.batch(
      row.prepareMarkAsDeleted(),
      ...below.map((s) => s.prepareUpdate((x) => { x.setNumber = x.setNumber - 1; })),
      ...(target
        ? [
            target.prepareUpdate((t) => {
              const slots = Math.max(t.targetSets ?? 0, siblings.length);
              t.targetSets = Math.max(0, slots - 1);
            }),
          ]
        : []),
    );
  });

  after('delete-set');
}

/** Appends a slot. Nothing is logged — the row is empty until somebody ticks it. */
export async function addSetSlot(workoutExerciseId: string): Promise<void> {
  const row = await workoutExercisesCollection.find(workoutExerciseId);
  const logged = await setsFor(row.workoutSessionId, row.exerciseId);
  const slots = Math.max(row.targetSets ?? 0, logged.length ? logged[logged.length - 1].setNumber : 0);

  await database.write(() => row.update((r) => { r.targetSets = slots + 1; }));
  after('add-set-slot');
}

/* ------------------------------------------------------ the exercise list */

/**
 * Adds an exercise to today only. The client's program does not change — which
 * is the sentence the sheet itself makes, and this is where it is true.
 */
export async function addExercise(
  workoutId: string,
  exerciseId: string,
  source: ExerciseSource = 'unplanned',
  plan?: { sets?: number | null; reps?: number | null; restSeconds?: number | null },
): Promise<WorkoutExerciseModel> {
  const existing = await workoutExercisesCollection
    .query(Q.where('workout_session_id', workoutId), Q.where('exercise_id', exerciseId))
    .fetch();

  // Already there and swiped away: bring it back rather than creating a second
  // row, which the unique index would reject on push anyway.
  if (existing.length) {
    const row = existing[0];
    if (row.removedAt) await restoreExercise(row.id);
    return row;
  }

  const rows = await rowsFor(workoutId);
  const created = await database.write(() =>
    workoutExercisesCollection.create((row) => {
      row.workoutSessionId = workoutId;
      row.exerciseId = exerciseId;
      row.orderIndex = rows.length;
      row.source = source;
      row.targetSets = plan?.sets ?? null;
      row.targetReps = plan?.reps ?? null;
      row.restSeconds = plan?.restSeconds ?? null;
    }),
  );

  after('add-exercise');
  return created;
}

/**
 * Takes an exercise out of today.
 *
 * Soft, and the sets stay. §07: the toast offers Undo and "logged sets come back
 * with it" — they can only come back if they were never destroyed, and a set
 * that happened is not undone by a swipe on the card above it.
 */
export async function removeExercise(workoutExerciseId: string): Promise<void> {
  const row = await workoutExercisesCollection.find(workoutExerciseId);
  await database.write(() => row.update((r) => { r.removedAt = new Date(); }));
  after('remove-exercise');
}

export async function restoreExercise(workoutExerciseId: string): Promise<void> {
  const row = await workoutExercisesCollection.find(workoutExerciseId);
  await database.write(() =>
    row.update((r) => { r.removedAt = null as unknown as Date; }),
  );
  after('restore-exercise');
}

/** Today's order, saved to today. The program's own order does not move. */
export async function reorderExercises(orderedIds: string[]): Promise<void> {
  const rows = await workoutExercisesCollection
    .query(Q.where('id', Q.oneOf(orderedIds)))
    .fetch();
  const byId = new Map(rows.map((r) => [r.id, r] as const));

  await database.write(async () => {
    await database.batch(
      ...orderedIds
        .map((id, i) => {
          const row = byId.get(id);
          return row && row.orderIndex !== i
            ? row.prepareUpdate((r) => { r.orderIndex = i; })
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    );
  });

  after('reorder-exercises');
}

/**
 * Rest for this exercise, and optionally for the plan behind it.
 *
 * §09: rest autostart is a per-exercise setting and never a global one. 90s
 * after a bench set and 20s after a curl is one trainer, not two preferences.
 * `stick` is the long press — it writes through to the program so next Monday
 * starts from the same number.
 */
export async function setExerciseRest(
  workoutExerciseId: string,
  seconds: number | null,
  stick: boolean = false,
): Promise<void> {
  const row = await workoutExercisesCollection.find(workoutExerciseId);
  await database.write(() =>
    row.update((r) => { r.restSeconds = seconds as number | null; }),
  );

  if (stick) {
    const workout = await workoutsCollection.find(row.workoutSessionId).catch(() => null);
    if (workout?.programId) {
      const planned = await programExercisesCollection
        .query(Q.where('program_id', workout.programId), Q.where('exercise_id', row.exerciseId))
        .fetch();
      if (planned.length) {
        await database.write(async () => {
          await database.batch(
            ...planned.map((pe) =>
              pe.prepareUpdate((p) => { p.restSeconds = seconds as number; }),
            ),
          );
        });
      }
    }
  }

  after('set-rest');
}

/* ---------------------------------------------------------------- the swap */

export interface SwapInput {
  workoutExerciseId: string;
  /** What is being done instead. */
  toExerciseId: string;
  scope: SwapScope;
}

/**
 * Swap, don't skip.
 *
 * Three scopes, because they are three different decisions and every competitor
 * collapses them into one. Each is a superset of the one before it, which is what
 * "in the template **too**" means.
 *
 *   today    — this log only. The bench press is back next week.
 *   program  — plus this client's remaining program days.
 *   template — plus the template, and plus everyone already on a copy of it.
 *
 * ── The one place the copy rule bends, and why ────────────────────────────
 *
 * Everywhere else in this app, **assigning a program copies it** and editing a
 * template can never reach a plan somebody is halfway through. The template
 * scope here reaches four people's live programs, and it is not an oversight:
 * the option says so on its own row — "Everyone on Full Body B · 4 people" —
 * because a trainer who has decided the machine chest press is better for this
 * block means it for the block, not for whoever they sign up next March. The
 * blast radius is stated before the tap, which is the part that matters.
 *
 * Every write is local. All three scopes work in a basement.
 */
export async function swapExercise(input: SwapInput): Promise<void> {
  const row = await workoutExercisesCollection.find(input.workoutExerciseId);
  const fromExerciseId = row.exerciseId;
  if (fromExerciseId === input.toExerciseId) return;

  // You cannot swap out something they have already done. The card would go and
  // the sets would stay, orphaned — visible in her history, invisible in the
  // session they belong to, and taking any record they held off the screen with
  // them. Two exercises happened; that is an addition, not a swap.
  const logged = await setsFor(row.workoutSessionId, fromExerciseId);
  if (logged.length) {
    throw new Error('Sets are already logged against this one. Add the new exercise instead.');
  }

  const workout = await workoutsCollection.find(row.workoutSessionId);

  // Today: the planned row goes and a new one takes its place, carrying what it
  // replaced. Two rows, because two things happened — and never a moved
  // `exercise_id`, which would silently re-attribute any set already logged.
  await database.write(async () => {
    await database.batch(
      row.prepareMarkAsDeleted(),
      workoutExercisesCollection.prepareCreate((next) => {
        next.workoutSessionId = row.workoutSessionId;
        next.exerciseId = input.toExerciseId;
        next.orderIndex = row.orderIndex;
        next.source = row.source;
        next.swappedFromExerciseId = fromExerciseId;
        next.targetSets = row.targetSets;
        next.targetReps = row.targetReps;
        next.restSeconds = row.restSeconds;
      }),
    );
  });

  if (input.scope !== 'today' && workout.programId) {
    await swapInProgram(workout.programId, fromExerciseId, input.toExerciseId);
  }

  if (input.scope === 'template' && workout.programId) {
    const program = await programsCollection.find(workout.programId).catch(() => null);
    if (program?.templateId) {
      await swapInTemplate(program.templateId, fromExerciseId, input.toExerciseId);
      // Everyone else already on a copy. The template alone would only change
      // the next assignment, and the option promised four people.
      const siblings = await programsCollection
        .query(Q.where('template_id', program.templateId))
        .fetch();
      for (const other of siblings) {
        if (other.id === workout.programId) continue;
        if (DEAD_PROGRAM.has((other.status ?? '').toLowerCase())) continue;
        await swapInProgram(other.id, fromExerciseId, input.toExerciseId);
      }
    }
  }

  after('swap-exercise');
}

const DEAD_PROGRAM = new Set(['cancelled', 'canceled', 'completed', 'archived']);

/**
 * Replaces an exercise across one program's remaining days.
 *
 * Delete-and-create rather than an update, because `exercise_id` is the row's
 * identity: the server's push refuses to move it for exactly this reason, and a
 * row that changed it would be a different exercise wearing the same id.
 */
async function swapInProgram(
  programId: string,
  fromExerciseId: string,
  toExerciseId: string,
): Promise<void> {
  const rows = await programExercisesCollection
    .query(Q.where('program_id', programId), Q.where('exercise_id', fromExerciseId))
    .fetch();
  if (!rows.length) return;

  await database.write(async () => {
    await database.batch(
      ...rows.flatMap((pe) => [
        pe.prepareMarkAsDeleted(),
        programExercisesCollection.prepareCreate((next) => {
          next.programId = pe.programId;
          next.exerciseId = toExerciseId;
          next.sets = pe.sets;
          next.reps = pe.reps;
          next.restSeconds = pe.restSeconds;
          next.durationSeconds = pe.durationSeconds;
          next.targetLoad = pe.targetLoad;
          next.notes = pe.notes;
          next.dayOfWeek = pe.dayOfWeek;
          // Carried, not defaulted: a swap that reaches the program reaches
          // every week it appears in, each staying in the week it was on.
          next.week = pe.week;
          next.orderIndex = pe.orderIndex;
        }),
      ]),
    );
  });
}

/**
 * Rewrites one exercise id inside a template's blueprint.
 *
 * A string edit on the JSON the server already stores, rather than a call to
 * `PUT /v1/templates/{id}` — the column pushes through the ordinary sync, so a
 * swap decided in a basement reaches the template when the bars come back
 * rather than failing at the moment it was decided.
 */
async function swapInTemplate(
  templateId: string,
  fromExerciseId: string,
  toExerciseId: string,
): Promise<void> {
  const template = await templatesCollection.find(templateId).catch(() => null);
  if (!template?.structure) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(template.structure);
  } catch {
    // A blueprint this phone cannot read is one it must not rewrite. The other
    // two scopes have already landed; silently mangling the template would be
    // worse than leaving it as the trainer last saw it.
    return;
  }
  if (!Array.isArray(parsed)) return;

  let touched = false;
  const next = parsed.map((entry) => {
    if (entry && typeof entry === 'object' && (entry as Record<string, unknown>).exercise_id === fromExerciseId) {
      touched = true;
      return { ...(entry as Record<string, unknown>), exercise_id: toExerciseId };
    }
    return entry;
  });
  if (!touched) return;

  await database.write(() =>
    template.update((t) => { t.structure = JSON.stringify(next); }),
  );
}

/* -------------------------------------------------------------- closing it */

/**
 * Closes the log. Stamps when, and stops.
 *
 * §09, said twice because it is the rule this screen is most likely to break:
 * **finishing the log does not move the pack.** The sets happened; whether the
 * session counts is a separate fact and a separate tap, and that tap is
 * `endSession` in `db/sessions.ts`.
 */
export async function finishLog(workoutId: string, notes?: string): Promise<void> {
  const workout = await workoutsCollection.find(workoutId);
  await database.write(() =>
    workout.update((w) => {
      w.endedAt = new Date();
      if (notes !== undefined) w.notes = notes;
    }),
  );
  after('finish-log');
}

/** Back into the session — the Back arrow from the summary, and nothing else. */
export async function reopenLog(workoutId: string): Promise<void> {
  const workout = await workoutsCollection.find(workoutId);
  await database.write(() =>
    workout.update((w) => { w.endedAt = null as unknown as Date; }),
  );
  after('reopen-log');
}

/**
 * Throws the whole session away.
 *
 * The only destructive action on this screen and the only one that asks first —
 * §07 puts it behind a long press on the Back arrow, and the screen confirms.
 * The scheduled session is left alone: the appointment still happened, and
 * whether it counted is the diary's question.
 */
export async function discardLog(workoutId: string): Promise<void> {
  const workout = await workoutsCollection.find(workoutId);
  const [sets, exercises] = await Promise.all([
    setLogsCollection.query(Q.where('workout_session_id', workoutId)).fetch(),
    workoutExercisesCollection.query(Q.where('workout_session_id', workoutId)).fetch(),
  ]);

  await database.write(async () => {
    await database.batch(
      ...sets.map((s) => s.prepareMarkAsDeleted()),
      ...exercises.map((e) => e.prepareMarkAsDeleted()),
      workout.prepareMarkAsDeleted(),
    );
  });

  after('discard-log');
}
