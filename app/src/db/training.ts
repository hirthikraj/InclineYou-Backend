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
export { parseBlueprint as readBlueprint, parseDayLabels as readDayLabels } from '../training/training';
export type { BlueprintEntry } from '../training/training';

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
): Promise<TemplateModel> {
  const created = await database.write(() =>
    templatesCollection.create((t) => {
      t.trainerId = trainerId;
      t.name = name.trim() || 'New program';
      t.weeks = weeks;
      t.structure = '[]';
      t.dayLabels = '{}';
    }),
  );
  after('create-template');
  return created;
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
    sets?: number | null;
    reps?: number | null;
    restSeconds?: number | null;
    notes?: string | null;
  },
): Promise<void> {
  const row = await templatesCollection.find(templateId);
  const current = parseBlueprintRows(row.structure);
  const onDay = current.filter((e) => num(e.day_of_week) === entry.day);

  current.push({
    exercise_id: entry.exerciseId,
    day_of_week: entry.day,
    sets: entry.sets ?? 3,
    reps: entry.reps ?? 10,
    rest_seconds: entry.restSeconds ?? 60,
    notes: entry.notes ?? null,
    order_index: onDay.length + 1,
  });

  await database.write(() =>
    row.update((t) => {
      t.structure = JSON.stringify(current);
    }),
  );
  after('add-to-blueprint');
}

/** Removes one exercise from a day, and closes the gap in that day's order. */
export async function removeFromBlueprint(
  templateId: string,
  exerciseId: string,
  day: number,
): Promise<void> {
  const row = await templatesCollection.find(templateId);
  const kept = parseBlueprintRows(row.structure).filter(
    (e) => !(e.exercise_id === exerciseId && num(e.day_of_week) === day),
  );
  let seen = 0;
  kept.forEach((e) => {
    if (num(e.day_of_week) === day) {
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

/** Names a day — "Push A". Stored beside the blueprint, keyed by weekday. */
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
