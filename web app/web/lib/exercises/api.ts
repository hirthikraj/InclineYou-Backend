import 'server-only';

import { getToken } from '@/lib/auth/session';

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

export class ExercisesApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'ExercisesApiError';
  }
}

export interface ExerciseWire {
  id: string;
  name: string;
  muscleGroup: string | null;
  bodyPart: string | null;
  target: string | null;
  /** Everything else the movement works. Empty on an isolation exercise, and
   *  empty on a custom one — see the POST route in `mock/router.ts`. */
  secondaryTargets: string[];
  equipment: string | null;
  movementPattern: string | null;
  /** Short imperatives. Empty draws no section, never an empty heading. */
  formCues: string[];
  /** The steps, one per paragraph. Split on the blank line, never rendered raw. */
  description: string | null;
  level: string | null;
  isCustom: boolean;
  /** `'published' | 'draft'`. Optional so a row written before the column
   *  existed reads `undefined` and is treated as published — the safe end. */
  status?: 'published' | 'draft' | null;
  /**
   * WHETHER THIS MOVEMENT IS COUNTED IN REPS OR IN SECONDS.
   *
   * `'weight_reps' | 'reps' | 'duration'`, and it was on the wire all along —
   * `store.exercises` returns catalogue rows unmapped and this read is a bare
   * `res.json()`. It was simply absent from this interface, which is why the
   * builder could not see it: `addEntries` wrote `reps: 10` for **every**
   * movement, so a Plank added from the library arrived as *3 × 10 reps*
   * instead of a hold. Fifteen movements in the catalogue are timed, and
   * `blueprintOf` in the seed guards against exactly this — "a plank written as
   * 3 × 45 reps instead of 45 seconds is wrong in a way nothing downstream can
   * detect, and it would have had to be got right twice."
   *
   * `lib/log/api.ts` has carried it since the console was built. Optional here
   * so a row written before the column existed reads `undefined` and falls to
   * the reps branch, which is the right default for a movement nobody has
   * classified.
   */
  logType?: string | null;
}

export interface ExercisesMeta {
  muscleGroups: string[];
  bodyParts: string[];
  targets: string[];
  equipment: string[];
  levels: string[];
}

/**
 * ONE MUSCLE GROUP AND HOW MUCH IS IN IT.
 *
 * The count is the whole reason the *By categories* view is worth drawing: a
 * grid of eight names is a filter dropdown laid out flat, and a grid of eight
 * names with figures beside them is a map of the library — *Legs 15, Cardio 4*
 * tells a trainer where the depth is before they have opened anything.
 */
export interface ExerciseCategory {
  muscleGroup: string;
  count: number;
}

export interface ExerciseCategories {
  categories: ExerciseCategory[];
  /** Every exercise in the account, including the ones in no group at all. */
  total: number;
  /** `total` minus what the cards add up to. See the route's own note. */
  uncategorised: number;
}

export interface ExercisesPage {
  exercises: ExerciseWire[];
  total: number;
}

/**
 * WHOSE MOVEMENTS THE LIST IS SHOWING.
 *
 * `all` is the default and is NOT the whole table — it is everything that is
 * ready to be put in a program, so it excludes drafts. That is why `draft` is a
 * value of this one control rather than a second switch beside it: a draft is
 * not a flavour of the list you are already looking at, it is a different list.
 */
export type ExerciseSource = 'all' | 'incline' | 'mine' | 'draft';

export interface ExerciseSearchParams {
  q?: string;
  muscleGroup?: string;
  equipment?: string;
  /** Whose movements, and whether finished. Server-side, deliberately — see the
   *  route's note in `mock/router.ts` on why the client-side version was a bug. */
  source?: ExerciseSource;
  page?: number;
  size?: number;
}

async function authedGet<T>(path: string): Promise<T> {
  const token = await getToken();
  if (!token) throw new ExercisesApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ExercisesApiError(null);
  }

  if (!res.ok) throw new ExercisesApiError(res.status);
  return res.json() as Promise<T>;
}

export async function getExercises(params: ExerciseSearchParams = {}): Promise<ExercisesPage> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.muscleGroup) qs.set('muscleGroup', params.muscleGroup);
  if (params.equipment) qs.set('equipment', params.equipment);
  if (params.source && params.source !== 'all') qs.set('source', params.source);
  if (params.page !== undefined) qs.set('page', String(params.page));
  if (params.size !== undefined) qs.set('size', String(params.size));

  const query = qs.toString();
  return authedGet<ExercisesPage>(`/v1/exercises${query ? `?${query}` : ''}`);
}

/**
 * The library counted by muscle group.
 *
 * Deliberately NOT derived on this side by reading every exercise and tallying
 * them: the list route is paged, so a client-side tally would count the fifty
 * rows it happens to be holding and call that the library. The count has to come
 * from wherever the rows are.
 */
export async function getExerciseCategories(): Promise<ExerciseCategories> {
  return authedGet<ExerciseCategories>('/v1/exercises/categories');
}

export async function getExercisesMeta(): Promise<ExercisesMeta> {
  return authedGet<ExercisesMeta>('/v1/exercises/meta');
}

/**
 * One exercise, whole.
 *
 * The builder's rows carry `ExerciseNameWire`, which has no cues, no steps and
 * no secondary targets — the panel is opened from a row and has to go and get
 * them. One row at a time is the right shape here rather than widening the
 * builder's bulk read: a trainer opens the panel for one movement out of twenty,
 * and putting four prose fields on every row of every column would grow the
 * builder's payload for a thing almost none of it draws.
 */
export async function getExercise(id: string): Promise<ExerciseWire> {
  return authedGet<ExerciseWire>(`/v1/exercises/${encodeURIComponent(id)}`);
}

export async function createExercise(body: {
  name: string;
  muscleGroup?: string;
  target?: string;
  equipment?: string;
  description?: string;
  /** Omitted means published. See the POST route on why that is the default. */
  status?: 'published' | 'draft';
}): Promise<ExerciseWire> {
  const token = await getToken();
  if (!token) throw new ExercisesApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/exercises`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ExercisesApiError(null);
  }

  if (!res.ok) throw new ExercisesApiError(res.status);
  return res.json() as Promise<ExerciseWire>;
}
