'use server';

import {
  createExercise,
  getExercises,
  getExercisesMeta,
  ExercisesApiError,
  type ExerciseWire,
  type ExercisesMeta,
  type ExerciseSearchParams,
} from './api';

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
): Promise<{ ok: true; exercise: ExerciseWire } | { ok: false; error: string }> {
  try {
    const filledSteps = descriptionSteps.map(s => s.trim()).filter(Boolean);
    const exercise = await createExercise({
      name: name.trim(),
      muscleGroup: muscleGroup || undefined,
      target: target || undefined,
      equipment: equipment || undefined,
      description: filledSteps.length > 0 ? filledSteps.join('\n\n') : undefined,
    });
    return { ok: true, exercise };
  } catch (error) {
    if (error instanceof ExercisesApiError) {
      return {
        ok: false,
        error:
          error.status === null
            ? 'Could not reach the server. Check your connection.'
            : `Server error (${error.status}).`,
      };
    }
    return { ok: false, error: 'Something went wrong.' };
  }
}
