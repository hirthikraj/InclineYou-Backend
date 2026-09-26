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

async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
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
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

export async function getWorkoutTemplates(): Promise<WorkoutTemplateWire[]> {
  return authed<WorkoutTemplateWire[]>('/v1/workout-templates');
}

export async function getWorkoutTemplate(id: string): Promise<WorkoutTemplateWire> {
  return authed<WorkoutTemplateWire>(`/v1/workout-templates/${encodeURIComponent(id)}`);
}

export async function createWorkoutTemplate(
  body: WorkoutTemplateInput,
): Promise<WorkoutTemplateWire> {
  return authed<WorkoutTemplateWire>('/v1/workout-templates', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateWorkoutTemplate(
  id: string,
  body: WorkoutTemplateInput,
): Promise<WorkoutTemplateWire> {
  return authed<WorkoutTemplateWire>(`/v1/workout-templates/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteWorkoutTemplate(id: string): Promise<void> {
  await authed<null>(`/v1/workout-templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
