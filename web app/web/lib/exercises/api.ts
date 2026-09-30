import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

export class ExercisesApiError extends Error {
  /** `code` is the server's machine-readable reason (`EXERCISE_NAME_TAKEN`…), when it sent one. */
  constructor(readonly status: number | null, readonly code: string | null = null) {
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
  /** What a PATCH echoes as If-Match. */
  version?: string;
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

/* ═════════════════════════════════════════ the v1.1 wire ↔ the UI's shape ══
 *
 * The server (Programs L6, A9–A10) pages by KEYSET (`limit` + `cursor`), filters by
 * `bodyPart` / `equipment` / `level` / `custom`, and groups the library in
 * `GET /meta`. The screen was written against numbered pages (`page`, `size`,
 * `{exercises, total}`), a muscle-group filter and a `source` switch, so this is
 * the seam: it translates on the way out and in, and nothing above this file
 * knows the wire moved.
 *
 *  · `muscleGroup` (the filter and the category cards) is the server's `bodyPart`.
 *  · `source`: incline → custom=false, mine → custom=true, draft → custom=true
 *    and only drafts, all → the library without drafts.
 *  · Page N is reached by walking cursors — a typeahead never asks for one, and
 *    the library screen's pages are a few deep.
 */

interface ItemV11 {
  id: string;
  name: string;
  muscleGroup: string | null;
  bodyPart: string | null;
  target: string | null;
  secondaryTargets?: string[];
  equipment: string | null;
  movementPattern: string | null;
  level: string | null;
  logType: string | null;
  isCustom: boolean;
  status: 'published' | 'draft' | null;
  version: string;
  description?: string | null;
  formCues?: string[];
}

interface PageV11 {
  items: ItemV11[];
  nextCursor: string | null;
  total?: number;
}

interface MetaV11 {
  bodyParts: { id: string; count: number }[];
  equipment: { id: string; count: number }[];
  levels: { id: string; count: number }[];
  total: number;
}

/** The server's item as the UI knows it; a list row has no cues or steps, which read as empty. */
const wireOf = (e: ItemV11): ExerciseWire => ({
  id: e.id,
  name: e.name,
  muscleGroup: e.muscleGroup,
  bodyPart: e.bodyPart,
  target: e.target,
  secondaryTargets: e.secondaryTargets ?? [],
  equipment: e.equipment,
  movementPattern: e.movementPattern,
  formCues: e.formCues ?? [],
  description: e.description ?? null,
  level: e.level,
  isCustom: e.isCustom,
  status: e.status,
  logType: e.logType,
  version: e.version,
});

async function call<T>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const token = await getToken();
  if (!token) throw new ExercisesApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ExercisesApiError(null);
  }

  if (!res.ok) {
    let code: string | null = null;
    try {
      code = ((await res.json()) as { code?: string }).code ?? null;
    } catch {
      /* no body, or not JSON: the status is all there is */
    }
    throw new ExercisesApiError(res.status, code);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

const MAX_LIMIT = 200;

export async function getExercises(params: ExerciseSearchParams = {}): Promise<ExercisesPage> {
  const size = Math.max(1, params.size ?? 20);
  const offset = Math.max(0, params.page ?? 0) * size;
  const source = params.source ?? 'all';

  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.muscleGroup) qs.set('bodyPart', params.muscleGroup);
  if (params.equipment) qs.set('equipment', params.equipment);
  if (source === 'incline') qs.set('custom', 'false');
  if (source === 'mine' || source === 'draft') qs.set('custom', 'true');
  qs.set('includeTotal', 'true');

  const keep = (e: ItemV11) => (source === 'draft' ? e.status === 'draft' : source === 'all' || source === 'mine' ? e.status !== 'draft' : true);

  const rows: ItemV11[] = [];
  let cursor: string | null = null;
  let total = 0;
  let first = true;
  do {
    const q = new URLSearchParams(qs);
    q.set('limit', String(Math.min(MAX_LIMIT, Math.max(1, offset + size - rows.length))));
    if (cursor) q.set('cursor', cursor);
    if (!first) q.delete('includeTotal');
    const page: PageV11 = await call<PageV11>(`/v1/exercises?${q.toString()}`);
    if (first) total = page.total ?? 0;
    first = false;
    rows.push(...page.items.filter(keep));
    cursor = page.nextCursor;
  } while (cursor && rows.length < offset + size);

  return { exercises: rows.slice(offset, offset + size).map(wireOf), total };
}

/** `/meta` is read by two callers of one request (the facets and the category cards): once each render. */
const metaOf = cache(() => call<MetaV11>('/v1/exercises/meta'));

/**
 * The library counted by body part — the server's facet, which replaces the old
 * `/categories`. The cards carry the body part under the old name, `muscleGroup`.
 */
export async function getExerciseCategories(): Promise<ExerciseCategories> {
  const m = await metaOf();
  const categories = m.bodyParts.map(b => ({ muscleGroup: b.id, count: b.count }));
  return { categories, total: m.total, uncategorised: Math.max(0, m.total - categories.reduce((n, c) => n + c.count, 0)) };
}

/**
 * The filter vocabularies. `muscleGroups` and `bodyParts` are both the server's body parts.
 * `targets` is EMPTY: the server no longer lists them, so the create form's secondary-muscle
 * dropdown has nothing to offer until it does.
 */
export async function getExercisesMeta(): Promise<ExercisesMeta> {
  const m = await metaOf();
  const bodyParts = m.bodyParts.map(b => b.id);
  return { muscleGroups: bodyParts, bodyParts, targets: [], equipment: m.equipment.map(e => e.id), levels: m.levels.map(l => l.id) };
}

/**
 * One exercise, whole.
 *
 * The builder's rows carry `ExerciseNameWire`, which has no cues, no steps and
 * no secondary targets — the panel is opened from a row and has to go and get
 * them. One row at a time is the right shape here rather than widening the
 * builder's bulk read.
 */
export async function getExercise(id: string): Promise<ExerciseWire> {
  return wireOf(await call<ItemV11>(`/v1/exercises/${encodeURIComponent(id)}`));
}

/** A custom exercise (A9). `muscleGroup` is the body part; the id is minted here so a retry replays. */
export async function createExercise(body: {
  name: string;
  muscleGroup?: string;
  target?: string;
  equipment?: string;
  description?: string;
  /** Omitted means published. */
  status?: 'published' | 'draft';
}): Promise<ExerciseWire> {
  return wireOf(
    await call<ItemV11>('/v1/exercises', {
      method: 'POST',
      body: {
        id: crypto.randomUUID(),
        name: body.name,
        ...(body.muscleGroup ? { bodyPart: body.muscleGroup } : {}),
        ...(body.target ? { target: body.target } : {}),
        ...(body.equipment ? { equipment: body.equipment } : {}),
        ...(body.description ? { description: body.description } : {}),
        ...(body.status ? { status: body.status } : {}),
      },
    }),
  );
}

/** Fix a custom exercise (A10). Any subset; `version` (from the last read) makes it conditional. */
export async function patchExercise(
  id: string,
  fields: {
    name?: string;
    muscleGroup?: string | null;
    target?: string | null;
    equipment?: string | null;
    description?: string | null;
    formCues?: string[];
    status?: 'published' | 'draft';
  },
  version?: string,
): Promise<ExerciseWire> {
  const { muscleGroup, ...rest } = fields;
  return wireOf(
    await call<ItemV11>(`/v1/exercises/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { ...rest, ...(muscleGroup !== undefined ? { bodyPart: muscleGroup } : {}) },
      headers: version ? { 'if-match': `"${version}"` } : undefined,
    }),
  );
}

/** Retire a custom exercise (A10). Soft; plans and past logs still resolve its name. */
export async function deleteExercise(id: string): Promise<void> {
  await call<null>(`/v1/exercises/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
