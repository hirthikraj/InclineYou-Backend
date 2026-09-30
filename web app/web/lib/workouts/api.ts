import 'server-only';

import { getToken } from '@/lib/auth/session';

/**
 * `/v1/workout-templates` — ONE SESSION, WRITTEN ONCE.
 *
 * A rung below `/v1/templates`, which is a whole block with weeks and training
 * days. `mock/types.ts` carries the argument for the two being separate tables;
 * the short version is that a program template is placed on a CALENDAR and this
 * one deliberately has none, which is what makes it droppable into any of them.
 *
 * Its own module rather than a section of `lib/programs/api.ts` for the reason
 * `lib/clients/client-api.ts` is its own: two fetchers against two resources
 * that will diverge is cheaper than one that has to branch on which it is
 * holding. **This is a mock-only endpoint** — Spring has no `workout_template`
 * table and `BACKEND_GAPS.md` in the sibling tree is where that is owed.
 */

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

export class WorkoutsApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'WorkoutsApiError';
  }
}

export interface WorkoutTemplateSetWire {
  loadKind:
    | 'percent_1rm'
    | 'level'
    | 'weight'
    | 'weight_range'
    | 'bodyweight'
    | 'rpe_level'
    | 'rpe_weight';
  loadValue: number | null;
  effortKind:
    | 'max_reps'
    | 'max_time'
    | 'max_distance'
    | 'distance'
    | 'reps'
    | 'rep_interval'
    | 'time';
  effortValue: number | null;
  restSeconds: number | null;
  tempo: string | null;
  notes: string | null;
}

export interface WorkoutTemplateAlternativeWire {
  exerciseId: string;
  sets: WorkoutTemplateSetWire[];
}

export interface WorkoutTemplateExerciseWire {
  id: string;
  exerciseId: string;
  orderIndex: number;
  groupId: string | null;
  /**
   * What the client may swap this movement for, in the trainer's own order,
   * each with its own prescription. See `WorkoutTemplateExerciseRow`.
   *
   * OPTIONAL ON THE READ, for the reason `dividers` is: a workout saved by a
   * build that predates substitutes comes back without the key at all, and that
   * is a movement with nothing to swap for rather than a session that failed to
   * load. Declared present, it crashed the read that windows the library —
   * `undefined.map` — and took the whole dialog with it. Every reader takes
   * `?? []`; `WorkoutTemplateInput` still REQUIRES it, because anything this
   * build sends has been through the builder's draft.
   */
  alternatives?: WorkoutTemplateAlternativeWire[];
  sets: WorkoutTemplateSetWire[];
}

/**
 * A LABELLED BREAK — *Warm-up*, *Main set*, *Cool-down*.
 *
 * `beforeIndex` counts the movements that precede it, so `exercises.length` is
 * the foot of the session. A POSITION rather than an exercise id, because the
 * heading belongs to the place: delete the movement under *Main set* and the
 * block is still called that. See `DraftDivider`, which holds the same thing as
 * an anchor for as long as one dialog is open.
 */
export interface WorkoutTemplateDividerWire {
  label: string;
  beforeIndex: number;
}

export interface WorkoutTemplateWire {
  id: string;
  name: string;
  notes: string | null;
  exercises: WorkoutTemplateExerciseWire[];
  /** Optional on the read for the rows written before the column existed — a
   *  workout saved by an older build has none, which is a session with no
   *  headings rather than a session that failed to load. */
  dividers?: WorkoutTemplateDividerWire[];
  createdAt: number;
  updatedAt: number;
  /** What a save must echo as If-Match; the dialog keeps it from the read. */
  version?: string;
  /** Counted by the server, never stored — see `workoutTemplateView`. */
  exerciseCount: number;
  setCount: number;
}

/** What the builder sends. No ids and no ordinals: the server re-derives
 *  `orderIndex` from the position, which is the one thing a reorder cannot get
 *  wrong when it is read rather than sent. */
export interface WorkoutTemplateInput {
  name: string;
  notes: string | null;
  dividers: WorkoutTemplateDividerWire[];
  exercises: {
    exerciseId: string;
    groupId: string | null;
    alternatives: WorkoutTemplateAlternativeWire[];
    sets: WorkoutTemplateSetWire[];
  }[];
}

/** Keep the headers a caller cares about next to the body; the adapter needs the ETag of a read. */
async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await authedRaw<T>(path, init)).body;
}

async function authedRaw<T>(path: string, init: RequestInit = {}): Promise<{ body: T; res: Response }> {
  const token = await getToken();
  if (!token) throw new WorkoutsApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new WorkoutsApiError(null);
  }

  if (!res.ok) throw new WorkoutsApiError(res.status);
  /* 204 on the delete. `res.json()` on an empty body throws, and the caller
     wants the success rather than the payload. */
  if (res.status === 204) return { body: null as T, res };
  return { body: (await res.json()) as T, res };
}

/* ═════════════════════════════════════════ the v1.1 wire ↔ the UI's shape ══
 *
 * The server (Programs L4 / A7) answers `{items}`, names a row's place `position`,
 * carries dividers as `{position, label}` and sends a `version` that a PUT must
 * echo as If-Match. The builder was written against the flat shape above
 * (`orderIndex`, `beforeIndex`, bare arrays), so this is the seam: it translates
 * on the way in and out, and nothing above this file knows the wire moved. */

interface SetV11 {
  loadKind: WorkoutTemplateSetWire['loadKind'];
  loadValue: number | null;
  effortKind: WorkoutTemplateSetWire['effortKind'];
  effortValue: number | null;
  restSeconds: number | null;
  tempo: string | null;
  notes: string | null;
}

interface ExerciseV11 {
  id: string;
  exerciseId: string;
  position: number;
  groupId: string | null;
  sets: SetV11[];
  alternatives?: { exerciseId: string; sets: SetV11[] }[];
}

interface ItemV11 {
  id: string;
  name: string;
  notes: string | null;
  exercises: ExerciseV11[];
  dividers: { position: number; label: string }[];
  exerciseCount: number;
  setCount: number;
  createdAt: number;
  updatedAt: number;
  version: string;
}

const setOf = (s: SetV11): WorkoutTemplateSetWire => ({
  loadKind: s.loadKind,
  loadValue: s.loadValue,
  effortKind: s.effortKind,
  effortValue: s.effortValue,
  restSeconds: s.restSeconds,
  tempo: s.tempo,
  notes: s.notes,
});

const viewOf = (w: ItemV11): WorkoutTemplateWire => ({
  id: w.id,
  name: w.name,
  notes: w.notes,
  exercises: w.exercises.map(e => ({
    id: e.id,
    exerciseId: e.exerciseId,
    orderIndex: e.position,
    groupId: e.groupId,
    alternatives: (e.alternatives ?? []).map(a => ({ exerciseId: a.exerciseId, sets: a.sets.map(setOf) })),
    sets: e.sets.map(setOf),
  })),
  dividers: w.dividers.map(d => ({ label: d.label, beforeIndex: d.position })),
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
  exerciseCount: w.exerciseCount,
  setCount: w.setCount,
  version: w.version,
});

/** Only the keys the server binds — a stray one is a 400. */
function bodyOf(body: WorkoutTemplateInput, id?: string) {
  return {
    ...(id ? { id } : {}),
    name: body.name.trim() || 'New workout',
    notes: body.notes,
    exercises: body.exercises.map(e => ({
      exerciseId: e.exerciseId,
      groupId: e.groupId,
      sets: e.sets.map(setOf),
      alternatives: e.alternatives.map(a => ({ exerciseId: a.exerciseId, sets: a.sets.map(setOf) })),
    })),
    dividers: body.dividers
      .filter(d => d.label.trim())
      .map(d => ({ position: Math.max(0, Math.round(d.beforeIndex)), label: d.label.trim().slice(0, 60) })),
  };
}

export async function getWorkoutTemplates(): Promise<WorkoutTemplateWire[]> {
  return (await authed<{ items: ItemV11[] }>('/v1/workout-templates')).items.map(viewOf);
}

export async function getWorkoutTemplate(id: string): Promise<WorkoutTemplateWire> {
  return viewOf(await authed<ItemV11>(`/v1/workout-templates/${encodeURIComponent(id)}`));
}

/** The id is minted here, so a retried create replays (200) instead of making two. */
export async function createWorkoutTemplate(
  body: WorkoutTemplateInput,
): Promise<WorkoutTemplateWire> {
  return viewOf(
    await authed<ItemV11>('/v1/workout-templates', {
      method: 'POST',
      body: JSON.stringify(bodyOf(body, crypto.randomUUID())),
    }),
  );
}

/**
 * A save is conditional on the version the workout is at (428 / 412 otherwise). The dialog sends the
 * one it opened with, so a save from a stale dialog is refused instead of overwriting. A caller with
 * none (nothing today) falls back to reading it just before the PUT.
 */
export async function updateWorkoutTemplate(
  id: string,
  body: WorkoutTemplateInput,
  version?: string,
): Promise<WorkoutTemplateWire> {
  const path = `/v1/workout-templates/${encodeURIComponent(id)}`;
  const current = version ?? (await authedRaw<ItemV11>(path)).body.version;
  return viewOf(
    await authed<ItemV11>(path, {
      method: 'PUT',
      headers: { 'if-match': `"${current}"` },
      body: JSON.stringify(bodyOf(body)),
    }),
  );
}

export async function deleteWorkoutTemplate(id: string): Promise<void> {
  await authed<null>(`/v1/workout-templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
