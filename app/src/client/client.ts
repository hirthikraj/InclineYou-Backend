/**
 * Screens 18–24 · the client role, as pure functions — FR-11.
 *
 * Not one new visual idea and not one new source of truth. Every figure below is
 * derived from the same rows the trainer's screens read, which is what "the role
 * is a lens, not an account" means in practice: a client's log of Sunday's
 * session and their trainer's log of it are one record with two readers.
 *
 * So this file is a re-keying, not a second model. Where the trainer's home is a
 * business — who is next, where the day stands, who needs chasing — this is one
 * person's day: what is on now, where they stand, what needs a decision, then the
 * work. Same grammar, same order, same reasoning.
 *
 * ── The rules that live in here rather than in a screen ───────────────────
 *
 * 1. **Rest days never count against adherence.** Adherence counts sessions the
 *    trainer scheduled that the client completed. Two of two is 100% with five
 *    rest days in the week, and a rest cell is drawn differently from a miss so
 *    it can never be misread.
 * 2. **Nothing a client does changes what they owe.** The balance here is
 *    computed from packs and the payments their trainer recorded, never from
 *    anything the client asserted.
 * 3. **A client can never see another client.** Every builder takes a clientId
 *    and filters on it first. The device only holds their own rows, and this is
 *    the second belt.
 */

import {
  isoDay,
  shortDate,
  trim1,
  type LogInput,
  type LogSet,
} from '../log/log';
import { programWeek } from '../training/training';
import {
  daysLate,
  ms,
  outstanding,
  rupees,
  rupeesShort,
  methodLabel,
  packDescription,
  type MoneyPackage,
  type MoneyPayment,
} from '../money/money';

/* ------------------------------------------------------------------- input */

/** The client's trainer, cut down to what a client is allowed to know. */
export interface ClientCoach {
  id: string;
  name: string;
  gymName: string | null;
  phone: string | null;
  /** Carried by the deep link. Never rendered. */
  upiVpa: string | null;
}

/**
 * One day of the plan, as the trainer built it.
 *
 * The log reads these too, when it seeds a session. Today reads them for the
 * screen a client sees BEFORE they start — which is most of the times they open
 * the app — so both halves have to agree, and they do because it is one table.
 */
export interface ClientPlanRow {
  id: string;
  programId: string;
  exerciseId: string;
  sets: number | null;
  reps: number | null;
  /** A timed prescription's seconds — "3 × 45s" — carried instead of reps. */
  durationSeconds: number | null;
  targetLoad: number | null;
  dayOfWeek: number | null;
  /** Which week of the program. Null reads as week 1. */
  week?: number | null;
  orderIndex: number;
}

/** The client's own row. Its age is "added you 2 Aug" on the no-plan screen. */
export interface ClientRecord {
  id: string;
  name: string;
  createdAt: number;
  deliveryMode: string | null;
}

/** One stored weekly report, exactly as the server wrote it. */
export interface ClientReport {
  id: string;
  clientId: string;
  weekStart: string;
  weekEnd: string;
  sessionsKept: number;
  sessionsPlanned: number;
  trainedDays: string | null;
  volumeKg: number;
  setsDone: number;
  newBests: number;
  bestLine: string | null;
  bestPrevious: string | null;
  sentAt: number | null;
}

export interface ClientInput extends LogInput {
  coach: ClientCoach | null;
  me: ClientRecord | null;
  programExercises: ClientPlanRow[];
  packages: MoneyPackage[];
  payments: MoneyPayment[];
  reports: ClientReport[];
}

/* -------------------------------------------------------------------- time */

const DAY_MS = 86_400_000;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * 12-hour in a hero, 24-hour in a dense list.
 *
 * The system's rule, and it is not a slip when both appear on one screen: a
 * single time somebody reads aloud is 10:30 AM, and a column of times somebody
 * scans is 18:30.
 */
export function hero(at: number): { time: string; meridiem: string } {
  const d = new Date(at);
  const h = d.getHours();
  const m = d.getMinutes();
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return {
    time: `${twelve}:${String(m).padStart(2, '0')}`,
    meridiem: h < 12 ? 'AM' : 'PM',
  };
}

export function clock24(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "10:30 AM" — one string, for a sentence rather than a hero. */
export function clock12(at: number): string {
  const { time, meridiem } = hero(at);
  return `${time} ${meridiem}`;
}

export function dayName(at: number): string {
  return DAYS[new Date(at).getDay()];
}

/** ISO weekday, 1 = Monday, which is how templates key their days. */
export function isoWeekday(at: number): number {
  const day = new Date(at).getDay();
  return day === 0 ? 7 : day;
}

export function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday 00:00 of the week `at` falls in. */
export function mondayAt(at: number): number {
  return startOfDay(at) - (isoWeekday(at) - 1) * DAY_MS;
}

function relative(at: number, now: number): string {
  const mins = Math.round((at - now) / 60_000);
  if (mins > 90) return `in ${Math.round(mins / 60)} hours`;
  if (mins > 1) return `in ${mins} min`;
  if (mins >= -1) return 'now';
  const ago = -mins;
  if (ago < 90) return `${ago} min ago`;
  return `${Math.round(ago / 60)} hours ago`;
}

/* ------------------------------------------------------------ shared reads */

const DEAD_SESSION = new Set(['cancelled']);
const DEAD_PROGRAM = new Set(['cancelled', 'archived', 'completed']);

function myName(input: ClientInput, clientId: string): string {
  return input.clients.find((c) => c.id === clientId)?.name?.trim() || 'You';
}

/** Their trainer's first name — the client app says "Ravi", not "your trainer". */
export function coachFirstName(coach: ClientCoach | null): string {
  if (!coach) return 'your trainer';
  return coach.name.trim().split(/\s+/)[0] || coach.name;
}

/** The same first-name rule, for a name that arrived from sign-in rather than sync. */
function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/**
 * § 07b, moved inside the lens.
 *
 * This used to be a wall at sign-in: a paused membership got no token, and a
 * lapsed package took the app off somebody's phone. It is a line now, because
 * everything behind it is still theirs — every session, every set — and they can
 * keep logging on their own while the coaching is off.
 *
 * What survives from 7b is the part that made it information rather than a
 * shrug: the trainer is named, the date is named, and the recovery is a message
 * to them. The person who can undo this is the one who did it.
 */
export function pausedLine(trainerName: string, pausedOn: string | null): string {
  const who = firstNameOf(trainerName);
  const when = pausedOn ? ` on ${longDateIso(pausedOn)}` : '';
  return `${who} paused your plan${when}. Your history is safe and you can still log.`;
}

/** The WhatsApp draft behind that line. Never sent silently — it opens a compose. */
export function pausedDraft(trainerName: string): string {
  return `Hi ${firstNameOf(trainerName)}, my InclineYou access is paused. Could you turn it back on?`;
}

/** "2026-07-22" → "22 July". Falls back to the raw string on anything unparseable. */
function longDateIso(iso: string): string {
  const at = new Date(`${iso}T00:00:00`);
  return Number.isNaN(at.getTime()) ? iso : longDate(at.getTime());
}

function livePlan(input: ClientInput, clientId: string) {
  return input.programs.find(
    (p) => p.clientId === clientId && !DEAD_PROGRAM.has(p.status.toLowerCase()),
  );
}

/** Every set this client has ever logged, newest workout first is NOT assumed. */
function mySets(input: ClientInput, clientId: string): { set: LogSet; date: string }[] {
  const dates = new Map(
    input.workouts.filter((w) => w.clientId === clientId).map((w) => [w.id, w.sessionDate] as const),
  );
  const out: { set: LogSet; date: string }[] = [];
  for (const set of input.sets) {
    const date = dates.get(set.workoutSessionId);
    if (date) out.push({ set, date });
  }
  return out;
}

/* ------------------------------------------------------------ 01 · Today */

export interface PlanRow {
  exerciseId: string;
  name: string;
  /** "4 × 5 · 55 kg last time", or just the target when there is no history. */
  detail: string;
  sets: number;
}

export interface SessionRow {
  id: string;
  /** "09" and "AUG" — the two-line date block on the left of a row. */
  day: string;
  month: string;
  /** "Today · 10:30" or "Sunday · 10:30". 24-hour, because this is a list. */
  when: string;
  detail: string;
  mode: 'floor' | 'remote';
  /** Today's row gets the now spine. */
  now: boolean;
  /** Last session in the pack — nobody should discover that on the day. */
  last: boolean;
  moved: boolean;
}

export interface NeedRow {
  key: 'owed' | 'pack';
  title: string;
  detail: string;
  action: string;
  severity: 'critical' | 'alert';
}

export interface LiveCard {
  sessionId: string | null;
  /** The open log, if one exists. Start becomes Resume. */
  workoutId: string | null;
  lead: string;
  time: string;
  meridiem: string;
  title: string;
  meta: string;
  running: boolean;
}

export interface TodayView {
  clientName: string;
  /** "Sun · 9 Aug · 1 session" — the app bar's sub-line. */
  dateLine: string;
  /** Which of 1a / 1b / 1c this is. */
  kind: 'session' | 'rest' | 'noplan';
  live: LiveCard | null;
  pack: { left: number; total: number | null } | null;
  week: { kept: number; planned: number; percent: number | null; days: WeekCell[] };
  owed: number;
  needs: NeedRow[];
  plan: PlanRow[];
  planCount: number;
  next: SessionRow | null;
  coach: ClientCoach | null;
  /** For 1c — when their trainer put them on the roster. */
  addedOn: string | null;
  bookedCount: number;
}

export type WeekCell = 'done' | 'miss' | 'rest' | 'unknown';

/**
 * The client's counterpart to the trainer's home.
 *
 * Band order is the trainer's home re-keyed: the live card, the rail, the thing
 * that needs a decision, then the work. The rail's third cell is the amber one on
 * both screens — the trainer's says Pending, this one says You owe, and it is the
 * same figure read from the other end.
 */
export function buildToday(input: ClientInput, clientId: string, now: number): TodayView {
  const clientName = myName(input, clientId);
  const today = startOfDay(now);
  const todayIso = isoDay(now);

  const mine = input.sessions
    .filter((s) => s.clientId === clientId && !DEAD_SESSION.has(s.status.toLowerCase()))
    .sort((a, b) => a.scheduledAt - b.scheduledAt);

  const todays = mine.filter((s) => startOfDay(s.scheduledAt) === today);
  const upcoming = mine.filter((s) => s.scheduledAt >= now);

  /* ---- is there a plan at all? 1c is the likeliest first launch there is ---- */
  const program = livePlan(input, clientId);
  const planRowsAll = program
    ? input.programExercises.filter((r) => r.programId === program.id)
    : [];
  const hasPlan = planRowsAll.length > 0;

  /* ---- the live card ---- */
  const openWorkout = input.workouts.find(
    (w) => w.clientId === clientId && w.sessionDate === todayIso && !w.endedAt,
  );
  const session = todays.find((s) => s.status.toLowerCase() === 'scheduled') ?? todays[0];
  const live = liveCard(input, session, openWorkout?.id ?? null, now);

  /* ---- the rail ---- */
  const pack = activePack(input, clientId);
  const week = weekShape(input, clientId, now);
  const owed = owedNow(input, clientId);

  /* ---- what needs a decision ---- */
  const needs: NeedRow[] = [];
  const debt = oldestDebt(input, clientId, now);
  if (debt) needs.push(debt);
  if (pack && pack.left > 0 && pack.left <= 4) {
    needs.push({
      key: 'pack',
      title: `${pack.left} session${pack.left === 1 ? '' : 's'} left`,
      detail: pack.lastOn ? `Last one ${pack.lastOn}` : 'Ask about the next pack',
      action: 'Renew',
      severity: 'alert',
    });
  }

  /* ---- today's work ---- */
  const plan = planRows(
    input,
    clientId,
    openWorkout?.id ?? null,
    session?.templateDay ?? (todays.length ? isoWeekday(now) : null),
    program?.id ?? null,
  );

  const kind: TodayView['kind'] = !hasPlan ? 'noplan' : todays.length ? 'session' : 'rest';

  return {
    clientName,
    dateLine: dateLine(now, todays.length, kind),
    kind,
    live,
    pack: pack ? { left: pack.left, total: pack.total } : null,
    week,
    owed,
    needs,
    plan: plan.slice(0, 3),
    planCount: plan.length,
    next: upcoming[0] ? sessionRow(input, upcoming[0], now, pack?.lastSessionId ?? null) : null,
    coach: input.coach,
    addedOn: input.me ? shortDate(isoDay(input.me.createdAt)) : null,
    bookedCount: upcoming.length,
  };
}

function dateLine(now: number, sessions: number, kind: TodayView['kind']): string {
  const d = new Date(now);
  const head = `${SHORT[d.getDay()]} · ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (kind === 'noplan') return head;
  if (sessions === 0) return `${head} · rest day`;
  return `${head} · ${sessions} session${sessions === 1 ? '' : 's'}`;
}

function liveCard(
  input: ClientInput,
  session: ClientInput['sessions'][number] | undefined,
  workoutId: string | null,
  now: number,
): LiveCard | null {
  if (!session) return null;
  const { time, meridiem } = hero(session.scheduledAt);
  const coach = coachFirstName(input.coach);
  const program = input.programs.find((p) => p.id === session.programId);
  const mode = (session.deliveryMode ?? 'floor') === 'remote' ? 'Remote' : 'Floor';
  const count = plannedCount(input, session, program?.id ?? null);

  // "Next session · 16 hours ago" is a sentence the screen must never produce.
  // A booked hour that has passed and was never opened is still today's session
  // — the card offers to log it, and says which of the three it is.
  const past = session.scheduledAt < now;
  const lead = workoutId
    ? 'In session'
    : past
      ? `Earlier today · ${relative(session.scheduledAt, now)}`
      : `Next session · ${relative(session.scheduledAt, now)}`;

  return {
    sessionId: session.id,
    workoutId,
    lead,
    time,
    meridiem,
    title: session.dayLabel?.trim() || program?.name?.trim() || 'Your session',
    meta: [
      `With ${input.coach?.name ?? coach}`,
      mode,
      count ? `${count} exercise${count === 1 ? '' : 's'}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    running: !!workoutId,
  };
}

/** How many exercises the plan asks for on this session's day. */
function plannedCount(
  input: ClientInput,
  session: ClientInput['sessions'][number] | undefined,
  programId: string | null,
): number {
  if (!session) return 0;
  const open = input.workouts.find((w) => w.scheduledSessionId === session.id);
  if (open) {
    return input.logExercises.filter((r) => r.workoutSessionId === open.id && !r.removedAt).length;
  }
  // Nothing logged yet, so the count comes from the program's day. The log
  // itself reads the same rows when it seeds — this is the same number.
  return countProgramDay(input, programId ?? session.programId ?? null, session.templateDay ?? null);
}

/**
 * The plan's rows for one day of one program.
 *
 * Narrowed to the week the program is actually in, worked out from its start
 * date — the same arithmetic the trainer's app uses when it seeds a log, so the
 * client's preview and the session they walk into agree. A week the trainer
 * never authored has no rows of its own and falls back to week 1, which is what
 * a one-week shape repeated has always meant.
 */
function programDay(
  input: ClientInput,
  programId: string | null,
  day: number | null,
): ClientPlanRow[] {
  if (!programId) return [];
  const all = input.programExercises.filter((r) => r.programId === programId);

  const week = programWeek(input.programs.find((p) => p.id === programId)?.startDate);
  const thisWeek = all.filter((r) => Math.max(1, r.week ?? 1) === week);
  const rows = thisWeek.length || week === 1
    ? thisWeek
    : all.filter((r) => Math.max(1, r.week ?? 1) === 1);

  const forDay = day == null ? rows : rows.filter((r) => r.dayOfWeek === day);
  // A program whose rows carry no day at all is one day repeated — that is how
  // the builder stores a single-day template, and dropping to every row is
  // better than showing nothing.
  const chosen = forDay.length ? forDay : rows.filter((r) => r.dayOfWeek == null);
  return [...chosen].sort((a, b) => a.orderIndex - b.orderIndex);
}

function countProgramDay(input: ClientInput, programId: string | null, day: number | null): number {
  return programDay(input, programId, day).length;
}

/**
 * Today's work, from whichever source is further along.
 *
 * Once a log is open it is the authority — it holds swaps, additions and
 * removals, and the plan does not. Before that the plan's own rows are what
 * today is, which is the state a client is in almost every time they open the
 * app: standing outside the gym, looking at what they are about to do.
 */
function planRows(
  input: ClientInput,
  clientId: string,
  workoutId: string | null,
  templateDay: number | null,
  programId: string | null,
): PlanRow[] {
  const history = mySets(input, clientId);

  if (workoutId) {
    const rows = input.logExercises
      .filter((r) => r.workoutSessionId === workoutId && !r.removedAt)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    return rows.map((row) => {
      const exercise = input.exercises.find((e) => e.id === row.exerciseId);
      const target =
        row.targetSets && row.targetReps ? `${row.targetSets} × ${row.targetReps}` : null;
      const last = lastTime(history, row.exerciseId, workoutId, input);
      return {
        exerciseId: row.exerciseId,
        name: exercise?.name ?? 'Exercise',
        detail: [target, last].filter(Boolean).join(' · ') || 'No target set',
        sets: row.targetSets ?? 0,
      };
    });
  }

  return programDay(input, programId, templateDay).map((row) => {
    const exercise = input.exercises.find((e) => e.id === row.exerciseId);
    const work = row.durationSeconds ? `${row.durationSeconds}s` : row.reps;
    const target = row.sets && work ? `${row.sets} × ${work}` : null;
    const last = lastTime(history, row.exerciseId, null, input);
    return {
      exerciseId: row.exerciseId,
      name: exercise?.name ?? 'Exercise',
      detail: [target, last].filter(Boolean).join(' · ') || 'No target set',
      sets: row.sets ?? 0,
    };
  });
}

/** "55 kg last time" — the heaviest set of the last session that had one. */
function lastTime(
  history: { set: LogSet; date: string }[],
  exerciseId: string,
  exceptWorkoutId: string | null,
  input: ClientInput,
): string | null {
  const previous = history
    .filter((h) => h.set.exerciseId === exerciseId && h.set.workoutSessionId !== exceptWorkoutId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!previous.length) return null;
  const day = previous[0].date;
  const sameDay = previous.filter((h) => h.date === day);
  const top = sameDay.reduce((best, h) => ((h.set.loadKg ?? 0) > (best.set.loadKg ?? 0) ? h : best));
  const logType = input.exercises.find((e) => e.id === exerciseId)?.logType;
  if (logType === 'reps' || top.set.loadKg == null) {
    return top.set.reps ? `${top.set.reps} reps last time` : null;
  }
  return `${trim1(top.set.loadKg)} kg last time`;
}

/* --------------------------------------------------------- the week's shape */

/**
 * Monday to Sunday, as seven cells and a percentage.
 *
 * A day is `done` if a session was completed OR anything was logged — a client
 * who trains on a rest day has trained, whatever the plan says. `miss` is only
 * for a scheduled session in the past that was not kept. Every other day is
 * `rest`, and rest is not a miss: two of two kept is 100% with five rest days,
 * which is the number their trainer sees too.
 */
export function weekShape(
  input: ClientInput,
  clientId: string,
  now: number,
): { kept: number; planned: number; percent: number | null; days: WeekCell[] } {
  const monday = mondayAt(now);
  const today = startOfDay(now);

  const sessions = input.sessions.filter(
    (s) =>
      s.clientId === clientId &&
      s.scheduledAt >= monday &&
      s.scheduledAt < monday + 7 * DAY_MS &&
      !DEAD_SESSION.has(s.status.toLowerCase()),
  );
  const logged = new Set(
    input.workouts
      .filter((w) => w.clientId === clientId)
      .map((w) => w.sessionDate)
      .filter((date) => {
        const at = new Date(`${date}T00:00:00`).getTime();
        return at >= monday && at < monday + 7 * DAY_MS;
      }),
  );

  const days: WeekCell[] = [];
  for (let i = 0; i < 7; i += 1) {
    const at = monday + i * DAY_MS;
    const iso = isoDay(at);
    const onDay = sessions.filter((s) => startOfDay(s.scheduledAt) === at);
    const kept = onDay.some((s) => s.status.toLowerCase() === 'done') || logged.has(iso);
    if (kept) days.push('done');
    else if (onDay.length && at < today) days.push('miss');
    else if (at > today) days.push('unknown');
    else days.push('rest');
  }

  const planned = sessions.filter((s) => startOfDay(s.scheduledAt) <= today).length;
  const kept = sessions.filter((s) => s.status.toLowerCase() === 'done').length;
  return {
    kept,
    planned,
    percent: planned > 0 ? Math.round((kept / planned) * 100) : null,
    days,
  };
}

/* ------------------------------------------------------------ 04 · Sessions */

export interface PackCard {
  total: number | null;
  used: number;
  left: number;
  /** "30 Aug" — the date the last one falls on. */
  lastOn: string | null;
  lastSessionId: string | null;
  low: boolean;
  label: string;
}

export interface MovedNotice {
  sessionId: string;
  title: string;
  at: string;
  from: string;
  to: string;
  /** "you still have 4 of 24 left" — the sentence that stops the question. */
  packLine: string | null;
  confirmLabel: string;
}

export interface SessionsView {
  clientName: string;
  subtitle: string;
  pack: PackCard | null;
  upcoming: SessionRow[];
  notice: MovedNotice | null;
  coach: ClientCoach | null;
}

/**
 * A client's schedule is not a diary.
 *
 * No day strip, no week view, no month grid, no agenda gutter — those exist on
 * the trainer's side because a split shift across 27 people needs them. Here it
 * is a pack, then the sessions that are left, in order.
 */
export function buildSessions(input: ClientInput, clientId: string, now: number): SessionsView {
  const pack = activePack(input, clientId);

  const upcoming = input.sessions
    .filter(
      (s) =>
        s.clientId === clientId &&
        !DEAD_SESSION.has(s.status.toLowerCase()) &&
        s.scheduledAt >= startOfDay(now),
    )
    .sort((a, b) => a.scheduledAt - b.scheduledAt)
    .map((s) => sessionRow(input, s, now, pack?.lastSessionId ?? null));

  // The change that needs a tap: moved, and not yet confirmed. Newest first,
  // and only one at a time — two notices is a queue, and a queue is a screen.
  const movedRow = input.sessions
    .filter(
      (s) =>
        s.clientId === clientId &&
        !!s.movedFromAt &&
        !s.clientConfirmedAt &&
        !DEAD_SESSION.has(s.status.toLowerCase()) &&
        s.scheduledAt >= startOfDay(now),
    )
    .sort((a, b) => (b.movedFromAt ?? 0) - (a.movedFromAt ?? 0))[0];

  const coach = coachFirstName(input.coach);
  const notice: MovedNotice | null = movedRow
    ? {
        sessionId: movedRow.id,
        title: `${coach} moved ${whichDay(movedRow.scheduledAt, now)} session`,
        at: clock12(movedRow.movedFromAt ?? movedRow.scheduledAt),
        from: clock12(movedRow.movedFromAt ?? movedRow.scheduledAt),
        to: clock12(movedRow.scheduledAt),
        packLine:
          pack && pack.total
            ? `Nothing was deducted — a move never touches your pack, so you still have ${pack.left} of ${pack.total} left.`
            : 'Nothing was deducted — a move never touches your pack.',
        confirmLabel: `Confirm ${clock12(movedRow.scheduledAt)}`,
      }
    : null;

  return {
    clientName: myName(input, clientId),
    subtitle: notice
      ? '1 change to confirm'
      : pack
        ? `Today · ${pack.left} left in your pack`
        : `${upcoming.length} booked`,
    pack,
    upcoming,
    notice,
    coach: input.coach,
  };
}

function whichDay(at: number, now: number): string {
  const days = Math.round((startOfDay(at) - startOfDay(now)) / DAY_MS);
  if (days === 0) return "today's";
  if (days === 1) return "tomorrow's";
  return `${dayName(at)}'s`;
}

function sessionRow(
  input: ClientInput,
  session: ClientInput['sessions'][number],
  now: number,
  lastSessionId: string | null,
): SessionRow {
  const at = session.scheduledAt;
  const d = new Date(at);
  const days = Math.round((startOfDay(at) - startOfDay(now)) / DAY_MS);
  const program = input.programs.find((p) => p.id === session.programId);
  const coach = coachFirstName(input.coach);
  const last = session.id === lastSessionId;
  const moved = !!session.movedFromAt;

  return {
    id: session.id,
    day: String(d.getDate()).padStart(2, '0'),
    month: MONTHS[d.getMonth()].toUpperCase(),
    when: `${days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : dayName(at)} · ${clock24(at)}`,
    detail: moved
      ? `Moved from ${clock12(session.movedFromAt ?? at)}`
      : last
        ? 'Last one in this pack'
        : [session.dayLabel?.trim() || program?.name?.trim(), `with ${coach}`]
            .filter(Boolean)
            .join(' · '),
    mode: (session.deliveryMode ?? 'floor') === 'remote' ? 'remote' : 'floor',
    now: days === 0,
    last,
    moved,
  };
}

/* ---------------------------------------------------------------- the pack */

/**
 * The pack the client is training out of, read the way a client reads it.
 *
 * Done in neutral and left in amber, because the number a client needs is what
 * remains, not what they have used.
 */
function activePack(input: ClientInput, clientId: string): PackCard | null {
  const packs = input.packages
    .filter(
      (p) =>
        p.clientId === clientId &&
        p.type !== 'monthly' &&
        p.status === 'active' &&
        (p.sessionsRemaining ?? 0) > 0,
    )
    .sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  const pack = packs[0];
  if (!pack) return null;

  const total = pack.sessionsTotal ?? null;
  const left = pack.sessionsRemaining ?? 0;
  const used = total ? Math.max(0, total - left) : 0;

  // The date the last one falls on: count `left` bookings forward.
  const booked = input.sessions
    .filter(
      (s) =>
        s.clientId === clientId &&
        !DEAD_SESSION.has(s.status.toLowerCase()) &&
        s.status.toLowerCase() === 'scheduled',
    )
    .sort((a, b) => a.scheduledAt - b.scheduledAt);
  const lastOne = booked[left - 1] ?? null;

  return {
    total,
    used,
    left,
    lastOn: lastOne ? shortDate(isoDay(lastOne.scheduledAt)) : null,
    lastSessionId: lastOne?.id ?? null,
    low: left <= 4,
    label: total ? `${total}-session pack` : 'Your pack',
  };
}

/* ----------------------------------------------------------- 05 · Payments */

export interface ReceiptRowView {
  id: string;
  amount: string;
  /** "23-session pack · UPI · 1 Aug" — for a list that has room. */
  detail: string;
  /** "UPI · 1 Aug" — for one that leads with the receipt number instead. */
  short: string;
  receiptNo: string | null;
}

export interface ReceiptDetail {
  paidTo: string;
  forWhat: string;
  method: string;
  when: string;
  receiptNo: string;
  amount: string;
}

export interface PaymentsView {
  /** "₹9,000 due · 6 days late", or "Nothing due" — the app bar's sub-line. */
  subtitle: string;
  owed: number;
  owedLabel: string;
  paidSoFar: string;
  /** "24-session pack · ₹375 a session · was due 3 August." */
  dueLine: string | null;
  lateDays: number;
  /** The amount a part payment would leave behind, for the sheet's amber line. */
  packageId: string | null;
  receipts: ReceiptRowView[];
  latest: ReceiptDetail | null;
  allTime: string;
  since: string | null;
  coach: ClientCoach | null;
}

/**
 * A bill, not a book.
 *
 * The trainer's Money tab has two directions — payments in, the gym's cut out, a
 * running balance, a GST line. A client's has one, so it is not a ledger: every
 * row is a payment they made, and rendering those as debits would paint every
 * settled receipt in danger red, which in this system means overdue.
 */
export function buildPayments(input: ClientInput, clientId: string, now: number): PaymentsView {
  const packages = input.packages
    .filter((p) => p.clientId === clientId && p.status !== 'cancelled')
    .sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  const payments = input.payments
    .filter((p) => p.clientId === clientId && p.status === 'paid')
    .sort((a, b) => paidAtOf(b) - paidAtOf(a));

  const owed = owedNow(input, clientId);
  const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);

  // The oldest pack still owing anything is the one the screen is about.
  const open = packages.find((p) => outstanding(p, input.payments) > 0) ?? null;
  const dueAt = open?.dueDate ? new Date(`${open.dueDate}T00:00:00`).getTime() : null;
  const late = daysLate(dueAt, now);
  const perSession =
    open && open.sessionsTotal && open.sessionsTotal > 0
      ? Math.round(open.amount / open.sessionsTotal)
      : null;

  const dueLine = open
    ? [
        open.sessionsTotal ? `${open.sessionsTotal}-session pack` : packDescription(open),
        perSession ? `${rupees(perSession)} a session` : null,
        dueAt
          ? late > 0
            ? `was due ${longDate(dueAt)}`
            : `due ${longDate(dueAt)}`
          : 'no due date agreed',
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  const coachName = input.coach?.name ?? 'your trainer';
  const receipts: ReceiptRowView[] = payments.map((p) => ({
    id: p.id,
    amount: rupees(p.amount),
    detail: [
      packages.find((k) => k.id === p.packageId)?.sessionsTotal
        ? `${packages.find((k) => k.id === p.packageId)?.sessionsTotal}-session pack`
        : null,
      methodLabel(p.method),
      shortDate(isoDay(paidAtOf(p))),
    ]
      .filter(Boolean)
      .join(' · '),
    // The receipts screen leads with the number, so it needs the same line
    // without the pack — "TX-2607-1001 · UPI · 28 Jul" fits where the full one
    // truncates, and the pack is already on the receipt above it.
    short: [methodLabel(p.method), shortDate(isoDay(paidAtOf(p)))].filter(Boolean).join(' · '),
    receiptNo: p.receiptNo ?? null,
  }));

  const newest = payments[0];
  const latest: ReceiptDetail | null = newest
    ? {
        paidTo: coachName,
        forWhat: (() => {
          const pkg = packages.find((k) => k.id === newest.packageId);
          return pkg?.sessionsTotal ? `${pkg.sessionsTotal}-session pack` : 'Training';
        })(),
        method: [
          methodLabel(newest.method),
          newest.upiReference ? `ref ${newest.upiReference}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        when: `${longDate(paidAtOf(newest))}, ${clock12(paidAtOf(newest))}`,
        receiptNo: newest.receiptNo ?? '—',
        amount: rupees(newest.amount),
      }
    : null;

  const oldest = payments[payments.length - 1];

  return {
    subtitle:
      owed > 0
        ? `${rupees(owed)} due${late > 0 ? ` · ${late} day${late === 1 ? '' : 's'} late` : ''}`
        : paidTotal > 0
          ? 'Nothing due'
          : 'Nothing due yet',
    owed,
    owedLabel: rupees(owed),
    paidSoFar: rupees(paidTotal),
    dueLine,
    lateDays: late,
    packageId: open?.id ?? null,
    receipts,
    latest,
    allTime: rupees(paidTotal),
    since: oldest ? longMonth(paidAtOf(oldest)) : null,
    coach: input.coach,
  };
}

function paidAtOf(p: MoneyPayment): number {
  return ms(p.paidAt ?? p.createdAt);
}

/** Everything still owing across every open pack. Never what a client asserted. */
function owedNow(input: ClientInput, clientId: string): number {
  return input.packages
    .filter((p) => p.clientId === clientId && p.status !== 'cancelled')
    .reduce((sum, p) => sum + Math.max(0, outstanding(p, input.payments)), 0);
}

function oldestDebt(input: ClientInput, clientId: string, now: number): NeedRow | null {
  const open = input.packages
    .filter(
      (p) => p.clientId === clientId && p.status !== 'cancelled' && outstanding(p, input.payments) > 0,
    )
    .sort((a, b) => ms(a.createdAt) - ms(b.createdAt))[0];
  if (!open) return null;

  const amount = outstanding(open, input.payments);
  const dueAt = open.dueDate ? new Date(`${open.dueDate}T00:00:00`).getTime() : null;
  const late = daysLate(dueAt, now);

  return {
    key: 'owed',
    title: `${rupees(amount)} due`,
    detail: [
      open.sessionsTotal ? `${open.sessionsTotal}-session pack` : packDescription(open),
      late > 0 ? `${late} day${late === 1 ? '' : 's'} late` : dueAt ? 'due soon' : null,
    ]
      .filter(Boolean)
      .join(' · '),
    action: 'Pay',
    severity: late > 0 ? 'critical' : 'alert',
  };
}

/** "3 August" — the year is noise on a date this close. */
function longDate(at: number): string {
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

function longMonth(at: number): string {
  return new Date(at).toLocaleDateString('en-GB', { month: 'long' });
}

/* ----------------------------------------------------------- 03 · Progress */

export interface BestRowView {
  exerciseId: string;
  name: string;
  /** "Was 55 kg on 22 July", or the date it was set when it is not new. */
  detail: string;
  value: string;
  unit: string;
  /** Set inside the last seven days — the only thing that earns the gold tag. */
  fresh: boolean;
}

export interface WeightRow {
  id: string;
  value: string;
  when: string;
  delta: string | null;
}

export interface WeightView {
  /** "Sunday 9 August, morning." */
  todayLine: string;
  last: { value: number; when: string } | null;
  history: WeightRow[];
  count: number;
}

/**
 * Every personal best, newest first.
 *
 * Records first, because a client can quote them; charts second, because a client
 * can only feel them. Computed on read like everywhere else — correcting a set
 * from November fixes this list in the same frame.
 */
export function buildBests(input: ClientInput, clientId: string, now: number): BestRowView[] {
  const history = mySets(input, clientId);
  const byExercise = new Map<string, { set: LogSet; date: string }[]>();
  for (const row of history) {
    const list = byExercise.get(row.set.exerciseId);
    if (list) list.push(row);
    else byExercise.set(row.set.exerciseId, [row]);
  }

  const out: BestRowView[] = [];
  for (const [exerciseId, rows] of byExercise) {
    const exercise = input.exercises.find((e) => e.id === exerciseId);
    const reps = exercise?.logType === 'reps';
    const ranked = [...rows].sort((a, b) =>
      reps
        ? (b.set.reps ?? 0) - (a.set.reps ?? 0)
        : (b.set.loadKg ?? 0) - (a.set.loadKg ?? 0) || (b.set.reps ?? 0) - (a.set.reps ?? 0),
    );
    const best = ranked[0];
    if (!best) continue;

    // What it beat, so the row can say what changed. The previous best is the
    // best of everything logged before the day this one was.
    const earlier = rows.filter((r) => r.date < best.date);
    const previous = earlier.length
      ? earlier.reduce((top, r) =>
          reps
            ? (r.set.reps ?? 0) > (top.set.reps ?? 0)
              ? r
              : top
            : (r.set.loadKg ?? 0) > (top.set.loadKg ?? 0)
              ? r
              : top,
        )
      : null;

    const bestAt = new Date(`${best.date}T00:00:00`).getTime();
    const fresh = startOfDay(now) - startOfDay(bestAt) <= 7 * DAY_MS;

    out.push({
      exerciseId,
      name: exercise?.name ?? 'Exercise',
      detail:
        fresh && previous
          ? `Was ${reps ? `${previous.set.reps} reps` : `${trim1(previous.set.loadKg ?? 0)} kg`} on ${longDate(new Date(`${previous.date}T00:00:00`).getTime())}`
          : longDate(bestAt),
      value: reps ? String(best.set.reps ?? 0) : trim1(best.set.loadKg ?? 0),
      unit: reps ? 'REPS' : `KG × ${best.set.reps ?? 0}`,
      fresh,
    });
  }

  return out.sort((a, b) => Number(b.fresh) - Number(a.fresh) || a.name.localeCompare(b.name));
}

/**
 * The weight sheet — the history above the button, on purpose.
 *
 * Body metrics are append-only (FR-1): a reading is never overwritten, so the
 * correction path is another entry. Showing the series the client is adding to is
 * also what stops a mistyped 6.18 from being saved.
 */
export function buildWeightSheet(input: ClientInput, clientId: string, now: number): WeightView {
  const readings = input.metrics
    .filter((m) => m.clientId === clientId && m.metricType === 'weight')
    .sort((a, b) => b.recordedAt - a.recordedAt);

  const history: WeightRow[] = readings.map((m, i) => {
    const before = readings[i + 1];
    const delta = before ? m.value - before.value : null;
    return {
      id: `${m.clientId}-${m.recordedAt}`,
      value: `${trim1(m.value)} ${m.unit || 'kg'}`,
      when: `${dayName(m.recordedAt)} ${longDate(m.recordedAt)}`,
      delta: delta === null || Math.abs(delta) < 0.05 ? null : `${delta > 0 ? '+' : '−'}${trim1(Math.abs(delta))}`,
    };
  });

  const d = new Date(now);
  const partOfDay = d.getHours() < 12 ? 'morning' : d.getHours() < 17 ? 'afternoon' : 'evening';

  return {
    todayLine: `${dayName(now)} ${longDate(now)}, ${partOfDay}. Same scale, same time of day, if you can.`,
    last: readings[0]
      ? { value: readings[0].value, when: agoWords(readings[0].recordedAt, now) }
      : null,
    // Two rows, which is what the frame draws — and the reason is mechanical:
    // the sheet is capped at 88% of the screen, and a longer history pushes the
    // Save button under the fold on a 360dp phone.
    history: history.slice(1, 3),
    count: readings.length,
  };
}

function agoWords(at: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? 'one week ago' : `${weeks} weeks ago`;
}

/* ------------------------------------------------------------- 06 · Sunday */

export interface WeekView {
  id: string;
  /** "3–9 August · from Ravi". */
  range: string;
  kept: number;
  planned: number;
  percent: number;
  days: { label: string; trained: boolean }[];
  trainedLabel: string;
  restLabel: string;
  volume: string;
  sets: string;
  newBests: string;
  best: { line: string; previous: string | null } | null;
  next: SessionRow | null;
  restIsThePlan: boolean;
}

/**
 * Sunday's report, read back exactly as it was written.
 *
 * The one screen in the client app that does not come from local computation —
 * the server generated it and pushed it, and it never changes afterwards. Which
 * is why nothing here recomputes anything: the numbers on her phone and the
 * numbers her trainer got on Sunday night are the same numbers because they are
 * the same row.
 */
export function buildWeek(
  input: ClientInput,
  clientId: string,
  now: number,
  weekStart?: string,
): WeekView | null {
  const reports = input.reports
    .filter((r) => r.clientId === clientId)
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
  const report = weekStart ? reports.find((r) => r.weekStart === weekStart) : reports[0];
  if (!report) return null;

  const trained = new Set(
    (report.trainedDays ?? '')
      .split(',')
      .map((n) => Number(n.trim()))
      .filter((n) => n >= 1 && n <= 7),
  );

  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const days = letters.map((label, i) => ({ label, trained: trained.has(i + 1) }));
  const restDays = 7 - trained.size;

  const pack = activePack(input, clientId);
  const after = input.sessions
    .filter(
      (s) =>
        s.clientId === clientId &&
        !DEAD_SESSION.has(s.status.toLowerCase()) &&
        s.scheduledAt >= startOfDay(now),
    )
    .sort((a, b) => a.scheduledAt - b.scheduledAt)[0];

  return {
    id: report.id,
    range: `${rangeLabel(report.weekStart, report.weekEnd)} · from ${coachFirstName(input.coach)}`,
    kept: report.sessionsKept,
    planned: report.sessionsPlanned,
    percent:
      report.sessionsPlanned > 0
        ? Math.round((report.sessionsKept / report.sessionsPlanned) * 100)
        : 100,
    days,
    trainedLabel: trained.size
      ? `Trained · ${[...trained].sort((a, b) => a - b).map((n) => names[n - 1]).join(', ')}`
      : 'Nothing logged',
    restLabel: `${restDays} rest day${restDays === 1 ? '' : 's'}`,
    volume: Math.round(report.volumeKg).toLocaleString('en-IN'),
    sets: String(report.setsDone),
    newBests: String(report.newBests),
    best: report.bestLine ? { line: report.bestLine, previous: report.bestPrevious } : null,
    next: after ? sessionRow(input, after, now, pack?.lastSessionId ?? null) : null,
    // The report opens with what she kept, not with what she missed — and if she
    // kept everything the plan asked for, nothing in it is a miss.
    restIsThePlan: report.sessionsPlanned > 0 && report.sessionsKept >= report.sessionsPlanned,
  };
}

/** "3–9 August", collapsing the month when both ends share it. */
function rangeLabel(startIso: string, endIso: string): string {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  const sameMonth = start.getMonth() === end.getMonth();
  const month = end.toLocaleDateString('en-GB', { month: 'long' });
  if (sameMonth) return `${start.getDate()}–${end.getDate()} ${month}`;
  return `${start.getDate()} ${start.toLocaleDateString('en-GB', { month: 'long' })} – ${end.getDate()} ${month}`;
}

/* ----------------------------------------------------------------- the bill */

export { rupees, rupeesShort };
