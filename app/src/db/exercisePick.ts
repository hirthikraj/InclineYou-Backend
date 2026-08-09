/** Callback bridge for the exercise picker. Avoids threading data through nav params. */
export interface PickedExercise {
  id: string;
  name: string;
  muscleGroup: string | null;
}

type PickCallback = (exercise: PickedExercise) => void;
let _callback: PickCallback | null = null;

export function setPendingPick(cb: PickCallback) {
  _callback = cb;
}

export function deliverPick(exercise: PickedExercise) {
  _callback?.(exercise);
  _callback = null;
}
