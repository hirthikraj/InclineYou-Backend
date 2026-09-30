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
  name: string,
  muscleGroup: string,
  target: string,
  equipment: string,
  descriptionSteps: string[],
  /** `true` from the form's *Save as draft*. A draft is kept out of the library
   *  proper until the trainer finishes it — see `ExerciseRow.status`. */
  asDraft = false,
): Promise<{ ok: true; exercise: ExerciseWire } | { ok: false; error: string }> {
  try {
    const filledSteps = descriptionSteps.map(s => s.trim()).filter(Boolean);
    const exercise = await createExercise({
      name: name.trim(),
      muscleGroup: muscleGroup || undefined,
      target: target || undefined,
      equipment: equipment || undefined,
      description: filledSteps.length > 0 ? filledSteps.join('\n\n') : undefined,
      ...(asDraft ? { status: 'draft' as const } : {}),
    });
    return { ok: true, exercise };
  } catch (error) {
    return { ok: false, error: refusal(error) };
  }
}

/** The sentence for a refusal: the server's reason when it gave one the trainer can act on. */
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
