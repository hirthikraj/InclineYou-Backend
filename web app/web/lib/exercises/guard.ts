import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import {
  ExercisesApiError,
  getExercises,
  getExercisesMeta,
  getLibraryMeta,
  type ExercisesMeta,
  type ExercisesPage,
  type LibraryMeta,
} from './api';
import { EXERCISES_PAGE_SIZE, wantsList, type LibraryQuery } from './tabs';

export interface LibraryData {
  /** Null on a grid of tiles: nothing is listed until a tile is opened or the search is used. */
  initial: ExercisesPage | null;
  meta: LibraryMeta;
  /** For the create form's pickers. */
  createMeta: ExercisesMeta;
  query: LibraryQuery;
  size: number;
}

export type ExercisesResult =
  | { ok: true; data: LibraryData }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

/** What the server is asked, from a state of the page. The three views name the same filters differently. */
function searchOf(q: LibraryQuery) {
  const base = { size: EXERCISES_PAGE_SIZE, page: q.page };
  if (q.view === 'categories') {
    return { ...base, bodyPart: q.group ? [q.group] : [], target: q.muscle ? [q.muscle] : [] };
  }
  if (q.view === 'equipment') {
    return { ...base, equipmentCategory: q.ecat ? [q.ecat] : [], equipmentKey: q.ekey ? [q.ekey] : [] };
  }
  return {
    ...base,
    q: q.q || undefined,
    bodyPart: q.body,
    target: q.muscles,
    secondary: q.also,
    equipmentKey: q.kit,
    pattern: q.pattern,
    level: q.level,
    logType: q.counted,
    category: q.type,
    source: q.source !== 'all' ? q.source : undefined,
  };
}

export async function requireExercises(query: LibraryQuery): Promise<ExercisesResult> {
  if (!(await getToken())) redirect('/sign-in');

  try {
    /* The facets first: whether an opened equipment category lists or shows tiles depends on how many kinds it holds.
       `getLibraryMeta` is cached for the request and the server answers it from an ETag. */
    const [meta, createMeta] = await Promise.all([getLibraryMeta(), getExercisesMeta()]);
    const initial = wantsList(query, meta) ? await getExercises(searchOf(query)) : null;
    return { ok: true, data: { initial, meta, createMeta, query, size: EXERCISES_PAGE_SIZE } };
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
