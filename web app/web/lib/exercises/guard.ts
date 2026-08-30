import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import {
  ExercisesApiError,
  getExercises,
  getExercisesMeta,
  type ExercisesPage,
  type ExercisesMeta,
} from './api';

export interface ExercisesData {
  initial: ExercisesPage;
  meta: ExercisesMeta;
}

export type ExercisesResult =
  | { ok: true; data: ExercisesData }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

export async function requireExercises(): Promise<ExercisesResult> {
  if (!(await getToken())) redirect('/sign-in');

  try {
    const [initial, meta] = await Promise.all([
      getExercises({ size: 40 }),
      getExercisesMeta(),
    ]);
    return { ok: true, data: { initial, meta } };
  } catch (error) {
    if (error instanceof ExercisesApiError) {
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      return error.status === null
        ? { ok: false, kind: 'unreachable' }
        : { ok: false, kind: 'refused', status: error.status };
    }
    throw error;
  }
}
