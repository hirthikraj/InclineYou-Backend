import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import {
  ExercisesApiError,
  getExercises,
  getExerciseCategories,
  getExercisesMeta,
  type ExercisesPage,
  type ExercisesMeta,
  type ExerciseCategories,
} from './api';
import { EXERCISES_PAGE_SIZE, type ExercisesQuery } from './tabs';

export interface ExercisesData {
  initial: ExercisesPage;
  meta: ExercisesMeta;
  /**
   * Read on BOTH views, not only on the one that draws the grid.
   *
   * It is one small read and it is what lets the tab strip say *By categories
   * 8* while the list is open — a strip whose count appears only once you are
   * already looking at the thing it counts is a strip that never told you
   * anything. The drill-down banner over a filtered list uses the same figure.
   */
  categories: ExerciseCategories;
  /** Echoed back so the screen draws the filters the server actually applied,
   *  rather than re-deriving them from the URL and risking a different answer. */
  query: Required<Pick<ExercisesQuery, 'q' | 'group' | 'equipment' | 'source' | 'page'>>;
  size: number;
}

export type ExercisesResult =
  | { ok: true; data: ExercisesData }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

/**
 * The library, at the slice the URL asked for.
 *
 * This used to take nothing and always read the first forty rows, because the
 * screen filtered and paged entirely on the client. Numbered pages moved that
 * decision into the address bar, and a page number in the URL that the server
 * ignores is a link that opens on page one — so the read is parameterised and
 * the first paint is already the right page.
 */
export async function requireExercises(query: ExercisesQuery = {}): Promise<ExercisesResult> {
  if (!(await getToken())) redirect('/sign-in');

  const q = (query.q ?? '').trim();
  const group = (query.group ?? '').trim();
  const equipment = (query.equipment ?? '').trim();
  const source = query.source ?? 'all';
  const page = query.page && query.page > 0 ? query.page : 0;

  try {
    const [initial, meta, categories] = await Promise.all([
      getExercises({
        size: EXERCISES_PAGE_SIZE,
        page,
        ...(q ? { q } : {}),
        ...(group ? { muscleGroup: group } : {}),
        ...(equipment ? { equipment } : {}),
        ...(source !== 'all' ? { source } : {}),
      }),
      getExercisesMeta(),
      getExerciseCategories(),
    ]);
    return {
      ok: true,
      data: {
        initial,
        meta,
        categories,
        query: { q, group, equipment, source, page },
        size: EXERCISES_PAGE_SIZE,
      },
    };
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
