import {
  buildFinish,
  buildHistory,
  buildLog,
  isoDay,
  judge,
  PLATE_STEP_KG,
  shortDate,
  trim1,
  volumeOf,
  type FinishView,
  type HistorySession,
  type Judged,
  type LogExercise,
  type LogExerciseRow,
  type LogExerciseView,
  type LogInput,
  type LogScheduled,
  type LogSet,
  type LogSetRow,
  type LogView,
  type LogWorkout,
  type PickRow,
  type PickView,
} from '@/lib/log/log';

import { EFFORT, effortFamily, isWeightReps, LOAD, sayTarget, saySet as saySetKinds } from './kinds';
import { effortBestRow, effortRecordCard, hasExotic, isPlain, sayOne, topOf } from './kindtext';
import type {
  AlternativeWire,
  BestWire,
  EffortKind,
  ExerciseWire,
  HistoryItemWire,
  HistoryWire,
  LoadKind,
  LogWire,
  PickWire,
  SessionRowWire,
  SetAddedWire,
  SetDeletedWire,
  SetTargetWire,
  SetWire,
  SetWriteWire,
  TotalsWire,
} from './wire';

/**
 * THE ADAPTER — the new wire in, today's view models out.
 *
 * ── THE RULE THIS FILE IS BUILT TO ──────────────────────────────────────────
 *
 * The console already draws `LogView`, `FinishView` and `PickView` (from
 * `lib/log/log.ts`), and "the UI stays the same" is a hard requirement of the
 * migration: every string, every verdict, every badge. So this file does NOT
 * re-derive any of it. It builds the `LogInput` the old model was written for —
 * from the new log read plus the client's set history — and hands it to the SAME
 * `buildLog`, `buildFinish` and `buildHistory`. A record that read "quiet" on
 * Friday reads "quiet" on Monday, because the same `judge` decides it.
 *
 * What is NEW is only what the old model could not say, added as extension
 * fields on the old shapes (`LogSetRowX`, `LogExerciseViewX`, `LogViewX`): the
 * ids the new writes key on (`sxId`, `planSetId`), each set's kinds and target,
 * and the plan's sections and swap offers. A component that ignores them draws
 * exactly what it drew before.
 *
 * ── WHERE THE OLD MODEL IS TOLD A LITTLE TRUTH ──────────────────────────────
 *
 * Only DONE sets are handed over as logged sets. In v1 every planned set already
 * has a row (`done_at` null), which the old model would read as "logged"; an
 * undone planned set is therefore an EMPTY SLOT, as it always was, and its id
 * rides along as `planSetId` so the tap that logs it can name it.
 *
 * Pure: no `server-only`, no network, no clock (`now` is passed in) — the console
 * rebuilds its view from this on every write, in the browser.
 */

/* ──────────────────────────────────────────────────────── extension types ── */

export interface LogSetRowX extends LogSetRow {
  /** The `set_log` id for THIS slot even when it is not done — what a tap names. */
  planSetId: string | null;
  loadKind: LoadKind;
  effortKind: EffortKind;
  planned: boolean;
  target: SetTargetWire | null;
  loadValue: number | null;
  effortValue: number | null;
  doneAt: number | null;
  /** The set in words, by its own kinds (`45 s`, `BW × 12`) — `load`/`reps` stay the old two-way split. */
  said: string;
  /** What the plan asked, in words; empty for an extra set. */
  targetSaid: string;
}

export interface LogExerciseViewX extends Omit<LogExerciseView, 'sets'> {
  sets: LogSetRowX[];
  /** `session_exercise.id`; empty on the plan preview of an unstarted session. */
  sxId: string;
  position: number;
  section: string | null;
  groupId: string | null;
  notes: string | null;
  removed: boolean;
  alternatives: AlternativeWire[];
  best: BestWire | null;
  /** The kinds the exercise's sets were prescribed in — drives the panel's boxes. */
  loadKind: LoadKind;
  effortKind: EffortKind;
}

export interface LogViewX extends Omit<LogView, 'exercises'> {
  exercises: LogExerciseViewX[];
  /** Exercises taken out today, kept so the console can offer Undo. */
  removed: LogExerciseViewX[];
  /** The server's own figures, kept in place by every set write. */
  totals: TotalsWire;
  started: boolean;
}

/* ───────────────────────────────────────────────────────────── history ── */

/** `set_log.load_kind` values whose `load_value` is kilograms — what the old `loadKg` meant. */
function loadKg(kind: LoadKind, value: number | null): number | null {
  return LOAD[kind].kilograms ? value : null;
}

/** Effort kinds that are counts of repetitions — what the old `reps` meant. */
function repsOf(kind: EffortKind, value: number | null): number | null {
  return EFFORT[kind].repetitions ? value : null;
}

/**
 * A hold or a carry carries its figure to the record rule as `effort` and its `family` (seconds or
 * metres) — the old model has nowhere else to put it, since it reads only kilograms and reps. Nothing
 * for a count of reps, so weight × reps and reps-only sets are exactly what they always were.
 */
function familyOf(kind: EffortKind, value: number | null): { family: 'time' | 'distance'; effort: number | null } | Record<string, never> {
  const family = effortFamily(kind);
  return family ? { family, effort: value } : {};
}

export interface HistoryParts {
  /** The raw rows (kinds and all), minus the session on screen — what the text is said from. */
  items: HistoryItemWire[];
  workouts: LogWorkout[];
  sets: LogSet[];
  exercises: LogExercise[];
}

/**
 * `GET /v1/clients/{id}/set-history` in `LogInput`'s shape — the client's PAST
 * sessions, never the one on screen (the old console kept today apart from
 * history, and `judge` compares one against the other).
 *
 * A session is a "workout": the log sits on the session in v1. A set keeps its
 * load only when that load is kilograms and its effort only when it is reps, so a
 * timed or 70 % set counts as done without adding volume — the same mapping
 * `lib/log/set-history.ts` makes for Progress, which is what keeps this
 * console's records and Progress's personal bests from disagreeing.
 */
export function historyParts(history: HistoryWire, clientId: string, exceptSessionId: string): HistoryParts {
  const workouts = new Map<string, LogWorkout>();
  const weighted = new Set<string>();
  const sets: LogSet[] = [];
  for (const s of history.items) {
    if (s.sessionId === exceptSessionId) continue;
    const held = workouts.get(s.sessionId);
    if (!held) {
      workouts.set(s.sessionId, {
        id: s.sessionId, clientId, scheduledSessionId: s.sessionId,
        sessionDate: s.date, startedAt: s.doneAt, endedAt: s.doneAt,
      });
    } else if (s.doneAt < held.startedAt) {
      held.startedAt = s.doneAt;
    }
    const kg = loadKg(s.loadKind, s.loadValue);
    if (kg !== null) weighted.add(s.exerciseId);
    sets.push({
      id: `${s.sessionId}:${s.exerciseId}:${s.position}:${s.doneAt}`,
      workoutSessionId: s.sessionId,
      exerciseId: s.exerciseId,
      setNumber: s.position,
      loadKg: kg,
      reps: repsOf(s.effortKind, s.effortValue),
      rpe: s.rpe,
      createdAt: s.doneAt,
      ...familyOf(s.effortKind, s.effortValue),
    });
  }
  const exercises: LogExercise[] = Object.entries(history.exercises).map(([id, e]) => ({
    id, name: e.name, equipment: e.equipment, isCustom: e.custom,
    logType: weighted.has(id) ? 'weight_reps' : 'reps',
  }));
  return { items: history.items.filter((s) => s.sessionId !== exceptSessionId), workouts: [...workouts.values()], sets, exercises };
}

/* ───────────────────────────────────────────────────── the LogInput builder ── */

export interface ViewContext {
  /** The server's clock reading for this render; every minute figure is against it. */
  now: number;
  /**
   * The workout name of the client's last whole session, when the screen knows it
   * (the history carries no names), so frame 6b's offer can say *Repeat 3 Oct ·
   * Push A* rather than *That session*.
   */
  repeatLabel?: { sessionId: string; name: string } | null;
}

/** The DONE sets of one exercise as the old model's logged sets, all belonging to today's session. */
function setsOnly(sets: SetWire[], exerciseId: string, sessionId: string): LogSet[] {
  return sets
    .filter((s) => s.doneAt !== null)
    .map((s) => ({
      id: s.id ?? `${sessionId}:${exerciseId}:${s.position}`,
      workoutSessionId: sessionId,
      exerciseId,
      setNumber: s.position,
      loadKg: loadKg(s.loadKind, s.loadValue),
      reps: repsOf(s.effortKind, s.effortValue),
      rpe: s.rpe,
      notes: s.notes,
      createdAt: s.doneAt as number,
      ...familyOf(s.effortKind, s.effortValue),
    }));
}

/** The one-word reading of a whole exercise for the old two-way split. */
function exerciseLogType(e: ExerciseWire): 'weight_reps' | 'reps' {
  const first = e.sets[0];
  if (!first) return 'weight_reps';
  return isWeightReps(first.loadKind, first.effortKind) ? 'weight_reps' : 'reps';
}

/** Rows that count as being on today's card: everything but a removed exercise with nothing logged. */
function cardRows(log: LogWire): ExerciseWire[] {
  return [...log.exercises]
    .filter((e) => e.removedAt === null || e.sets.some((s) => s.doneAt !== null))
    .sort((a, b) => a.position - b.position);
}

export function logInputFromWire(log: LogWire, history: HistoryParts, ctx: ViewContext): LogInput {
  const s = log.session;
  const today: LogWorkout = {
    id: s.id,
    clientId: log.client.id,
    programId: log.program?.id ?? null,
    scheduledSessionId: s.id,
    sessionDate: isoDay(s.scheduledAt),
    startedAt: s.startedAt ?? s.scheduledAt,
    endedAt: s.endedAt,
  };
  const rows = cardRows(log);
  const todaySets = rows.flatMap((e) => setsOnly(e.sets, e.exerciseId, s.id));
  const logExercises: LogExerciseRow[] = rows.map((e) => {
    const planned = e.sets.filter((x) => x.planned);
    const firstTarget = planned.find((x) => x.target !== null)?.target ?? null;
    const maxPosition = e.sets.reduce((m, x) => Math.max(m, x.position), 0);
    return {
      exerciseId: e.exerciseId,
      orderIndex: e.position,
      source: e.source === 'added' ? 'unplanned' : 'plan',
      // Every slot on the grid, planned or extra: the old model sizes the grid from this.
      targetSets: e.sets.length ? maxPosition : null,
      targetReps: firstTarget && EFFORT[planned[0].effortKind].repetitions ? firstTarget.effort : null,
      restSeconds: firstTarget?.restSeconds ?? null,
      swappedFromExerciseId: e.swappedFrom,
    };
  });
  const names = new Map<string, LogExercise>(history.exercises.map((e) => [e.id, e] as const));
  for (const e of log.exercises) {
    const known = names.get(e.exerciseId);
    names.set(e.exerciseId, {
      id: e.exerciseId,
      name: e.name,
      equipment: e.equipment,
      isCustom: known?.isCustom ?? false,
      logType: exerciseLogType(e),
    });
  }
  const sessions: LogScheduled[] = [
    {
      id: s.id, clientId: log.client.id, programId: log.program?.id ?? null, status: s.status,
      dayLabel: s.workout?.name ?? null, templateDay: s.workout?.day ?? null,
      scheduledAt: s.scheduledAt, durationMinutes: s.durationMinutes, deliveryMode: s.deliveryMode,
    },
  ];
  if (ctx.repeatLabel) {
    sessions.push({
      id: ctx.repeatLabel.sessionId, clientId: log.client.id, status: 'done',
      dayLabel: ctx.repeatLabel.name, scheduledAt: 0,
    });
  }
  return {
    workouts: [today, ...history.workouts],
    logExercises,
    sets: [...history.sets, ...todaySets],
    exercises: [...names.values()],
    clients: [{ id: log.client.id, name: log.client.name }],
    sessions,
    programs: log.program
      ? [{ id: log.program.id, clientId: log.client.id, name: log.program.name, status: 'active', startDate: null }]
      : [],
    plateStepKg: PLATE_STEP_KG,
  };
}

/* ──────────────────────────────────────────────────────── the view model ── */

function slotRow(base: LogSetRow, wire: SetWire | undefined, doneRow: boolean): LogSetRowX {
  const kinds = wire ?? null;
  const loadKind = kinds?.loadKind ?? 'weight';
  const effortKind = kinds?.effortKind ?? 'reps';
  const target = wire?.target ?? null;
  return {
    ...base,
    planSetId: wire?.id ?? null,
    loadKind,
    effortKind,
    planned: wire?.planned ?? false,
    target,
    loadValue: wire?.loadValue ?? null,
    effortValue: wire?.effortValue ?? null,
    doneAt: wire?.doneAt ?? null,
    said: doneRow && wire
      ? saySetKinds({ loadKind, effortKind, loadValue: wire.loadValue, effortValue: wire.effortValue })
      : '',
    targetSaid: wire ? sayTarget({ loadKind, effortKind, target }) : '',
  };
}

function toX(view: LogExerciseView, wire: ExerciseWire | undefined): LogExerciseViewX {
  const byPosition = new Map((wire?.sets ?? []).map((s) => [s.position, s] as const));
  const first = wire?.sets[0];
  return {
    ...view,
    // The backend names the movement it replaced (3 Oct); the old model's name lookup is the fallback.
    swappedFrom: wire?.swappedFromName ?? view.swappedFrom,
    sets: view.sets.map((row) => {
      const w = byPosition.get(row.number);
      return slotRow(row, w, row.done);
    }),
    sxId: wire?.id ?? '',
    position: wire?.position ?? view.orderIndex,
    section: wire?.section ?? null,
    groupId: wire?.groupId ?? null,
    notes: wire?.notes ?? null,
    removed: wire?.removedAt !== null && wire?.removedAt !== undefined,
    alternatives: wire?.alternatives ?? [],
    best: wire?.best ?? null,
    loadKind: first?.loadKind ?? 'weight',
    effortKind: first?.effortKind ?? 'reps',
  };
}

/**
 * The console's view model — `LogView` as the old `buildLog` returns it, plus the
 * extension fields. Null when the old model finds nothing to draw (never, for a
 * log that exists, but it is the old function's contract).
 */
export function buildConsoleView(log: LogWire, history: HistoryParts, ctx: ViewContext): LogViewX | null {
  const input = logInputFromWire(log, history, ctx);
  const view = buildLog(input, log.session.id, ctx.now);
  if (!view) return null;
  const byExercise = new Map(log.exercises.map((e) => [e.exerciseId, e] as const));
  /* Frame 1a's heading reads `<plan> · Week n`. The old model computed n from the
     program's start date; the new read says which week of the plan THIS session is
     (`workout.week`), which is the same fact without the arithmetic. */
  const week = log.session.workout?.week ?? null;
  const plan = view.planHead && week ? `${view.planHead} · Week ${week}` : view.plan;
  const removed = log.exercises
    .filter((e) => e.removedAt !== null && !e.sets.some((s) => s.doneAt !== null))
    .sort((a, b) => a.position - b.position)
    .map((e) => toX(removedView(e), e));
  const exercises = view.exercises.map((v) => sayByKind(toX(v, byExercise.get(v.exerciseId)), byExercise.get(v.exerciseId), history.items));
  return {
    ...view,
    plan,
    exercises,
    removed,
    totals: log.totals,
    started: log.session.startedAt !== null,
    records: view.records.map((c) => sayCardByKind(c, byExercise.get(c.exerciseId), familyJudged(byExercise.get(c.exerciseId), history, log.session.id))),
    bests: view.bests.map((b) => sayBestByKind(b, byExercise.get(b.exerciseId), history.items, familyJudged(byExercise.get(b.exerciseId), history, log.session.id))),
  };
}

/* ───────────────────────────────────────── the text, said by kind ── */

/** The newest earlier session of one exercise, as its sets in position order — `previousFor`'s source. */
function lastSessionOf(items: HistoryItemWire[], exerciseId: string): { date: string; sets: HistoryItemWire[] } | null {
  let best: { date: string; at: number; id: string } | null = null;
  for (const i of items) {
    if (i.exerciseId !== exerciseId) continue;
    if (best === null || i.date > best.date || (i.date === best.date && i.doneAt > best.at)) best = { date: i.date, at: i.doneAt, id: i.sessionId };
  }
  if (best === null) return null;
  const id = best.id;
  return { date: best.date, sets: items.filter((i) => i.exerciseId === exerciseId && i.sessionId === id).sort((a, b) => a.position - b.position) };
}

const doneSets = (e: ExerciseWire | undefined) => (e?.sets ?? []).filter((x) => x.doneAt !== null);

/**
 * THE ORIGINAL TEXT, KEPT, WHERE IT IS RIGHT — and said by kind where it is not.
 *
 * `buildLog` knows only kilograms and reps, so a plank's last time read `0 reps` and its summary
 * `top 0 reps`. For an exercise whose sets (today's or last time's) are in a kind the old strings
 * cannot say, the four strings that quote a set are rebuilt from the real values with the registry:
 * each row's `previous`, `last`, and the `top` in `summary`. An exercise logged only in weight × reps
 * or bodyweight × reps is returned untouched, so its strings are byte for byte the original.
 * Nothing but text changes: the verdict, the counts and the volume are the old model's.
 */
function sayByKind(view: LogExerciseViewX, wire: ExerciseWire | undefined, items: HistoryItemWire[]): LogExerciseViewX {
  const last = lastSessionOf(items, view.exerciseId);
  const lastExotic = last !== null && hasExotic(last.sets);
  const today = doneSets(wire);
  const todayExotic = hasExotic(today);
  if (!lastExotic && !todayExotic) return view;

  let next = view;
  if (lastExotic && last) {
    const top = topOf(last.sets);
    next = {
      ...next,
      last: top ? `Last: ${shortDate(last.date)} · ${sayOne(top)}` : next.last,
      sets: next.sets.map((row) => {
        const prev = last.sets.find((p) => p.position === row.number) ?? last.sets[last.sets.length - 1];
        return prev ? { ...row, previous: sayOne(prev) } : row;
      }),
    };
  }
  if (todayExotic) {
    const top = topOf(today);
    if (top) next = { ...next, summary: next.summary.replace(/ · top .*$/, ` · top ${sayOne(top)}`) };
  }
  return next;
}

/** A Bests row: the figure and the 'was' quote real values, by kind. The verdict is not touched. */
function sayBestByKind(b: BestRowLike, wire: ExerciseWire | undefined, items: HistoryItemWire[], judged: Judged | null): BestRowLike {
  const today = doneSets(wire);
  // A hold or a carry has its own verdict (`judgeEffort`) and so its own sentences: the original ones
  // say 'kg' and 'reps' and, for `matched`, 'exactly what they did last time' — untrue of 50 s → 1:05.
  const words = judged ? effortBestRow(judged, '') : null;
  if (judged && words) {
    const holder = today.find((x) => x.id === judged.setId) ?? topOf(today);
    return { ...b, ...words, value: holder ? sayOne(holder) : b.value };
  }
  const before = items.filter((i) => i.exerciseId === b.exerciseId);
  if (!hasExotic(today) && !hasExotic(before)) return b;
  const top = topOf(today);
  const was = before.length ? topOf(before) : null;
  return {
    ...b,
    value: top ? sayOne(top) : b.value,
    was: was && /^was /.test(b.was) ? `was ${sayOne(was)}` : b.was,
    // "+2.5 kg" is a statement about kilograms; there is none to make about a hold or a carry.
    delta: hasExotic(today) ? null : b.delta,
  };
}

/** A record card for a movement in exotic kinds quotes the set, not a kilogram figure. */
function sayCardByKind(c: LogView['records'][number], wire: ExerciseWire | undefined, judged: Judged | null): LogView['records'][number] {
  const today = doneSets(wire);
  const holder = judged ? today.find((x) => x.id === judged.setId) ?? topOf(today) : null;
  const words = judged && holder ? effortRecordCard(judged, c.name, sayOne(holder)) : null;
  if (words) return { ...c, ...words };
  if (!hasExotic(today)) return c;
  const top = topOf(today);
  return top ? { ...c, value: sayOne(top), unit: '', reps: null } : c;
}

type BestRowLike = LogView['bests'][number];

/**
 * The verdict `buildLog` reached for an exercise logged as a hold or a carry, run again over the same
 * sets — the numbers (`effort`, `wasEffort`, `by`) the sentences are written from. The very function
 * the old model called, on the very same inputs, so the words cannot disagree with the badge.
 */
function familyJudged(wire: ExerciseWire | undefined, history: HistoryParts, sessionId: string): Judged | null {
  if (!wire) return null;
  const today = setsOnly(wire.sets, wire.exerciseId, sessionId);
  if (!today.some((s) => s.family)) return null;
  return judge(today, history.sets.filter((s) => s.exerciseId === wire.exerciseId), 'reps', PLATE_STEP_KG);
}

/** A removed exercise has no card on the grid; this is just enough of one for the Undo list. */
function removedView(e: ExerciseWire): LogExerciseView {
  return {
    exerciseId: e.exerciseId, name: e.name, logType: exerciseLogType(e), unplanned: e.source === 'added',
    orderIndex: e.position, targetSets: null, targetReps: null, swappedFrom: e.swappedFromName ?? null, swappedFromExerciseId: e.swappedFrom,
    last: '', summary: 'Removed', complete: false, started: false, sets: [], restSeconds: null, volumeKg: 0,
    historySets: 0, historySessions: 0, verdict: 'none',
  };
}

/** The right-hand column of frame 1a: the last four sessions per exercise, judged by the same `judge`. */
export function buildTimelines(log: LogWire, history: HistoryParts, ctx: ViewContext): Record<string, HistorySession[]> {
  const input = logInputFromWire(log, history, ctx);
  const out: Record<string, HistorySession[]> = {};
  // The same id `historyParts` gave each set, so a timeline set can be found again by its raw row.
  const byId = new Map<string, HistoryItemWire>(history.items.map((i) => [`${i.sessionId}:${i.exerciseId}:${i.position}:${i.doneAt}`, i]));
  for (const e of cardRows(log)) {
    out[e.exerciseId] = buildHistory(input, log.client.id, e.exerciseId, ctx.now).sessions.slice(0, 4).map((session) => {
      const raw = session.sets.map((x) => byId.get(x.setId));
      if (!raw.some((r) => r && !isPlain(r))) return session;
      return { ...session, sets: session.sets.map((x, i) => (raw[i] ? { ...x, said: sayOne(raw[i] as HistoryItemWire) } : x)) };
    });
  }
  return out;
}

/**
 * Frame 3a's recents: what was last done on the exercises NOT already on today's
 * card, newest first, eight of them — chosen on numbers, not on a name.
 */
export function buildRecents(
  history: HistoryWire,
  onCard: ReadonlySet<string>,
  exceptSessionId: string,
): { exerciseId: string; name: string; meta: string; isCustom: boolean }[] {
  const last = new Map<string, { date: string; position: number; item: HistoryItemWire }>();
  for (const s of history.items) {
    if (s.sessionId === exceptSessionId || onCard.has(s.exerciseId)) continue;
    const held = last.get(s.exerciseId);
    if (!held || s.date > held.date || (s.date === held.date && s.position >= held.position)) {
      last.set(s.exerciseId, { date: s.date, position: s.position, item: s });
    }
  }
  return [...last]
    .sort((a, b) => (a[1].date < b[1].date ? 1 : -1))
    .slice(0, 8)
    .map(([exerciseId, h]) => {
      const e = history.exercises[exerciseId];
      const kg = loadKg(h.item.loadKind, h.item.loadValue);
      const reps = repsOf(h.item.effortKind, h.item.effortValue);
      // The original strings for the two shapes they knew; the registry's for the rest.
      const said = isPlain(h.item) ? (kg ? `${kg} kg × ${reps ?? 0}` : `${reps ?? 0} reps`) : sayOne(h.item);
      return {
        exerciseId,
        name: e?.name ?? 'Exercise',
        meta: `last: ${said} · ${h.date.split('-').slice(1).reverse().join('/')}`,
        isCustom: e?.custom ?? false,
      };
    });
}

/** The client's most recent session before this one that logged anything — frame 6b's repeat candidate. */
export function lastSessionId(history: HistoryWire, exceptSessionId: string): string | null {
  let best: { id: string; date: string } | null = null;
  for (const s of history.items) {
    if (s.sessionId === exceptSessionId) continue;
    if (!best || s.date > best.date) best = { id: s.sessionId, date: s.date };
  }
  return best?.id ?? null;
}

/* ──────────────────────────────────────────────────────────────── finish ── */

/** The pack the session would come off: the oldest ACTIVE sessions pack with something left — the rule `markDone` charges by. */
export function packFor(
  packages: { basis: string; status: string; sessionsRemaining: number | null; sessionsTotal: number | null; createdAt: number }[],
): { remaining: number; total: number } | null {
  const row = packages
    .filter((p) => p.basis === 'sessions' && p.status === 'active' && (p.sessionsRemaining ?? 0) > 0 && (p.sessionsTotal ?? 0) > 0)
    .sort((a, b) => a.createdAt - b.createdAt)[0];
  return row ? { remaining: row.sessionsRemaining as number, total: row.sessionsTotal as number } : null;
}

/** Frame 5b, through the old `buildFinish` so every sentence is the old sentence. */
export function buildFinishView(
  view: LogViewX,
  session: SessionRowWire,
  pack: { remaining: number; total: number } | null,
): FinishView {
  const stub: LogInput = {
    workouts: [], logExercises: [], sets: [], exercises: [], clients: [], programs: [],
    plateStepKg: PLATE_STEP_KG,
    sessions: [{
      id: session.id, clientId: session.clientId, status: session.status,
      dayLabel: session.workout?.name ?? null, templateDay: session.workout?.day ?? null,
      scheduledAt: session.scheduledAt, durationMinutes: session.durationMinutes, deliveryMode: session.deliveryMode,
    }],
  };
  return buildFinish(stub, view as unknown as LogView, pack);
}

/* ───────────────────────────────────────────────────────────────── picker ── */

const hhmm = (at: number) => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * Frame 5a through the old rows. Each open log carries how far it is (`setsDone`,
 * `volumeKg`), so the *Carry on* row still says `4 sets in · 1,200 kg` without a
 * read per row.
 */
export function buildPickView(pick: PickWire): PickView {
  const spoken = new Set<string>();
  const open: PickRow[] = [...pick.open]
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((o) => {
      spoken.add(o.clientId);
      const sets = o.setsDone;
      return {
        clientId: o.clientId,
        name: o.clientName.trim() || 'Client',
        meta: sets
          ? `${sets} set${sets === 1 ? '' : 's'} in · ${Math.round(o.volumeKg).toLocaleString('en-IN')} kg`
          : `Started ${shortDate(isoDay(o.startedAt))} · nothing logged`,
        href: `/sessions/${o.sessionId}/log`,
        verb: 'Carry on',
        sessionId: o.sessionId,
      };
    });
  const booked: PickRow[] = [...pick.booked]
    .filter((b) => !spoken.has(b.clientId))
    .sort((a, b) => a.scheduledAt - b.scheduledAt)
    .map((b) => {
      spoken.add(b.clientId);
      return {
        clientId: b.clientId,
        name: b.clientName.trim() || 'Client',
        meta: `${hhmm(b.scheduledAt)}${b.workoutName ? ` · ${b.workoutName}` : ''}`,
        href: `/sessions/${b.sessionId}/log`,
        verb: 'Start',
        sessionId: b.sessionId,
      };
    });
  const everybody: PickRow[] = pick.everybody
    .filter((c) => !spoken.has(c.clientId))
    .sort((a, b) => {
      const da = a.lastDoneAt ?? 0;
      const db = b.lastDoneAt ?? 0;
      if (da !== db) return db - da;
      return a.clientName.localeCompare(b.clientName);
    })
    .map((c) => ({
      clientId: c.clientId,
      name: c.clientName.trim() || 'Client',
      meta: c.lastDoneAt ? `Last trained ${shortDate(isoDay(c.lastDoneAt))}` : 'Never logged',
      href: `/sessions/new?clientId=${c.clientId}`,
      verb: 'Log',
      sessionId: null,
    }));
  return { open, booked, everybody };
}

/* ──────────────────────────────────────────── merging a write into the log ── */

function replaceExercise(log: LogWire, sxId: string | null, change: (e: ExerciseWire) => ExerciseWire): LogWire {
  return { ...log, exercises: log.exercises.map((e) => (e.id === sxId ? change(e) : e)) };
}

function exerciseOfSet(log: LogWire, setId: string | null): ExerciseWire | undefined {
  // A preview row has no id: nothing can have been written against it.
  if (setId === null) return undefined;
  return log.exercises.find((e) => e.sets.some((s) => s.id === setId));
}

/** A tap, a correction or a skip came back: swap the row in, take the server's totals. No re-read. */
export function applySetWrite(log: LogWire, write: SetWriteWire): LogWire {
  const owner = exerciseOfSet(log, write.set.id);
  if (!owner) return { ...log, totals: write.totals };
  return {
    ...replaceExercise(log, owner.id, (e) => ({ ...e, sets: e.sets.map((s) => (s.id === write.set.id ? write.set : s)) })),
    totals: write.totals,
  };
}

/** An extra set was added to `sxId`, at its position. */
export function applySetAdded(log: LogWire, sxId: string, added: SetAddedWire): LogWire {
  return {
    ...replaceExercise(log, sxId, (e) => ({
      ...e,
      sets: [...e.sets.filter((s) => s.id !== added.set.id), added.set].sort((a, b) => a.position - b.position),
    })),
    totals: added.totals,
  };
}

/** An extra set was deleted. */
export function applySetDeleted(log: LogWire, setId: string, deleted: SetDeletedWire): LogWire {
  const owner = exerciseOfSet(log, setId);
  if (!owner) return { ...log, totals: deleted.totals };
  return {
    ...replaceExercise(log, owner.id, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) })),
    totals: deleted.totals,
  };
}

/**
 * An exercise entry came back whole (add, swap, remove/undo, note, rest). It
 * replaces the row with the same id, or is inserted by position when it is new.
 * Totals are recomputed from the sets, because these writes answer the entry and
 * not the aggregate.
 */
export function applyExercise(log: LogWire, entry: ExerciseWire): LogWire {
  const has = log.exercises.some((e) => e.id === entry.id);
  const next = has
    ? log.exercises.map((e) => (e.id === entry.id ? entry : e))
    : [...log.exercises, entry].sort((a, b) => a.position - b.position);
  return { ...log, exercises: next, totals: totalsOf(next) };
}

/** Totals from the sets, by the server's definitions (see `kinds.ts`): live exercises only. */
export function totalsOf(exercises: ExerciseWire[]): TotalsWire {
  let setsDone = 0;
  let setsPlanned = 0;
  let volumeKg = 0;
  for (const e of exercises) {
    if (e.removedAt !== null) continue;
    for (const s of e.sets) {
      if (s.planned) setsPlanned += 1;
      if (s.doneAt !== null) {
        setsDone += 1;
        if (s.loadKind === 'weight' && s.effortKind === 'reps') volumeKg += (s.loadValue ?? 0) * (s.effortValue ?? 0);
      }
    }
  }
  return { setsDone, setsPlanned, volumeKg };
}

/** The first set not yet done, in the order the trainer works through the card — what *next* focuses. */
export function nextUndoneSet(log: LogWire): { sxId: string; setId: string; exerciseId: string; position: number } | null {
  for (const e of [...log.exercises].filter((x) => x.removedAt === null).sort((a, b) => a.position - b.position)) {
    const s = [...e.sets].sort((a, b) => a.position - b.position).find((x) => x.planned && x.doneAt === null);
    // Before start there are no ids to focus: the plan preview has no "next set".
    if (s && e.id !== null && s.id !== null) return { sxId: e.id, setId: s.id, exerciseId: e.exerciseId, position: s.position };
  }
  return null;
}

/** `3 of 4 planned sets` — and how many extras ride on top. A skipped set stays planned and not done, so the count stays honest. */
export function planCounts(e: ExerciseWire): { planned: number; plannedDone: number; extras: number; extrasDone: number } {
  const planned = e.sets.filter((s) => s.planned);
  const extras = e.sets.filter((s) => !s.planned);
  return {
    planned: planned.length,
    plannedDone: planned.filter((s) => s.doneAt !== null).length,
    extras: extras.length,
    extrasDone: extras.filter((s) => s.doneAt !== null).length,
  };
}

export interface SectionGroup {
  /** The plan's section heading ("Warm-up", "Main"), or null for exercises without one. */
  section: string | null;
  /** Consecutive exercises sharing a `groupId` are one superset; a lone exercise is a group of one. */
  groups: { groupId: string | null; exercises: ExerciseWire[] }[];
}

/**
 * The card list as the plan wrote it: sections, and inside them supersets. Order
 * is `position`; a section or group is a run of neighbours, never a re-sort, so
 * the trainer's order survives. Removed exercises are left out.
 */
export function groupExercises(log: LogWire): SectionGroup[] {
  const out: SectionGroup[] = [];
  for (const e of [...log.exercises].filter((x) => x.removedAt === null).sort((a, b) => a.position - b.position)) {
    let section = out[out.length - 1];
    if (!section || section.section !== e.section) {
      section = { section: e.section, groups: [] };
      out.push(section);
    }
    const group = section.groups[section.groups.length - 1];
    if (group && e.groupId !== null && group.groupId === e.groupId) group.exercises.push(e);
    else section.groups.push({ groupId: e.groupId, exercises: [e] });
  }
  return out;
}

/** `volumeOf`/`trim1` re-exported so a screen reaches the old formatting through one import. */
export { trim1, volumeOf };
