/**
 * Training writes — the exercise library and the program shelf.
 *
 * One rule from §07 of the design is enforced here rather than in a screen,
 * because a screen is not where a rule belongs:
 *
 *   **A custom exercise's log type is immutable.** It is written by
 *   `createExercise` and there is no function in this file that can change it.
 *   `describeExercise` exists and takes a name, muscles and equipment;
 *   `relogExercise` does not exist, and that absence *is* the enforcement.
 *   Hevy learned this first — every set already recorded against the exercise
 *   would stop making sense.
 *
 * The other rule — **assigning a program copies it** — is deliberately NOT
 * implemented here. It already exists on the server, at
 * `POST /v1/templates/{id}/apply`, where it is one transaction that reads the
 * blueprint and writes fresh `program_exercise` rows. Re-implementing the copy
 * on the phone would give us two versions of the most consequential write in the
 * app, and the day they disagreed a client would be halfway through a plan that
 * changed under them. `readBlueprint` below is the read half, which is all the
 * phone needs to draw a template's shape offline.
 */

import { Q } from '@nozbe/watermelondb';
import { database } from './index';
import ExerciseModel from './models/Exercise';
import ExerciseFavouriteModel from './models/ExerciseFavourite';
import TemplateModel from './models/Template';
import { refreshPending, syncDatabase } from './sync';

// The blueprint's shape and its parsers live with the module that reads them.
// Re-exported here so a writer's call site does not need to know that.
export {
  parseBlueprint as readBlueprint,
  parseDayLabels as readDayLabels,
  parseTrainingDays as readTrainingDays,
  formatTrainingDays,
} from '../training/training';
export type { BlueprintEntry } from '../training/training';

import { parseTrainingDays, formatTrainingDays } from '../training/training';

export const exercisesCollection = database.get<ExerciseModel>('exercises');
export const favouritesCollection = database.get<ExerciseFavouriteModel>('exercise_favourites');
export const templatesCollection = database.get<TemplateModel>('templates');

/** How a set is recorded. Chosen once and then fixed forever. */
export type LogType = 'weight_reps' | 'reps';

/** Everything the "your own exercise" sheet collects. */
export interface NewExercise {
  trainerId: string;
  name: string;
  /** Primary first. Stored comma-separated, which is how the seeded library reads. */
  muscles: string[];
  equipment: string | null;
  logType: LogType;
}

function after(reason: string) {
  void refreshPending();
  void syncDatabase(reason);
}

/**
 * A custom exercise.
 *
 * `logType` is set here and nowhere else — see the note at the top of the file.
 */
export async function createExercise(input: NewExercise): Promise<ExerciseModel> {
  const row = await database.write(() =>
    exercisesCollection.create((e) => {
      e.name = input.name.trim();
      e.muscleGroup = input.muscles.join(', ');
      e.equipment = input.equipment ?? '';
      e.isCustom = true;
      e.trainerId = input.trainerId;
      e.logType = input.logType;
    }),
  );
  after('create-exercise');
  return row;
}

/**
 * Everything about a custom exercise except how it is logged.
 *
 * Named `describeExercise` rather than `updateExercise` on purpose: a function
 * called "update" invites someone to add a `logType` field to it one day.
 */
export async function describeExercise(
  id: string,
  patch: { name?: string; muscles?: string[]; equipment?: string | null },
): Promise<void> {
  const row = await exercisesCollection.find(id);
  if (!row.isCustom) throw new Error('The shared library is read-only');

  await database.write(() =>
    row.update((e) => {
      if (patch.name !== undefined) e.name = patch.name.trim();
      if (patch.muscles !== undefined) e.muscleGroup = patch.muscles.join(', ');
      if (patch.equipment !== undefined) e.equipment = patch.equipment ?? '';
    }),
  );
  after('describe-exercise');
}

/**
 * The star.
 *
 * Reads the rows first rather than trusting a set held in memory: the star is
 * tapped from three screens, and what is on disk is the only current answer.
 * Every duplicate is deleted, not just the first — two devices can each have
 * starred the same exercise before either pulled, and un-starring has to
 * actually un-star.
 */
export async function toggleFavourite(trainerId: string, exerciseId: string): Promise<boolean> {
  const existing = await favouritesCollection
    .query(Q.where('trainer_id', trainerId), Q.where('exercise_id', exerciseId))
    .fetch();

  if (existing.length) {
    await database.write(async () => {
      await Promise.all(existing.map((row) => row.markAsDeleted()));
    });
    after('unfavourite');
    return false;
  }

  await database.write(() =>
    favouritesCollection.create((f) => {
      f.trainerId = trainerId;
      f.exerciseId = exerciseId;
    }),
  );
  after('favourite');
  return true;
}

/**
 * Renames a template or sets how long it runs.
 *
 * Both ride the sync queue rather than the template API, because neither needs
 * the server to think: they are two scalar fields on a row the phone already
 * holds, and a trainer renaming a program in a basement should see it renamed.
 * Editing the *blueprint* is a different matter and goes through the API.
 */
/**
 * A new, empty program. § 02: **a program is a template.**
 *
 * Written locally like everything else, so a trainer can start one on a gym
 * floor with no signal. It arrives with no days on it, which is the honest
 * starting state — 3b's empty case already says what to do about that.
 */
export async function createTemplate(
  trainerId: string,
  name: string,
  weeks: number | null = null,
  trainingDays: number[] = [],
): Promise<TemplateModel> {
  const created = await database.write(() =>
    templatesCollection.create((t) => {
      t.trainerId = trainerId;
      t.name = name.trim() || 'New program';
      t.weeks = weeks;
      t.structure = '[]';
      t.dayLabels = '{}';
      // Empty rather than null when the trainer skipped the layout: null means
      // "never asked", and this one was asked and left blank.
      t.trainingDays = formatTrainingDays(trainingDays);
    }),
  );
  after('create-template');
  return created;
}

/**
 * The days the program trains on.
 *
 * Laid out before anything is put on them, which is the point — a day nobody has
 * filled yet is still a day, and it is the only thing the trainer can add the
 * first exercise to.
 *
 * Taking a day away leaves whatever was on it alone. The alternative is deleting
 * a session's worth of prescription as a side effect of tapping a chip, and 3b
 * draws an off-layout day that still has exercises on it rather than hiding
 * them. Removing them is a separate, deliberate act.
 */
export async function setTrainingDays(templateId: string, days: number[]): Promise<void> {
  const row = await templatesCollection.find(templateId);
  await database.write(() =>
    row.update((t) => {
      t.trainingDays = formatTrainingDays(days);
    }),
  );
  after('set-training-days');
}

/**
 * Copies one week's exercises onto another week.
 *
 * This is how week 2 gets written: a trainer does not author twelve weeks from
 * nothing, they take last week and change three numbers. So the copy is a real
 * copy — every entry duplicated with the new week on it — and from that moment
 * the two weeks have nothing to do with each other. Editing week 2 afterwards is
 * ordinary editing, because week 2 is now ordinary rows.
 *
 * Refuses to write over a week that already has something on it. Overwriting is
 * a different decision and it belongs behind its own confirmation, not inside a
 * function called "copy".
 */
export async function copyWeek(
  templateId: string,
  from: number,
  to: number,
): Promise<number> {
  if (from === to) return 0;
  const row = await templatesCollection.find(templateId);
  const current = parseBlueprintRows(row.structure);

  const already = current.filter((e) => weekOf(e) === to);
  if (already.length) throw new Error(`Week ${to} already has exercises on it`);

  const source = current.filter((e) => weekOf(e) === from);
  if (!source.length) return 0;

  const copied = source.map((e) => ({ ...e, week: to }));
  await database.write(() =>
    row.update((t) => {
      t.structure = JSON.stringify([...current, ...copied]);
    }),
  );
  after('copy-week');
  return copied.length;
}

/** Empties one week. The week itself stays — it goes back to repeating week 1. */
export async function clearWeek(templateId: string, week: number): Promise<number> {
  const row = await templatesCollection.find(templateId);
  const current = parseBlueprintRows(row.structure);
  const kept = current.filter((e) => weekOf(e) !== week);
  if (kept.length === current.length) return 0;

  await database.write(() =>
    row.update((t) => {
      t.structure = JSON.stringify(kept);
    }),
  );
  after('clear-week');
  return current.length - kept.length;
}

/**
 * Adds one exercise to a program's blueprint.
 *
 * The blueprint is a JSON array on the template, so this is a read-modify-write
 * of that column rather than a row insert — which is why it appends with the
 * next `order_index` **within that day** rather than globally: two days each
 * starting at 1 is what `parseBlueprint` sorts by, and a global counter would
 * put Tuesday's first exercise below Monday's fourth.
 */
export async function addToBlueprint(
  templateId: string,
  entry: {
    exerciseId: string;
    day: number;
    /** Defaults to week 1, which is the only week a single-week program has. */
    week?: number;
    sets?: number | null;
    reps?: number | null;
    restSeconds?: number | null;
    /** Seconds, for a hold — "3 × 45s". Given INSTEAD of reps, never alongside. */
    durationSeconds?: number | null;
    notes?: string | null;
  },
): Promise<void> {
  const row = await templatesCollection.find(templateId);
  const current = parseBlueprintRows(row.structure);
  const week = Math.max(1, Math.round(entry.week ?? 1));
  const onDay = current.filter((e) => weekOf(e) === week && num(e.day_of_week) === entry.day);

  // 3 × 10 stands in only when nothing was said. A timed entry gets no reps at
  // all — inventing 10 reps of a plank would be a number nobody wrote.
  const timed = entry.durationSeconds != null && entry.durationSeconds > 0;
  current.push({
    exercise_id: entry.exerciseId,
    day_of_week: entry.day,
    week,
    sets: entry.sets ?? 3,
    reps: timed ? null : entry.reps ?? 10,
    rest_seconds: entry.restSeconds ?? 60,
    duration_seconds: timed ? entry.durationSeconds : null,
    notes: entry.notes ?? null,
    order_index: onDay.length + 1,
  });

  // Putting something on a day makes it a training day, if it wasn't one. The
  // trainer has just said so more plainly than any chip row could.
  //
  // The blueprint's own days are the fallback, not an empty list: a template
  // authored before the layout existed has no `training_days`, and writing one
  // that holds only the day just touched would claim the program dropped every
  // other day it has always trained on.
  const existing = current
    .map((e) => num(e.day_of_week))
    .filter((day): day is number => day != null);
  const days = parseTrainingDays(row.trainingDays, []);
  const laidOut = days.length ? days : existing;

  await database.write(() =>
    row.update((t) => {
      t.structure = JSON.stringify(current);
      t.trainingDays = formatTrainingDays([...laidOut, entry.day]);
    }),
  );
  after('add-to-blueprint');
}

/**
 * Removes one exercise from one day of one week, and closes the gap in that
 * day's order.
 *
 * Scoped to the week on purpose: weeks 1 and 3 both having a bench press is the
 * normal case, and taking it out of week 3 must not quietly take it out of the
 * week the client is training this Monday.
 */
export async function removeFromBlueprint(
  templateId: string,
  exerciseId: string,
  day: number,
  week: number = 1,
): Promise<void> {
  const row = await templatesCollection.find(templateId);
  const kept = parseBlueprintRows(row.structure).filter(
    (e) => !(e.exercise_id === exerciseId && num(e.day_of_week) === day && weekOf(e) === week),
  );
  let seen = 0;
  kept.forEach((e) => {
    if (num(e.day_of_week) === day && weekOf(e) === week) {
      seen += 1;
      e.order_index = seen;
    }
  });

  await database.write(() =>
    row.update((t) => {
      t.structure = JSON.stringify(kept);
    }),
  );
  after('remove-from-blueprint');
}

/** Names a day — "Push A". Stored beside the blueprint, keyed by day number. */
export async function nameTemplateDay(
  templateId: string,
  day: number,
  label: string,
): Promise<void> {
  const row = await templatesCollection.find(templateId);
  let labels: Record<string, string> = {};
  try {
    const parsed = JSON.parse(row.dayLabels || '{}');
    if (parsed && typeof parsed === 'object') labels = parsed as Record<string, string>;
  } catch {
    /* A corrupt label map is not worth losing the program over. */
  }
  const trimmed = label.trim();
  if (trimmed) labels[String(day)] = trimmed;
  else delete labels[String(day)];

  await database.write(() =>
    row.update((t) => {
      t.dayLabels = JSON.stringify(labels);
    }),
  );
  after('name-template-day');
}

/**
 * The blueprint as raw rows, for writing.
 *
 * `readBlueprint` returns the parsed, camel-cased read model; a writer has to
 * put back exactly the snake_case shape the server and every other reader
 * expect, so it works on the raw array instead of round-tripping through the
 * read model and losing any key this build doesn't know about.
 */
type RawEntry = Record<string, unknown>;

function parseBlueprintRows(structure: string | null | undefined): RawEntry[] {
  if (!structure) return [];
  try {
    const parsed: unknown = JSON.parse(structure);
    return Array.isArray(parsed) ? (parsed.filter((e) => e && typeof e === 'object') as RawEntry[]) : [];
  } catch {
    return [];
  }
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A raw entry's week. Missing means 1 — see `BlueprintEntry.week`. */
function weekOf(entry: RawEntry): number {
  return Math.max(1, num(entry.week) ?? 1);
}

/**
 * Takes a program off the shelf.
 *
 * A local soft-delete that rides the sync queue like every other template
 * write — the push tells the server, which soft-deletes its row, and the
 * next pull clears it off any other device. Deliberately NOT the template
 * API's DELETE: a trainer clearing out their shelf in a basement should not
 * need a connection for it.
 *
 * Clients already on a copy are untouched — assigning was a copy, and the
 * copy never looks back at its source. The one thing that dies with the
 * template is the ability to assign it again.
 */
export async function deleteTemplate(templateId: string): Promise<void> {
  const row = await templatesCollection.find(templateId);
  await database.write(() => row.markAsDeleted());
  after('delete-template');
}

export async function updateTemplate(
  id: string,
  patch: { name?: string; weeks?: number | null; goal?: string | null },
): Promise<void> {
  const row = await templatesCollection.find(id);
  await database.write(() =>
    row.update((t) => {
      if (patch.name !== undefined) t.name = patch.name.trim();
      if (patch.weeks !== undefined) t.weeks = patch.weeks;
      if (patch.goal !== undefined) t.goal = patch.goal ?? '';
    }),
  );
  after('update-template');
}
