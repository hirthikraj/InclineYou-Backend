/**
 * The workout log — screen 17, derived from local tables. Pure: rows and `now`
 * come in, nothing here reads the database or the clock.
 *
 * ── The two things this file exists to compute ────────────────────────────
 *
 * **Previous.** Every row in the set table carries what this client lifted on
 * this exercise, at this set number, the last time they did it. §09 makes it the
 * one thing on the screen that may never collapse, truncate or hide: it is the
 * entire advantage over the notebook this app replaces, and a trainer who can
 * see last Monday does not have to remember it.
 *
 * **The record.** Computed here, every read, and never stored — §09 again, and
 * it is the rule with the longest reach. Correct a set from November and every
 * record that depended on it fixes itself in the same frame. Strava is the only
 * platform in the teardown that got this right; it is the one idea worth taking
 * from it, and there is no `savePr` anywhere in this codebase.
 *
 * ── The threshold, which is the whole design of the record ────────────────
 *
 * Gold is cheap to hand out and worthless once it is. Three tests, all of them
 * here in `judge`:
 *
 *   1. There has to be an earlier session. **A first log is never a record** —
 *      it is the number to beat, not a number beaten.
 *   2. It has to beat the old number. **Matching is not beating.**
 *   3. **Only the top set is checked**, so a warm-up can never make one.
 *
 * And then one more, which decides whether the client's phone buzzes rather than
 * whether the record is real: a record is announced when the client moved a
 * heavier load than they ever have, and kept quiet when it is more reps at a
 * weight they had already lifted. Both go in her history. Only the first is
 * worth a message, because a trainer who forwards five records a week has taught
 * a client that records mean nothing.
 */

/* ------------------------------------------------------------------- input */

export interface LogExerciseRow {
  id: string;
  workoutSessionId: string;
  exerciseId: string;
  orderIndex: number;
  source: string;
  swappedFromExerciseId?: string | null;
  targetSets?: number | null;
  targetReps?: number | null;
  restSeconds?: number | null;
  /** Epoch ms, or null when it is still in today. */
  removedAt?: number | null;
}

export interface LogSet {
  id: string;
  workoutSessionId: string;
  exerciseId: string;
  setNumber: number;
  loadKg?: number | null;
  reps?: number | null;
  rpe?: number | null;
  notes?: string | null;
  /** Epoch ms. Rest is counted from this, so the clock survives a locked phone. */
  createdAt: number;
  /** On this phone and not yet on the server. The only thing sync gets to say. */
  pending: boolean;
}

export interface LogWorkout {
  id: string;
  clientId: string;
  programId?: string | null;
  scheduledSessionId?: string | null;
  /** 'YYYY-MM-DD'. */
  sessionDate: string;
  startedAt: number;
  endedAt?: number | null;
}

export interface LogScheduled {
  id: string;
  clientId: string;
  programId?: string | null;
  status: string;
  dayLabel?: string | null;
  templateDay?: number | null;
  scheduledAt: number;
  /** FR-11 — the client's screens say "60 minutes" and "Floor" out loud. */
  durationMinutes?: number | null;
  deliveryMode?: string | null;
  /** V14 — what the time was before the trainer moved it, for the struck-through line. */
  movedFromAt?: number | null;
  /** V14 — the client's one-tap confirm. Not a fifth status. */
  clientConfirmedAt?: number | null;
}

export interface LogExercise {
  id: string;
  name: string;
  logType?: string | null;
  /** A movement the trainer invented. The one they will hunt for hardest. */
  isCustom?: boolean;
}

export interface LogProgram {
  id: string;
  clientId: string;
  templateId?: string | null;
  name: string;
  status: string;
  startDate?: string | null;
}

export interface LogTemplate {
  id: string;
  name: string;
  weeks?: number | null;
}

export interface LogMetric {
  clientId: string;
  metricType: string;
  value: number;
  unit: string;
  recordedAt: number;
}

export interface LogInput {
  workouts: LogWorkout[];
  logExercises: LogExerciseRow[];
  sets: LogSet[];
  exercises: LogExercise[];
  clients: { id: string; name: string }[];
  sessions: LogScheduled[];
  programs: LogProgram[];
  templates: LogTemplate[];
  metrics: LogMetric[];
  /** The gym's smallest plate. Decides what counts as beating a number. */
  plateStepKg: number;
}

export const EMPTY_LOG_INPUT: LogInput = {
  workouts: [],
  logExercises: [],
  sets: [],
  exercises: [],
  clients: [],
  sessions: [],
  programs: [],
  templates: [],
  metrics: [],
  plateStepKg: 2.5,
};

/* ------------------------------------------------------------------ output */

export type LogType = 'weight_reps' | 'reps';

export interface LogSetRow {
  /** The slot. Stable across an un-tick, which is why it is not an index. */
  number: number;
  /** Null when nothing is logged in this slot. */
  setId: string | null;
  /** "52.5 kg × 8", or null the first time this client ever does this. */
  previous: string | null;
  previousLoad: number | null;
  previousReps: number | null;
  /** What is in the row. Empty strings when nothing is logged. */
  load: string;
  reps: string;
  rpe: number | null;
  note: string | null;
  done: boolean;
  /** Written here, not yet on the server. An amber ring, and nothing else. */
  queued: boolean;
  /** This set holds the record. Gold on the set number. */
  pr: boolean;
}

export interface LogExerciseView {
  /** The `workout_exercises` row id — what every write on this card takes. */
  id: string;
  exerciseId: string;
  name: string;
  logType: LogType;
  unplanned: boolean;
  /** The name of what this replaced, when it replaced something. */
  swappedFrom: string | null;
  /** "Last: 3 Aug · 52.5 kg × 8", or "Never logged with Meera". */
  last: string;
  /** The two-line figure on a collapsed row: "3/3 sets" or "3 × 10 planned". */
  value: { top: string; bottom: string };
  /** "Top set 47.5 kg × 8" — what the collapsed row says it did. */
  summary: string;
  /** Every planned slot has a tick in it. */
  complete: boolean;
  /** Any set logged at all. Drives the ok spine on a collapsed row. */
  started: boolean;
  /** Anything on this card still waiting to reach the server. */
  queued: boolean;
  sets: LogSetRow[];
  /** Resolved for today: the card's own value, else the plan's. */
  restSeconds: number | null;
  removed: boolean;
  volumeKg: number;
}

/** What today's top set did to the client's history on that exercise. */
export type Verdict = 'record' | 'quiet' | 'matched' | 'first' | 'none';

export interface BestRow {
  exerciseId: string;
  name: string;
  verdict: Verdict;
  /** "55 kg × 8 · beat 52.5 kg" — the whole sentence, on one line. */
  detail: string;
  /** The set that did it. */
  setId: string | null;
}

export interface PrCard {
  exerciseId: string;
  name: string;
  setId: string;
  /** "Set 3". */
  setLabel: string;
  /** The new number, big. */
  value: string;
  unit: string;
  /** "was 52.5 kg". */
  was: string;
  /** "+2.5". */
  delta: string;
  /** The sentence under it, which is why the number means something. */
  why: string;
  /** Gold and loud, or gold and quiet. */
  announced: boolean;
}

export interface LogView {
  workoutId: string;
  clientId: string;
  clientName: string;
  /** "Full Body B · Week 4 of 8", or null when nobody has a plan. */
  plan: string | null;
  programId: string | null;
  scheduledId: string | null;
  startedAt: number;
  endedAt: number | null;
  exercises: LogExerciseView[];
  /** Swiped out of today. Kept so the toast can put one back. */
  removed: LogExerciseView[];
  /** "2 of 6 · 5 sets". */
  stick: string;
  setsLogged: number;
  volumeKg: number;
  /** Every record today, loud ones first. */
  records: PrCard[];
  /** Everything checked, including what did not make it. Screen 4b. */
  bests: BestRow[];
  /** Nothing planned and nothing added. Screen 6c. */
  emptyPlan: boolean;
  /** 6c's "Repeat 31 July". */
  repeat: { workoutId: string; date: string; label: string; meta: string } | null;
  /** 6c's nine-day fact, stated and not editorialised. */
  quiet: string | null;
}

/* ------------------------------------------------------------------ shared */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' → "9 Aug". Parsed by field: `Date` would time-zone it. */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]}`;
}

/** 92.5 stays 92.5; 90.0 becomes 90. Nobody writes "90.0 kg" on a whiteboard. */
export function trim1(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** "52.5 kg × 8", or "8 reps" for an exercise that carries no load. */
function saySet(load: number | null | undefined, reps: number | null | undefined, logType: LogType): string {
  if (logType === 'reps') return `${reps ?? 0} reps`;
  if (load == null || load <= 0) return `${reps ?? 0} reps`;
  return `${trim1(load)} kg × ${reps ?? 0}`;
}

/** Local 'YYYY-MM-DD'. `toISOString` would move an evening session a day back. */
export function isoDay(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00`);
  const b = Date.parse(`${toIso}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

const DEAD_PROGRAM = new Set(['cancelled', 'canceled', 'completed', 'archived']);

function readLogType(raw: string | null | undefined): LogType {
  return raw === 'reps' ? 'reps' : 'weight_reps';
}

/** Volume is load × reps, added up. The one figure on this screen that is a sum. */
function volumeOf(sets: { loadKg?: number | null; reps?: number | null }[]): number {
  return Math.round(sets.reduce((sum, s) => sum + (s.loadKg ?? 0) * (s.reps ?? 0), 0));
}

/**
 * The best set in a list: heaviest, and on a tie the one that got more reps.
 *
 * "Best" has two defensible meanings — heaviest, and most total weight moved.
 * This one is heaviest, because it is the set a record is judged on and a coach
 * saying "her best set" at the rack means the heaviest one.
 */
function topSet<T extends { loadKg?: number | null; reps?: number | null }>(
  sets: T[],
  logType: LogType,
): T | null {
  if (!sets.length) return null;
  return sets.reduce((best, s) => {
    if (logType === 'reps') return (s.reps ?? 0) > (best.reps ?? 0) ? s : best;
    const a = s.loadKg ?? 0;
    const b = best.loadKg ?? 0;
    if (a !== b) return a > b ? s : best;
    return (s.reps ?? 0) > (best.reps ?? 0) ? s : best;
  });
}

/* -------------------------------------------------------------- 1a · the log */

interface Indexed {
  workout: LogWorkout;
  /** This client's sets, by exercise, from every session except this one. */
  historyByExercise: Map<string, LogSet[]>;
  /** This log's sets, by exercise. */
  todayByExercise: Map<string, LogSet[]>;
  /** The most recent earlier session per exercise, as its sets in order. */
  lastSessionByExercise: Map<string, { date: string; sets: LogSet[] }>;
  exerciseById: Map<string, LogExercise>;
}

function index(input: LogInput, workout: LogWorkout): Indexed {
  const exerciseById = new Map(input.exercises.map((e) => [e.id, e] as const));

  // Only this client's history. A trainer next to Meera wants Meera's numbers,
  // and a record against "the gym" would be meaningless on a shared library.
  const mine = new Set(
    input.workouts.filter((w) => w.clientId === workout.clientId).map((w) => w.id),
  );
  const dateOf = new Map(input.workouts.map((w) => [w.id, w.sessionDate] as const));

  const historyByExercise = new Map<string, LogSet[]>();
  const todayByExercise = new Map<string, LogSet[]>();
  const perSession = new Map<string, Map<string, LogSet[]>>();

  for (const s of input.sets) {
    if (!mine.has(s.workoutSessionId)) continue;

    if (s.workoutSessionId === workout.id) {
      const list = todayByExercise.get(s.exerciseId);
      if (list) list.push(s);
      else todayByExercise.set(s.exerciseId, [s]);
      continue;
    }

    // Same day, different log: still earlier work, not today's row. It counts
    // as history so a second session on one day cannot beat itself.
    const list = historyByExercise.get(s.exerciseId);
    if (list) list.push(s);
    else historyByExercise.set(s.exerciseId, [s]);

    const bucket = perSession.get(s.exerciseId) ?? new Map<string, LogSet[]>();
    const inSession = bucket.get(s.workoutSessionId);
    if (inSession) inSession.push(s);
    else bucket.set(s.workoutSessionId, [s]);
    perSession.set(s.exerciseId, bucket);
  }

  todayByExercise.forEach((list) => list.sort((a, b) => a.setNumber - b.setNumber));

  // The last time she did it: the latest dated session, and on a tie the one
  // whose sets were written most recently.
  const lastSessionByExercise = new Map<string, { date: string; sets: LogSet[] }>();
  perSession.forEach((bucket, exerciseId) => {
    let bestId: string | null = null;
    let bestDate = '';
    let bestAt = -1;
    bucket.forEach((sets, sessionId) => {
      const date = dateOf.get(sessionId) ?? '';
      const at = sets.reduce((max, s) => Math.max(max, s.createdAt), 0);
      if (date > bestDate || (date === bestDate && at > bestAt)) {
        bestId = sessionId;
        bestDate = date;
        bestAt = at;
      }
    });
    if (bestId) {
      lastSessionByExercise.set(exerciseId, {
        date: bestDate,
        sets: [...(bucket.get(bestId) ?? [])].sort((a, b) => a.setNumber - b.setNumber),
      });
    }
  });

  return { workout, historyByExercise, todayByExercise, lastSessionByExercise, exerciseById };
}

/**
 * What the header says the session is: the program, and where in it.
 *
 * The week is counted from the program's start date, because a program that has
 * been running four weeks is four weeks in whatever the template says. Null when
 * the client has no live program — 6c, which is the likeliest first screen a new
 * trainer ever sees.
 */
function planLine(input: LogInput, workout: LogWorkout, todayIso: string): string | null {
  const program = workout.programId
    ? input.programs.find((p) => p.id === workout.programId)
    : input.programs.find(
        (p) => p.clientId === workout.clientId && !DEAD_PROGRAM.has(p.status.toLowerCase()),
      );
  if (!program) return null;

  const scheduled = workout.scheduledSessionId
    ? input.sessions.find((s) => s.id === workout.scheduledSessionId)
    : undefined;
  const template = program.templateId
    ? input.templates.find((t) => t.id === program.templateId)
    : undefined;

  // The day's own name where the booking carries one — "Full Body B" is more use
  // at the rack than the program's name.
  const head = scheduled?.dayLabel?.trim() || template?.name || program.name;

  const weeks = template?.weeks ?? null;
  if (program.startDate) {
    const elapsed = daysBetween(program.startDate, todayIso);
    if (elapsed >= 0) {
      const week = Math.floor(elapsed / 7) + 1;
      if (!weeks || weeks <= 0) return `${head} · Week ${week}`;
      // "Week 5 of 4" is nonsense, and a program outrunning its own length is
      // ordinary — a block gets extended, a client misses a fortnight. Say which
      // week it is and that the plan has run out, rather than a fraction that
      // cannot be true.
      return week <= weeks
        ? `${head} · Week ${week} of ${weeks}`
        : `${head} · Week ${week}, past the ${weeks} planned`;
    }
  }
  return weeks && weeks > 0 ? `${head} · ${weeks} weeks` : head;
}

/**
 * The whole floor screen.
 *
 * Returns null when the workout is not on this phone, which the screen says out
 * loud rather than drawing an empty session.
 */
export function buildLog(input: LogInput, workoutId: string, now: number): LogView | null {
  const workout = input.workouts.find((w) => w.id === workoutId);
  if (!workout) return null;

  const idx = index(input, workout);
  const clientName =
    input.clients.find((c) => c.id === workout.clientId)?.name?.trim() || 'Client';

  const rows = input.logExercises
    .filter((r) => r.workoutSessionId === workoutId)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const judged = new Map<string, Judged>();
  const views = rows.map((row) => {
    const view = buildExerciseView(input, idx, row, clientName, judged);
    return view;
  });

  const live = views.filter((v) => !v.removed);
  const removed = views.filter((v) => v.removed);

  const todaySets = live.flatMap((v) => v.sets.filter((s) => s.done));
  const volume = live.reduce((sum, v) => sum + v.volumeKg, 0);
  const complete = live.filter((v) => v.complete).length;

  const records = live
    .map((v) => prCard(v, judged.get(v.exerciseId)))
    .filter((c): c is PrCard => c !== null)
    .sort((a, b) => Number(b.announced) - Number(a.announced));

  const bests = live
    .map((v) => bestRow(v, judged.get(v.exerciseId)))
    .filter((b): b is BestRow => b !== null);

  return {
    workoutId,
    clientId: workout.clientId,
    clientName,
    plan: planLine(input, workout, workout.sessionDate),
    programId: workout.programId ?? null,
    scheduledId: workout.scheduledSessionId ?? null,
    startedAt: workout.startedAt,
    endedAt: workout.endedAt ?? null,
    exercises: live,
    removed,
    stick: `${complete} of ${live.length} · ${todaySets.length} set${todaySets.length === 1 ? '' : 's'}`,
    setsLogged: todaySets.length,
    volumeKg: volume,
    records,
    bests,
    emptyPlan: live.length === 0,
    repeat: lastWholeSession(input, idx, workout),
    quiet: quietLine(input, workout, now),
  };
}

function buildExerciseView(
  input: LogInput,
  idx: Indexed,
  row: LogExerciseRow,
  clientName: string,
  judged: Map<string, Judged>,
): LogExerciseView {
  const exercise = idx.exerciseById.get(row.exerciseId);
  const logType = readLogType(exercise?.logType);
  const name = exercise?.name ?? 'An exercise not on this phone yet';

  const today = idx.todayByExercise.get(row.exerciseId) ?? [];
  const last = idx.lastSessionByExercise.get(row.exerciseId) ?? null;
  const history = idx.historyByExercise.get(row.exerciseId) ?? [];

  const verdict = judge(today, history, logType, input.plateStepKg);
  judged.set(row.exerciseId, verdict);

  // Slots: what was asked for, or how far the trainer has already got, whichever
  // is further. An un-ticked set leaves its slot behind, which is the difference
  // between un-ticking and deleting.
  const highest = today.reduce((max, s) => Math.max(max, s.setNumber), 0);
  const slots = Math.max(row.targetSets ?? 0, highest);

  const byNumber = new Map(today.map((s) => [s.setNumber, s] as const));

  const sets: LogSetRow[] = [];
  for (let n = 1; n <= slots; n += 1) {
    const set = byNumber.get(n) ?? null;
    const prev = previousFor(last, n);
    sets.push({
      number: n,
      setId: set?.id ?? null,
      previous: prev ? saySet(prev.loadKg, prev.reps, logType) : null,
      previousLoad: prev?.loadKg ?? null,
      previousReps: prev?.reps ?? null,
      load: set?.loadKg != null ? trim1(set.loadKg) : '',
      reps: set?.reps != null ? String(set.reps) : '',
      rpe: set?.rpe ?? null,
      note: set?.notes?.trim() || null,
      done: set !== null,
      queued: set?.pending ?? false,
      pr: verdict.kind !== 'none' && verdict.kind !== 'matched' && verdict.setId === set?.id,
    });
  }

  const top = topSet(today, logType);
  const swappedFrom = row.swappedFromExerciseId
    ? idx.exerciseById.get(row.swappedFromExerciseId)?.name ?? null
    : null;

  return {
    id: row.id,
    exerciseId: row.exerciseId,
    name,
    logType,
    unplanned: row.source === 'unplanned',
    swappedFrom,
    last: last
      ? `Last: ${shortDate(last.date)} · ${saySet(topSet(last.sets, logType)?.loadKg, topSet(last.sets, logType)?.reps, logType)}`
      : `Never logged with ${clientName.split(' ')[0]}`,
    value: today.length
      ? { top: `${today.length}/${Math.max(slots, today.length)}`, bottom: 'sets' }
      : {
          top: row.targetSets && row.targetReps
            ? `${row.targetSets} × ${row.targetReps}`
            : row.targetSets
              ? `${row.targetSets} sets`
              : '—',
          bottom: 'planned',
        },
    summary: top ? `Top set ${saySet(top.loadKg, top.reps, logType)}` : 'Nothing logged yet',
    complete: slots > 0 && today.length >= slots,
    started: today.length > 0,
    queued: today.some((s) => s.pending),
    sets,
    restSeconds: row.restSeconds ?? null,
    removed: row.removedAt != null,
    volumeKg: volumeOf(today),
  };
}

/**
 * Last time's numbers for one slot.
 *
 * Set 3 against set 3, which is what a trainer is comparing. If last time was
 * shorter, the last set she did stands in — better the nearest true number than
 * a blank, and it is still a number she lifted.
 */
function previousFor(
  last: { date: string; sets: LogSet[] } | null,
  slot: number,
): LogSet | null {
  if (!last || !last.sets.length) return null;
  return last.sets.find((s) => s.setNumber === slot) ?? last.sets[last.sets.length - 1];
}

/* ---------------------------------------------------------- 4a · the record */

interface Judged {
  kind: Verdict;
  setId: string | null;
  /** What was beaten. */
  wasLoad: number | null;
  wasReps: number | null;
  load: number | null;
  reps: number | null;
  /** Numeric improvement, in kg for a record and in reps for a quiet one. */
  by: number;
  /** How many earlier sessions this exercise has, for the "third running" line. */
  streak: number;
}

const NOTHING: Judged = {
  kind: 'none', setId: null, wasLoad: null, wasReps: null, load: null, reps: null, by: 0, streak: 0,
};

/**
 * Today's top set against everything before it.
 *
 * The three tests are in order and each one can end it. See the header of this
 * file for why they are the tests.
 */
function judge(today: LogSet[], history: LogSet[], logType: LogType, plateStep: number): Judged {
  const top = topSet(today, logType);
  if (!top) return NOTHING;

  // Test 1 — you cannot beat nothing.
  if (!history.length) {
    return { ...NOTHING, kind: 'first', setId: top.id, load: top.loadKg ?? null, reps: top.reps ?? null };
  }

  const streak = history.length;

  if (logType === 'reps') {
    const best = history.reduce((max, s) => Math.max(max, s.reps ?? 0), 0);
    const reps = top.reps ?? 0;
    if (reps > best) {
      return { kind: 'record', setId: top.id, wasLoad: null, wasReps: best, load: null, reps, by: reps - best, streak };
    }
    if (reps === best) {
      return { ...NOTHING, kind: 'matched', setId: top.id, wasReps: best, reps, streak };
    }
    return NOTHING;
  }

  const bestLoad = history.reduce((max, s) => Math.max(max, s.loadKg ?? 0), 0);
  const load = top.loadKg ?? 0;
  const reps = top.reps ?? 0;

  if (load > bestLoad) {
    // Heavier than she has ever lifted. Gold, and loud enough to send — unless
    // the jump is smaller than the smallest plate in the room, which is not a
    // session's worth of progress, it is a typo or a fractional plate.
    const by = load - bestLoad;
    return {
      kind: by + 1e-9 >= plateStep ? 'record' : 'quiet',
      setId: top.id,
      wasLoad: bestLoad,
      wasReps: history.filter((s) => (s.loadKg ?? 0) === bestLoad).reduce((m, s) => Math.max(m, s.reps ?? 0), 0),
      load,
      reps,
      by,
      streak,
    };
  }

  if (load === bestLoad) {
    const bestReps = history
      .filter((s) => (s.loadKg ?? 0) === load)
      .reduce((max, s) => Math.max(max, s.reps ?? 0), 0);
    // Test 2 — matching is not beating.
    if (reps > bestReps) {
      // A real record, and a small one: one more rep at a weight she had already
      // lifted. Kept in her history, kept off her phone.
      return { kind: 'quiet', setId: top.id, wasLoad: load, wasReps: bestReps, load, reps, by: reps - bestReps, streak };
    }
    if (reps === bestReps) {
      return { ...NOTHING, kind: 'matched', setId: top.id, wasLoad: load, wasReps: bestReps, load, reps, streak };
    }
  }

  return NOTHING;
}

function prCard(view: LogExerciseView, verdict: Judged | undefined): PrCard | null {
  if (!verdict || (verdict.kind !== 'record' && verdict.kind !== 'quiet')) return null;
  if (!verdict.setId) return null;

  const set = view.sets.find((s) => s.setId === verdict.setId);
  const setLabel = set ? `Set ${set.number}` : 'Top set';
  const announced = verdict.kind === 'record';

  if (view.logType === 'reps' || verdict.wasLoad === null) {
    return {
      exerciseId: view.exerciseId,
      name: view.name,
      setId: verdict.setId,
      setLabel,
      value: String(verdict.reps ?? 0),
      unit: 'reps',
      was: `was ${verdict.wasReps ?? 0}`,
      delta: `+${verdict.by} rep${verdict.by === 1 ? '' : 's'}`,
      why: `Most reps she has logged on the ${view.name.toLowerCase()}.`,
      announced,
    };
  }

  // A heavier load, or the same load for more reps. Two different sentences,
  // because "+1 rep" and "+2.5 kg" are two different pieces of news.
  const heavier = (verdict.load ?? 0) > (verdict.wasLoad ?? 0);

  return {
    exerciseId: view.exerciseId,
    name: view.name,
    setId: verdict.setId,
    setLabel,
    value: heavier ? trim1(verdict.load ?? 0) : String(verdict.reps ?? 0),
    unit: heavier ? 'kg' : 'reps',
    was: heavier
      ? `was ${trim1(verdict.wasLoad ?? 0)} kg`
      : `was ${verdict.wasReps ?? 0} at ${trim1(verdict.wasLoad ?? 0)} kg`,
    delta: heavier ? `+${trim1(verdict.by)}` : `+${verdict.by} rep${verdict.by === 1 ? '' : 's'}`,
    why: heavier
      ? `Heaviest set she has logged on the ${view.name.toLowerCase()}, at ${verdict.reps ?? 0} reps.`
      : `A real record, and a small one: ${verdict.by} more rep${verdict.by === 1 ? '' : 's'} at a weight she had already lifted.`,
    announced,
  };
}

function bestRow(view: LogExerciseView, verdict: Judged | undefined): BestRow | null {
  if (!verdict || verdict.kind === 'none') return null;

  const detail = (() => {
    switch (verdict.kind) {
      case 'record':
      case 'quiet':
        return verdict.wasLoad !== null && (verdict.load ?? 0) > verdict.wasLoad
          ? `${saySet(verdict.load, verdict.reps, view.logType)} · beat ${trim1(verdict.wasLoad)} kg`
          : `${saySet(verdict.load, verdict.reps, view.logType)} · was ${verdict.wasReps ?? 0} reps`;
      case 'matched':
        return `${saySet(verdict.load, verdict.reps, view.logType)} · matched, not beaten`;
      default:
        return 'First time she has logged it';
    }
  })();

  return { exerciseId: view.exerciseId, name: view.name, verdict: verdict.kind, detail, setId: verdict.setId };
}

/* -------------------------------------------------------- 6c · no plan yet */

/** The last whole session this client did, as something to repeat. */
function lastWholeSession(
  input: LogInput,
  idx: Indexed,
  workout: LogWorkout,
): LogView['repeat'] {
  const mine = input.workouts
    .filter((w) => w.clientId === workout.clientId && w.id !== workout.id)
    .sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : a.sessionDate > b.sessionDate ? -1 : 0));

  for (const candidate of mine) {
    const sets = input.sets.filter((s) => s.workoutSessionId === candidate.id);
    if (!sets.length) continue;
    const exercises = new Set(sets.map((s) => s.exerciseId));
    const scheduled = candidate.scheduledSessionId
      ? input.sessions.find((s) => s.id === candidate.scheduledSessionId)
      : undefined;
    const label = scheduled?.dayLabel?.trim() || 'That session';
    return {
      workoutId: candidate.id,
      date: candidate.sessionDate,
      label: `Repeat ${shortDate(candidate.sessionDate)}`,
      meta: `${label} · ${exercises.size} exercise${exercises.size === 1 ? '' : 's'}, ${sets.length} set${sets.length === 1 ? '' : 's'}`,
    };
  }
  return null;
}

/** "No workout logged in 9 days." Stated, not editorialised. */
function quietLine(input: LogInput, workout: LogWorkout, now: number): string | null {
  const withSets = new Set(input.sets.map((s) => s.workoutSessionId));
  const previous = input.workouts
    .filter((w) => w.clientId === workout.clientId && w.id !== workout.id && withSets.has(w.id))
    .map((w) => w.sessionDate)
    .sort();

  const last = previous[previous.length - 1];
  if (!last) return null;

  const days = daysBetween(last, isoDay(now));
  if (days < 7) return null;
  return `No workout logged in ${days} days. The last one was ${shortDate(last)}.`;
}

/* -------------------------------------------------------- 6b · the summary */

export interface FinishView {
  clientName: string;
  /** "Full Body B, logged". */
  title: string;
  /** "Week 4 of 8 · six exercises planned, seven done." */
  line: string;
  minutes: number;
  sets: number;
  volumeKg: number;
  records: PrCard[];
  /** The pack sentence, exact about what it will move. */
  pack: string;
  /** Whether there is a pack to take one off at all. */
  packMoves: boolean;
  /** Already marked done or not-trained — the dock says so instead of offering. */
  closed: boolean;
  /** The WhatsApp text, if the trainer leaves the switch on. */
  message: string;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

function count(n: number): string {
  return n <= 10 ? WORDS[n] : String(n);
}

export function buildFinish(
  input: LogInput,
  view: LogView,
  pack: { remaining: number; total: number } | null,
  now: number,
): FinishView {
  const planned = view.exercises.filter((e) => !e.unplanned).length;
  const done = view.exercises.filter((e) => e.started).length;
  const end = view.endedAt ?? now;
  const minutes = Math.max(1, Math.round((end - view.startedAt) / 60_000));

  const scheduled = view.scheduledId
    ? input.sessions.find((s) => s.id === view.scheduledId)
    : undefined;
  const closed = scheduled ? scheduled.status.toLowerCase() !== 'scheduled' : false;

  const head = view.plan ?? 'Session';
  const first = view.clientName.split(' ')[0];

  const pieces = [
    `${first}, ${shortDate(isoDay(end))}`,
    `${view.setsLogged} sets · ${view.volumeKg.toLocaleString('en-IN')} kg`,
    ...view.records.filter((r) => r.announced).map((r) => `${r.name}: ${r.value} ${r.unit} — ${r.was}`),
  ];

  return {
    clientName: view.clientName,
    title: `${head.split(' · ')[0]}, logged`,
    line: [
      view.plan?.split(' · ')[1],
      `${count(planned)} exercise${planned === 1 ? '' : 's'} planned, ${count(done)} done`,
    ]
      .filter(Boolean)
      .join(' · '),
    minutes,
    sets: view.setsLogged,
    volumeKg: view.volumeKg,
    records: view.records,
    pack: pack
      ? `Marking the session done is what moves it — ${pack.remaining} to ${Math.max(0, pack.remaining - 1)} of ${pack.total}.`
      : 'There is no session pack to take one off. Marking it done records that it happened.',
    packMoves: pack !== null,
    closed,
    message: pieces.join('\n'),
  };
}

/* -------------------------------------------------------- 5a · the progress */

export interface ProgressWeek {
  label: string;
  volumeKg: number;
  /** 0…1 against the tallest week. */
  fraction: number;
  current: boolean;
}

export interface ProgressView {
  clientName: string;
  plan: string | null;
  sessions: number;
  sets: number;
  records: number;
  /** Absent when there is not enough logged to draw a week. */
  volume: {
    value: string;
    delta: { direction: 'up' | 'down' | 'flat'; text: string } | null;
    weeks: ProgressWeek[];
    note: string;
  } | null;
  /** The client's most-logged exercise, written out rather than charted. */
  topSet: { label: string; value: string; delta: string | null; note: string } | null;
  bodyweight: { value: string; delta: string | null; note: string } | null;
  exerciseCount: number;
}

export type ProgressRange = '8w' | '6m' | 'all';

const RANGE_DAYS: Record<ProgressRange, number | null> = { '8w': 56, '6m': 183, all: null };

/**
 * Volume, the top set and bodyweight — and only one of them gets a chart.
 *
 * §09: no bar chart of anything that is not a sum. Volume adds up, so bars from
 * zero are honest about it. A load does not: from a zero baseline a 2.5 kg week
 * is two pixels, so the top set is written out as the sequence of numbers it
 * actually is. Bodyweight gets no colour and no verdict arrow — the app has no
 * opinion about which way a client's weight should go.
 */
export function buildProgress(
  input: LogInput,
  clientId: string,
  range: ProgressRange,
  now: number,
): ProgressView {
  const clientName = input.clients.find((c) => c.id === clientId)?.name?.trim() || 'Client';
  const days = RANGE_DAYS[range];
  const todayIso = isoDay(now);

  const mine = input.workouts.filter((w) => w.clientId === clientId);
  const inRange = days === null
    ? mine
    : mine.filter((w) => daysBetween(w.sessionDate, todayIso) <= days);
  const ids = new Set(inRange.map((w) => w.id));
  const dateOf = new Map(inRange.map((w) => [w.id, w.sessionDate] as const));
  const sets = input.sets.filter((s) => ids.has(s.workoutSessionId));

  const program = input.programs.find(
    (p) => p.clientId === clientId && !DEAD_PROGRAM.has(p.status.toLowerCase()),
  );
  const template = program?.templateId
    ? input.templates.find((t) => t.id === program.templateId)
    : undefined;

  /* ---- volume, by week, Monday-anchored ---- */

  const buckets = new Map<string, number>();
  sets.forEach((s) => {
    const date = dateOf.get(s.workoutSessionId);
    if (!date) return;
    const monday = mondayOf(date);
    buckets.set(monday, (buckets.get(monday) ?? 0) + (s.loadKg ?? 0) * (s.reps ?? 0));
  });

  const ordered = [...buckets.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-8);
  const peak = Math.max(1, ...ordered.map(([, v]) => v));
  const thisWeek = mondayOf(todayIso);

  const weeks: ProgressWeek[] = ordered.map(([monday, value], i) => ({
    label: `W${i + 1}`,
    volumeKg: Math.round(value),
    fraction: value / peak,
    current: monday === thisWeek,
  }));

  const latest = ordered.length ? Math.round(ordered[ordered.length - 1][1]) : 0;
  const before = ordered.length > 1 ? Math.round(ordered[ordered.length - 2][1]) : null;
  const change = before && before > 0 ? Math.round(((latest - before) / before) * 100) : null;

  /* ---- the top set on whatever she does most ---- */

  const perExercise = new Map<string, LogSet[]>();
  sets.forEach((s) => {
    const list = perExercise.get(s.exerciseId);
    if (list) list.push(s);
    else perExercise.set(s.exerciseId, [s]);
  });

  let mostLogged: string | null = null;
  perExercise.forEach((list, id) => {
    if (!mostLogged || list.length > (perExercise.get(mostLogged)?.length ?? 0)) mostLogged = id;
  });

  const topSetCard = mostLogged ? topSetOverTime(input, perExercise.get(mostLogged) ?? [], dateOf, mostLogged) : null;

  /* ---- bodyweight, with no opinion attached ---- */

  const weights = input.metrics
    .filter((m) => m.clientId === clientId && m.metricType === 'weight')
    .sort((a, b) => a.recordedAt - b.recordedAt);
  const newest = weights[weights.length - 1] ?? null;
  const oldest = weights.length > 1 ? weights[0] : null;

  const recordCount = countRecords(input, clientId, ids);

  return {
    clientName,
    plan: template?.name ?? program?.name ?? null,
    sessions: inRange.filter((w) => sets.some((s) => s.workoutSessionId === w.id)).length,
    sets: sets.length,
    records: recordCount,
    volume: weeks.length
      ? {
          value: `${latest.toLocaleString('en-IN')} kg`,
          delta:
            change === null
              ? null
              : {
                  direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
                  text: `${Math.abs(change)}%`,
                },
          weeks,
          // Direction matters and this used to read "Up from 19,350 kg" beside a
          // red ▼ 59%. Two halves of one card contradicting each other is worse
          // than either being absent.
          note: before
            ? `${latest >= before ? 'Up' : 'Down'} from ${before.toLocaleString('en-IN')} kg. Volume is load × reps, added up.`
            : 'Volume is load × reps, added up.',
        }
      : null,
    topSet: topSetCard,
    bodyweight: newest
      ? {
          value: `${trim1(newest.value)} ${newest.unit || 'kg'}`,
          delta:
            oldest && oldest.value !== newest.value
              ? `${newest.value > oldest.value ? '▲' : '▼'} ${trim1(Math.abs(newest.value - oldest.value))} kg`
              : null,
          note: oldest
            ? `Logged ${shortDate(isoDay(newest.recordedAt))}. Was ${trim1(oldest.value)} ${oldest.unit || 'kg'} on ${shortDate(isoDay(oldest.recordedAt))}.`
            : `Logged ${shortDate(isoDay(newest.recordedAt))}. The first one on record.`,
        }
      : null,
    exerciseCount: perExercise.size,
  };
}

/** "45 → 47.5 → 50 → 52.5 → 55 kg, her last five." */
function topSetOverTime(
  input: LogInput,
  sets: LogSet[],
  dateOf: Map<string, string>,
  exerciseId: string,
): ProgressView['topSet'] {
  const exercise = input.exercises.find((e) => e.id === exerciseId);
  const logType = readLogType(exercise?.logType);

  const perSession = new Map<string, LogSet[]>();
  sets.forEach((s) => {
    const list = perSession.get(s.workoutSessionId);
    if (list) list.push(s);
    else perSession.set(s.workoutSessionId, [s]);
  });

  const tops = [...perSession.entries()]
    .map(([id, list]) => ({ date: dateOf.get(id) ?? '', top: topSet(list, logType) }))
    .filter((e) => e.date && e.top)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!tops.length) return null;

  const newest = tops[tops.length - 1].top!;
  const previous = tops.length > 1 ? tops[tops.length - 2].top! : null;
  const run = tops.slice(-5).map((e) => trim1(e.top!.loadKg ?? 0));

  const change = previous ? (newest.loadKg ?? 0) - (previous.loadKg ?? 0) : null;

  return {
    label: `Top set · ${exercise?.name?.toLowerCase() ?? 'her main lift'}`,
    value: saySet(newest.loadKg, newest.reps, logType),
    delta: change === null || change === 0 ? null : `${change > 0 ? '▲' : '▼'} ${trim1(Math.abs(change))} kg`,
    note:
      run.length > 1
        ? `${run.join(' → ')} kg, her last ${count(run.length)}.`
        : 'One session on record so far.',
  };
}

/**
 * How many records fell in this window.
 *
 * Walks the sessions in order and judges each against everything before it —
 * the same function the log screen uses, so the count and the gold cards can
 * never disagree.
 *
 * **Announced records only.** Counting the quiet ones as well is arithmetically
 * defensible and reads as inflation: on a client whose numbers climb steadily,
 * almost every session beats the one before it, and the honest count came out
 * at 73 in eight weeks. A figure that large says the opposite of what a record
 * is for. This counts what the trainer would say out loud, which is the same
 * set of records that would have sent a message.
 */
function countRecords(input: LogInput, clientId: string, windowIds: Set<string>): number {
  const mine = input.workouts
    .filter((w) => w.clientId === clientId)
    .sort((a, b) => (a.sessionDate < b.sessionDate ? -1 : 1));

  const seen = new Map<string, LogSet[]>();
  let found = 0;

  for (const workout of mine) {
    const sets = input.sets.filter((s) => s.workoutSessionId === workout.id);
    const byExercise = new Map<string, LogSet[]>();
    sets.forEach((s) => {
      const list = byExercise.get(s.exerciseId);
      if (list) list.push(s);
      else byExercise.set(s.exerciseId, [s]);
    });

    byExercise.forEach((list, exerciseId) => {
      const logType = readLogType(input.exercises.find((e) => e.id === exerciseId)?.logType);
      const history = seen.get(exerciseId) ?? [];
      const verdict = judge(list, history, logType, input.plateStepKg);
      if (windowIds.has(workout.id) && verdict.kind === 'record') found += 1;
      seen.set(exerciseId, [...history, ...list]);
    });
  }

  return found;
}

/** The Monday of the week an ISO date falls in. */
function mondayOf(iso: string): string {
  const at = Date.parse(`${iso}T00:00:00`);
  if (Number.isNaN(at)) return iso;
  const d = new Date(at);
  const weekday = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - weekday);
  return isoDay(d.getTime());
}

/* -------------------------------------------- 5b · one exercise's history */

export interface HistorySet {
  number: number;
  rpe: number | null;
  load: string;
  reps: string;
  note: string | null;
  pr: boolean;
}

export interface HistorySession {
  workoutId: string;
  /** "Today · Sun 9 Aug", or "Mon 3 Aug". */
  title: string;
  /** "1,260 kg". */
  volume: string;
  sets: HistorySet[];
}

export interface HistoryView {
  name: string;
  /** "Meera Shah · 14 sessions". */
  subtitle: string;
  logType: LogType;
  records: { label: string; value: string; unit: string }[];
  sessions: HistorySession[];
  empty: boolean;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Every session this client did this exercise in, newest first.
 *
 * The same five columns as the log, read-only — a trainer should never have to
 * learn a second layout for their own data. Sets inside a session stay in the
 * order they happened, because set 3 only means something after set 2, and the
 * PR tag is on the set rather than on the day.
 */
export function buildHistory(
  input: LogInput,
  clientId: string,
  exerciseId: string,
  now: number,
): HistoryView {
  const exercise = input.exercises.find((e) => e.id === exerciseId);
  const logType = readLogType(exercise?.logType);
  const clientName = input.clients.find((c) => c.id === clientId)?.name?.trim() || 'Client';

  const mine = input.workouts
    .filter((w) => w.clientId === clientId)
    .sort((a, b) => (a.sessionDate < b.sessionDate ? -1 : 1));

  const todayIso = isoDay(now);
  const seen: LogSet[] = [];
  const sessions: HistorySession[] = [];

  for (const workout of mine) {
    const sets = input.sets
      .filter((s) => s.workoutSessionId === workout.id && s.exerciseId === exerciseId)
      .sort((a, b) => a.setNumber - b.setNumber);
    if (!sets.length) continue;

    // Judged against everything before it, in order — which is what makes a PR
    // tag on an old session mean "this was a record at the time".
    const verdict = judge(sets, [...seen], logType, input.plateStepKg);
    seen.push(...sets);

    const day = new Date(`${workout.sessionDate}T00:00:00`);
    const stamp = `${WEEKDAYS[day.getDay()]} ${shortDate(workout.sessionDate)}`;

    sessions.push({
      workoutId: workout.id,
      title: workout.sessionDate === todayIso ? `Today · ${stamp}` : stamp,
      volume: `${volumeOf(sets).toLocaleString('en-IN')} kg`,
      sets: sets.map((s) => ({
        number: s.setNumber,
        rpe: s.rpe ?? null,
        load: s.loadKg != null ? trim1(s.loadKg) : '—',
        reps: s.reps != null ? String(s.reps) : '—',
        note: s.notes?.trim() || null,
        pr: (verdict.kind === 'record' || verdict.kind === 'quiet') && verdict.setId === s.id,
      })),
    });
  }

  sessions.reverse();

  const all = seen;
  const loaded = all.filter((s) => (s.loadKg ?? 0) > 0);
  const records: HistoryView['records'] = [];
  if (logType === 'reps' || !loaded.length) {
    if (all.length) {
      records.push(
        { label: 'Most reps', value: String(all.reduce((m, s) => Math.max(m, s.reps ?? 0), 0)), unit: '' },
        { label: 'Sets logged', value: String(all.length), unit: '' },
        { label: 'Sessions', value: String(sessions.length), unit: '' },
      );
    }
  } else {
    const heaviest = loaded.reduce((m, s) => Math.max(m, s.loadKg ?? 0), 0);
    const oneRm = loaded.reduce((m, s) => Math.max(m, (s.loadKg ?? 0) * (1 + (s.reps ?? 0) / 30)), 0);
    const best = loaded.reduce((top, s) =>
      (s.loadKg ?? 0) * (s.reps ?? 0) > (top.loadKg ?? 0) * (top.reps ?? 0) ? s : top,
    );
    records.push(
      { label: 'Heaviest', value: trim1(heaviest), unit: 'kg' },
      { label: 'Est. 1RM', value: String(Math.round(oneRm)), unit: 'kg' },
      { label: 'Best set', value: String(best.reps ?? 0), unit: `×${trim1(best.loadKg ?? 0)}` },
    );
  }

  return {
    name: exercise?.name ?? 'That exercise',
    subtitle: `${clientName} · ${sessions.length} session${sessions.length === 1 ? '' : 's'}`,
    logType,
    records,
    sessions,
    empty: sessions.length === 0,
  };
}

/* ------------------------------------------ + · who are you logging for */

export interface OpenLogRow {
  workoutId: string;
  clientId: string;
  clientName: string;
  /** "2 sets in · 1,245 kg" or "Nothing logged yet". */
  meta: string;
  programId: string | null;
  templateDay: number | null;
}

export interface BookedRow {
  scheduledId: string;
  clientId: string;
  clientName: string;
  /** "6:00 AM · Pull A". */
  meta: string;
  programId: string | null;
  templateDay: number | null;
  at: number;
}

export interface RosterRow {
  clientId: string;
  clientName: string;
  /** "Last trained 10 Aug" or "Never logged". */
  meta: string;
  /** Sorts the people most likely to be standing in front of you to the top. */
  lastAt: number;
}

export interface LogPickView {
  /** Logs opened today and not closed. A trainer can have two on the go. */
  open: OpenLogRow[];
  /** Booked for today and not yet closed off. */
  booked: BookedRow[];
  roster: RosterRow[];
  /** Nobody on the roster at all. */
  empty: boolean;
}

const DEAD_SESSION = new Set(['done', 'no_show', 'noshow', 'cancelled', 'canceled']);

/**
 * Who the + button is about to log for.
 *
 * The + is pressed with the intention already formed, so this screen asks one
 * question — **who?** — and answers it in the order a gym floor answers it:
 * what is already open, then who is booked in, then everybody else.
 *
 * The third group is the one no competitor offers. Every logger in the teardown
 * assumes a workout belongs to a booking or a routine; a client who turns up on
 * a Wednesday she does not normally train is not an edge case in a gym where the
 * trainer is on the floor and the booking never got made.
 */
export function buildLogPick(input: LogInput, now: number): LogPickView {
  const names = new Map(input.clients.map((c) => [c.id, c.name.trim() || 'Client'] as const));
  const todayIso = isoDay(now);

  const setsByWorkout = new Map<string, LogSet[]>();
  input.sets.forEach((s) => {
    const list = setsByWorkout.get(s.workoutSessionId);
    if (list) list.push(s);
    else setsByWorkout.set(s.workoutSessionId, [s]);
  });

  /* ---- still open ---- */

  const open = input.workouts
    .filter((w) => w.sessionDate === todayIso && !w.endedAt && names.has(w.clientId))
    .sort((a, b) => b.startedAt - a.startedAt)
    .map<OpenLogRow>((w) => {
      const sets = setsByWorkout.get(w.id) ?? [];
      const scheduled = w.scheduledSessionId
        ? input.sessions.find((s) => s.id === w.scheduledSessionId)
        : undefined;
      return {
        workoutId: w.id,
        clientId: w.clientId,
        clientName: names.get(w.clientId) ?? 'Client',
        meta: sets.length
          ? `${sets.length} set${sets.length === 1 ? '' : 's'} in · ${volumeOf(sets).toLocaleString('en-IN')} kg`
          : 'Nothing logged yet',
        programId: w.programId ?? null,
        templateDay: scheduled?.templateDay ?? null,
      };
    });

  const openClients = new Set(open.map((o) => o.clientId));

  /* ---- booked today ---- */

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = dayStart.getTime() + 86_400_000;

  const booked = input.sessions
    .filter(
      (s) =>
        s.scheduledAt >= dayStart.getTime() &&
        s.scheduledAt < dayEnd &&
        !DEAD_SESSION.has(s.status.toLowerCase()) &&
        names.has(s.clientId) &&
        // Already under way — it is in the group above, and offering it twice
        // would give two ways to reach one log.
        !openClients.has(s.clientId),
    )
    .sort((a, b) => a.scheduledAt - b.scheduledAt)
    .map<BookedRow>((s) => ({
      scheduledId: s.id,
      clientId: s.clientId,
      clientName: names.get(s.clientId) ?? 'Client',
      meta: [clockTime(s.scheduledAt), s.dayLabel?.trim()].filter(Boolean).join(' · '),
      programId: s.programId ?? null,
      templateDay: s.templateDay ?? null,
      at: s.scheduledAt,
    }));

  const bookedClients = new Set(booked.map((b) => b.clientId));

  /* ---- everybody else ---- */

  const lastTrained = new Map<string, string>();
  input.workouts.forEach((w) => {
    if (!setsByWorkout.has(w.id)) return;
    const held = lastTrained.get(w.clientId);
    if (!held || w.sessionDate > held) lastTrained.set(w.clientId, w.sessionDate);
  });

  const roster = input.clients
    .filter((c) => !openClients.has(c.id) && !bookedClients.has(c.id))
    .map<RosterRow>((c) => {
      const last = lastTrained.get(c.id);
      return {
        clientId: c.id,
        clientName: c.name.trim() || 'Client',
        meta: last ? `Last trained ${shortDate(last)}` : 'Never logged',
        lastAt: last ? Date.parse(`${last}T00:00:00`) || 0 : 0,
      };
    })
    // Most recently trained first: the person standing in front of you is far
    // more likely to be somebody you trained last week than somebody whose name
    // starts with A.
    .sort((a, b) => b.lastAt - a.lastAt || (a.clientName < b.clientName ? -1 : 1));

  return { open, booked, roster, empty: input.clients.length === 0 };
}

/** "6:00 AM". */
function clockTime(at: number): string {
  const d = new Date(at);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

/* ------------------------------------------------------- 3a · the picker */

export interface PickerRow {
  id: string;
  name: string;
  /** "Last: 12 Jul · 14 kg × 10", or "Never logged with Meera". */
  meta: string;
  custom: boolean;
  /** Sorted to the top: what she has done recently is nearly always the answer. */
  recent: boolean;
}

/**
 * The exercises to offer when the rack is busy.
 *
 * Recents first, because the answer to a busy rack is nearly always something
 * she has already done — and every recent row carries what she last lifted on
 * it, so the choice is made on numbers rather than on a name.
 */
export function buildPicker(
  input: LogInput,
  clientId: string,
  clientName: string,
  query: string,
  bucket: 'recent' | 'yours' | 'all',
  exclude: Set<string>,
): { rows: PickerRow[]; recentCount: number; yoursCount: number; total: number } {
  const mine = new Set(input.workouts.filter((w) => w.clientId === clientId).map((w) => w.id));
  const dateOf = new Map(input.workouts.map((w) => [w.id, w.sessionDate] as const));

  const last = new Map<string, { date: string; set: LogSet }>();
  input.sets.forEach((s) => {
    if (!mine.has(s.workoutSessionId)) return;
    const date = dateOf.get(s.workoutSessionId) ?? '';
    const held = last.get(s.exerciseId);
    if (!held || date > held.date) last.set(s.exerciseId, { date, set: s });
  });

  const first = clientName.split(' ')[0];
  const q = query.trim().toLowerCase();

  const all = input.exercises
    .filter((e) => !exclude.has(e.id))
    .map<PickerRow>((e) => {
      const seen = last.get(e.id);
      return {
        id: e.id,
        name: e.name,
        meta: seen
          ? `Last: ${shortDate(seen.date)} · ${saySet(seen.set.loadKg, seen.set.reps, readLogType(e.logType))}`
          : `Never logged with ${first}`,
        custom: e.isCustom === true,
        recent: seen !== undefined,
      };
    });

  const recents = all.filter((r) => r.recent);
  const yours = all.filter((r) => r.custom);

  // Capped at sixty rows, and the cap is safe only because the search box is
  // above it: the library is 873 long, nobody scrolls to row 400, and the chip
  // counts below still report the whole library rather than what fitted.
  const base = bucket === 'recent' ? recents : bucket === 'yours' ? yours : all;
  const matched = q ? base.filter((r) => r.name.toLowerCase().includes(q)) : base;
  const rows = [...matched]
    .sort((a, b) => Number(b.recent) - Number(a.recent) || (a.name < b.name ? -1 : 1))
    .slice(0, 60);

  return { rows, recentCount: recents.length, yoursCount: yours.length, total: all.length };
}
