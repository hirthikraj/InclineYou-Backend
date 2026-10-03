import type { EffortFamily } from '@/lib/log/log';

import type { EffortKind, LoadKind, SetTargetWire } from './wire';

/**
 * THE SET-KIND REGISTRY — R39, the biggest item in the log migration.
 *
 * ── WHY IT EXISTS ───────────────────────────────────────────────────────────
 *
 * The planner prescribes seven load kinds × seven effort kinds and the schema
 * stores them (`set_log_kinds`); the console it feeds knew two, `weight_reps` and
 * `reps`. A plank at 45 s, a 400 m row, a 70 % squat and a pull-up to failure are
 * all things a trainer prescribes on Monday and has to log on Tuesday, so the
 * console draws each set's boxes from THIS table and from nothing else: what to
 * ask for, how to read what was typed, how to say it back, and whether a single
 * tap can log it as prescribed.
 *
 * ── HOW IT IS KEPT HONEST ───────────────────────────────────────────────────
 *
 * Both tables are `Record<Kind, …>`, so a new kind is a compile error until it
 * has a row here — the same discipline `lib/programs/wire.ts` applies to the
 * planner. Every bound below is the schema's (`set_log_actuals`): a load is
 * 0–2000, an effort 0–86 400, an RPE 1–10 in half steps. The server stays the
 * judge — this file is the courtesy that says so before the request is sent.
 *
 * Two definitions are MIRRORS of the server's and are marked as such, because a
 * second opinion about them is how a screen ends up promising a figure the server
 * will not produce: {@link volumeOfSet} (`LogSql.volume`) and
 * {@link rankingValue} (`LogSql.score`).
 *
 * Pure: no imports from React, `next/*` or the network, so a client component
 * can use all of it.
 */

export const LOAD_KINDS = [
  'percent_1rm', 'level', 'weight', 'weight_range', 'bodyweight', 'rpe_level', 'rpe_weight',
] as const satisfies readonly LoadKind[];

export const EFFORT_KINDS = [
  'reps', 'rep_interval', 'time', 'distance', 'max_reps', 'max_time', 'max_distance',
] as const satisfies readonly EffortKind[];

/* ──────────────────────────────────────────────────────────── numbers ── */

export type Parsed = { ok: true; value: number | null } | { ok: false; message: string };

const LOAD_MAX = 2000;
const EFFORT_MAX = 86_400;

/** `12`, `12.5`, `12,5` — a trainer on an Indian keyboard types either. Empty is "nothing typed", not zero. */
function plain(text: string): number | null | 'bad' {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return 'bad';
  const n = Number(t);
  return Number.isFinite(n) ? n : 'bad';
}

/** Up to one decimal place is all a plate or a level ever needs. */
function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function ranged(text: string, min: number, max: number, what: string, whole = false): Parsed {
  const n = plain(text);
  if (n === null) return { ok: true, value: null };
  if (n === 'bad') return { ok: false, message: `${what} has to be a number.` };
  if (whole && !Number.isInteger(n)) return { ok: false, message: `${what} has to be a whole number.` };
  if (n < min || n > max) return { ok: false, message: `${what} has to be between ${min} and ${max}.` };
  return { ok: true, value: n };
}

/** `90`, `1:30`, `1:30:00`, `45s`, `2 min` → seconds. */
export function parseDuration(text: string): Parsed {
  const t = text.trim().toLowerCase();
  if (t === '') return { ok: true, value: null };
  let seconds: number;
  const clock = /^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/.exec(t);
  if (clock) {
    seconds = clock[3] !== undefined
      ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
      : Number(clock[1]) * 60 + Number(clock[2]);
  } else {
    const unit = /^(\d+(?:[.,]\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?)?$/.exec(t);
    if (!unit) return { ok: false, message: 'Time has to look like 45, 1:30 or 2 min.' };
    const n = Number(unit[1].replace(',', '.'));
    seconds = unit[2] && unit[2].startsWith('m') ? Math.round(n * 60) : Math.round(n);
  }
  if (seconds > EFFORT_MAX) return { ok: false, message: 'Time has to be under 24 hours.' };
  return { ok: true, value: seconds };
}

/** 90 → `1:30`; 45 → `45 s`; 3600 → `1:00:00`. */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

/** 400 → `400 m`; 1500 → `1.5 km`. The wire is always metres. */
export function formatDistance(metres: number): string {
  return metres >= 1000 ? `${trim(Math.round(metres) / 1000)} km` : `${trim(metres)} m`;
}

/** `400`, `400 m`, `1.5 km` → metres. */
export function parseDistance(text: string): Parsed {
  const t = text.trim().toLowerCase();
  if (t === '') return { ok: true, value: null };
  const m = /^(\d+(?:[.,]\d+)?)\s*(m|km)?$/.exec(t);
  if (!m) return { ok: false, message: 'Distance has to look like 400, 400 m or 1.5 km.' };
  const n = Number(m[1].replace(',', '.'));
  const metres = m[2] === 'km' ? Math.round(n * 1000) : n;
  if (metres > EFFORT_MAX) return { ok: false, message: 'Distance has to be under 86 400 m.' };
  return { ok: true, value: metres };
}

/** 1–10 in half steps (`set_log_actuals`). */
export function parseRpe(text: string): Parsed {
  const r = ranged(text, 1, 10, 'RPE');
  if (!r.ok || r.value === null) return r;
  return r.value * 2 === Math.trunc(r.value * 2) ? r : { ok: false, message: 'RPE goes up in halves: 7, 7.5, 8.' };
}

/* ────────────────────────────────────────────────────────── load kinds ── */

export interface LoadDescriptor {
  kind: LoadKind;
  /** The box's label. */
  label: string;
  /** Unit drawn beside the number; null when the number carries its own word. */
  unit: string | null;
  /** False for bodyweight: there is nothing to type, so no box is drawn (R39). */
  hasBox: boolean;
  placeholder: string;
  step: number;
  min: number;
  max: number;
  inputMode: 'decimal' | 'numeric';
  /** The number is kilograms — what `volumeOfSet` and the old console's `loadKg` mean. */
  kilograms: boolean;
  /** The plan may prescribe a number for it (the schema bars a bodyweight target). */
  targetable: boolean;
  parse(text: string): Parsed;
  format(value: number): string;
}

function loadRow(row: Omit<LoadDescriptor, 'parse'> & { whole?: boolean }): LoadDescriptor {
  const { whole, ...rest } = row;
  return {
    ...rest,
    parse: (text) => ranged(text, row.min, row.max, row.label, whole === true),
  };
}

export const LOAD: Record<LoadKind, LoadDescriptor> = {
  weight: loadRow({
    kind: 'weight', label: 'Load', unit: 'kg', hasBox: true, placeholder: 'kg', step: 2.5, min: 0, max: LOAD_MAX,
    inputMode: 'decimal', kilograms: true, targetable: true, format: (v) => `${trim(v)} kg`,
  }),
  /* The plan stores ONE number for a weight range (`PlanSetWire.loadValue`): the
     range's endpoints are not on the wire, so a range set is logged as the weight
     that was actually lifted and prescribed as that one figure. */
  weight_range: loadRow({
    kind: 'weight_range', label: 'Load', unit: 'kg', hasBox: true, placeholder: 'kg', step: 2.5, min: 0, max: LOAD_MAX,
    inputMode: 'decimal', kilograms: true, targetable: true, format: (v) => `${trim(v)} kg`,
  }),
  /* Weight chosen by feel: logged as the weight, with its RPE beside it. */
  rpe_weight: loadRow({
    kind: 'rpe_weight', label: 'Load', unit: 'kg', hasBox: true, placeholder: 'kg', step: 2.5, min: 0, max: LOAD_MAX,
    inputMode: 'decimal', kilograms: true, targetable: true, format: (v) => `${trim(v)} kg`,
  }),
  percent_1rm: loadRow({
    kind: 'percent_1rm', label: '% of 1RM', unit: '%', hasBox: true, placeholder: '%', step: 2.5, min: 0, max: 200,
    inputMode: 'decimal', kilograms: false, targetable: true, format: (v) => `${trim(v)}% 1RM`,
  }),
  level: loadRow({
    kind: 'level', label: 'Level', unit: null, hasBox: true, placeholder: 'level', step: 1, min: 0, max: 100,
    inputMode: 'numeric', kilograms: false, targetable: true, whole: true, format: (v) => `Level ${trim(v)}`,
  }),
  /* The load IS an effort rating (a band or a machine set "to RPE 8"). */
  rpe_level: loadRow({
    kind: 'rpe_level', label: 'RPE', unit: null, hasBox: true, placeholder: 'RPE', step: 0.5, min: 1, max: 10,
    inputMode: 'decimal', kilograms: false, targetable: true, format: (v) => `RPE ${trim(v)}`,
  }),
  /* Nothing to type: the body is the load. An EXTRA load (a belt, a vest) is not
     asked for — the planner has no kind for it, and a box nobody uses is noise. */
  bodyweight: loadRow({
    kind: 'bodyweight', label: 'Bodyweight', unit: null, hasBox: false, placeholder: '', step: 0, min: 0, max: LOAD_MAX,
    inputMode: 'decimal', kilograms: false, targetable: false, format: (v) => (v > 0 ? `+${trim(v)} kg` : 'BW'),
  }),
};

/* ───────────────────────────────────────────────────────── effort kinds ── */

export interface EffortDescriptor {
  kind: EffortKind;
  label: string;
  unit: string | null;
  placeholder: string;
  step: number;
  min: number;
  max: number;
  inputMode: 'decimal' | 'numeric';
  /** Counts of repetitions: what `volumeOfSet` multiplies by, and what the old console called `reps`. */
  repetitions: boolean;
  /** The plan can prescribe a number; the `max_*` kinds mean "as many as you can" and have none. */
  targetable: boolean;
  /** Entered on a timer, not a keyboard — the panel draws a stopwatch. */
  timer: boolean;
  parse(text: string): Parsed;
  format(value: number): string;
}

const reps = (n: number) => `${trim(n)} ${n === 1 ? 'rep' : 'reps'}`;

export const EFFORT: Record<EffortKind, EffortDescriptor> = {
  reps: {
    kind: 'reps', label: 'Reps', unit: null, placeholder: 'reps', step: 1, min: 0, max: 1000, inputMode: 'numeric',
    repetitions: true, targetable: true, timer: false,
    parse: (t) => ranged(t, 0, 1000, 'Reps', true), format: reps,
  },
  /* One number on the wire for a rep range: the plan's `effortValue`. */
  rep_interval: {
    kind: 'rep_interval', label: 'Reps', unit: null, placeholder: 'reps', step: 1, min: 0, max: 1000, inputMode: 'numeric',
    repetitions: true, targetable: true, timer: false,
    parse: (t) => ranged(t, 0, 1000, 'Reps', true), format: reps,
  },
  max_reps: {
    kind: 'max_reps', label: 'Reps', unit: null, placeholder: 'reps', step: 1, min: 0, max: 1000, inputMode: 'numeric',
    repetitions: true, targetable: false, timer: false,
    parse: (t) => ranged(t, 0, 1000, 'Reps', true), format: reps,
  },
  time: {
    kind: 'time', label: 'Time', unit: null, placeholder: 'm:ss', step: 5, min: 0, max: EFFORT_MAX, inputMode: 'numeric',
    repetitions: false, targetable: true, timer: true, parse: parseDuration, format: formatDuration,
  },
  max_time: {
    kind: 'max_time', label: 'Time', unit: null, placeholder: 'm:ss', step: 5, min: 0, max: EFFORT_MAX, inputMode: 'numeric',
    repetitions: false, targetable: false, timer: true, parse: parseDuration, format: formatDuration,
  },
  distance: {
    kind: 'distance', label: 'Distance', unit: 'm', placeholder: 'm', step: 50, min: 0, max: EFFORT_MAX, inputMode: 'decimal',
    repetitions: false, targetable: true, timer: false, parse: parseDistance, format: formatDistance,
  },
  max_distance: {
    kind: 'max_distance', label: 'Distance', unit: 'm', placeholder: 'm', step: 50, min: 0, max: EFFORT_MAX, inputMode: 'decimal',
    repetitions: false, targetable: false, timer: false, parse: parseDistance, format: formatDistance,
  },
};

/**
 * THE FAMILY A SET'S EFFORT BELONGS TO, FOR THE RECORD RULE — null for a count of reps.
 *
 * The original record rule ranks kilograms and reps. How LONG and how FAR have a rule of their own
 * (`judgeEffort` in lib/log/log.ts), and this is the one place that says which kinds are which:
 * `time` and `max_time` are the stopwatch, `distance` and `max_distance` the tape.
 */
export function effortFamily(kind: EffortKind): EffortFamily | null {
  switch (kind) {
    case 'time':
    case 'max_time':
      return 'time';
    case 'distance':
    case 'max_distance':
      return 'distance';
    default:
      return null;
  }
}

/* ───────────────────────────────────────────────── a set's boxes & words ── */

export interface Boxes {
  /** Null when the load kind has nothing to type. */
  load: LoadDescriptor | null;
  effort: EffortDescriptor;
  /** Always offered, always optional, always 1–10 in halves. */
  rpe: { label: string; placeholder: string; step: number; min: number; max: number; parse: (t: string) => Parsed };
}

const RPE_BOX: Boxes['rpe'] = { label: 'RPE', placeholder: 'RPE', step: 0.5, min: 1, max: 10, parse: parseRpe };

/** What the grid and the set panel draw for one set. */
export function boxesFor(loadKind: LoadKind, effortKind: EffortKind): Boxes {
  const load = LOAD[loadKind];
  return { load: load.hasBox ? load : null, effort: EFFORT[effortKind], rpe: RPE_BOX };
}

export interface SetLike {
  loadKind: LoadKind;
  effortKind: EffortKind;
  loadValue: number | null;
  effortValue: number | null;
}

/**
 * A set in words: `80 kg × 5`, `BW × 12`, `70% 1RM × 5`, `45 s`, `20 kg × 45 s`,
 * `400 m`, `RPE 8 × 5`. `Max reps` / `Max time` / `Max distance` when it is a
 * to-failure set with nothing logged yet. Empty string when there is nothing to say.
 */
export function saySet(set: SetLike): string {
  const effort = set.effortValue !== null ? EFFORT[set.effortKind].format(set.effortValue) : null;
  const load = set.loadValue !== null ? LOAD[set.loadKind].format(set.loadValue) : null;
  const loadWord = set.loadKind === 'bodyweight' ? (set.loadValue && set.loadValue > 0 ? load : 'BW') : load;
  if (effort === null && (loadWord === null || (set.loadKind === 'bodyweight' && set.loadValue === null))) return '';
  // A timed or measured set with no meaningful load (bodyweight) is just the effort.
  if (set.loadKind === 'bodyweight' && !EFFORT[set.effortKind].repetitions && effort !== null) return effort;
  if (loadWord === null) return effort ?? '';
  if (effort === null) return loadWord;
  return `${loadWord} × ${effort.replace(/ reps?$/, '')}`;
}

/** What the plan asked of a set, in words — `Max reps` for a to-failure set. */
export function sayTarget(set: { loadKind: LoadKind; effortKind: EffortKind; target: SetTargetWire | null }): string {
  if (set.target === null) return '';
  const effortKind = EFFORT[set.effortKind];
  const said = saySet({
    loadKind: set.loadKind, effortKind: set.effortKind,
    loadValue: set.target.load, effortValue: set.target.effort,
  });
  if (said) return said;
  return effortKind.targetable ? '' : `Max ${set.effortKind === 'max_time' ? 'time' : set.effortKind === 'max_distance' ? 'distance' : 'reps'}`;
}

/* ─────────────────────────────────────────── the one-tap rule (R41) ── */

/**
 * What `{done: true}` with no values writes: whatever targets exist, copied.
 * Mirrors the server — which answers 422 SET_NEEDS_VALUE when nothing can be
 * copied (a to-failure set, a bodyweight set with no rep target, or a load left
 * to the day with no effort target either), because the schema's `set_log_done`
 * wants at least one of load / effort on every done set. Knowing it here is what
 * lets the grid open the panel instead of sending a tap that will be refused.
 */
export function copiedByTap(set: { loadKind: LoadKind; effortKind: EffortKind; target: SetTargetWire | null }): {
  loadValue: number | null;
  effortValue: number | null;
} | null {
  const t = set.target;
  if (t === null) return null;
  const loadValue = LOAD[set.loadKind].targetable ? t.load : null;
  const effortValue = EFFORT[set.effortKind].targetable ? t.effort : null;
  return loadValue === null && effortValue === null ? null : { loadValue, effortValue };
}

/* ─────────────────────────────────────────── the server's two definitions ── */

/**
 * MIRROR of `LogSql.volume`: a done set is volume ONLY when it is weight × reps
 * (`load_kind = 'weight' AND effort_kind = 'reps'`) — `load × effort`, in kg. A
 * timed set, a 70 % set and a rep-interval set add nothing, by the server's rule.
 */
export function volumeOfSet(set: SetLike & { doneAt: number | null }): number {
  if (set.doneAt === null || set.loadKind !== 'weight' || set.effortKind !== 'reps') return 0;
  return (set.loadValue ?? 0) * (set.effortValue ?? 0);
}

/**
 * MIRROR of `LogSql.score`, the ranking `best` and `isBest` use: weight × reps
 * ranks by Epley's estimated one-rep max, `load × (1 + reps / 30)`; every other
 * kind ranks by its effort, else its load. Higher is better.
 */
export function rankingValue(set: SetLike): number {
  if (set.loadKind === 'weight' && set.effortKind === 'reps') {
    return (set.loadValue ?? 0) * (1 + (set.effortValue ?? 0) / 30);
  }
  return set.effortValue ?? set.loadValue ?? 0;
}

/** Epley, rounded to a tenth — what the contract's `best.e1rm` is. */
export function epley(load: number, reps: number): number {
  return Math.round(load * (1 + reps / 30) * 10) / 10;
}

/**
 * `percent_1rm` → kilograms, from the client's best e1RM (`best.e1rm`). Null when
 * there is no best to take a percentage of — a first-ever lift cannot say "70 %"
 * in kilos. Rounded to the nearest half-kilo: no plate rack goes finer.
 */
export function kgFromPercent(percent: number, e1rm: number | null): number | null {
  if (e1rm === null || e1rm <= 0) return null;
  return Math.round((percent / 100) * e1rm * 2) / 2;
}

/** The kind a set row falls under in the old console's two-way split — see `select.ts`. */
export function isWeightReps(loadKind: LoadKind, effortKind: EffortKind): boolean {
  return LOAD[loadKind].kilograms && EFFORT[effortKind].repetitions;
}

/** Narrowing helpers for strings that arrive off the wire. */
export function asLoadKind(value: string): LoadKind {
  return (LOAD_KINDS as readonly string[]).includes(value) ? (value as LoadKind) : 'weight';
}
export function asEffortKind(value: string): EffortKind {
  return (EFFORT_KINDS as readonly string[]).includes(value) ? (value as EffortKind) : 'reps';
}
