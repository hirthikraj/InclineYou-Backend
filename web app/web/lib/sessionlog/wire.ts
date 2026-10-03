/**
 * THE LOG SESSION WIRE — api-contract v1.1 *Log session*, as the backend answers it.
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ───────────────────────────────────────
 *
 * Plain types for the eleven routes that replace `/v1/workouts/*`. Nothing in
 * here computes anything: `select.ts` turns these into the view models the
 * console already draws, and `kinds.ts` says what each set kind means.
 *
 * Every quantity is a JSON NUMBER — `loadValue`, `effortValue`, `rpe`,
 * `target.load`, `target.effort`, `e1rm`, `volumeKg` (R79). Nothing here parses
 * a decimal string; `tempo` stays a string because it is a pattern, and every
 * instant is epoch milliseconds.
 *
 * The set kinds are the planner's own (`lib/programs/wire.ts` spells the same
 * seven × seven): the console must be able to LOG whatever the plan can
 * PRESCRIBE (R39). They are re-declared here, rather than imported, so the log
 * layer does not depend on the program builder's module graph.
 */

export type LoadKind =
  | 'percent_1rm'
  | 'level'
  | 'weight'
  | 'weight_range'
  | 'bodyweight'
  | 'rpe_level'
  | 'rpe_weight';

export type EffortKind =
  | 'reps'
  | 'rep_interval'
  | 'time'
  | 'distance'
  | 'max_reps'
  | 'max_time'
  | 'max_distance';

/** What the plan asked of one set. Absent on an extra set, which has no plan. */
export interface SetTargetWire {
  load: number | null;
  effort: number | null;
  restSeconds: number | null;
  tempo: string | null;
}

/** One `set_log` row. `doneAt` null means not done yet — or skipped. */
export interface SetWire {
  /** `set_log.id`. NULL on the plan preview of an unstarted session — the rows do not exist yet. */
  id: string | null;
  /** 1-based, and the number the grid draws. */
  position: number;
  /** False for an extra set: no plan, no target, and the only kind DELETE accepts. */
  planned: boolean;
  loadKind: LoadKind;
  effortKind: EffortKind;
  target: SetTargetWire | null;
  loadValue: number | null;
  effortValue: number | null;
  /** 1–10 in half steps. */
  rpe: number | null;
  notes: string | null;
  doneAt: number | null;
}

/** One session's totals, kept by one aggregate over its `set_log` rows. */
export interface TotalsWire {
  setsDone: number;
  setsPlanned: number;
  /** Weight × reps sets alone — the server's definition, mirrored by `kinds.ts`. */
  volumeKg: number;
}

/** The plan's own swap offers for an exercise, shown first in the swap modal. */
export interface AlternativeWire {
  planRowId: string;
  exerciseId: string;
  name: string;
}

/** This client's most recent COMPLETED session containing the exercise. */
export interface LastWire {
  /** `yyyy-MM-dd`. */
  date: string;
  sets: { loadValue: number | null; effortValue: number | null; loadKind: LoadKind; effortKind: EffortKind }[];
}

/** Their top set on the exercise — by e1RM for weight × reps, by value for the other kinds. */
export interface BestWire {
  date: string;
  loadValue: number | null;
  effortValue: number | null;
  loadKind: LoadKind;
  effortKind: EffortKind;
  e1rm: number | null;
}

/** One `session_exercise`, with its sets. Before start it is the plan preview and carries no ids. */
export interface ExerciseWire {
  /** `session_exercise.id` — every write keys on it. NULL on the plan preview of an unstarted session. */
  id: string | null;
  exerciseId: string;
  name: string;
  equipment: string | null;
  position: number;
  /** From the plan row: sections and supersets. */
  section: string | null;
  groupId: string | null;
  source: 'planned' | 'added';
  plannedFrom: string | null;
  swappedFrom: string | null;
  /** The name of the movement it replaced (backend 3 Oct), so 'Swapped from {name}' needs no lookup. */
  swappedFromName?: string | null;
  swapReason: 'unavailable' | 'difficulty' | null;
  /** Removed rows stay in the read so the console can offer Undo. */
  removedAt: number | null;
  notes: string | null;
  sets: SetWire[];
  alternatives: AlternativeWire[];
  last: LastWire | null;
  best: BestWire | null;
}

/** The `L4` session row the Schedule already reads. */
export interface SessionRowWire {
  id: string;
  clientId: string;
  scheduledAt: number;
  endsAt: number;
  durationMinutes: number;
  /** `scheduled` · `done` · `no_show` · `cancelled`. */
  status: string;
  deliveryMode: string | null;
  notes: string | null;
  workout: { id: string; name: string; programId: string | null; week: number | null; day: number | null } | null;
  startedAt: number | null;
  endedAt: number | null;
  /** Only once the log was opened. */
  log: { exercises: number; setsDone: number; volumeKg: number; lastSetAt: number | null } | null;
  charge: { packageId: string } | null;
  updatedAt: number;
  version: string;
}

/** `GET /v1/sessions/{id}/log` — everything the console draws, in one read. */
export interface LogWire {
  session: SessionRowWire;
  client: { id: string; name: string; hasPinnedNote: boolean };
  /** Null when the session is unplanned. */
  program: { id: string; name: string; weeks: number } | null;
  exercises: ExerciseWire[];
  totals: TotalsWire;
}

/** `GET /v1/sessions/pick` — who can be logged right now. */
export interface PickWire {
  /** `setsDone` and `volumeKg` ride on each open log so the picker's *Carry on* meta needs no read of its own. */
  open: { sessionId: string; clientId: string; clientName: string; scheduledAt: number; startedAt: number; workoutName: string | null; setsDone: number; volumeKg: number }[];
  booked: { sessionId: string; clientId: string; clientName: string; scheduledAt: number; workoutName: string | null }[];
  everybody: { clientId: string; clientName: string; nextWorkoutName: string | null; lastDoneAt: number | null }[];
}

/** What a set write answers — small on purpose, so a tap never re-reads the log. */
export interface SetWriteWire {
  set: SetWire;
  totals: TotalsWire;
  /** Beats this client's best on the exercise: the console's PR flash. */
  isBest: boolean;
}

/** `POST …/sets` — an extra set, and the totals it moved. */
export interface SetAddedWire {
  set: SetWire;
  totals: TotalsWire;
}

/** `DELETE …/sets/{id}`. */
export interface SetDeletedWire {
  totals: TotalsWire;
}

/** `GET /v1/clients/{id}/set-history` — every completed set for one client, oldest first. */
export interface HistoryItemWire {
  sessionId: string;
  /** `yyyy-MM-dd`, the session's day in the workspace calendar. */
  date: string;
  exerciseId: string;
  position: number;
  loadKind: LoadKind;
  effortKind: EffortKind;
  loadValue: number | null;
  effortValue: number | null;
  rpe: number | null;
  doneAt: number;
}

export interface HistoryWire {
  exercises: Record<string, { name: string; equipment: string | null; custom: boolean }>;
  items: HistoryItemWire[];
  /** session id → its workout's name (null: no workout), for the sessions on the pages read — the repeat offer's label. */
  sessions?: Record<string, { workoutName: string | null }>;
}

/* ────────────────────────────────────────────────────────── request bodies ── */

export interface SetPatch {
  done?: boolean;
  loadValue?: number | null;
  effortValue?: number | null;
  rpe?: number | null;
  /** ≤ 200; '' or null clears. A notes-only patch changes neither the values nor done. */
  notes?: string | null;
}

export interface SetAdd {
  /** Client-minted, so a retried tap replays the same row. */
  id: string;
  loadValue?: number | null;
  effortValue?: number | null;
  rpe?: number | null;
  done?: boolean;
  loadKind?: LoadKind;
  effortKind?: EffortKind;
  notes?: string | null;
}

export interface ExercisePatch {
  removed?: boolean;
  notes?: string | null;
  restSeconds?: number;
  /** True also writes the client's plan (R44). */
  onPlan?: boolean;
}

export type SwapScopeV1 = 'today' | 'program';
export type SwapReason = 'unavailable' | 'difficulty';
