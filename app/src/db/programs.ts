import { Q } from '@nozbe/watermelondb';
import { database } from './index';
import { refreshPending, syncDatabase } from './sync';
import Template from './models/Template';
import Program from './models/Program';
import ProgramExercise from './models/ProgramExercise';
import Exercise from './models/Exercise';

export const templatesCollection = database.get<Template>('templates');
export const programsCollection = database.get<Program>('programs');
export const programExercisesCollection = database.get<ProgramExercise>('program_exercises');
export const exercisesCollection = database.get<Exercise>('exercises');

export function observeTemplates() {
  return templatesCollection.query(Q.sortBy('created_at', Q.desc)).observe();
}

export function observePrograms(clientId: string) {
  return programsCollection
    .query(Q.where('client_id', clientId), Q.sortBy('created_at', Q.desc))
    .observe();
}

export function observeProgramExercises(programId: string) {
  return programExercisesCollection
    .query(
      Q.where('program_id', programId),
      Q.sortBy('week', Q.asc),
      Q.sortBy('day_of_week', Q.asc),
      Q.sortBy('order_index', Q.asc),
    )
    .observe();
}

/* ------------------------------------------------- the client's own program

 * A program on a client is a COPY. It arrived from a template and from that
 * moment it is theirs, so editing it is ordinary editing and it happens here
 * rather than through `api/programs` — the same way `db/log` already writes
 * these rows when a swap reaches program scope.
 *
 * Local, because the alternative is a trainer standing in a gym with one bar of
 * signal, watching a spinner to move an exercise from Tuesday to Thursday. The
 * sync push carries every one of these to the server on the next window.
 */

/** Null and 0 both read as week 1 — see the column note in `schema.ts`. */
export function weekOf(pe: ProgramExercise): number {
  return Math.max(1, pe.week ?? 1);
}

/** Null reads as unscheduled, which is a day of its own at the end of the list. */
export function dayOf(pe: ProgramExercise): number | null {
  return pe.dayOfWeek == null ? null : pe.dayOfWeek;
}

export interface NewProgramExercise {
  exerciseId: string;
  day: number | null;
  week?: number;
  sets?: number | null;
  reps?: number | null;
  restSeconds?: number | null;
  /** Seconds, for a hold — "3 × 45s". Given INSTEAD of reps, never alongside. */
  durationSeconds?: number | null;
}

function after(reason: string) {
  void refreshPending();
  void syncDatabase(reason);
}

export async function addProgramExercise(
  programId: string,
  input: NewProgramExercise,
): Promise<ProgramExercise> {
  const week = Math.max(1, Math.round(input.week ?? 1));
  // Ordered within its own day and week, so Thursday's first exercise does not
  // land below Monday's fourth.
  //
  // Filtered in JS rather than by `Q.where('week', week)`: every row written
  // before V15 holds NULL there and means week 1, and a SQL equality test skips
  // all of them — which would restart week 1's numbering at 1 on top of rows
  // that already use it.
  const existing = await programExercisesCollection
    .query(Q.where('program_id', programId))
    .fetch();
  const order =
    existing.filter((pe) => weekOf(pe) === week && dayOf(pe) === input.day).length + 1;

  // A timed entry gets no reps — inventing 10 reps of a plank would be a
  // number nobody wrote. 3 × 10 stands in only when nothing was said.
  const timed = input.durationSeconds != null && input.durationSeconds > 0;
  const created = await database.write(() =>
    programExercisesCollection.create((pe) => {
      pe.programId = programId;
      pe.exerciseId = input.exerciseId;
      pe.sets = input.sets ?? 3;
      if (!timed) pe.reps = input.reps ?? 10;
      pe.restSeconds = input.restSeconds ?? 60;
      if (timed) pe.durationSeconds = input.durationSeconds ?? null;
      if (input.day != null) pe.dayOfWeek = input.day;
      pe.week = week;
      pe.orderIndex = order;
    }),
  );
  after('add-program-exercise');
  return created;
}

export async function updateProgramExercise(
  id: string,
  patch: {
    sets?: number | null;
    reps?: number | null;
    restSeconds?: number | null;
    durationSeconds?: number | null;
    day?: number | null;
  },
): Promise<void> {
  const row = await programExercisesCollection.find(id);
  await database.write(() =>
    row.update((pe) => {
      if (patch.sets !== undefined) pe.sets = patch.sets as number;
      if (patch.reps !== undefined) pe.reps = patch.reps as number;
      if (patch.restSeconds !== undefined) pe.restSeconds = patch.restSeconds as number;
      // Explicit null is a real answer here: switching a row from a hold back
      // to reps clears the duration rather than leaving both to disagree.
      if (patch.durationSeconds !== undefined) pe.durationSeconds = patch.durationSeconds;
      if (patch.day !== undefined && patch.day != null) pe.dayOfWeek = patch.day;
    }),
  );
  after('update-program-exercise');
}

export async function removeProgramExercise(id: string): Promise<void> {
  const row = await programExercisesCollection.find(id);
  await database.write(() => row.markAsDeleted());
  after('remove-program-exercise');
}

/**
 * Copies one week of a client's plan onto another.
 *
 * Refuses a week that already has something on it, for the same reason the
 * template's copy does: overwriting somebody's plan is a decision, not a
 * side effect of tapping Copy.
 */
export async function copyProgramWeek(
  programId: string,
  from: number,
  to: number,
): Promise<number> {
  if (from === to) return 0;

  const rows = await programExercisesCollection.query(Q.where('program_id', programId)).fetch();
  if (rows.some((pe) => weekOf(pe) === to)) {
    throw new Error(`Week ${to} already has exercises on it`);
  }
  const source = rows.filter((pe) => weekOf(pe) === from);
  if (!source.length) return 0;

  await database.write(async () => {
    await database.batch(
      ...source.map((pe) =>
        programExercisesCollection.prepareCreate((next) => {
          next.programId = programId;
          next.exerciseId = pe.exerciseId;
          next.sets = pe.sets;
          next.reps = pe.reps;
          next.restSeconds = pe.restSeconds;
          next.durationSeconds = pe.durationSeconds;
          next.targetLoad = pe.targetLoad;
          next.notes = pe.notes;
          next.dayOfWeek = pe.dayOfWeek;
          next.week = to;
          next.orderIndex = pe.orderIndex;
        }),
      ),
    );
  });
  after('copy-program-week');
  return source.length;
}

/** Empties one week of a client's plan. The week goes back to repeating week 1. */
export async function clearProgramWeek(programId: string, week: number): Promise<number> {
  const rows = await programExercisesCollection.query(Q.where('program_id', programId)).fetch();
  const doomed = rows.filter((pe) => weekOf(pe) === week);
  if (!doomed.length) return 0;

  await database.write(async () => {
    await database.batch(...doomed.map((pe) => pe.prepareMarkAsDeleted()));
  });
  after('clear-program-week');
  return doomed.length;
}

/**
 * Which week of the program a date falls in.
 *
 * The arithmetic is in `training/training` with the rest of the pure reading,
 * because the client's own app needs the same answer and cannot reach the
 * trainer's database to get it.
 */
export { programWeek as currentProgramWeek } from '../training/training';

export function observeExerciseSearch(query: string) {
  const conditions: Q.Clause[] = [];
  if (query.trim()) {
    conditions.push(
      Q.where('name', Q.like(`%${Q.sanitizeLikeString(query.trim())}%`)),
    );
  }
  return exercisesCollection
    .query(...conditions, Q.sortBy('is_custom', Q.asc), Q.sortBy('name', Q.asc))
    .observeWithColumns(['name', 'muscle_group']);
}

/**
 * One day of one week, as the log asks for it.
 *
 * A week the trainer never authored has no rows of its own and falls back to
 * week 1 — the same repeat-until-told-otherwise rule the program screen draws,
 * and the reason a client on week 6 of a four-week plan still gets a session
 * instead of an empty log.
 */
export async function fetchProgramExercisesForDay(
  programId: string,
  dayOfWeek: number,
  week: number = 1,
): Promise<ProgramExercise[]> {
  const onDay = await programExercisesCollection
    .query(
      Q.where('program_id', programId),
      Q.where('day_of_week', dayOfWeek),
      Q.sortBy('order_index', Q.asc),
    )
    .fetch();

  const wanted = Math.max(1, Math.round(week));
  const own = onDay.filter((pe) => weekOf(pe) === wanted);
  if (own.length || wanted === 1) return own;
  return onDay.filter((pe) => weekOf(pe) === 1);
}

export async function findExercisesByIds(ids: string[]): Promise<Record<string, Exercise>> {
  if (!ids.length) return {};
  const rows = await exercisesCollection.query(Q.where('id', Q.oneOf(ids))).fetch();
  const map: Record<string, Exercise> = {};
  rows.forEach((e) => { map[e.id] = e; });
  return map;
}
