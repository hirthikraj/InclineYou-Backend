/**
 * THE FOUR-LEVEL PLAN ↔ THE BUILDER'S FLAT ROWS.
 *
 * The schema holds a plan as `program` › `workout` › `workout_exercise` ›
 * `workout_set` (release/release/proposed-schema.html, Planning), and the
 * backend answers with that tree: a program carries `workouts`, each workout
 * its `exercises`, each exercise its `sets` and up to two `alternatives`.
 *
 * The builder, the shelf and the push panel were written against a flat list of
 * prescription rows — `TemplateExerciseWire`, one per exercise, with its week,
 * day, workout and a sets × reps count. The UI stays exactly as it is, so this
 * file is the seam: it flattens the tree on the way in and rebuilds it on the
 * way out, and nothing above `lib/programs/api.ts` knows the wire changed.
 *
 * PURE AND IMPORT-FREE, for the reason `diff.ts` is: the mock backend runs the
 * same flattening to compute an assignment's divergence server-side, and
 * `api.ts` is `server-only`.
 *
 * ── WHAT THE TWO SHAPES DISAGREE ABOUT ─────────────────────────────────────
 *
 * - A day's name is its workout's name — there is no `day_labels`. Reading,
 *   `dayLabels[d]` is Day d's first week-1 workout. Writing, a row's
 *   `workoutName` names its workout, and a named day with no rows is written
 *   as an empty workout so its name survives.
 * - `days` is a count with no gaps. The builder's `trainingDays` may have gaps
 *   (a rest day between two training days); writing COMPACTS them — the k-th
 *   training day becomes Day k. Rows parked on a slot that is not a training
 *   day have nowhere to live in the schema and are not written.
 * - A prescription is per SET. Reading, the first set speaks for the count and
 *   a set list that is not uniform becomes `setDetail`; writing, `sets` × the
 *   row's numbers becomes that many set rows, or `setDetail` one row each.
 * - The builder offers ONE alternative; the schema allows two. The first
 *   alternative is `altExerciseId`, and it runs the main row's own sets.
 * - `goal` is a catalogue id on the wire and a label in the builder.
 */

/* ═══════════════════════════════════════════════════ the new wire ══ */

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

/** One `workout_set`. */
export interface PlanSetWire {
  id?: string;
  position?: number;
  loadKind: LoadKind;
  loadValue: number | null;
  effortKind: EffortKind;
  effortValue: number | null;
  restSeconds: number | null;
  tempo: string | null;
  notes: string | null;
}

/** One `workout_exercise`, with its sets. An alternative has no `alternatives`. */
export interface PlanExerciseWire {
  id?: string;
  exerciseId: string;
  position?: number;
  groupId?: string | null;
  section?: string | null;
  notes: string | null;
  sets: PlanSetWire[];
  alternatives?: PlanExerciseWire[];
}

/** One `workout`, placed on a program's week and day. */
export interface PlanWorkoutWire {
  id?: string;
  name: string;
  notes: string | null;
  week: number | null;
  day: number | null;
  position: number | null;
  exercises: PlanExerciseWire[];
}

/** An entry of the program read's `exercises` dictionary. The optional fields are
 *  what the builder's meta lines draw when the server sends them. */
export interface PlanExerciseNameWire {
  name: string;
  equipment: string | null;
  logType: string | null;
  muscleGroup?: string | null;
  bodyPart?: string | null;
  target?: string | null;
  movementPattern?: string | null;
  level?: string | null;
  isCustom?: boolean;
}

export type ProgramGoalId = 'weight_loss' | 'strength' | 'muscle_gain' | 'rehab' | 'general';

/** A `program` as the backend answers it. */
export interface PlanProgramWire {
  id: string;
  origin: 'inclineyou' | 'trainer';
  clientId: string | null;
  name: string;
  goal: ProgramGoalId | null;
  description: string | null;
  weeks: number;
  days: number;
  status: 'active' | 'paused' | 'completed' | null;
  /** v1.1: `revisedAt` as text — what `If-Match` carries on PUT and resync. */
  version: string;
  startDate: string | null;
  endDate: string | null;
  copiedFromProgramId: string | null;
  syncedAt: number | null;
  revisedAt: number;
  createdAt: number;
  updatedAt: number;
  /** Present on a detail read, absent on a list read. */
  workouts?: PlanWorkoutWire[];
  workoutCount: number;
  exerciseCount: number;
  assignedCount: number;
  activeAssignedCount: number;
  assignedClients: { id: string; name: string }[];
  copiedFrom: { id: string; name: string; revisedAt: number } | null;
  behind: boolean;
  /** v1.1 (R48): each exercise's name once, so no follow-up `?ids=` read. Detail reads only. */
  exercises?: Record<string, PlanExerciseNameWire>;
  certified: {
    summary: string;
    level: 'beginner' | 'intermediate' | 'advanced';
    equipment: 'full_gym' | 'dumbbells' | 'bodyweight';
    reviewedAt: number | null;
    isSample: boolean;
    usedCount: number;
  } | null;
  mine: { id: string; copiedAt: number; stale: boolean } | null;
}

/* ═══════════════════════════════════════════ the builder's flat row ══ */

export interface FlatSetDetail {
  reps: number | null;
  durationSeconds: number | null;
  toFailure: boolean | null;
}

/** Structurally `TemplateExerciseWire` (and `DiffRow`). */
export interface FlatRow {
  exerciseId: string;
  sets: number | null;
  reps: number | null;
  restSeconds: number | null;
  targetLoad: number | null;
  notes: string | null;
  dayOfWeek: number | null;
  orderIndex: number;
  week: number | null;
  durationSeconds: number | null;
  tempo: string | null;
  altExerciseId: string | null;
  groupId: string | null;
  workoutId?: string | null;
  workoutName?: string | null;
  setDetail: FlatSetDetail[] | null;
}

/* ═════════════════════════════════════════════════════════ goals ══ */

const GOAL_LABEL: Record<ProgramGoalId, string> = {
  weight_loss: 'Fat loss',
  strength: 'Strength',
  muscle_gain: 'Hypertrophy',
  rehab: 'Rehab',
  general: 'General',
};

/** The id → the builder's label, which `goalKeyOf` reads back to its key. */
export function goalLabelOf(goal: ProgramGoalId | null): string | null {
  return goal ? GOAL_LABEL[goal] : null;
}

/**
 * The builder's goal — a label, a key (`fat-loss`, `hypertrophy`) or free text a
 * trainer typed — → the catalogue id. The same matching `goalKeyOf` uses, so a
 * goal reads back under the chip it was filed under.
 */
export function goalIdOf(goal: string | null | undefined): ProgramGoalId | null {
  const g = (goal ?? '').toLowerCase().trim();
  if (!g) return null;
  const match: [ProgramGoalId, string[]][] = [
    ['weight_loss', ['weight_loss', 'fat', 'weight loss', 'lose', 'cut', 'lean']],
    ['strength', ['strength', 'strong', 'power', 'force']],
    ['muscle_gain', ['muscle_gain', 'hypertroph', 'muscle', 'size', 'mass', 'build']],
    ['rehab', ['rehab', 'injur', 'recover', 'mobility', 'physio', 'prehab']],
  ];
  for (const [id, words] of match) if (words.some(w => g.includes(w))) return id;
  return 'general';
}

/** `full_gym` → `full-gym`, the builder's spelling. */
export function equipmentOf(e: 'full_gym' | 'dumbbells' | 'bodyweight'): 'full-gym' | 'dumbbells' | 'bodyweight' {
  return e === 'full_gym' ? 'full-gym' : e;
}

/* ═══════════════════════════════════════════════════ tree → rows ══ */

const isTimed = (k: EffortKind) => k === 'time' || k === 'max_time';

/** One set as the builder's per-set line. */
function detailOf(s: PlanSetWire): FlatSetDetail {
  return {
    reps: s.effortKind === 'reps' || s.effortKind === 'rep_interval' ? s.effortValue : null,
    durationSeconds: isTimed(s.effortKind) ? s.effortValue : null,
    toFailure: s.effortKind.startsWith('max_') ? true : null,
  };
}

/** Every set the same work? Then the count says it and `setDetail` stays null. */
function uniform(sets: PlanSetWire[]): boolean {
  const [first, ...rest] = sets;
  if (!first) return true;
  return rest.every(s => s.effortKind === first.effortKind && s.effortValue === first.effortValue);
}

function rowOf(
  e: PlanExerciseWire,
  w: PlanWorkoutWire,
  orderIndex: number,
): FlatRow {
  const first = e.sets[0] ?? null;
  const detail = first ? detailOf(first) : null;
  return {
    exerciseId: e.exerciseId,
    sets: e.sets.length || null,
    reps: detail?.reps ?? null,
    restSeconds: first?.restSeconds ?? null,
    targetLoad: first && first.loadKind === 'weight' ? first.loadValue : null,
    notes: e.notes,
    dayOfWeek: w.day ?? 1,
    orderIndex,
    week: w.week ?? 1,
    durationSeconds: detail?.durationSeconds ?? null,
    tempo: first?.tempo ?? null,
    altExerciseId: e.alternatives?.[0]?.exerciseId ?? null,
    groupId: e.groupId ?? null,
    workoutId: w.id ?? null,
    workoutName: w.name,
    setDetail:
      e.sets.length > 0 && (!uniform(e.sets) || e.sets.some(s => s.effortKind.startsWith('max_')))
        ? e.sets.map(detailOf)
        : null,
  };
}

/** A program's workouts → the builder's rows, week → day → workout → exercise. */
export function flatRowsOf(workouts: PlanWorkoutWire[] | undefined): FlatRow[] {
  const ordered = [...(workouts ?? [])].sort(
    (a, b) =>
      (a.week ?? 1) - (b.week ?? 1) || (a.day ?? 1) - (b.day ?? 1) || (a.position ?? 0) - (b.position ?? 0),
  );
  const next = new Map<string, number>();
  const rows: FlatRow[] = [];
  for (const w of ordered) {
    const lane = `${w.week ?? 1}:${w.day ?? 1}`;
    for (const e of w.exercises) {
      const i = next.get(lane) ?? 0;
      rows.push(rowOf(e, w, i));
      next.set(lane, i + 1);
    }
  }
  return rows;
}

/** Day d's name — its first week-1 workout's. A day with none is unnamed. */
export function dayLabelsOf(workouts: PlanWorkoutWire[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const week1 = [...(workouts ?? [])]
    .filter(w => (w.week ?? 1) === 1)
    .sort((a, b) => (a.day ?? 1) - (b.day ?? 1) || (a.position ?? 0) - (b.position ?? 0));
  for (const w of week1) {
    const key = String(w.day ?? 1);
    if (!(key in out) && w.name.trim()) out[key] = w.name;
  }
  return out;
}

/** `days` → the builder's slot list: 1 … n, no gaps. */
export function trainingDaysOf(days: number): number[] {
  return Array.from({ length: Math.max(0, days) }, (_, i) => i + 1);
}

/* ═══════════════════════════════════════════════════ rows → tree ══ */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A workout's id is sent only when it is a real uuid — the server's own, kept so
 *  `scheduled_session.workout_id` survives a save, or one the builder minted. */
const idOf = (raw: string | null | undefined): { id?: string } =>
  raw && UUID.test(raw) ? { id: raw } : {};

/** The builder's numbers for one row → that many set rows. */
function setsOfRow(r: FlatRow): PlanSetWire[] {
  const base = {
    loadKind: 'weight' as LoadKind,
    loadValue: r.targetLoad,
    restSeconds: r.restSeconds,
    tempo: r.tempo,
    notes: null,
  };
  const one = (d: FlatSetDetail): PlanSetWire => {
    const timed = d.durationSeconds != null;
    const effortKind: EffortKind = d.toFailure ? (timed ? 'max_time' : 'max_reps') : timed ? 'time' : 'reps';
    return {
      ...base,
      effortKind,
      effortValue: effortKind.startsWith('max_') ? null : timed ? d.durationSeconds : d.reps,
    };
  };
  if (r.setDetail && r.setDetail.length > 0) return r.setDetail.slice(0, 30).map(one);
  const count = Math.max(1, Math.min(30, r.sets ?? 1));
  const d: FlatSetDetail = { reps: r.reps, durationSeconds: r.durationSeconds, toFailure: null };
  return Array.from({ length: count }, () => one(d));
}

export interface ShapeInput {
  /** The builder's slots, possibly with gaps. Empty = whatever the rows use. */
  trainingDays?: number[];
  dayLabels?: Record<string, string>;
}

/**
 * The builder's rows (and shape) → a program's `workouts` and its `days`.
 *
 * Rows group into workouts by `(week, day, workoutId)` — a row with no
 * `workoutId` belongs to its day's one unnamed workout — in the order the
 * workout first appears on the day. A training day with a label and no rows
 * becomes an empty workout under that label, so the name the trainer gave it is
 * not lost with the rows.
 */
export function treeOf(rows: FlatRow[], shape: ShapeInput): { days: number; workouts: PlanWorkoutWire[] } {
  const used = [...new Set(rows.map(r => r.dayOfWeek ?? 1))];
  const slots = (shape.trainingDays && shape.trainingDays.length > 0 ? shape.trainingDays : used)
    .filter(d => d >= 1 && d <= 7);
  const ordered = [...new Set(slots)].sort((a, b) => a - b);
  const dayOf = new Map(ordered.map((slot, i) => [slot, i + 1]));
  const labels = shape.dayLabels ?? {};

  const byWorkout = new Map<string, { week: number; slot: number; first: number; name: string | null; workoutId: string | null; rows: FlatRow[] }>();
  rows.forEach(r => {
    const slot = r.dayOfWeek ?? 1;
    if (!dayOf.has(slot)) return; // parked on a rest day — see the header
    const week = r.week ?? 1;
    const key = `${week}:${slot}:${r.workoutId ?? ''}`;
    const entry = byWorkout.get(key) ?? { week, slot, first: r.orderIndex, name: null, workoutId: r.workoutId ?? null, rows: [] };
    entry.first = Math.min(entry.first, r.orderIndex);
    entry.name = entry.name ?? (r.workoutName?.trim() || null);
    entry.rows.push(r);
    byWorkout.set(key, entry);
  });

  const workouts: PlanWorkoutWire[] = [];
  const perDay = new Map<string, number>();
  const groups = [...byWorkout.values()].sort(
    (a, b) => a.week - b.week || a.slot - b.slot || a.first - b.first,
  );
  for (const g of groups) {
    const day = dayOf.get(g.slot)!;
    const lane = `${g.week}:${day}`;
    const position = perDay.get(lane) ?? 0;
    perDay.set(lane, position + 1);
    workouts.push({
      ...idOf(g.workoutId),
      name: g.name ?? labels[String(g.slot)]?.trim() ?? `Day ${day}`,
      notes: null,
      week: g.week,
      day,
      position,
      exercises: [...g.rows]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map(r => {
          const sets = setsOfRow(r);
          return {
            exerciseId: r.exerciseId,
            groupId: r.groupId,
            section: null,
            notes: r.notes,
            sets,
            alternatives: r.altExerciseId ? [{ exerciseId: r.altExerciseId, notes: null, sets }] : [],
          };
        }),
    });
  }

  /* A named training day with nothing on it in week 1 keeps its name. */
  for (const slot of ordered) {
    const day = dayOf.get(slot)!;
    const label = labels[String(slot)]?.trim();
    if (label && !perDay.has(`1:${day}`)) {
      workouts.push({ name: label, notes: null, week: 1, day, position: 0, exercises: [] });
      perDay.set(`1:${day}`, 1);
    }
  }

  return { days: Math.max(1, ordered.length), workouts };
}
