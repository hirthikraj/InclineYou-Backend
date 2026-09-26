/**
 * THE CLIENT PROGRESS REPORT — pure arithmetic, no wire, no React.
 *
 * The brief calls this "the highest-leverage feature on the list" and gives the
 * reason in one line: **clients renew when they can see progress, and most quit
 * because progress feels invisible, not because it is absent.** Everything in
 * this file exists to make twelve weeks of work visible in one card.
 *
 * ── THE ONE RULE THIS FILE MUST NEVER BREAK ─────────────────────────────────
 *
 * Every figure here is going to be read by a client, and possibly posted
 * publicly. So it must be a number the trainer can defend to that client's face.
 * That means:
 *
 * - **nothing is invented.** A client with no measurements gets no measurement
 *   block, not a zero. `null` travels all the way to the card, and the card
 *   draws fewer blocks rather than empty ones.
 * - **no rate is a rate of what we did not see.** A past session nobody marked
 *   is in no denominator, which is `webapp-reports.html`'s rule and the same one
 *   `lib/business/report.ts` follows. It is counted and named instead.
 * - **there is no opinion about direction.** `ProgressTab.tsx` states it for
 *   bodyweight and it holds for every measurement here: a trainer cutting and a
 *   trainer bulking read the same −2.4 kg in opposite directions, and a green
 *   arrow would be the product taking a side. The card prints the change and
 *   its sign, and never colours it.
 *
 * ── AND NO HEALTH DATA, WHICH IS NOT A PREFERENCE ───────────────────────────
 *
 * A body reading is a measurement — weight, waist, chest — and is exactly what
 * this report is allowed to draw. There is no injury field, no condition field
 * and no PAR-Q flag anywhere near it, and this file must never grow one:
 * `InclineYou_MVP_interaction_map.md` excludes health data outright under the DPDP Act
 * 2023, and a report is the single worst place in the product to leak it,
 * because the whole feature is about the file leaving the building.
 */

import { DAY_MS, startOfDay } from '@/lib/today/time';

/** The windows the screen offers. Twelve is the brief's number and the default:
 *  long enough that a strength change is real, short enough that a client
 *  remembers the start of it. Four is for a client who started last month —
 *  their report is the one most likely to renew them — and twenty-four is the
 *  one a long-standing client asks for at a year end. */
export const REPORT_WEEKS = [4, 12, 24] as const;
export type ReportWeeks = (typeof REPORT_WEEKS)[number];
export const DEFAULT_WEEKS: ReportWeeks = 12;

export function parseWeeks(raw: string | string[] | undefined): ReportWeeks {
  const n = Number(typeof raw === 'string' ? raw : NaN);
  return (REPORT_WEEKS as readonly number[]).includes(n) ? (n as ReportWeeks) : DEFAULT_WEEKS;
}

/* ------------------------------------------------------------------- input */

export interface ReportSetRow {
  exerciseId: string;
  loadKg: number | null;
  reps: number | null;
  /** The owning log's date, epoch ms at the start of the day. A set's date is
   *  the SESSION's — a Tuesday session typed up on Thursday is Tuesday. */
  at: number;
}

export interface ReportMetricRow {
  metricType: string;
  value: number;
  unit: string;
  recordedAt: number;
}

export interface ReportBuildInput {
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  clientSince: number;
  trainerName: string;
  gymName: string | null;
  /** Bookings, any status, across the window. */
  sessions: Array<{ scheduledAt: number; status: string }>;
  /** Workout logs, epoch ms at the start of the training day. */
  workouts: number[];
  /** EVERY set this client has ever logged, oldest first. The whole history and
   *  not the window: a personal record is a claim about all of it. */
  sets: ReportSetRow[];
  metrics: ReportMetricRow[];
  /** `exerciseId` → display name. Missing ids are dropped, never drawn blank. */
  exerciseNames: Map<string, string>;
  now: number;
}

/* ------------------------------------------------------------------ output */

/**
 * ONE POINT ON A SERIES. Added for the charts, and the reason it carries its
 * date rather than being a bare number is that measurements are NOT evenly
 * spaced: a client weighed on week 1, week 2 and week 11 plotted at equal x
 * would draw a gentle slope where the truth is a plateau and a drop. The chart
 * gets the dates so the axis can say what it is actually spacing.
 */
export interface Reading {
  at: number;
  value: number;
}

export interface MetricChange {
  type: string;
  /** `weight` → `Weight`, `body_fat` → `Body fat`. */
  label: string;
  from: number;
  to: number;
  unit: string;
  /** `to − from`. Signed, and never coloured. */
  delta: number;
  readings: number;
  firstAt: number;
  lastAt: number;
  /** True when `from` is a reading taken BEFORE the window — see `metricChange`. */
  baselineIsOlder: boolean;
  /**
   * EVERY reading from the baseline through the window, oldest first — the
   * trajectory, not the endpoints.
   *
   * `from → to` was all this type used to carry, and it hides the one thing a
   * client most wants to know: a waist that went 92 → 90 → 88 → 90 and a waist
   * that went 92 → 90 are both "−2 cm", and only one of them is a client who
   * has started drifting back. A trainer looking at the second number wants to
   * see the shape before they send it.
   */
  series: Reading[];
}

export interface LiftGain {
  exerciseId: string;
  name: string;
  /** `load` for a movement with plates on it, `reps` for a bodyweight one. */
  kind: 'load' | 'reps';
  /** The best set on the first day of the window. */
  from: number;
  /** The best set anywhere in the window. */
  to: number;
  unit: 'kg' | 'reps';
  delta: number;
  percent: number;
  /** Days trained on this movement inside the window. */
  days: number;
  /** Sets logged on this movement inside the window. */
  sets: number;
  /**
   * The best set on each training day, oldest first. What makes a lift row a
   * trajectory rather than a pair of numbers — and the honest picture of a
   * block, deloads included, which is exactly what `from`/`to` deliberately
   * looks past. The pair is the claim; this is the evidence for it.
   */
  series: Reading[];
}

/**
 * EVERY MOVEMENT TRAINED IN THE WINDOW, WHETHER OR NOT IT WENT UP.
 *
 * `LiftGain` is a shortlist by construction — `liftGains` drops anything that
 * did not beat its own first day, which is right for a card the client keeps
 * and wrong for the trainer's own reading of the block. A movement trained
 * eighteen times that has not moved is the single most useful row on this
 * screen: it is the one to change next month, and the old build had no way to
 * even see it.
 *
 * So this is the complete census. It is never drawn on the card.
 */
export interface ExerciseWork {
  exerciseId: string;
  name: string;
  /** Days this movement was trained inside the window. */
  days: number;
  sets: number;
  reps: number;
  /** Load moved on this movement, kg. Zero for a bodyweight-only movement. */
  volumeKg: number;
  /** Heaviest set in the window, or null where nothing was loaded. */
  topLoad: number | null;
  /** Most reps in a single set. */
  topReps: number | null;
  /** The matching `LiftGain.percent`, or null where it did not gain. */
  gainPercent: number | null;
  /** True when the client's FIRST EVER set on this movement is in the window. */
  isNew: boolean;
}

/** One week of the window. A bar, with the dates that make its label true. */
export interface ReportWeek {
  /** 1-based, for `w1` … `w12`. */
  index: number;
  from: number;
  to: number;
  /** Days trained in this week. */
  count: number;
}

export interface ReportSessions {
  /** Days the client trained — a marked booking or a logged session. */
  attended: number;
  /** Bookings that settled one way or the other: done + no-show. */
  settled: number;
  noShow: number;
  /** Past bookings nobody marked. In no denominator, and named on the screen. */
  unmarked: number;
  /** `done / settled`, or null when nothing settled. */
  adherence: number | null;
}

export interface ClientReport {
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  trainerName: string;
  gymName: string | null;
  weeks: ReportWeeks;
  from: number;
  to: number;
  /** When this client joined the roster. Drawn when it falls inside the window —
   *  "started 6 weeks ago" is the most persuasive line a new client's card has. */
  clientSince: number;
  sessions: ReportSessions;
  /** One count per week, oldest first. The shape of the client's consistency. */
  weekBars: number[];
  /** The same series with its dates, for a chart that labels its own columns. */
  weekSeries: ReportWeek[];
  bestWeek: number;
  /** Weeks with at least one session in them. */
  trainedWeeks: number;
  /** The longest run of consecutive weeks trained. The retention number. */
  bestStreak: number;
  /** The measurement a client asks about first, so it is not in the list. */
  weight: MetricChange | null;
  measurements: MetricChange[];
  lifts: LiftGain[];
  /** The complete census — see `ExerciseWork`. Trainer-side only. */
  exercises: ExerciseWork[];
  /** Total load moved in the window, kg. Zero for a client who logs no loads. */
  volumeKg: number;
  /** Sets logged in the window, and the reps in them. */
  setCount: number;
  repCount: number;
  /** Movements whose first ever set falls inside the window. */
  newExerciseCount: number;
  /** Personal bests set inside the window, one per exercise per day. */
  prCount: number;
  exerciseCount: number;
  /** True when there is nothing worth sending — no sessions, no measurements, no
   *  sets. The screen refuses to generate rather than sending an empty card. */
  isThin: boolean;
}

/* ----------------------------------------------------------------- helpers */

function metricLabel(type: string): string {
  const words = type.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * ONE MEASUREMENT'S CHANGE ACROSS THE WINDOW, AND THE BASELINE THAT MAKES IT
 * TRUE.
 *
 * The obvious reading — first reading inside the window against the last — has a
 * hole a trainer would notice immediately: a client weighed in January and again
 * last week has **one** reading inside a twelve-week window, and would be
 * reported as having no change at all. The reading before the window is the
 * baseline that was true when the window opened, so it is the one to measure
 * from, and `baselineIsOlder` tells the card to say so rather than implying the
 * measurement was taken on day one.
 *
 * Null when there is only ever one reading. A `+0.0` against a single number is
 * a claim about a change that was never measured.
 */
function metricChange(rows: ReportMetricRow[], from: number, to: number): MetricChange | null {
  const sorted = [...rows].sort((a, b) => a.recordedAt - b.recordedAt);
  const inside = sorted.filter((m) => m.recordedAt >= from && m.recordedAt <= to);
  if (inside.length === 0) return null;

  const last = inside[inside.length - 1];
  const before = sorted.filter((m) => m.recordedAt < from);
  const baseline = inside.length > 1 ? inside[0] : before[before.length - 1];
  if (!baseline || baseline === last) return null;

  /* The baseline first — which is a reading BEFORE the window when there is
     only one inside it — then everything inside, in order. Deduplicated on
     identity rather than on date: two readings on one day are two readings, and
     a chart that silently merges them is a chart claiming a precision the tape
     did not have. */
  const series: Reading[] = [
    ...(baseline === inside[0] ? [] : [{ at: baseline.recordedAt, value: baseline.value }]),
    ...inside.map((m) => ({ at: m.recordedAt, value: m.value })),
  ];

  return {
    type: last.metricType,
    label: metricLabel(last.metricType),
    from: baseline.value,
    to: last.value,
    unit: last.unit || '',
    delta: Math.round((last.value - baseline.value) * 10) / 10,
    readings: inside.length + (inside.length > 1 ? 0 : 1),
    firstAt: baseline.recordedAt,
    lastAt: last.recordedAt,
    baselineIsOlder: inside.length === 1,
    series,
  };
}

/**
 * STRENGTH GAINS — first day of the window against the best day in it.
 *
 * Not "first against last": a client's last session in a twelve-week block is as
 * likely to be a deload as a peak, and a report that shows a real gain as a loss
 * because of where the window happened to close is a report that costs the
 * trainer the conversation. What a client wants to hear is *"you started at 40
 * and you have pressed 55"*, which is exactly this pair.
 *
 * Two or more training days are required. One day gives a number with nothing to
 * compare it to, and the honest version of that is silence.
 *
 * `kind` is decided by the sets themselves rather than by `exercise.log_type` —
 * that field is not on `ExerciseResponse` (BACKEND_GAPS 5) and the client's own
 * sets are the better evidence anyway: a movement they have only ever done
 * bodyweight is a reps movement for THEM, whatever the library says.
 */
function liftGains(
  sets: ReportSetRow[],
  names: Map<string, string>,
  from: number,
  to: number,
): LiftGain[] {
  const byExercise = new Map<string, ReportSetRow[]>();
  for (const s of sets) {
    if (s.at < from || s.at > to) continue;
    const list = byExercise.get(s.exerciseId);
    if (list) list.push(s);
    else byExercise.set(s.exerciseId, [s]);
  }

  const out: LiftGain[] = [];
  for (const [exerciseId, rows] of byExercise) {
    const name = names.get(exerciseId);
    if (!name) continue; // a name we could not resolve is not drawn blank

    const days = [...new Set(rows.map((r) => r.at))].sort((a, b) => a - b);
    if (days.length < 2) continue;

    const loaded = rows.some((r) => (r.loadKg ?? 0) > 0);
    const kind: 'load' | 'reps' = loaded ? 'load' : 'reps';
    const valueOf = (r: ReportSetRow) => (kind === 'load' ? r.loadKg ?? 0 : r.reps ?? 0);

    const firstDay = days[0];
    const start = Math.max(...rows.filter((r) => r.at === firstDay).map(valueOf));
    const best = Math.max(...rows.map(valueOf));
    if (start <= 0 || best <= start) continue;

    /* THE BEST SET OF EACH DAY, not every set of every day.
       A day's working sets descend — 60, 60, 55, 50 to failure — so plotting
       all of them draws a sawtooth that says nothing about the block, and the
       figure the pair above is made of is the day's TOP set. One point per day
       is the series those two numbers are the ends of. */
    const series: Reading[] = days.map((at) => ({
      at,
      value: Math.max(...rows.filter((r) => r.at === at).map(valueOf)),
    }));

    out.push({
      exerciseId,
      name,
      kind,
      from: start,
      to: best,
      unit: kind === 'load' ? 'kg' : 'reps',
      delta: Math.round((best - start) * 10) / 10,
      percent: Math.round(((best - start) / start) * 100),
      days: days.length,
      sets: rows.length,
      series,
    });
  }

  /* Ranked by the proportion gained, not by the kilos: +5 kg on a 20 kg curl is
     a bigger achievement than +5 kg on a 140 kg deadlift, and the client who did
     the first one is the one who needs to see it. Ties break on the absolute
     change so the ordering is stable. */
  return out.sort((a, b) => b.percent - a.percent || b.delta - a.delta);
}

/**
 * PERSONAL BESTS SET INSIDE THE WINDOW.
 *
 * A running best over the client's WHOLE history, so a "record" is a record —
 * beating a number they never actually reached is the one thing this figure must
 * never do, and it is exactly what a windowed read produces.
 *
 * Counted once per exercise per day. Working up 40 → 45 → 50 in one session is
 * one personal best, not three, and a card claiming three would be a card the
 * trainer has to explain.
 */
function personalBests(sets: ReportSetRow[], from: number, to: number): number {
  const best = new Map<string, number>();
  const credited = new Set<string>();
  let count = 0;

  /* Oldest first, so the running best is always "everything before this set". */
  for (const s of [...sets].sort((a, b) => a.at - b.at)) {
    const load = s.loadKg ?? 0;
    if (load <= 0) continue;
    const prior = best.get(s.exerciseId) ?? 0;
    if (load > prior) {
      best.set(s.exerciseId, load);
      const key = `${s.exerciseId}·${s.at}`;
      if (s.at >= from && s.at <= to && !credited.has(key)) {
        credited.add(key);
        count++;
      }
    }
  }
  return count;
}

/**
 * THE CENSUS — every movement trained in the window, ranked by how much of it
 * there was.
 *
 * `isNew` is computed against the WHOLE history for the same reason `prCount`
 * is: "three new movements" has to mean three the client had genuinely never
 * done, and a windowed read calls every exercise new to a client who has been
 * training for a year. `firstEver` is built from all of `sets`, and the window
 * is only then asked whether that first day falls inside it.
 *
 * Ranked on days rather than on volume, because volume is a unit a bodyweight
 * movement does not have: sorting on it puts every plank and every push-up at
 * the bottom of a trainer's list whatever they actually did.
 */
function exerciseCensus(
  sets: ReportSetRow[],
  names: Map<string, string>,
  lifts: LiftGain[],
  from: number,
  to: number,
): ExerciseWork[] {
  const firstEver = new Map<string, number>();
  for (const s of sets) {
    const seen = firstEver.get(s.exerciseId);
    if (seen === undefined || s.at < seen) firstEver.set(s.exerciseId, s.at);
  }

  const gain = new Map(lifts.map((l) => [l.exerciseId, l.percent]));
  const byExercise = new Map<string, ReportSetRow[]>();
  for (const s of sets) {
    if (s.at < from || s.at > to) continue;
    const list = byExercise.get(s.exerciseId);
    if (list) list.push(s);
    else byExercise.set(s.exerciseId, [s]);
  }

  const out: ExerciseWork[] = [];
  for (const [exerciseId, rows] of byExercise) {
    const name = names.get(exerciseId);
    if (!name) continue; // never drawn blank — `liftGains`' rule

    const loads = rows.map((r) => r.loadKg ?? 0).filter((v) => v > 0);
    const repsList = rows.map((r) => r.reps ?? 0).filter((v) => v > 0);

    out.push({
      exerciseId,
      name,
      days: new Set(rows.map((r) => r.at)).size,
      sets: rows.length,
      reps: repsList.reduce((sum, v) => sum + v, 0),
      volumeKg: Math.round(rows.reduce((sum, r) => sum + (r.loadKg ?? 0) * (r.reps ?? 0), 0)),
      topLoad: loads.length > 0 ? Math.max(...loads) : null,
      topReps: repsList.length > 0 ? Math.max(...repsList) : null,
      gainPercent: gain.get(exerciseId) ?? null,
      isNew: (firstEver.get(exerciseId) ?? 0) >= from,
    });
  }

  return out.sort((a, b) => b.days - a.days || b.sets - a.sets || a.name.localeCompare(b.name));
}

/**
 * THE LONGEST RUN OF CONSECUTIVE WEEKS TRAINED.
 *
 * The one figure on this report that is about the HABIT rather than about the
 * work, and the brief's own reason for the whole feature — *clients renew when
 * they can see progress* — lands hardest here: eleven weeks in a row is a
 * sentence a client repeats to somebody else, and it is invisible in a total.
 *
 * A gap of one week breaks it, which is the honest reading of "in a row" and
 * not a tuned threshold. It is never framed as a failure when it is short: the
 * screen prints the run and says nothing about the weeks around it.
 */
function bestStreakOf(weekBars: number[]): number {
  let best = 0;
  let run = 0;
  for (const count of weekBars) {
    run = count > 0 ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/* ------------------------------------------------------------------ the report */

export function buildClientReport(input: ReportBuildInput, weeks: ReportWeeks): ClientReport {
  const to = input.now;
  const from = startOfDay(to - weeks * 7 * DAY_MS);

  /* ── what they turned up to ───────────────────────────────────────────────
     A marked booking or a logged session, folded on the day — the roster's own
     rule for *Last attended*, and the same one the practice report uses. An
     unlogged session a client turned up to is still a session they turned up
     to, and a logged session nobody booked is still work delivered. */
  const days = new Set<number>();
  for (const s of input.sessions) {
    if (s.status === 'done' && s.scheduledAt >= from && s.scheduledAt <= to) {
      days.add(startOfDay(s.scheduledAt));
    }
  }
  for (const at of input.workouts) {
    if (at >= from && at <= to) days.add(startOfDay(at));
  }

  const windowSessions = input.sessions.filter((s) => s.scheduledAt >= from && s.scheduledAt <= to);
  const done = windowSessions.filter((s) => s.status === 'done').length;
  const noShow = windowSessions.filter((s) => s.status === 'no_show').length;
  const settled = done + noShow;
  const unmarked = windowSessions.filter(
    (s) => s.status === 'scheduled' && s.scheduledAt < input.now,
  ).length;

  /* ── the shape of the consistency ─────────────────────────────────────────
     One bar per week of the window, oldest first. A client who trained twice a
     week for twelve weeks and one who crammed twenty-four sessions into a
     fortnight have the same total, and only one of them is a client who is
     going to renew. */
  const weekBars = Array.from({ length: weeks }, () => 0);
  for (const day of days) {
    const i = Math.min(weeks - 1, Math.floor((day - from) / (7 * DAY_MS)));
    if (i >= 0) weekBars[i]++;
  }

  /* ── the measurements ─────────────────────────────────────────────────────
     Weight is pulled out because it is the one a client asks about, and the card
     has room for it as a headline where the rest are a list. */
  const byType = new Map<string, ReportMetricRow[]>();
  for (const m of input.metrics) {
    const list = byType.get(m.metricType);
    if (list) list.push(m);
    else byType.set(m.metricType, [m]);
  }

  const weight = byType.has('weight')
    ? metricChange(byType.get('weight')!, from, to)
    : null;

  const measurements = [...byType.entries()]
    .filter(([type]) => type !== 'weight')
    .map(([, rows]) => metricChange(rows, from, to))
    .filter((m): m is MetricChange => m !== null)
    /* Biggest movement first, by proportion — a 4 cm waist is a bigger story
       than a 4 cm chest, and the client can see which is which. */
    .sort((a, b) => Math.abs(b.delta / (b.from || 1)) - Math.abs(a.delta / (a.from || 1)));

  const lifts = liftGains(input.sets, input.exerciseNames, from, to);
  const exercises = exerciseCensus(input.sets, input.exerciseNames, lifts, from, to);

  const windowSets = input.sets.filter((s) => s.at >= from && s.at <= to);
  const volumeKg = Math.round(
    windowSets.reduce((sum, s) => sum + (s.loadKg ?? 0) * (s.reps ?? 0), 0),
  );

  /* ── the weeks, with the dates that label them ────────────────────────────
     `weekBars` is kept as it was because the card's painter reads it and a
     canvas wants nothing but the heights. This is the same series for a chart
     that has to say WHICH week a column is — `w7` alone is a label a client
     cannot place, and "18 Aug" is one they can. The last week's `to` is
     clamped to the window's end so the final column does not claim days that
     have not happened. */
  const weekSeries: ReportWeek[] = weekBars.map((count, i) => ({
    index: i + 1,
    from: from + i * 7 * DAY_MS,
    to: Math.min(to, from + (i + 1) * 7 * DAY_MS - 1),
    count,
  }));

  return {
    clientId: input.clientId,
    clientName: input.clientName,
    clientPhone: input.clientPhone,
    trainerName: input.trainerName,
    gymName: input.gymName,
    weeks,
    from,
    to,
    clientSince: input.clientSince,
    sessions: {
      attended: days.size,
      settled,
      noShow,
      unmarked,
      adherence: settled > 0 ? Math.round((done / settled) * 100) : null,
    },
    weekBars,
    weekSeries,
    bestWeek: weekBars.reduce((m, v) => Math.max(m, v), 0),
    trainedWeeks: weekBars.filter((v) => v > 0).length,
    bestStreak: bestStreakOf(weekBars),
    weight,
    measurements,
    lifts,
    exercises,
    volumeKg,
    setCount: windowSets.length,
    repCount: windowSets.reduce((sum, s) => sum + (s.reps ?? 0), 0),
    newExerciseCount: exercises.filter((e) => e.isNew).length,
    prCount: personalBests(input.sets, from, to),
    exerciseCount: new Set(windowSets.map((s) => s.exerciseId)).size,
    isThin: days.size === 0 && weight === null && measurements.length === 0 && lifts.length === 0,
  };
}

/* ------------------------------------------------------------------ formatting */

/** `72.4` → `72.4`, `72` → `72`. A trailing `.0` on a bodyweight reads as a
 *  precision the scale did not have. */
export function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1);
}

/** `+2.5` / `−1.2`. A true minus sign, not a hyphen — this string is going into
 *  a card somebody may post publicly. */
export function signed(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${trim(Math.abs(n))}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `14 Aug` — the card's date stamps. */
export function shortDate(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** `14 Aug 2026`. */
export function longDate(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** `6 Jun — 29 Aug 2026`, and the year twice only when it changes. The card has
 *  one line for the whole window and a repeated year spends a third of it. */
export function dateRange(from: number, to: number): string {
  const a = new Date(from);
  const b = new Date(to);
  return a.getFullYear() === b.getFullYear()
    ? `${a.getDate()} ${MONTHS[a.getMonth()]} — ${longDate(to)}`
    : `${longDate(from)} — ${longDate(to)}`;
}

/**
 * THE WHATSAPP MESSAGE.
 *
 * A `wa.me` deep link carries text and nothing else, so this is the half of the
 * share that WhatsApp can actually deliver in one tap; the card is an image the
 * trainer attaches or posts. It is written as a message from the TRAINER to the
 * client, in the second person, because that is who is about to send it — a
 * summary written in the third person reads as a document the client was cc'd
 * on.
 *
 * It is a first draft on purpose. The trainer edits it in their own composer
 * before sending, which is the one part of "sending a WhatsApp" that never
 * happens on a server — the same thing `POST /v1/clients/{id}/nudge` says about
 * every template it renders.
 */
export function reportMessage(r: ClientReport): string {
  const lines: string[] = [];
  const firstName = r.clientName.split(' ')[0];

  lines.push(`${firstName} — your last ${r.weeks} weeks 💪`);
  lines.push('');

  if (r.sessions.attended > 0) {
    lines.push(`• ${r.sessions.attended} session${r.sessions.attended === 1 ? '' : 's'} done`);
  }
  if (r.sessions.adherence !== null) {
    lines.push(`• ${r.sessions.adherence}% of what we booked`);
  }
  if (r.weight) {
    lines.push(`• Weight ${trim(r.weight.from)} → ${trim(r.weight.to)} ${r.weight.unit} (${signed(r.weight.delta)})`);
  }
  for (const m of r.measurements.slice(0, 3)) {
    lines.push(`• ${m.label} ${trim(m.from)} → ${trim(m.to)} ${m.unit} (${signed(m.delta)})`);
  }
  for (const l of r.lifts.slice(0, 3)) {
    lines.push(`• ${l.name} ${trim(l.from)} → ${trim(l.to)} ${l.unit} (+${l.percent}%)`);
  }
  if (r.prCount > 0) {
    lines.push(`• ${r.prCount} personal best${r.prCount === 1 ? '' : 's'}`);
  }

  lines.push('');
  lines.push(`Proud of this. Keep going — ${r.trainerName}`);
  return lines.join('\n');
}
