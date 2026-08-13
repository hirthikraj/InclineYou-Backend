/**
 * Reports and adherence — screens 4a, 4b and 4c, derived from local tables.
 *
 * Pure, like `home/deck`, `clients/roster`, `diary/diary` and `money/money`:
 * `now` and the rows come in as arguments, nothing here reads the database or
 * the clock.
 *
 * ── The two refusals ──────────────────────────────────────────────────────
 *
 * Trainerize computes the right metrics. "Sign-ins per week", "Workouts per
 * week", Exercise Compliance from scheduled workouts completed — those are the
 * numbers, and this file takes the definitions. It refuses the two decisions
 * around them:
 *
 *   · **Weekly recalculation.** Trainerize's scores are "calculated every Sunday
 *     night", which means a client who stopped on Tuesday looks fine until the
 *     weekend. Every function here runs on the frame it is called, over rows
 *     that are already on the phone, so a Tuesday miss shows on Tuesday.
 *   · **Web-only.** Trainerize shows compliance on a web dashboard. A trainer
 *     standing on a gym floor has a phone. That is the whole argument.
 *
 * ── The rule that makes the score usable ──────────────────────────────────
 *
 * **Rest days never count against anyone.** Adherence is scheduled sessions the
 * client completed, over scheduled sessions, and a day with nothing scheduled is
 * not in the denominator. A score a trainer argues with is a score they ignore,
 * and every "you missed 4 of 7 days" reading of a three-day-a-week plan is an
 * argument waiting to happen.
 */

import { DAY_MS, daysBetween, startOfDay } from '../home/time';
import { readMode } from '../home/mode';

/* ------------------------------------------------------------------- input */

export interface ReportClient {
  id: string;
  name: string;
  status: string;
  /** How many sessions a week they are on. Used for the "3/wk" line, never for the score. */
  sessionsPerWeek?: number | null;
  deliveryMode?: string | null;
  createdAt: Date | number;
  updatedAt?: Date | number;
}

export interface ReportSession {
  id: string;
  clientId: string;
  scheduledAt: Date | number;
  durationMinutes?: number | null;
  status: string;
  deliveryMode?: string | null;
}

export interface ReportPayment {
  id: string;
  amount: number;
  status: string;
  paidAt?: Date | number | null;
}

export interface ReportProgram {
  id: string;
  clientId: string;
  name: string;
  status: string;
}

/** When the trainer is open. A closed weekday is the difference between a gap and a choice. */
export interface ReportHours {
  weekday: number; // 0 = Monday
  startMinute: number;
  endMinute: number;
}

export interface ReportInput {
  clients: ReportClient[];
  sessions: ReportSession[];
  payments: ReportPayment[];
  programs: ReportProgram[];
  hours: ReportHours[];
}

export const EMPTY_REPORT_INPUT: ReportInput = {
  clients: [],
  sessions: [],
  payments: [],
  programs: [],
  hours: [],
};

/* ------------------------------------------------------------- vocabulary */

const DONE = new Set(['done', 'completed']);
const NO_SHOW = new Set(['no_show', 'noshow']);
const CANCELLED = new Set(['cancelled', 'canceled']);
const PAID = new Set(['paid', 'confirmed', 'completed', 'success']);
const LIVE_CLIENT = new Set(['active', 'trial']);

function ms(value: Date | number | null | undefined): number {
  if (value == null) return 0;
  return value instanceof Date ? value.getTime() : value;
}

/** A session that happened. The only thing that counts as delivered. */
function delivered(status: string): boolean {
  return DONE.has(status.toLowerCase());
}

/**
 * A session the client did not turn up to.
 *
 * A cancellation is NOT a no-show. Somebody who called on Tuesday to move
 * Thursday did the right thing, and counting that against them — or against the
 * trainer's no-show rate — is the kind of number that makes a trainer stop
 * trusting the screen.
 */
function noShow(status: string): boolean {
  return NO_SHOW.has(status.toLowerCase());
}

function cancelled(status: string): boolean {
  return CANCELLED.has(status.toLowerCase());
}

/* -------------------------------------------------------------- the ranges */

export type Range = '7d' | '30d' | 'year';

export const RANGES: { key: Range; label: string }[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'year', label: 'Year' },
];

export const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, year: 365 };

export const RANGE_TITLE: Record<Range, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  year: 'Last 12 months',
};

export interface Window {
  /** Inclusive, at local midnight. */
  from: number;
  /** Exclusive. Tomorrow's midnight, so today is always in the window. */
  to: number;
  days: number;
}

/**
 * The window a range covers, and the one before it.
 *
 * `to` is tomorrow's midnight rather than `now`: a session at 6pm today is part
 * of today, and a window that ends at 9:24am would drop it and make every
 * morning's figures look like a collapse.
 */
export function windowFor(now: number, range: Range): { current: Window; previous: Window } {
  const days = RANGE_DAYS[range];
  const to = startOfDay(now) + DAY_MS;
  const from = to - days * DAY_MS;
  return {
    current: { from, to, days },
    previous: { from: from - days * DAY_MS, to: from, days },
  };
}

function inWindow(at: number, w: Window): boolean {
  return at >= w.from && at < w.to;
}

/* ----------------------------------------------------------------- reports */

export interface MetricCard {
  key: MetricKey;
  label: string;
  value: string;
  delta: { direction: 'up' | 'down' | 'flat'; text: string } | null;
  /** One entry per day of the window, normalised to 0…1. */
  spark: number[];
}

export type MetricKey = 'delivered' | 'training';

export interface ReportRow {
  key: string;
  label: string;
  meta: string;
  value: string;
  /** No-shows are the one row that is a problem rather than a fact. */
  alert?: boolean;
}

export interface ReportsView {
  subtitle: string;
  metrics: MetricCard[];
  rows: ReportRow[];
  /** True when there is nothing in the window at all — the screen says so instead of showing zeroes. */
  empty: boolean;
}

export function buildReports(input: ReportInput, now: number, range: Range): ReportsView {
  const { current, previous } = windowFor(now, range);

  const deliveredNow = countDelivered(input.sessions, current);
  const deliveredWas = countDelivered(input.sessions, previous);

  const trainingNow = countTraining(input.sessions, current);
  const trainingWas = countTraining(input.sessions, previous);

  const metrics: MetricCard[] = [
    {
      key: 'delivered',
      label: 'Sessions delivered',
      value: String(deliveredNow),
      delta: percentDelta(deliveredNow, deliveredWas),
      spark: dailySpark(input.sessions, current, (s) => delivered(s.status)),
    },
    {
      key: 'training',
      label: 'Clients training',
      value: String(trainingNow),
      delta: countDelta(trainingNow, trainingWas),
      // Against the roster, not against its own peak. This metric has a real
      // ceiling — everybody — and normalising to the tallest bucket would make a
      // week where five of twenty-seven trained look identical to one where all
      // twenty-seven did.
      spark: trainingSpark(input.sessions, current, input.clients.length),
    },
  ];

  return {
    subtitle: RANGE_TITLE[range],
    metrics,
    rows: buildRows(input, now, current),
    empty: deliveredNow === 0 && trainingNow === 0,
  };
}

function countDelivered(sessions: ReportSession[], w: Window): number {
  return sessions.filter((s) => delivered(s.status) && inWindow(ms(s.scheduledAt), w)).length;
}

/** Distinct clients who trained at least once in the window. */
function countTraining(sessions: ReportSession[], w: Window): number {
  const seen = new Set<string>();
  sessions.forEach((s) => {
    if (delivered(s.status) && inWindow(ms(s.scheduledAt), w)) seen.add(s.clientId);
  });
  return seen.size;
}

/**
 * Four numbers that decide whether this is a business.
 *
 * Kept clients, revenue per client, hours on the floor, no-shows. Trainerize
 * computes all four and shows them on a web dashboard; these are the same
 * definitions on the only screen a trainer has while working.
 */
function buildRows(input: ReportInput, now: number, w: Window): ReportRow[] {
  const rows: ReportRow[] = [];

  /* Kept clients. Of the people who had been training three months ago, how
     many still are. A retention figure over a roster that is two months old is
     meaningless, so it is withheld rather than invented. */
  const kept = keptClients(input, now);
  if (kept) {
    rows.push({
      key: 'kept',
      label: 'Kept clients',
      meta: `${kept.still} of ${kept.total} still training after 3 months`,
      value: `${kept.percent}%`,
    });
  }

  /* Revenue per client per month, over the window. Payments, not billings:
     this row answers "what does a client bring in", and a debt brings in
     nothing until it is paid. */
  const collected = input.payments
    .filter((p) => PAID.has(p.status.toLowerCase()) && inWindow(ms(p.paidAt), w))
    .reduce((sum, p) => sum + p.amount, 0);
  const paying = new Set(
    input.payments
      .filter((p) => PAID.has(p.status.toLowerCase()) && inWindow(ms(p.paidAt), w))
      .map((p) => p.id),
  ).size;
  const activeClients = input.clients.filter((c) => LIVE_CLIENT.has(c.status.toLowerCase())).length;
  if (activeClients > 0 && paying > 0) {
    const months = Math.max(1, w.days / 30);
    const perClient = Math.round(collected / months / activeClients);
    rows.push({
      key: 'per-client',
      label: 'Per client, per month',
      meta: `${rupeesFlat(collected)} from ${activeClients} client${activeClients === 1 ? '' : 's'}`,
      value: rupeesFlat(perClient),
    });
  }

  /* Hours on the floor. Real minutes from the sessions that happened, defaulting
     to 60 where a session never had a duration — which is what an hour-long PT
     session is, and the honest guess. */
  const done = input.sessions.filter(
    (s) => delivered(s.status) && inWindow(ms(s.scheduledAt), w),
  );
  if (done.length) {
    const minutes = done.reduce((sum, s) => sum + (s.durationMinutes ?? 60), 0);
    const perDay = (done.length / w.days).toFixed(1);
    rows.push({
      key: 'hours',
      label: 'Hours on the floor',
      meta: `${done.length} session${done.length === 1 ? '' : 's'} · ${perDay} a day`,
      value: `${Math.round(minutes / 60)}h`,
    });
  }

  /* No-shows, against everything that was booked and not called off. A
     cancellation is excluded from both halves — see `noShow` above. */
  const booked = input.sessions.filter(
    (s) => inWindow(ms(s.scheduledAt), w) && !cancelled(s.status) && ms(s.scheduledAt) < now,
  );
  const missed = booked.filter((s) => noShow(s.status));
  if (booked.length) {
    const percent = (missed.length / booked.length) * 100;
    rows.push({
      key: 'no-shows',
      label: 'No-shows',
      meta: `${missed.length} of ${booked.length} booked`,
      value: `${percent < 10 ? percent.toFixed(1) : Math.round(percent)}%`,
      alert: missed.length > 0,
    });
  }

  return rows;
}

/**
 * Retention at three months.
 *
 * Denominator: clients who existed three months ago. Numerator: how many of
 * those have trained in the last month. Returns null when the denominator is
 * empty, because "100% kept" of nobody is a lie that looks like good news.
 */
function keptClients(
  input: ReportInput,
  now: number,
): { still: number; total: number; percent: number } | null {
  const threeMonths = now - 90 * DAY_MS;
  const lastMonth = now - 30 * DAY_MS;

  const cohort = input.clients.filter((c) => ms(c.createdAt) <= threeMonths);
  if (!cohort.length) return null;

  const trainedRecently = new Set(
    input.sessions
      .filter((s) => delivered(s.status) && ms(s.scheduledAt) >= lastMonth)
      .map((s) => s.clientId),
  );
  const still = cohort.filter((c) => trainedRecently.has(c.id)).length;
  return { still, total: cohort.length, percent: Math.round((still / cohort.length) * 100) };
}

/* ------------------------------------------------------------- sparklines */

/**
 * One bar per day, normalised against the tallest.
 *
 * Against the tallest and not against a fixed ceiling: a sparkline is about
 * shape, and a run of 2, 3, 2, 4 flattened against a scale of 10 has no shape at
 * all. The number above it is the magnitude.
 *
 * A year is 365 bars in 40px, which is a smear. Long ranges are bucketed into
 * roughly 30 columns so each bar is still a bar.
 */
function dailySpark(
  sessions: ReportSession[],
  w: Window,
  match: (s: ReportSession) => boolean,
): number[] {
  const buckets = Math.min(w.days, 30);
  const width = Math.ceil(w.days / buckets);
  const counts = new Array<number>(buckets).fill(0);

  sessions.forEach((s) => {
    const at = ms(s.scheduledAt);
    if (!inWindow(at, w) || !match(s)) return;
    const day = Math.floor((startOfDay(at) - w.from) / DAY_MS);
    const bucket = Math.min(buckets - 1, Math.floor(day / width));
    counts[bucket] += 1;
  });

  const peak = Math.max(...counts, 1);
  return counts.map((c) => c / peak);
}

/**
 * How many distinct clients were training as of each day.
 *
 * A rolling four-week window rather than a daily count, because a daily count of
 * distinct clients is a sawtooth between 0 and 6 and says nothing. This is the
 * curve that answers "is the roster growing".
 *
 * @param ceiling The roster size. Bars are drawn against it rather than against
 *                the series' own peak, so a full bar means everybody trained.
 *                Falls back to the peak when the roster is empty, which can only
 *                happen if there are no clients and therefore no bars.
 */
function trainingSpark(sessions: ReportSession[], w: Window, ceiling: number): number[] {
  const buckets = Math.min(w.days, 30);
  const width = Math.ceil(w.days / buckets);
  const out: number[] = [];

  for (let b = 0; b < buckets; b += 1) {
    const at = w.from + (b + 1) * width * DAY_MS;
    const since = at - 28 * DAY_MS;
    const seen = new Set<string>();
    sessions.forEach((s) => {
      const t = ms(s.scheduledAt);
      if (delivered(s.status) && t >= since && t < at) seen.add(s.clientId);
    });
    out.push(seen.size);
  }

  const scale = ceiling > 0 ? ceiling : Math.max(...out, 1);
  return out.map((v) => v / scale);
}

function percentDelta(now: number, was: number): MetricCard['delta'] {
  // No previous period to compare against. "▲ ∞%" is not a delta.
  if (was === 0) return now === 0 ? null : { direction: 'up', text: 'new' };
  const change = Math.round(((now - was) / was) * 100);
  if (change === 0) return { direction: 'flat', text: 'level' };
  return { direction: change > 0 ? 'up' : 'down', text: `${Math.abs(change)}%` };
}

function countDelta(now: number, was: number): MetricCard['delta'] {
  const change = now - was;
  if (change === 0) return { direction: 'flat', text: 'level' };
  return { direction: change > 0 ? 'up' : 'down', text: String(Math.abs(change)) };
}

/* --------------------------------------------------------- inside a metric */

export interface MetricLeader {
  clientId: string;
  name: string;
  meta: string;
  count: number;
}

export interface MetricView {
  title: string;
  subtitle: string;
  /** The pair the whole screen turns on. */
  delivered: number;
  booked: number;
  missed: number;
  /**
   * Seven bars, Monday first, as raw counts.
   *
   * Counts and not fractions: `WeekBars` normalises against its own peak, and
   * pre-normalising here would mean the component divides an already-divided
   * number and every bar draws full.
   */
  weekdays: { label: string; count: number; open: boolean }[];
  leaders: MetricLeader[];
  /** The line that does the thinking, or null when there is nothing to say. */
  note: string | null;
}

const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEK_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function buildMetric(
  input: ReportInput,
  now: number,
  range: Range,
  key: MetricKey,
): MetricView {
  const { current } = windowFor(now, range);
  const inRange = input.sessions.filter((s) => inWindow(ms(s.scheduledAt), current));

  const done = inRange.filter((s) => delivered(s.status));
  const missed = inRange.filter((s) => noShow(s.status));
  const booked = inRange.filter((s) => !cancelled(s.status) && ms(s.scheduledAt) < now);

  /* Monday-first weekday distribution of delivered sessions. */
  const byWeekday = new Array<number>(7).fill(0);
  done.forEach((s) => {
    const d = new Date(ms(s.scheduledAt));
    byWeekday[(d.getDay() + 6) % 7] += 1;
  });
  const openDays = new Set(input.hours.map((h) => h.weekday));
  const weekdays = byWeekday.map((count, i) => ({
    label: WEEK_LETTERS[i],
    count,
    // No working hours recorded at all means we don't know which days are shut,
    // and every day drawn as closed would be a confident lie.
    open: openDays.size === 0 ? count > 0 : openDays.has(i),
  }));

  /* Who delivered most. */
  const names = new Map(input.clients.map((c) => [c.id, c] as const));
  const perClient = new Map<string, number>();
  done.forEach((s) => perClient.set(s.clientId, (perClient.get(s.clientId) ?? 0) + 1));
  const programs = new Map(
    input.programs
      .filter((p) => !['cancelled', 'canceled', 'archived'].includes(p.status.toLowerCase()))
      .map((p) => [p.clientId, p.name] as const),
  );

  const leaders: MetricLeader[] = [...perClient.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([clientId, count]) => {
      const client = names.get(clientId);
      const perWeek = client?.sessionsPerWeek;
      return {
        clientId,
        name: client?.name ?? 'Someone',
        meta: [programs.get(clientId), perWeek ? `${perWeek} a week` : null]
          .filter(Boolean)
          .join(' · '),
        count,
      };
    });

  return {
    title: key === 'delivered' ? 'Sessions delivered' : 'Clients training',
    subtitle: `${key === 'delivered' ? done.length : countTraining(input.sessions, current)} in the ${RANGE_TITLE[range].toLowerCase()}`,
    delivered: done.length,
    booked: booked.length,
    missed: missed.length,
    weekdays,
    leaders,
    note: closedDayNote(byWeekday, openDays),
  };
}

/**
 * "Wednesday is your closed day, so the 8% there is one-off sessions you took
 * anyway — not a gap you need to fill."
 *
 * The callout that does the thinking. Only fires when a genuinely closed day has
 * a small amount of activity on it, because that is the only case where the bar
 * would otherwise read as a hole in the week.
 */
function closedDayNote(byWeekday: number[], openDays: Set<number>): string | null {
  if (!openDays.size) return null;
  const total = byWeekday.reduce((a, b) => a + b, 0);
  if (!total) return null;

  for (let i = 0; i < 7; i += 1) {
    if (openDays.has(i)) continue;
    const share = byWeekday[i] / total;
    if (byWeekday[i] > 0 && share < 0.15) {
      return `${WEEK_NAMES[i]} is your closed day, so the ${Math.round(share * 100)}% there is one-off sessions you took anyway — not a gap you need to fill.`;
    }
  }
  return null;
}

/* ------------------------------------------------------------- adherence */

export type AdherenceBucket = 'on_track' | 'slipping' | 'quiet';

/** Below this, a client is slipping. Four out of five is a good week, not a problem. */
export const ON_TRACK_AT = 0.8;

export type StreakCell = 'done' | 'miss' | 'rest' | 'unknown';

export interface AdherenceClient {
  clientId: string;
  name: string;
  /** "3/wk · 4 missed", or "Paused 22 July". */
  meta: string;
  /** Seven cells, oldest first, so the last one is today. */
  week: StreakCell[];
  /** Null for a quiet client: they have no rate, which is not the same as 0%. */
  percent: number | null;
  bucket: AdherenceBucket;
}

export interface AdherenceView {
  subtitle: string;
  tally: { onTrack: number; slipping: number; quiet: number };
  slipping: AdherenceClient[];
  onTrack: AdherenceClient[];
  quiet: AdherenceClient[];
  empty: boolean;
}

export type AdherenceSort = 'worst' | 'name' | 'improved';

export const ADHERENCE_SORTS: { key: AdherenceSort; label: string }[] = [
  { key: 'worst', label: 'Worst first' },
  { key: 'name', label: 'Name' },
  { key: 'improved', label: 'Most improved' },
];

/**
 * Seven days per client, and where each one stands.
 *
 * The window is the last seven days ending today. A cell is `done` if a session
 * that day was completed, `miss` if it was a no-show, and `rest` if nothing was
 * scheduled — and `rest` is not in the denominator, which is the whole rule.
 *
 * A cancelled session is `rest` too. The client called; that is the behaviour
 * the app wants to encourage, and scoring it as a miss punishes it.
 */
export function buildAdherence(
  input: ReportInput,
  now: number,
  sort: AdherenceSort = 'worst',
): AdherenceView {
  const today = startOfDay(now);
  const from = today - 6 * DAY_MS;

  const roster = input.clients.filter((c) => {
    const status = c.status.toLowerCase();
    // Archived and deleted clients are gone. A paused one is still a client, and
    // the fact that they are paused is exactly what this screen is for.
    return status !== 'archived' && status !== 'deleted' && status !== 'inactive';
  });

  const byClient = new Map<string, ReportSession[]>();
  input.sessions.forEach((s) => {
    const at = ms(s.scheduledAt);
    if (at < from || at >= today + DAY_MS) return;
    const list = byClient.get(s.clientId);
    if (list) list.push(s);
    else byClient.set(s.clientId, [s]);
  });

  const rows = roster.map<AdherenceClient>((client) => {
    const sessions = byClient.get(client.id) ?? [];
    const week: StreakCell[] = [];

    for (let i = 0; i < 7; i += 1) {
      const day = from + i * DAY_MS;
      const onDay = sessions.filter((s) => startOfDay(ms(s.scheduledAt)) === day);
      if (!onDay.length) {
        week.push('rest');
      } else if (onDay.some((s) => delivered(s.status))) {
        // One completed session redeems the day. A trainer who moved a 7am to a
        // 7pm and logged both should not see a miss beside a done.
        week.push('done');
      } else if (onDay.some((s) => noShow(s.status))) {
        week.push('miss');
      } else if (onDay.every((s) => cancelled(s.status))) {
        week.push('rest');
      } else {
        /*
         * Still `scheduled`. Either the day hasn't happened yet, or it has and
         * the trainer never closed the session off.
         *
         * Both are `unknown`, and neither counts. A past session nobody marked is
         * not evidence the client didn't turn up — it is evidence the trainer was
         * on a gym floor and didn't open the app, which is the whole reason the
         * Money screen has a state for it. Scoring it as a miss blames a client
         * for the trainer's admin, and one wrong red cell is all it takes for a
         * trainer to stop believing the number.
         */
        week.push('unknown');
      }
    }

    const done = week.filter((c) => c === 'done').length;
    const missed = week.filter((c) => c === 'miss').length;
    // Only what is known. `rest` and `unknown` are both outside the denominator.
    const counted = done + missed;
    const open = week.filter((c) => c === 'unknown').length;

    const paused = client.status.toLowerCase() === 'paused';
    const percent = counted ? Math.round((done / counted) * 100) : null;

    let bucket: AdherenceBucket;
    if (paused) bucket = 'slipping';
    else if (!counted) bucket = 'quiet';
    else bucket = done / counted >= ON_TRACK_AT ? 'on_track' : 'slipping';

    return {
      clientId: client.id,
      name: client.name,
      meta: adherenceMeta(client, missed, counted, open, paused),
      week,
      percent: paused && !counted ? 0 : percent,
      bucket,
    };
  });

  const order = sorter(sort);
  const slipping = rows.filter((r) => r.bucket === 'slipping').sort(order);
  const onTrack = rows.filter((r) => r.bucket === 'on_track').sort(order);
  const quiet = rows.filter((r) => r.bucket === 'quiet').sort(order);

  return {
    subtitle: `Last 7 days · ${rows.length} client${rows.length === 1 ? '' : 's'}`,
    tally: { onTrack: onTrack.length, slipping: slipping.length, quiet: quiet.length },
    slipping,
    onTrack,
    quiet,
    empty: rows.length === 0,
  };
}

function adherenceMeta(
  client: ReportClient,
  missed: number,
  counted: number,
  open: number,
  paused: boolean,
): string {
  if (paused) {
    const at = ms(client.updatedAt ?? client.createdAt);
    return at ? `Paused ${stamp(at)}` : 'Paused';
  }
  // Says which it is, rather than leaving a client with no score and no reason.
  // "3 not closed off" is a job for the trainer; "nothing scheduled" is not.
  if (!counted) {
    if (open) return `${open} session${open === 1 ? '' : 's'} not closed off`;
    return 'Nothing scheduled this week';
  }
  const plan = client.sessionsPerWeek ? `${client.sessionsPerWeek}/wk` : `${counted} this week`;
  const parts = [plan, missed ? `${missed} missed` : 'all done'];
  if (open) parts.push(`${open} not closed off`);
  return parts.join(' · ');
}

function sorter(sort: AdherenceSort): (a: AdherenceClient, b: AdherenceClient) => number {
  if (sort === 'name') return (a, b) => a.name.localeCompare(b.name);
  if (sort === 'improved') {
    // Best rate first, which is the closest honest reading of "most improved"
    // from one week of data. A real trend needs two windows and this screen
    // only has one, so it says what it can rather than inventing a slope.
    return (a, b) => (b.percent ?? -1) - (a.percent ?? -1);
  }
  return (a, b) => (a.percent ?? 101) - (b.percent ?? 101);
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function stamp(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** Whole rupees with Indian grouping. No paise: nothing on this screen is to the paisa. */
function rupeesFlat(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

/** Re-exported so screens that show a client's mode don't reach past this module. */
export { readMode, daysBetween };
