'use server';

import {
  createExercise,
  deleteExercise,
  getExercise,
  getExercises,
  getExercisesMeta,
  patchExercise,
  ExercisesApiError,
  type ExerciseWire,
  type NewExercise,
  type ExercisesMeta,
  type ExerciseSearchParams,
} from './api';

/** One exercise for the detail panel. `null` is "we could not get it", which
 *  the panel draws as a sentence rather than as an empty body. */
export async function fetchExercise(id: string): Promise<ExerciseWire | null> {
  try {
    return await getExercise(id);
  } catch {
    return null;
  }
}

export async function searchExercises(
  params: ExerciseSearchParams,
): Promise<{ exercises: ExerciseWire[]; total: number } | null> {
  try {
    return await getExercises(params);
  } catch {
    return null;
  }
}

export async function fetchExerciseMeta(): Promise<ExercisesMeta | null> {
  try {
    return await getExercisesMeta();
  } catch {
    return null;
  }
}

export async function createCustomExercise(
  input: NewExercise,
): Promise<{ ok: true; exercise: ExerciseWire } | { ok: false; error: string }> {
  try {
    const clean = (xs?: string[]) => (xs ?? []).map(x => x.trim()).filter(Boolean);
    const exercise = await createExercise({
      ...input,
      name: input.name.trim(),
      secondaryTargets: clean(input.secondaryTargets),
      formCues: clean(input.formCues),
      aliases: clean(input.aliases),
      commonMistakes: clean(input.commonMistakes),
      safety: clean(input.safety),
      equipmentNeeded: clean(input.equipmentNeeded),
    });
    return { ok: true, exercise };
  } catch (error) {
    return { ok: false, error: refusal(error) };
  }
}

function refusal(error: unknown): string {
  if (error instanceof ExercisesApiError) {
    if (error.status === null) return 'Could not reach the server. Check your connection.';
    if (error.code === 'EXERCISE_NAME_TAKEN') return 'You already have an exercise with that name.';
    if (error.status === 412) return 'This exercise changed since you opened it. Reload it and try again.';
    return `Server error (${error.status}).`;
  }
  return 'Something went wrong.';
}

/** Fix one of the trainer's own exercises. Built on the wire; no screen calls it yet. */
export async function updateCustomExercise(
  id: string,
  fields: Parameters<typeof patchExercise>[1],
  version?: string,
): Promise<{ ok: true; exercise: ExerciseWire } | { ok: false; error: string }> {
  try {
    return { ok: true, exercise: await patchExercise(id, fields, version) };
  } catch (error) {
    return { ok: false, error: refusal(error) };
  }
}

/** Retire one of the trainer's own exercises. Built on the wire; no screen calls it yet. */
export async function removeCustomExercise(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await deleteExercise(id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: refusal(error) };
  }
}
