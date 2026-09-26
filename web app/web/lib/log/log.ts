/**
 * THE WORKOUT LOG — the pure model, ported from `app/src/log/log.ts`.
 *
 * Rows and `now` come in, nothing here reads a database or the clock. Every
 * function below is the phone's, branch for branch, because a record that means
 * one thing on a phone and another on a desk is worse than no record at all.
 *
 * ── THE TWO THINGS THIS FILE EXISTS TO COMPUTE ──────────────────────────────
 *
 * **Previous.** Every row in the set table carries what this client lifted on
 * this exercise, at this set number, the last time they did it. §09 of the
 * mobile document makes it the one thing on the screen that may never collapse,
 * truncate or hide — it is the entire advantage over the notebook this app
 * replaces. On the desk it is `.sets td.prev`, a real column with its own head,
 * because a placeholder inside the field disappears at exactly the moment you
 * want it.
 *
 * **The record.** Computed here, on every read, and never stored. There is no
 * `savePr` anywhere in either half. Correct a set from November and every record
 * that depended on it fixes itself in the same frame — which is frame 7a, and
 * the reason this console exists at all.
 *
 * ── THE THRESHOLD, WHICH IS THE WHOLE DESIGN OF THE RECORD ──────────────────
 *
 * Gold is cheap to hand out and worthless once it is. Three tests, in order, all
 * of them in `judge`:
 *
 *   1. There has to be an earlier session. **A first log is never a record** —
 *      it is the number to beat, not a number beaten.
 *   2. It has to beat the old number. **Matching is not beating.**
 *   3. **Only the top set is checked**, so a warm-up can never make one.
 *
 * And then a fourth, which decides whether the client's phone buzzes rather than
 * whether the record is real: a jump smaller than the smallest plate in the room
 * is not a session's worth of progress, it is a typo or a fractional plate.
 * `PLATE_STEP_KG` is that plate, and §15 · 05 records that no screen in the set
 * lets a trainer say which gym they are in yet.
 *
 * ── WHAT THE WEB CHANGED, AND WHY ───────────────────────────────────────────
 *
 * **No `pending`, no `queued`, no amber ring.** `LogSetRow` on the phone carries
 * a `pending` flag and the stylesheet draws it as a ring, because a tick there
 * writes to SQLite and reaches the server later. This half is online-only: a
 * tick is a `POST` and it either happened or it did not. Frame 6a — the
 * basement, the offline banner and the six-row waiting card — is not built, per
 * `AGENTS.md`. The reasoning around it is kept; only the offline half is void.
 *
 * **`workout_exercises` is not on the wire**, so the exercise rows are
 * reconstructed rather than read — see `buildRows`. Nothing else about the model
 * changes.
 */

/* ------------------------------------------------------------------- input */

export interface LogSet {
  id: string;
  workoutSessionId: string;
  exerciseId: string;
  setNumber: number;
  loadKg?: number | null;
  reps?: number | null;
  rpe?: number | null;
  notes?: string | null;
  createdAt: number;
}

export interface LogWorkout {
  id: string;
  clientId: string;
  programId?: string | null;
  scheduledSessionId?: string | null;
  /** 'YYYY-MM-DD'. */
  sessionDate: string;
  startedAt: number;
  /** V13's column. Null means the log is still open. */
  endedAt?: number | null;
}

export interface LogExercise {
  id: string;
  name: string;
  logType?: string | null;
  equipment?: string | null;
  /** A movement the trainer invented. The one they will hunt for hardest. */
  isCustom?: boolean;
}

/**
 * One row of today's grid — a `workout_exercise` row, on both halves now.
 *
 * The phone reads them out of SQLite. This half reads them from
 * `GET /v1/workouts/{id}/exercises`, which arrived on 28 Aug 2026; before that
 * the table reached the server only inside the sync envelope and every row here
 * was synthesised. `buildRows` still synthesises, because a log opened by
 * `/done` or by an older build has no rows at all — but a real row now wins
 * wherever there is one.
 */
export interface LogExerciseRow {
  exerciseId: string;
  orderIndex: number;
  source: 'plan' | 'unplanned';
  targetSets?: number | null;
  targetReps?: number | null;
  restSeconds?: number | null;
  swappedFromExerciseId?: string | null;
}

export interface LogScheduled {
  id: string;
  clientId: string;
  programId?: string | null;
  status: string;
  dayLabel?: string | null;
  templateDay?: number | null;
  scheduledAt: number;
  durationMinutes?: number | null;
  deliveryMode?: string | null;
}

export interface LogProgram {
  id: string;
  clientId: string;
  templateId?: string | null;
  name: string;
  status: string;
  startDate?: string | null;
}

export interface LogInput {
  workouts: LogWorkout[];
  logExercises: LogExerciseRow[];
  sets: LogSet[];
  exercises: LogExercise[];
  clients: { id: string; name: string }[];
  sessions: LogScheduled[];
  programs: LogProgram[];
  /*
   * ── THE FLOOR IS GONE, AND ITS ABSENCE IS THE POINT ──────────────────────
   *
   * `bestLoadByExercise` used to sit here: the heaviest load this client had
   * ever put on each exercise, taken from `GET /v1/clients/{id}/progress` and
   * threaded into `judge` as a floor. It existed for one reason — `lib/log/api`
   * could only read a WINDOW of the client's recent sessions, because there was
   * no bulk set read and one request per logged session is ~150 of a 120/min
   * budget on a single page load. A bounded window understates an old best and
   * hands out gold for beating a number that was never the best, so the floor
   * patched the hole.
   *
   * `GET /v1/workouts/sets?clientId=` landed on 28 Aug 2026 and `sets` below is
   * now the client's WHOLE history. There is nothing left to patch, and keeping
   * the patch would be worse than removing it: `/progress` is `LIMIT 30`
   * exercises and counts only sets that carry a load, so it was silent about a
   * client with more than thirty movements and silent about every reps-only
   * exercise. Both holes close by deleting it rather than by widening it.
   */
  /** The gym's smallest plate. Decides what counts as beating a number. */
  plateStepKg: number;
}

/**
 * 2.5 kg here, 1.25 in some gyms, and it decides whether a client's phone
 * buzzes. Per-gym, and the only number on this screen that changes when the
 * trainer changes building — §15 · 05 records that nothing lets them say which
 * building that is yet, so this is the default and it is written down.
 */
export const PLATE_STEP_KG = 2.5;

export const EMPTY_LOG_INPUT: LogInput = {
  workouts: [],
  logExercises: [],
  sets: [],
  exercises: [],
  clients: [],
  sessions: [],
  programs: [],
  plateStepKg: PLATE_STEP_KG,
};

/* ------------------------------------------------------------------ output */

export type LogType = 'weight_reps' | 'reps';

export interface LogSetRow {
  /** The slot. Stable across a delete, which is why it is not an index. */
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
  /** This set holds the record. Gold on the set number, and nowhere else. */
  pr: boolean;
}

export interface LogExerciseView {
  exerciseId: string;
  name: string;
  logType: LogType;
  unplanned: boolean;
  /*
   * ── THE CARD'S OWN FIELDS, CARRIED THROUGH RATHER THAN DERIVED ───────────
   *
   * `POST /v1/workouts/{id}/exercises` is an upsert that REPLACES the row's
   * fields — a partial write clears the rest — so anything that touches a card
   * has to send the whole card back. These three are what the view was missing
   * to be able to do that, and they are the row's values verbatim.
   *
   * `targetSets` is not `sets.length`: the grid draws extra slots for what has
   * already been typed, so a three-set prescription with a fourth set logged
   * against it has four rows and is still a three-set prescription.
   */
  orderIndex: number;
  targetSets: number | null;
  targetReps: number | null;
  /** The name of what this replaced, when it replaced something. */
  swappedFrom: string | null;
  /**
   * And its id, because the name cannot be turned back into one: the exercise
   * this replaced is usually not in the grid any more — being replaced is what
   * took it out — so looking it up by name would find nothing and a write that
   * sends the card back whole would quietly erase the swap.
   */
  swappedFromExerciseId: string | null;
  /** "Last: 3 Aug · 52.5 kg × 8", or "Never logged with Meera". */
  last: string;
  /** "3 of 3 sets · top 65 kg × 6" — the collapsed row's second line. */
  summary: string;
  /** Every planned slot has a tick in it. */
  complete: boolean;
  /** Any set logged at all. Drives the ok spine on a collapsed row. */
  started: boolean;
  sets: LogSetRow[];
  restSeconds: number | null;
  volumeKg: number;
  /** How many earlier SETS this client has on this exercise. */
  historySets: number;
  /** How many earlier SESSIONS. `Judged.streak` counts the first and says the
      second — §14 owes the app a fix; this half keeps the two apart. */
  historySessions: number;
  verdict: Verdict;
}

/** What today's top set did to the client's history on that exercise. */
export type Verdict = 'record' | 'quiet' | 'matched' | 'first' | 'none';

export interface BestRow {
  exerciseId: string;
  name: string;
  verdict: Verdict;
  /** The big figure: "65 kg × 6". */
  value: string;
  /** "was 62.5 kg × 8", or "nothing before it". */
  was: string;
  /** "+2.5 kg", "+2 reps", or null when nothing was beaten. */
  delta: string | null;
  /** The sentence under it, which is why the number means something. */
  why: string;
  setId: string | null;
}

export interface PrCard {
  exerciseId: string;
  name: string;
  setId: string;
  /** "Set 2". */
  setLabel: string;
  /** The new number, big. */
  value: string;
  unit: string;
  /** "×6" — what it was done for. Null on a reps-only exercise. */
  reps: string | null;
  /** "was 62.5 kg × 8". */
  was: string;
  /** "+2.5 kg". */
  delta: string;
  /** The sentence under it. */
  why: string;
  /** Gold and loud, or gold and quiet. */
  announced: boolean;
}

export interface LogView {
  workoutId: string;
  clientId: string;
  clientName: string;
  /** 'YYYY-MM-DD' — the day the session happened, not the day it is read. */
  sessionDate: string;
  /** "Push A · Week 5 of 8", or null when nobody has a plan. */
  plan: string | null;
  /** Just the day's own name — "Push A". */
  planHead: string | null;
  programId: string | null;
  scheduledId: string | null;
  startedAt: number;
  endedAt: number | null;
  exercises: LogExerciseView[];
  setsLogged: number;
  /** Every slot on the grid, whether it has a tick in it or not. */
  setsPlanned: number;
  volumeKg: number;
  /**
   * HOW LONG IT TOOK, OR NULL BECAUSE NOBODY KNOWS.
   *
   * A closed log measures itself: `endedAt` minus `startedAt`. An OPEN log
   * started today is still running, so it measures to now. An open log from an
   * earlier day measures to nothing — the trainer left it open and the clock
   * kept going, and `(now - startedAt)` would print **12,960 min** for a session
   * nine days old.
   *
   * That is not hypothetical while `endedAt` has no write on the wire
   * (BACKEND_GAPS 4): every log is open, so every log older than today would
   * print a four-digit number in a slot the design gives two. The strip says
   * `—` and names why instead. A figure a screen cannot know is a figure it must
   * not invent — the same rule the day ribbon's ruler follows.
   */
  minutes: number | null;
  /** Every record today, loud ones first. */
  records: PrCard[];
  /** Everything checked, including what did not make it. Frame 2a. */
  bests: BestRow[];
  /** Nothing planned and nothing added. Frame 6b. */
  emptyPlan: boolean;
  /** 6b's "Repeat 31 Jul". */
  repeat: { workoutId: string; date: string; label: string; meta: string } | null;
  /** 6b's nine-day fact, stated and not editorialised. */
  quiet: string | null;
}

/* ------------------------------------------------------------------ shared */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 'YYYY-MM-DD' → "9 Aug". Parsed by field: `Date` would time-zone it. */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]}`;
}

/** 'YYYY-MM-DD' → "Tue 11 Aug". Same field parse, same reason. */
export function stampDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const at = new Date(y, m - 1, d);
  return `${WEEKDAYS[at.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** 92.5 stays 92.5; 90.0 becomes 90. Nobody writes "90.0 kg" on a whiteboard. */
export function trim1(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** "52.5 kg × 8", or "8 reps" for an exercise that carries no load. */
export function saySet(
  load: number | null | undefined,
  reps: number | null | undefined,
  logType: LogType,
): string {
  if (logType === 'reps') return `${reps ?? 0} reps`;
  if (load == null || load <= 0) return `${reps ?? 0} reps`;
  return `${trim1(load)} kg × ${reps ?? 0}`;
}

/** Local 'YYYY-MM-DD'. `toISOString` would move an evening session a day back. */
export function isoDay(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00`);
  const b = Date.parse(`${toIso}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

const DEAD_PROGRAM = new Set(['cancelled', 'canceled', 'completed', 'archived']);

/**
 * Which of the two shapes this exercise logs in.
 *
 * Three answers, in this order, and the ORDER is the argument:
 *
 *   1 · **The library's own `log_type`.** V12's column, on `ExerciseResponse`
 *       since 28 Aug 2026. It is the only branch that can answer for an
 *       exercise nobody has logged yet, which is exactly the case the two below
 *       cannot reach — a first chin-up drew a load field and asked the trainer
 *       for a number that does not exist.
 *   2 · **The client's own sets.** An exercise this person has logged with a
 *       load is a weight exercise whatever the library says, and a chin-up done
 *       in a dip belt is a weight exercise for precisely that reason. So this
 *       still overrides nothing and is overridden by nothing: it runs when the
 *       column is null, which it is on all 873 seeded rows.
 *   3 · **Equipment**, the tie-breaker for a first log with a null column.
 *
 * The inference below 1 was never wrong — it had nothing to go on before the
 * first set, and now it does not have to. `LogType` still has two members and
 * §14 owes it `time` and `distance`; a plank has nowhere to go, on either half.
 */
const BODYWEIGHT = new Set(['body weight', 'bodyweight', 'assisted', 'band', 'none']);

export function readLogType(
  exercise: LogExercise | undefined,
  sets: { loadKg?: number | null }[],
): LogType {
  if (exercise?.logType) return exercise.logType === 'reps' ? 'reps' : 'weight_reps';
  if (sets.some((s) => (s.loadKg ?? 0) > 0)) return 'weight_reps';
  if (sets.length) return 'reps';
  return BODYWEIGHT.has((exercise?.equipment ?? '').toLowerCase()) ? 'reps' : 'weight_reps';
}

/** Volume is load × reps, added up. The one figure on this screen that is a sum. */
export function volumeOf(sets: { loadKg?: number | null; reps?: number | null }[]): number {
  return Math.round(sets.reduce((sum, s) => sum + (s.loadKg ?? 0) * (s.reps ?? 0), 0));
}

/**
 * The best set in a list: heaviest, and on a tie the one that got more reps.
 *
 * "Best" has two defensible meanings — heaviest, and most total weight moved.
 * This one is heaviest, because it is the set a record is judged on and a coach
 * saying "their best set" at the rack means the heaviest one.
 */
export function topSet<T extends { loadKg?: number | null; reps?: number | null }>(
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

/* ---------------------------------------------------------------- the record */

export interface Judged {
  kind: Verdict;
  setId: string | null;
  /** What was beaten. */
  wasLoad: number | null;
  wasReps: number | null;
  load: number | null;
  reps: number | null;
  /** Numeric improvement, in kg for a loud record and in reps for a quiet one. */
  by: number;
}

const NOTHING: Judged = {
  kind: 'none', setId: null, wasLoad: null, wasReps: null, load: null, reps: null, by: 0,
};

/**
 * Today's top set against everything before it.
 *
 * The three tests are in order and each one can end it.
 *
 * It used to take a fifth argument, `bestLoadFloor` — the server's all-time
 * maximum, threaded in to keep the verdict honest against a windowed fetch. The
 * window is gone (see `LogInput`), so `history` IS everything before it and a
 * second opinion about the same question could only ever disagree with it.
 */
export function judge(
  today: LogSet[],
  history: LogSet[],
  logType: LogType,
  plateStep: number,
): Judged {
  const top = topSet(today, logType);
  if (!top) return NOTHING;

  // Test 1 — you cannot beat nothing, and now nothing means nothing: an empty
  // history is a client who has genuinely never done this, not one whose only
  // earlier session fell outside a window.
  if (!history.length) {
    return { ...NOTHING, kind: 'first', setId: top.id, load: top.loadKg ?? null, reps: top.reps ?? null };
  }

  if (logType === 'reps') {
    const best = history.reduce((max, s) => Math.max(max, s.reps ?? 0), 0);
    const reps = top.reps ?? 0;
    if (reps > best) {
      // No plate step for reps, so every real record here is a loud one.
      return { kind: 'record', setId: top.id, wasLoad: null, wasReps: best, load: null, reps, by: reps - best };
    }
    if (reps === best) {
      return { ...NOTHING, kind: 'matched', setId: top.id, wasReps: best, reps };
    }
    return NOTHING;
  }

  const bestLoad = history.reduce((max, s) => Math.max(max, s.loadKg ?? 0), 0);
  const load = top.loadKg ?? 0;
  const reps = top.reps ?? 0;

  if (load > bestLoad) {
    // Heavier than they have ever lifted. Gold, and loud enough to send — unless
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
    };
  }

  if (load === bestLoad) {
    const bestReps = history
      .filter((s) => (s.loadKg ?? 0) === load)
      .reduce((max, s) => Math.max(max, s.reps ?? 0), 0);
    // Test 2 — matching is not beating.
    if (reps > bestReps) {
      // A real record, and a small one: one more rep at a weight they had already
      // lifted. Kept in their history, kept off their phone.
      return { kind: 'quiet', setId: top.id, wasLoad: load, wasReps: bestReps, load, reps, by: reps - bestReps };
    }
    if (reps === bestReps) {
      return { ...NOTHING, kind: 'matched', setId: top.id, wasLoad: load, wasReps: bestReps, load, reps };
    }
  }

  return NOTHING;
}

/**
 * Last time's numbers for one slot.
 *
 * Set 3 against set 3, which is what a trainer is comparing. If last time was
 * shorter, the last set they did stands in — better the nearest true number than
 * a blank, and it is still a number they lifted.
 */
export function previousFor(
  last: { date: string; sets: LogSet[] } | null,
  slot: number,
): LogSet | null {
  if (!last || !last.sets.length) return null;
  return last.sets.find((s) => s.setNumber === slot) ?? last.sets[last.sets.length - 1];
}

/* --------------------------------------------------------------- the index */

interface Indexed {
  workout: LogWorkout;
  /** This client's sets, by exercise, from every session except this one. */
  historyByExercise: Map<string, LogSet[]>;
  /** How many earlier SESSIONS this exercise has. */
  sessionsByExercise: Map<string, number>;
  /** This log's sets, by exercise. */
  todayByExercise: Map<string, LogSet[]>;
  /** The most recent earlier session per exercise, as its sets in order. */
  lastSessionByExercise: Map<string, { date: string; workoutId: string; sets: LogSet[] }>;
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
  const sessionsSeen = new Map<string, Set<string>>();
  /** exerciseId → the newest earlier session found so far. */
  const lastSessionByExercise = new Map<string, { date: string; workoutId: string; sets: LogSet[] }>();

  for (const set of input.sets) {
    if (!mine.has(set.workoutSessionId)) continue;

    if (set.workoutSessionId === workout.id) {
      const arr = todayByExercise.get(set.exerciseId) ?? [];
      arr.push(set);
      todayByExercise.set(set.exerciseId, arr);
      continue;
    }

    const arr = historyByExercise.get(set.exerciseId) ?? [];
    arr.push(set);
    historyByExercise.set(set.exerciseId, arr);

    const seen = sessionsSeen.get(set.exerciseId) ?? new Set<string>();
    seen.add(set.workoutSessionId);
    sessionsSeen.set(set.exerciseId, seen);

    // "Last time" is the most recent EARLIER SESSION — one session, not one
    // date. Two logs can share a date (a client who trains twice, a log
    // corrected the same evening) and merging them would put six sets in a
    // three-set Previous column, which is the one column that may never lie.
    // So the winner is held by workout id and the later date takes it whole.
    const date = dateOf.get(set.workoutSessionId) ?? '';
    if (date > workout.sessionDate) continue;
    const held = lastSessionByExercise.get(set.exerciseId);
    if (!held || date > held.date) {
      lastSessionByExercise.set(set.exerciseId, {
        date,
        workoutId: set.workoutSessionId,
        sets: [set],
      });
    } else if (date === held.date && set.workoutSessionId === held.workoutId) {
      held.sets.push(set);
    }
  }

  for (const [, entry] of lastSessionByExercise) {
    entry.sets.sort((a, b) => a.setNumber - b.setNumber);
  }
  for (const [, sets] of todayByExercise) {
    sets.sort((a, b) => a.setNumber - b.setNumber);
  }

  const sessionsByExercise = new Map<string, number>();
  for (const [exerciseId, seen] of sessionsSeen) sessionsByExercise.set(exerciseId, seen.size);

  return {
    workout,
    historyByExercise,
    sessionsByExercise,
    todayByExercise,
    lastSessionByExercise,
    exerciseById,
  };
}

/* ------------------------------------------------------------- the grid */

/**
 * TODAY'S ROWS — REAL ONES WHERE THERE ARE ANY, RECONSTRUCTED WHERE THERE ARE NOT.
 *
 * Three inputs, and the third is the one that changed on 28 Aug 2026:
 *
 *   · **the plan** — `GET /v1/programs/{id}/exercises`, filtered to this
 *     session's ordinal day slot, in `orderIndex` order;
 *   · **what was logged** — any exercise with a set in this log and no row in
 *     the plan, which is exactly what `source: 'unplanned'` means; and
 *   · **`GET /v1/workouts/{id}/exercises`** — the actual `workout_exercise`
 *     rows, which had no REST route until that date.
 *
 * ── WHY IT STILL RECONSTRUCTS ───────────────────────────────────────────────
 *
 * Because a log is not always seeded. `POST /v1/sessions/{id}/done` opens one
 * with no rows in it at all, and so did every build before the route existed. A
 * grid that trusted the table alone would draw nothing for those and lose a
 * client's whole session. So the plan and the sets remain the floor, and **a
 * real row wins wherever there is one** — it is the record of what the trainer
 * actually did today, where the other two are inferences about it.
 *
 * ── AND WHAT THE REAL ROWS BUY ──────────────────────────────────────────────
 *
 * Three things the reconstruction cannot represent, each of them something the
 * trainer did on purpose:
 *
 *   · **an exercise added before its first set.** It used to live in the URL
 *     (`?plus=`) until something was typed into it, because there was no row to
 *     write. Now the card is written when it is added.
 *   · **a swap.** The rack was busy, so the bench press was not skipped, it was
 *     replaced — and `swappedFromExerciseId` is what says so. Reconstructed, the
 *     original simply vanished and read as a skip.
 *   · **rest on an off-plan exercise**, which had nowhere to persist.
 *
 * ── REMOVED IS NOT DELETED, AND A REMOVED CARD WITH SETS IN IT STAYS ────────
 *
 * `removedAt` takes a card out of today. It is dropped here — except when sets
 * are logged against it, in which case it is kept whatever the row says. Sets
 * whose card is gone are orphaned: visible in their history, invisible in the
 * session they belong to, and taking any record they held off the screen with
 * them. The phone refuses the same shape from the other end, by refusing to swap
 * out an exercise that has already been done.
 */
export function buildRows(
  plan: {
    exerciseId: string;
    sets: number | null;
    reps: number | null;
    restSeconds: number | null;
    orderIndex: number;
  }[],
  todaySets: LogSet[],
  live: {
    exerciseId: string;
    orderIndex: number;
    source: string;
    swappedFromExerciseId?: string | null;
    targetSets?: number | null;
    targetReps?: number | null;
    restSeconds?: number | null;
    removedAt?: number | null;
  }[] = [],
): LogExerciseRow[] {
  const rows: LogExerciseRow[] = plan.map((p, i) => ({
    exerciseId: p.exerciseId,
    orderIndex: p.orderIndex ?? i,
    source: 'plan',
    targetSets: p.sets,
    targetReps: p.reps,
    restSeconds: p.restSeconds,
    swappedFromExerciseId: null,
  }));

  const seen = new Set(rows.map((r) => r.exerciseId));
  let next = rows.length ? Math.max(...rows.map((r) => r.orderIndex)) + 1 : 0;

  // Logged but not planned. Order by the first set's clock, so an exercise the
  // trainer did third sits third rather than wherever a map iterated.
  const firstAt = new Map<string, number>();
  for (const set of todaySets) {
    const held = firstAt.get(set.exerciseId);
    if (held == null || set.createdAt < held) firstAt.set(set.exerciseId, set.createdAt);
  }
  for (const [exerciseId] of [...firstAt].sort((a, b) => a[1] - b[1])) {
    if (seen.has(exerciseId)) continue;
    seen.add(exerciseId);
    rows.push({ exerciseId, orderIndex: next, source: 'unplanned', targetSets: null, targetReps: null, restSeconds: null });
    next += 1;
  }

  // The real rows, last, because they overwrite. `order_index` is today's order
  // and diverges from the plan's the moment somebody drags a card, so it is
  // taken whole rather than merged field by field.
  const hasSets = new Set(todaySets.map((s) => s.exerciseId));
  for (const row of live) {
    const real: LogExerciseRow = {
      exerciseId: row.exerciseId,
      orderIndex: row.orderIndex,
      source: row.source === 'unplanned' ? 'unplanned' : 'plan',
      targetSets: row.targetSets ?? null,
      targetReps: row.targetReps ?? null,
      restSeconds: row.restSeconds ?? null,
      swappedFromExerciseId: row.swappedFromExerciseId ?? null,
    };
    const at = rows.findIndex((r) => r.exerciseId === row.exerciseId);

    if (row.removedAt != null && !hasSets.has(row.exerciseId)) {
      if (at >= 0) rows.splice(at, 1);
      continue;
    }

    if (at >= 0) rows[at] = real;
    else {
      // `row.orderIndex` verbatim, never `|| next`: 0 is a legitimate first
      // card, and treating it as absent would send it to the end of the grid.
      rows.push(real);
      next += 1;
    }
    seen.add(row.exerciseId);
  }

  return rows.sort((a, b) => a.orderIndex - b.orderIndex);
}

/* ------------------------------------------------------------- 1a · the log */

/**
 * "Push A · Week 5 of 8", or null when nobody has a plan.
 *
 * The day's own name where the booking carries one — "Push A" is more use at the
 * rack than the program's name.
 */
function planParts(
  input: LogInput,
  workout: LogWorkout,
  todayIso: string,
): { head: string; line: string } | null {
  const program = workout.programId
    ? input.programs.find((p) => p.id === workout.programId)
    : input.programs.find(
        (p) => p.clientId === workout.clientId && !DEAD_PROGRAM.has(p.status.toLowerCase()),
      );
  if (!program) return null;

  const scheduled = workout.scheduledSessionId
    ? input.sessions.find((s) => s.id === workout.scheduledSessionId)
    : undefined;

  const head = scheduled?.dayLabel?.trim() || program.name;

  if (program.startDate) {
    const elapsed = daysBetween(program.startDate, todayIso);
    if (elapsed >= 0) {
      const week = Math.floor(elapsed / 7) + 1;
      return { head, line: `${head} · Week ${week}` };
    }
  }
  return { head, line: head };
}

/** The whole console. Null when the workout is not this trainer's. */
export function buildLog(input: LogInput, workoutId: string, now: number): LogView | null {
  const workout = input.workouts.find((w) => w.id === workoutId);
  if (!workout) return null;

  const idx = index(input, workout);
  const clientName =
    input.clients.find((c) => c.id === workout.clientId)?.name?.trim() || 'Client';

  const rows = [...input.logExercises].sort((a, b) => a.orderIndex - b.orderIndex);
  const views = rows.map((row) => buildExerciseView(input, idx, row, clientName));
  const judged = new Map(views.map((v) => [v.exerciseId, v.judged] as const));

  const logged = views.reduce((n, v) => n + v.view.sets.filter((s) => s.done).length, 0);
  const planned = views.reduce((n, v) => n + v.view.sets.length, 0);
  const volume = views.reduce((sum, v) => sum + v.view.volumeKg, 0);

  const records = views
    .map((v) => prCard(v.view, judged.get(v.exerciseId)))
    .filter((c): c is PrCard => c !== null)
    .sort((a, b) => Number(b.announced) - Number(a.announced));

  const bests = views
    .map((v) => bestRow(v.view, judged.get(v.exerciseId)))
    .filter((b): b is BestRow => b !== null);

  const plan = planParts(input, workout, workout.sessionDate);
  const runningToday = workout.endedAt == null && workout.sessionDate === isoDay(now);
  const minutes = workout.endedAt
    ? Math.max(0, Math.round((workout.endedAt - workout.startedAt) / 60_000))
    : runningToday
      ? Math.max(0, Math.round((now - workout.startedAt) / 60_000))
      : null;

  return {
    workoutId,
    clientId: workout.clientId,
    clientName,
    sessionDate: workout.sessionDate,
    plan: plan?.line ?? null,
    planHead: plan?.head ?? null,
    programId: workout.programId ?? null,
    scheduledId: workout.scheduledSessionId ?? null,
    startedAt: workout.startedAt,
    endedAt: workout.endedAt ?? null,
    exercises: views.map((v) => v.view),
    setsLogged: logged,
    setsPlanned: planned,
    volumeKg: volume,
    minutes,
    records,
    bests,
    emptyPlan: rows.length === 0,
    repeat: lastWholeSession(input, workout),
    quiet: quietLine(input, workout, now),
  };
}

function buildExerciseView(
  input: LogInput,
  idx: Indexed,
  row: LogExerciseRow,
  clientName: string,
): { exerciseId: string; view: LogExerciseView; judged: Judged } {
  const exercise = idx.exerciseById.get(row.exerciseId);
  const today = idx.todayByExercise.get(row.exerciseId) ?? [];
  const history = idx.historyByExercise.get(row.exerciseId) ?? [];
  const last = idx.lastSessionByExercise.get(row.exerciseId) ?? null;
  const logType = readLogType(exercise, [...today, ...history]);
  const name = exercise?.name ?? 'An exercise the library does not know';

  const verdict = judge(today, history, logType, input.plateStepKg);

  // Slots: what was asked for, or how far the trainer has already got, whichever
  // is further. A deleted set leaves its slot behind.
  const highest = today.reduce((max, s) => Math.max(max, s.setNumber), 0);
  const slots = Math.max(row.targetSets ?? 0, highest, today.length ? highest : 1);

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
      pr: verdict.kind !== 'none' && verdict.kind !== 'matched' && verdict.setId === set?.id,
    });
  }

  const top = topSet(today, logType);
  const lastTop = last ? topSet(last.sets, logType) : null;

  return {
    exerciseId: row.exerciseId,
    judged: verdict,
    view: {
      exerciseId: row.exerciseId,
      name,
      logType,
      unplanned: row.source === 'unplanned',
      orderIndex: row.orderIndex,
      targetSets: row.targetSets ?? null,
      targetReps: row.targetReps ?? null,
      swappedFrom: row.swappedFromExerciseId
        ? idx.exerciseById.get(row.swappedFromExerciseId)?.name ?? null
        : null,
      swappedFromExerciseId: row.swappedFromExerciseId ?? null,
      last: last && lastTop
        ? `Last: ${shortDate(last.date)} · ${saySet(lastTop.loadKg, lastTop.reps, logType)}`
        : `Never logged with ${clientName.split(' ')[0]}`,
      summary: top
        ? `${today.length} of ${slots} sets · top ${saySet(top.loadKg, top.reps, logType)}`
        : row.targetSets && row.targetReps
          ? `Not started · ${row.targetSets} × ${row.targetReps} planned`
          : 'Not started',
      complete: slots > 0 && today.length >= slots,
      started: today.length > 0,
      sets,
      restSeconds: row.restSeconds ?? null,
      volumeKg: volumeOf(today),
      historySets: history.length,
      historySessions: idx.sessionsByExercise.get(row.exerciseId) ?? 0,
      verdict: verdict.kind,
    },
  };
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
      reps: null,
      was: `was ${verdict.wasReps ?? 0}`,
      delta: `+${verdict.by} rep${verdict.by === 1 ? '' : 's'}`,
      why: `Most reps they have logged on the ${view.name.toLowerCase()}. There is no plate step for reps, so every real record here is a loud one.`,
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
    reps: heavier ? `× ${verdict.reps ?? 0}` : null,
    was: heavier
      ? `was ${trim1(verdict.wasLoad ?? 0)} kg × ${verdict.wasReps ?? 0}`
      : `was ${verdict.wasReps ?? 0} at ${trim1(verdict.wasLoad ?? 0)} kg`,
    delta: heavier ? `+${trim1(verdict.by)} kg` : `+${verdict.by} rep${verdict.by === 1 ? '' : 's'}`,
    why: announced
      ? `Heavier than they have ever lifted, and the jump is a whole ${trim1(PLATE_STEP_KG)} kg plate — so this one is worth sending.`
      : heavier
        ? `Real, and smaller than the smallest plate in the room. In their history. Not on their phone.`
        : `Real, and small: ${verdict.by} more rep${verdict.by === 1 ? '' : 's'} at a weight they had already lifted. In their history. Not on their phone.`,
    announced,
  };
}

function bestRow(view: LogExerciseView, verdict: Judged | undefined): BestRow | null {
  if (!verdict || verdict.kind === 'none') return null;

  const value = saySet(verdict.load, verdict.reps, view.logType);
  const heavier = verdict.wasLoad !== null && (verdict.load ?? 0) > verdict.wasLoad;

  switch (verdict.kind) {
    case 'record':
      return {
        exerciseId: view.exerciseId, name: view.name, verdict: 'record', value, setId: verdict.setId,
        was: view.logType === 'reps'
          ? `was ${verdict.wasReps ?? 0} reps`
          : `was ${trim1(verdict.wasLoad ?? 0)} kg × ${verdict.wasReps ?? 0}`,
        delta: view.logType === 'reps'
          ? `+${verdict.by} rep${verdict.by === 1 ? '' : 's'}`
          : `+${trim1(verdict.by)} kg`,
        why: view.logType === 'reps'
          ? 'More reps than they have ever done. There is no plate step for reps, so it is a loud one.'
          : 'Heavier than they have ever lifted, by at least the smallest plate in the room. Gold, and their phone buzzes.',
      };
    case 'quiet':
      return {
        exerciseId: view.exerciseId, name: view.name, verdict: 'quiet', value, setId: verdict.setId,
        was: heavier
          ? `was ${trim1(verdict.wasLoad ?? 0)} kg`
          : `was ${trim1(verdict.wasLoad ?? 0)} kg × ${verdict.wasReps ?? 0}`,
        delta: heavier ? `+${trim1(verdict.by)} kg` : `+${verdict.by} rep${verdict.by === 1 ? '' : 's'}`,
        why: 'Real, and small — under the smallest plate, or one more rep at a weight they had already lifted. In their history. Not on their phone.',
      };
    case 'matched':
      return {
        exerciseId: view.exerciseId, name: view.name, verdict: 'matched', value, setId: verdict.setId,
        was: view.logType === 'reps'
          ? `was ${verdict.wasReps ?? 0} reps`
          : `was ${trim1(verdict.wasLoad ?? 0)} kg × ${verdict.wasReps ?? 0}`,
        delta: null,
        why: 'Exactly what they did last time. Matching is not beating — no gold, and nothing to send.',
      };
    default:
      return {
        exerciseId: view.exerciseId, name: view.name, verdict: 'first', value, setId: verdict.setId,
        was: 'nothing before it',
        delta: null,
        why: 'No earlier session to beat. A first log is never a record: it is the number to beat.',
      };
  }
}

/* -------------------------------------------------------- 6b · no plan yet */

/**
 * HOW LONG THEY HAVE BEEN ON THE FLOOR, AS A PERSON WOULD SAY IT.
 *
 * `minutes` is the wall clock since `startedAt` and a live log is not always
 * closed the minute the client leaves, so this figure is routinely in the
 * hundreds — the strip read **349 min** on a seeded session, which is a number
 * nobody converts at a glance and which reads at first as a typo. Anything
 * past an hour is said in hours.
 *
 * The cut is at 90 rather than at 60: a session that ran `75 min` is a long
 * session and the figure says that immediately, where `1h 15m` makes the
 * reader do the arithmetic back the other way. Past an hour and a half the
 * hours are the fact.
 *
 * Returned as a pair so the strip can set the unit in its own face —
 * `c-strip`'s `unit` is a word about the figure and takes the UI type, which
 * is the whole reason `349` and `min` stopped being one string.
 *
 * Here and not in a component because Top sets prints the same figure, and two
 * screens formatting one number is how one session is 349 minutes on one and
 * 5h 49m on the other.
 */
export function floorTime(minutes: number): { value: string; unit: string | null } {
  if (minutes < 90) return { value: String(minutes), unit: 'min' };
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return { value: m === 0 ? `${h}h` : `${h}h ${m}m`, unit: null };
}

/** The last whole session this client did, as something to repeat. */
function lastWholeSession(input: LogInput, workout: LogWorkout): LogView['repeat'] {
  const setsByWorkout = new Map<string, LogSet[]>();
  for (const set of input.sets) {
    const arr = setsByWorkout.get(set.workoutSessionId) ?? [];
    arr.push(set);
    setsByWorkout.set(set.workoutSessionId, arr);
  }

  const mine = input.workouts
    .filter((w) => w.clientId === workout.clientId && w.id !== workout.id)
    .sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : a.sessionDate > b.sessionDate ? -1 : 0));

  for (const candidate of mine) {
    const sets = setsByWorkout.get(candidate.id) ?? [];
    if (!sets.length) continue;
    const exercises = new Set(sets.map((s) => s.exerciseId));
    const scheduled = candidate.scheduledSessionId
      ? input.sessions.find((s) => s.id === candidate.scheduledSessionId)
      : undefined;
    const label = scheduled?.dayLabel?.trim() || 'That session';
    return {
      workoutId: candidate.id,
      date: candidate.sessionDate,
      label: `Repeat ${shortDate(candidate.sessionDate)} · ${label}`,
      meta: `${exercises.size} exercise${exercises.size === 1 ? '' : 's'} · ${sets.length} set${sets.length === 1 ? '' : 's'} · ${volumeOf(sets).toLocaleString('en-IN')} kg`,
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

/* -------------------------------------------------------- 5b · the summary */

export interface FinishView {
  clientName: string;
  /** "Push A, logged". */
  title: string;
  /** "Week 5 of 8 · four exercises planned, four done." */
  line: string;
  /** Null when the log is open and was not started today — see `LogView`. */
  minutes: number | null;
  /** "06:00 to 06:52", or null when the log has never been closed. */
  span: string | null;
  sets: number;
  setsPlanned: number;
  volumeKg: number;
  records: PrCard[];
  /** How many of them are worth saying out loud. */
  announced: number;
  /** The pack sentence, exact about what it will move. */
  pack: string;
  /** Whether there is a pack to take one off at all. */
  packMoves: boolean;
  packRemaining: number | null;
  packTotal: number | null;
  /** Already marked done or not-trained — the dock says so instead of offering. */
  closed: boolean;
  closedAs: string | null;
  /** The WhatsApp text, if the trainer leaves the switch on. */
  message: string;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

function count(n: number): string {
  return n <= 10 ? WORDS[n] : String(n);
}

function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * FRAME 5b — FOUR FIGURES AND ONE HONEST SENTENCE.
 *
 * The sentence is the screen. §09 names this frame as the one most likely to
 * break the rule it is about: **finishing the log does not move the pack.** A
 * pack moves on *done* or *no-show*, never on *booked* — so the strip says what
 * the pack is NOW and the sentence says what marking it done will do to it. The
 * page this replaces printed "Package after this · 7 of 12", which said the log
 * does the moving and was wrong about the number twice over.
 */
export function buildFinish(
  input: LogInput,
  view: LogView,
  pack: { remaining: number; total: number } | null,
): FinishView {
  /* No `now` here, and that is not tidiness: every figure this view prints is
     already settled on `LogView`, which was built against one clock reading. A
     second reading in a second function is how a screen ends up saying 52
     minutes in the strip and 53 in the summary. */
  const planned = view.exercises.filter((e) => !e.unplanned).length;
  const done = view.exercises.filter((e) => e.started).length;

  const scheduled = view.scheduledId
    ? input.sessions.find((s) => s.id === view.scheduledId)
    : undefined;
  const status = (scheduled?.status ?? '').toLowerCase();
  const closed = scheduled ? status !== 'scheduled' : false;

  const head = view.planHead ?? 'Session';
  const first = view.clientName.split(' ')[0];
  const loud = view.records.filter((r) => r.announced);

  const pieces = [
    `${first} — ${head} done.`,
    ...loud.map((r) => `${r.value} ${r.unit} ${r.reps ?? ''} on the ${r.name.toLowerCase()}, a new best.`.replace('  ', ' ')),
    `${view.setsLogged} sets, ${view.volumeKg.toLocaleString('en-IN')} kg.`,
  ];

  return {
    clientName: view.clientName,
    title: `${head}, logged`,
    line: [
      view.plan?.split(' · ')[1],
      `${count(planned)} exercise${planned === 1 ? '' : 's'} planned, ${count(done)} done`,
    ]
      .filter(Boolean)
      .join(' · '),
    minutes: view.minutes,
    span: view.endedAt ? `${clock(view.startedAt)} to ${clock(view.endedAt)}` : null,
    sets: view.setsLogged,
    setsPlanned: view.setsPlanned,
    volumeKg: view.volumeKg,
    records: view.records,
    announced: loud.length,
    pack: pack
      ? `The pack is ${pack.remaining} of ${pack.total} right now and will be ${Math.max(0, pack.remaining - 1)} of ${pack.total} the moment somebody marks today done.`
      : 'There is no session pack to take one off. Marking it done records that it happened.',
    packMoves: pack !== null,
    packRemaining: pack?.remaining ?? null,
    packTotal: pack?.total ?? null,
    closed,
    closedAs: closed ? status : null,
    message: pieces.join(' '),
  };
}

/* ------------------------------------------- 4a · one exercise, every session */

export interface HistorySet {
  setId: string;
  number: number;
  load: string;
  reps: string;
  rpe: number | null;
  note: string | null;
  pr: boolean;
}

export interface HistorySession {
  workoutId: string;
  date: string;
  /** "Tue 11 Aug", or "Today · Tue 11 Aug". */
  label: string;
  today: boolean;
  volumeKg: number;
  verdict: Verdict;
  sets: HistorySet[];
  /**
   * THE SESSION'S TOP SET, AS A NUMBER — the same figure `sequence` writes out.
   *
   * `sequence` is the whole history in one array and the sessions are another,
   * and they are pushed in one loop but not in step: a session with nothing in
   * it adds a row and no figure. So a reader that wanted *the top set of the
   * sessions in this range* had to zip two arrays by index and hope, which is
   * a bug waiting for the first empty session. The figure rides on the row it
   * belongs to instead.
   *
   * Null where there was no set to take a top of. In the logged unit — kilos
   * for a loaded movement, reps for a bodyweight one.
   */
  topFigure: number | null;
}

export interface HistoryView {
  clientId: string;
  clientName: string;
  exerciseId: string;
  exerciseName: string;
  logType: LogType;
  sessions: HistorySession[];
  /** The sequence, written out. Never charted — see `buildProgress`. */
  sequence: { value: string; best: boolean }[];
  /**
   * THE SETS THEMSELVES, SO A CORRECTION CAN BE RE-JUDGED IN THE BROWSER.
   *
   * Frame 7a's whole claim is that **a record is computed on read**: correct one
   * set from November and the gold leaves November *and* every session after it
   * re-judges in the same frame. A screen that only asserted that would be
   * making a promise; this one keeps it, by re-running `walkForward` over a
   * patched copy of these rows while the trainer is still typing.
   *
   * `walkForward` is pure and this module imports nothing, so the same function
   * runs on the server for the page and in the browser for the preview. Two
   * copies of the rule is how a preview ends up disagreeing with the save.
   */
  raw: { sets: LogSet[]; dateOf: Record<string, string> };
}

/**
 * Walk a client's sets on one exercise forward, judging each session against
 * everything before it.
 *
 * `bestLoadFloor` is deliberately NOT a parameter. It is an all-time maximum,
 * and walking forward means judging Thursday with only what Tuesday knew —
 * handing it the future's answer would tag every early session `none`.
 */
export function walkForward(
  sets: LogSet[],
  dateOf: Record<string, string>,
  logType: LogType,
  plateStep: number,
  todayIso: string,
): { sessions: HistorySession[]; sequence: { value: string; best: boolean }[] } {
  const byWorkout = new Map<string, LogSet[]>();
  for (const set of sets) {
    if (!(set.workoutSessionId in dateOf)) continue;
    const arr = byWorkout.get(set.workoutSessionId) ?? [];
    arr.push(set);
    byWorkout.set(set.workoutSessionId, arr);
  }

  const order = [...byWorkout.keys()].sort((a, b) => {
    const da = dateOf[a] ?? '';
    const db = dateOf[b] ?? '';
    return da < db ? -1 : da > db ? 1 : 0;
  });

  const seen: LogSet[] = [];
  const sessions: HistorySession[] = [];
  const sequence: { value: string; best: boolean }[] = [];
  let running = 0;

  for (const workoutId of order) {
    const own = (byWorkout.get(workoutId) ?? []).sort((a, b) => a.setNumber - b.setNumber);
    const verdict = judge(own, seen, logType, plateStep);
    const date = dateOf[workoutId] ?? '';
    const top = topSet(own, logType);
    const figure = top ? (logType === 'reps' ? (top.reps ?? 0) : (top.loadKg ?? 0)) : null;

    sessions.push({
      workoutId,
      date,
      label: date === todayIso ? `Today · ${stampDate(date)}` : stampDate(date),
      today: date === todayIso,
      volumeKg: volumeOf(own),
      verdict: verdict.kind,
      sets: own.map((s) => ({
        setId: s.id,
        number: s.setNumber,
        load: s.loadKg != null ? trim1(s.loadKg) : '—',
        reps: s.reps != null ? String(s.reps) : '—',
        rpe: s.rpe ?? null,
        note: s.notes?.trim() || null,
        pr: verdict.kind !== 'none' && verdict.kind !== 'matched' && verdict.setId === s.id,
      })),
      topFigure: figure,
    });

    if (figure !== null) {
      sequence.push({ value: trim1(figure), best: figure > running });
      running = Math.max(running, figure);
    }

    seen.push(...own);
  }

  // Newest first for reading; the sets inside each stay in the order they
  // happened, because set 3 only means something after set 2 — and the tag is
  // on the set, not on the day.
  sessions.reverse();

  return { sessions, sequence };
}

/**
 * FRAME 4a — JUDGED AT THE TIME, NOT TAGGED.
 *
 * The history is walked **forward** and each session judged against everything
 * before it, by the same `judge` the console uses. So four of five sessions
 * carry a tag and the oldest does not, because there was nothing before it.
 * **There is no stored flag to disagree with** — which is also what makes frame
 * 7a work: correct one set and every row below it re-judges on the next read.
 *
 * This page used to be the one that could not use `bestLoadByExercise` — an
 * all-time maximum is the future's answer, and walking forward means judging
 * Thursday with only what Tuesday knew, so handing it in would have tagged every
 * early session `none`. That is no longer a special case: the floor is gone from
 * `LogInput` entirely and `judge` takes only what it is given, which is what
 * this walk was doing by hand all along.
 */
export function buildHistory(
  input: LogInput,
  clientId: string,
  exerciseId: string,
  now: number,
): HistoryView {
  const exercise = input.exercises.find((e) => e.id === exerciseId);
  const clientName = input.clients.find((c) => c.id === clientId)?.name?.trim() || 'Client';

  const mine = input.workouts.filter((w) => w.clientId === clientId);
  const dateOf: Record<string, string> = Object.fromEntries(
    mine.map((w) => [w.id, w.sessionDate] as const),
  );

  const own = input.sets.filter(
    (s) => s.exerciseId === exerciseId && s.workoutSessionId in dateOf,
  );

  const logType = readLogType(exercise, own);
  const { sessions, sequence } = walkForward(
    own,
    dateOf,
    logType,
    input.plateStepKg,
    isoDay(now),
  );

  return {
    clientId,
    clientName,
    exerciseId,
    exerciseName: exercise?.name ?? 'An exercise the library does not know',
    logType,
    sessions,
    sequence,
    raw: { sets: own, dateOf },
  };
}

/* ------------------------------------------------------------ 4b · progress */

export type ProgressRange = '8w' | '6m' | 'all';

export const RANGE_DAYS: Record<ProgressRange, number | null> = { '8w': 56, '6m': 183, all: null };

export interface ProgressWeek {
  label: string;
  volumeKg: number;
  /** 0…1 against the tallest week. */
  fraction: number;
  current: boolean;
  /**
   * THE MONDAY, AS A DATE A PERSON CAN SAY — "18 Aug".
   *
   * `label` is `w1…w7`, which is an index and not a time: a trainer looking at
   * the fourth bar and asking *when was that* had nothing on the screen to
   * answer with, and the bar carried no readout either. The ordinal is still
   * what goes under the chart at seven bars and twenty-six, because a row of
   * dates does not fit at either; this is what the bar says when it is asked.
   */
  weekOf: string;
}

export interface ProgressView {
  clientId: string;
  clientName: string;
  plan: string | null;
  range: ProgressRange;
  sessions: number;
  sets: number;
  records: number;
  exerciseCount: number;
  weeks: ProgressWeek[];
  /** "3,438", and what it is against week one. */
  volumeNow: number;
  volumeDelta: string | null;
  /** The exercise the sequence is about, and the sequence itself. */
  focus: {
    exerciseId: string;
    name: string;
    logType: LogType;
    sequence: { value: string; best: boolean }[];
    unit: string;
  } | null;
  /** Every exercise with two or more sessions, so the trainer can pick. */
  choices: { exerciseId: string; name: string; sessions: number }[];
  /**
   * EVERY MOVEMENT IN THE RANGE, AS A LINE. See `ProgressMovement`.
   *
   * This screen counted ten exercises in a stat tile and then drew ONE of them,
   * chosen by a chip. The nine others were a number. Every figure here was
   * already being computed — `buildHistory` runs per exercise for the record
   * count — and thrown away on the way out.
   */
  movements: ProgressMovement[];
  bodyweight: { value: string; delta: string | null } | null;
}

/**
 * ONE EXERCISE OVER THE RANGE — the line of the movements table.
 *
 * Everything on it is read off the SAME walk forward the record count and the
 * top-set sequence are read off, so a row cannot disagree with the card above
 * it about what a client lifted.
 */
export interface ProgressMovement {
  exerciseId: string;
  name: string;
  /** Sessions with a set of this movement logged in them. */
  sessions: number;
  /** The top set at the start of the range, and at the end of it. */
  from: number | null;
  to: number;
  /** `kg` or `reps` — `readLogType`'s answer, said in the row's own unit. */
  unit: string;
  /**
   * Signed, and null where there is nothing to compare against or where the
   * movement did not move. `+0` on a lift that held is a claim about a change
   * that never happened, which is `ProgressTab`'s own rule about a single
   * reading applied one level up.
   */
  delta: number | null;
  /** Records inside the range, by the same walk `records` counts. */
  records: number;
  /** Kilos moved on this movement, inside the range. The share of the work. */
  volumeKg: number;
  /**
   * THE DAY IT WAS LAST DONE, `YYYY-MM-DD`.
   *
   * *When did they last squat* is the question a table of movements is opened
   * with as often as *how much*, and a session count cannot answer it: six
   * sessions spread over eight weeks and six in the last fortnight are the
   * same 6.
   */
  lastOn: string;
}

function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const at = new Date(y, m - 1, d);
  const back = (at.getDay() + 6) % 7;
  at.setDate(at.getDate() - back);
  return isoDay(at.getTime());
}

/**
 * FRAME 4b — VOLUME GETS A CHART. THE LOAD DOES NOT.
 *
 * Volume is a sum, so bars from zero tell the truth about it. A load is not:
 * from a zero baseline a 2.5 kg week is two pixels, and from a 50 kg baseline it
 * is everything. So the top set is written out as the sequence of numbers it
 * actually is — which is also what a coach says out loud.
 *
 * **`focus` is a choice here, and on the phone it is not.** §14 records the gap:
 * `ProgressView.topSet` on the phone is the client's MOST-LOGGED exercise, which
 * on somebody rehabbing a knee is a band walk, and the card says so with a
 * straight face. The desk has room to let the trainer pick, so it does — and the
 * most-logged one is only the default.
 */
export function buildProgress(
  input: LogInput,
  clientId: string,
  range: ProgressRange,
  now: number,
  focusExerciseId: string | null,
  bodyweight: { value: number; earlier: number | null } | null,
): ProgressView {
  const clientName = input.clients.find((c) => c.id === clientId)?.name?.trim() || 'Client';
  const days = RANGE_DAYS[range];
  const todayIso = isoDay(now);
  const floor = days == null ? '' : isoDay(now - days * 86_400_000);

  const mine = input.workouts.filter(
    (w) => w.clientId === clientId && (days == null || w.sessionDate >= floor),
  );
  const dateOf = new Map(mine.map((w) => [w.id, w.sessionDate] as const));

  const sets = input.sets.filter((s) => dateOf.has(s.workoutSessionId));
  const exerciseIds = new Set(sets.map((s) => s.exerciseId));

  /* Weeks. Every week between the first and the last gets a bar, including the
     ones with nothing in them — a gap that closes up is a gap that never
     happened, and a fortnight off is exactly what a trainer wants to see. */
  const volumeByWeek = new Map<string, number>();
  for (const set of sets) {
    const week = mondayOf(dateOf.get(set.workoutSessionId) ?? todayIso);
    volumeByWeek.set(week, (volumeByWeek.get(week) ?? 0) + (set.loadKg ?? 0) * (set.reps ?? 0));
  }
  const keys = [...volumeByWeek.keys()].sort();
  const weeks: ProgressWeek[] = [];
  if (keys.length) {
    const thisWeek = mondayOf(todayIso);
    const cursor = new Date(Date.parse(`${keys[0]}T00:00:00`));
    const end = Date.parse(`${keys[keys.length - 1]}T00:00:00`);
    while (cursor.getTime() <= end) {
      const key = isoDay(cursor.getTime());
      weeks.push({
        label: '',
        volumeKg: Math.round(volumeByWeek.get(key) ?? 0),
        fraction: 0,
        current: key === thisWeek,
        weekOf: key,
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    const tallest = weeks.reduce((max, w) => Math.max(max, w.volumeKg), 0) || 1;
    weeks.forEach((w, i) => {
      w.label = `w${i + 1}`;
      w.fraction = w.volumeKg / tallest;
    });
  }

  const first = weeks[0]?.volumeKg ?? 0;
  const current = weeks[weeks.length - 1]?.volumeKg ?? 0;
  const volumeDelta =
    weeks.length > 1 && first > 0
      ? `${current >= first ? '+' : '−'}${Math.abs(Math.round(((current - first) / first) * 100))}% on week one`
      : null;

  /* ── ONE WALK PER EXERCISE, FOUR READERS ──────────────────────────────────
     The record count, the picker, the movements table and the range filter all
     come off the same `buildHistory`, because four walks is four chances to
     disagree about what one client lifted.

     ── AND THE WALK IS UNWINDOWED WHILE THE COUNT IS NOT ────────────────────

     JUDGING has to see everything: a record is a claim about the whole history
     and a bounded window hands out gold for beating a number that was never the
     best — the console's own rule, and the reason `buildHistory` takes no
     range. COUNTING is the opposite question. *Records: 14* sat under three
     range chips and did not move when they were pressed, on all ten seeded
     clients, because it counted every record the client had ever set; so did
     *Sets*, *Sessions* and the volume chart beside it, all of which do window.
     One tile in four ignoring the screen's only control reads as the control
     being broken.

     So: judged over everything, counted where the session falls inside the
     range. `dateOf` is already the range's own set of workouts. */
  let records = 0;
  const sessionsPer = new Map<string, Set<string>>();
  /* AND WHETHER THE EXERCISE HAS A FIGURE AT ALL — see `choices` below. */
  const writable = new Set<string>();
  const movements: ProgressMovement[] = [];
  for (const exerciseId of exerciseIds) {
    const view = buildHistory(input, clientId, exerciseId, now);
    /* Chronological — `buildHistory` reverses for reading, and a first-to-last
       is the one question that cannot be asked of a reversed list. */
    const here = view.sessions.filter((s) => dateOf.has(s.workoutId)).reverse();
    if (here.length === 0) continue;

    const own = here.filter((s) => s.verdict === 'record' || s.verdict === 'quiet').length;
    records += own;
    sessionsPer.set(exerciseId, new Set(here.map((s) => s.workoutId)));

    const figures = here
      .map((s) => s.topFigure)
      .filter((n): n is number => n !== null && Number.isFinite(n));
    if (figures.some((n) => n > 0)) writable.add(exerciseId);
    const first = figures.length > 1 ? figures[0] : null;
    const last = figures.length ? figures[figures.length - 1] : 0;
    const moved = first === null ? null : Math.round((last - first) * 10) / 10;
    movements.push({
      exerciseId,
      name: view.exerciseName,
      sessions: here.length,
      from: first,
      to: last,
      unit: view.logType === 'reps' ? 'reps' : 'kg',
      delta: moved === null || Math.abs(moved) < 0.05 ? null : moved,
      records: own,
      volumeKg: here.reduce((sum, s) => sum + s.volumeKg, 0),
      lastOn: here[here.length - 1].date,
    });
  }

  /* Ranked by the work, not by the name: a trainer reading this table is
     asking what this client's training is MADE of, and the movement that ate
     the most kilos is the answer. A movement with no load to sum — the timed
     ones `writable` rejects — sorts on sessions, which is all it has. */
  movements.sort(
    (a, b) => b.volumeKg - a.volumeKg || b.sessions - a.sessions || a.name.localeCompare(b.name),
  );

  /* ── A CHOICE HAS TO HAVE A NUMBER IN IT ──────────────────────────────────
     FOUND ON A REAL CLIENT, 20 Sep 2026. Priya Pillai's most-logged movement is
     the **Assault Bike**, and the card drew *0 → 0 → 0 → 0 → 0 kg* — the
     default state of her Progress tab, with a straight face.

     `readLogType` has two members and the catalogue has three: a `duration`
     exercise folds to `weight_reps`, and its sets carry `loadKg: null` and
     `reps: null` because there is nowhere to put a time. So `topSet` returns a
     row, `figure` falls to `?? 0`, and the sequence is a row of honest-looking
     zeros. Nothing was broken enough to throw.

     The filter is on the SEQUENCE and not on `logType === 'duration'`, because
     the same hole opens for every type §14 still owes the enum — distance,
     time, a held stretch. An exercise earns the picker by having written a
     number down, whatever kind of exercise it is. */
  const choices = [...sessionsPer]
    .map(([exerciseId, seen]) => ({
      exerciseId,
      name: input.exercises.find((e) => e.id === exerciseId)?.name ?? 'Exercise',
      sessions: seen.size,
    }))
    .filter((c) => c.sessions >= 2 && writable.has(c.exerciseId))
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));

  /* A LINK CAN NAME ONE TOO, and the same test applies — `?focus=` survives in
     a shared URL long after the chip that wrote it stopped being offered. */
  const focusId = focusExerciseId && writable.has(focusExerciseId)
    ? focusExerciseId
    : choices[0]?.exerciseId ?? null;

  const focus = focusId
    ? (() => {
        const view = buildHistory(input, clientId, focusId, now);
        return {
          exerciseId: focusId,
          name: view.exerciseName,
          logType: view.logType,
          sequence: view.sequence.slice(-5),
          unit: view.logType === 'reps' ? 'reps' : 'kg',
        };
      })()
    : null;

  return {
    clientId,
    clientName,
    plan: null,
    range,
    sessions: mine.filter((w) => sets.some((s) => s.workoutSessionId === w.id)).length,
    sets: sets.length,
    records,
    exerciseCount: exerciseIds.size,
    weeks,
    volumeNow: current,
    volumeDelta,
    focus,
    choices,
    movements,
    bodyweight: bodyweight
      ? {
          value: trim1(bodyweight.value),
          // No colour and no arrow anywhere this is drawn. The app has no
          // opinion about which way a client's weight should go, and a green
          // arrow would be one.
          delta:
            bodyweight.earlier != null && bodyweight.earlier !== bodyweight.value
              ? `${bodyweight.value > bodyweight.earlier ? '+' : '−'}${trim1(Math.abs(bodyweight.value - bodyweight.earlier))} over the range`
              : null,
        }
      : null,
  };
}

/* ---------------------------------------------------------- 5a · who is it for */

export interface PickRow {
  clientId: string;
  name: string;
  /** "2 sets in · 1,245 kg", "17:00 · Full body", "Last trained 9 Aug". */
  meta: string;
  /** Where the button goes. */
  href: string;
  /** "Carry on" / "Start" / "Log". */
  verb: string;
  /** Null when there is no booking — the third group's whole point. */
  sessionId: string | null;
}

export interface PickView {
  open: PickRow[];
  booked: PickRow[];
  everybody: PickRow[];
}

const DEAD_SESSION = new Set(['done', 'no_show', 'noshow', 'cancelled', 'canceled', 'skipped']);

/**
 * FRAME 5a — ONE QUESTION, ASKED ONCE.
 *
 * Not what kind of workout, not which program, not when — all three are
 * answerable from **who**, and asking is how a two-tap action becomes a five-tap
 * one.
 *
 * **The third group is the finding.** Every logger in the teardown assumes a
 * workout belongs to a booking or a saved routine; ABC Trainerize is the only
 * one that lets a trainer log on the web at all and it requires the session to
 * be on the client's calendar first. In a gym where the trainer is on the floor,
 * a client turning up on a day they do not normally train is a Tuesday — and
 * logging is allowed to happen before programming exists. Before booking, too.
 *
 * **Still open is first** because a trainer who logs four clients a morning has
 * logs on the go, and coming back to one is the commonest reason to press this
 * at all. Nothing is started from that group: it goes straight back in.
 */
export function buildPicker(input: LogInput, now: number): PickView {
  const nameOf = new Map(input.clients.map((c) => [c.id, c.name?.trim() || 'Client'] as const));
  const todayIso = isoDay(now);

  const setsByWorkout = new Map<string, LogSet[]>();
  for (const set of input.sets) {
    const arr = setsByWorkout.get(set.workoutSessionId) ?? [];
    arr.push(set);
    setsByWorkout.set(set.workoutSessionId, arr);
  }

  const spoken = new Set<string>();

  /* 1 · still open — a log with no `endedAt`, whatever day it was started. */
  const open: PickRow[] = input.workouts
    .filter((w) => w.endedAt == null && nameOf.has(w.clientId))
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((w) => {
      const sets = setsByWorkout.get(w.id) ?? [];
      spoken.add(w.clientId);
      return {
        clientId: w.clientId,
        name: nameOf.get(w.clientId) ?? 'Client',
        meta: sets.length
          ? `${sets.length} set${sets.length === 1 ? '' : 's'} in · ${volumeOf(sets).toLocaleString('en-IN')} kg`
          : `Started ${shortDate(w.sessionDate)} · nothing logged`,
        href: `/sessions/${w.scheduledSessionId ?? w.id}/log`,
        verb: 'Carry on',
        sessionId: w.scheduledSessionId ?? null,
      };
    });

  /* 2 · booked today — opens against the booking, so the log carries its id. */
  const booked: PickRow[] = input.sessions
    .filter(
      (s) =>
        isoDay(s.scheduledAt) === todayIso &&
        !DEAD_SESSION.has(s.status.toLowerCase()) &&
        nameOf.has(s.clientId) &&
        !spoken.has(s.clientId),
    )
    .sort((a, b) => a.scheduledAt - b.scheduledAt)
    .map((s) => {
      spoken.add(s.clientId);
      const at = new Date(s.scheduledAt);
      return {
        clientId: s.clientId,
        name: nameOf.get(s.clientId) ?? 'Client',
        meta: `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}${s.dayLabel ? ` · ${s.dayLabel}` : ''}`,
        href: `/sessions/${s.id}/log`,
        verb: 'Start',
        sessionId: s.id,
      };
    });

  /* 3 · everybody else, by who trained most recently — because those are the
     people most likely to be standing in front of you. */
  const lastByClient = new Map<string, string>();
  for (const w of input.workouts) {
    if (!(setsByWorkout.get(w.id) ?? []).length) continue;
    const held = lastByClient.get(w.clientId);
    if (!held || w.sessionDate > held) lastByClient.set(w.clientId, w.sessionDate);
  }

  const everybody: PickRow[] = input.clients
    .filter((c) => !spoken.has(c.id))
    .map((c) => ({
      clientId: c.id,
      name: c.name?.trim() || 'Client',
      meta: lastByClient.has(c.id)
        ? `Last trained ${shortDate(lastByClient.get(c.id) as string)}`
        : 'Never logged',
      href: `/sessions/new?clientId=${c.id}`,
      verb: 'Log',
      sessionId: null,
    }))
    .sort((a, b) => {
      const da = lastByClient.get(a.clientId) ?? '';
      const db = lastByClient.get(b.clientId) ?? '';
      if (da !== db) return da < db ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

  return { open, booked, everybody };
}
