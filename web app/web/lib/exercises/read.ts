import type { ExerciseWire } from './api';
import { fetchExercise } from './actions';

/**
 * ONE READ OF ONE EXERCISE, however many times a component asks for it at once.
 *
 * A detail panel loads its exercise from an effect, and in development React runs every effect twice on mount (mount,
 * clean up, mount) to prove the cleanup is sound. A `live` flag in the cleanup throws the first answer away, but the
 * request has already left, so opening one exercise sent two identical server-action POSTs 80ms apart. Two panels
 * asking for the same id in the same moment would do the same in production.
 *
 * So requests for the same id that overlap share one promise. It is dropped the moment it settles and NOTHING is
 * cached: opening the exercise again later asks again, so an edit made in between is never hidden behind a stale copy.
 */
const inflight = new Map<string, Promise<ExerciseWire | null>>();

export function readExercise(id: string): Promise<ExerciseWire | null> {
  let read = inflight.get(id);
  if (!read) {
    read = fetchExercise(id).finally(() => inflight.delete(id));
    inflight.set(id, read);
  }
  return read;
}
