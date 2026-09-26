/**
 * THE TRAINER'S BUSINESS REPORT — pure arithmetic, no wire, no React.
 *
 * The brief names six questions and then puts a ceiling on the answer: *"Keep it
 * to one screen. A trainer is not an analyst."* The ceiling is the harder half.
 * Six metrics drawn as six charts is a dashboard nobody reads; what a trainer
 * needs at a month-end is four figures they can act on and three shapes that say
 * whether the figures are normal.
 *
 * So this file computes exactly what `ReportsTab` draws and nothing else:
 *
 * | The brief's metric | Where it lands |
 * | --- | --- |
 * | Revenue trend, month over month | `revenue[]`, twelve bars |
 * | Sessions delivered per month | `delivered[]`, twelve bars |
 * | Active client count over time | `active[]`, twelve bars |
 * | Client acquisition vs churn | `joined[]` / `lost[]`, under the same bars |
 * | Retention rate | `headline.retention` |
 * | Attendance rate (delivered vs scheduled) | `headline.attendance` |
 *
 * ── EVERY RATE HERE IS A RATE OF WHAT IS KNOWN ──────────────────────────────
 *
 * `webapp-reports.html` states the rule this file is most likely to be broken
 * by: *"Nine sessions in the window were never marked; they are in nobody's
 * denominator, because a past session nobody closed off is evidence the trainer
 * was on a gym floor, not evidence the client stayed away."*
 *
 * So attendance is `done / (done + no_show)` over **settled** sessions, and the
 * count of unmarked ones is returned beside it so the screen can name the hole
 * rather than quietly absorb it. One wrong red figure is all it takes for a
 * trainer to stop believing the tile.
 *
 * ── AND "ATTENDED" MEANS THE SAME THING IT MEANS ON THE ROSTER ──────────────
 *
 * A delivered session is a `done` booking **or** a workout log — whichever
 * exists. That is the roster's own rule for *Last attended*, and it is right for
 * the same reason: an unlogged session a client turned up to is still a session
 * they turned up to, and a logged session nobody booked is still work delivered.
 * Counting one and not the other would give the trainer a sessions figure lower
 * than the one their own diary shows them.
 *
 * The two are folded on `(clientId, day)`, so a booking that was marked done AND
 * logged is one session, not two.
 */

import {
  isCollected,
  monthBounds,
  settledAt,
  type MoneyPayment,
} from '@/lib/money/compute';
import { DAY_MS, startOfDay } from '@/lib/today/time';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** How many bars every chart on this screen draws. A year is the shortest window
 *  that can show a trainer their own seasonality — Indian gym floors empty in
 *  December and fill in January, and six months cannot say so. */
export const REPORT_MONTHS = 12;

/** The headline tiles' window. A quarter is recent enough to act on and long
 *  enough that one cancelled week does not move it. */
export const HEADLINE_DAYS = 90;

/** What counts as "training with you now" for the active-client and retention
 *  figures. The same 30 days `roster.ts` calls `LAPSED_DAYS`. */
export const ACTIVE_DAYS = 30;

/* ------------------------------------------------------------------- input */

export interface ReportClient {
  id: string;
  name: string;
  status: string;
  /** V18's invitation state. An `invited` client who never accepted has not
   *  been acquired and cannot be churned — see `joined`. */
  membershipStatus: string | null;
  createdAt: number;
}

export interface ReportSession {
  id: string;
  clientId: string;
  scheduledAt: number;
  /** `scheduled` | `done` | `no_show` | `cancelled`. */
  status: string;
}

export interface ReportWorkout {
  id: string;
  clientId: string;
  /** Epoch ms at the START of the day the training happened. */
  at: number;
}

export interface ReportInput {
  clients: ReportClient[];
  sessions: ReportSession[];
  workouts: ReportWorkout[];
  payments: MoneyPayment[];
  now: number;
}

/* ------------------------------------------------------------------ output */

export interface ReportMonth {
  year: number;
  month: number;
  /** `Aug` — the axis label. */
  label: string;
  from: number;
  to: number;
  /** The month `now` falls in. Drawn in the accent, and excluded from averages
   *  and from churn, because a month in progress is not a month. */
  isCurrent: boolean;
}

export interface Headline {
  /** The trainer's own share of everything collected in the window. */
  revenue: number;
  /** The same figure for the window before it, for the delta. */
  revenuePrev: number;
  /** Clients with a delivered session in the last `ACTIVE_DAYS`. */
  activeClients: number;
  activeClientsPrev: number;
  /**
   * Of the clients training a quarter ago, the share still training now.
   * Null when nobody was training then — a retention rate over an empty
   * denominator is a number with no meaning, and `0%` reads as a catastrophe.
   */
  retention: number | null;
  /** The two halves of that fraction, so the tile can print the sentence. */
  retentionKept: number;
  retentionBase: number;
  /** `done / (done + no_show)` over settled sessions in the window. */
  attendance: number | null;
  attendanceDone: number;
  attendanceSettled: number;
  /** Past sessions in the window that were never marked. In no denominator. */
  unmarked: number;
  /** Delivered sessions in the window, on the roster's definition. */
  delivered: number;
  deliveredPrev: number;
}

export interface PracticeReport {
  months: ReportMonth[];
  /** Trainer's share of money that ARRIVED that month. See `computeTrend`. */
  revenue: number[];
  /** Sessions delivered that month. */
  delivered: number[];
  /** Distinct clients with at least one delivered session that month. */
  active: number[];
  /** Clients whose relationship started that month. */
  joined: number[];
  /** Clients whose last delivered session was that month, and who have not
   *  trained since. Zero for the recent months — see `computeLost`. */
  lost: number[];
  headline: Headline;
  /** True when there is not one delivered session and not one payment. The
   *  screen draws an empty state rather than twelve bars of zero. */
  isEmpty: boolean;
}

/* ------------------------------------------------------------------ helpers */

/** The twelve month cells the charts are drawn over, oldest first. */
export function reportMonths(now: number, count = REPORT_MONTHS): ReportMonth[] {
  const d = new Date(now);
  const nowYear = d.getFullYear();
  const nowMonth = d.getMonth() + 1;

  const out: ReportMonth[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const anchor = new Date(nowYear, d.getMonth() - i, 1);
    const year = anchor.getFullYear();
    const month = anchor.getMonth() + 1;
    const { from, to } = monthBounds(year, month);
    out.push({
      year,
      month,
      label: MONTHS_SHORT[month - 1],
      from,
      to,
      isCurrent: year === nowYear && month === nowMonth,
    });
  }
  return out;
}

/**
 * Every session a client actually turned up to, as `(clientId, startOfDay)`.
 *
 * A `done` booking and a workout log on the same day for the same client are one
 * session. Folding them is what stops a trainer who both marks *and* logs from
 * reading twice as busy as one who only marks.
 */
function deliveredDays(input: ReportInput): Array<{ clientId: string; at: number }> {
  const seen = new Set<string>();
  const out: Array<{ clientId: string; at: number }> = [];

  const add = (clientId: string, at: number) => {
    const day = startOfDay(at);
    const key = `${clientId}·${day}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ clientId, at: day });
  };

  for (const s of input.sessions) if (s.status === 'done') add(s.clientId, s.scheduledAt);
  for (const w of input.workouts) add(w.clientId, w.at);

  return out.sort((a, b) => a.at - b.at);
}

/* ------------------------------------------------------------------ the report */

export function buildPracticeReport(input: ReportInput, count = REPORT_MONTHS): PracticeReport {
  const { now } = input;
  const months = reportMonths(now, count);
  const delivered = deliveredDays(input);

  /* ── revenue, by the month the money ARRIVED in ───────────────────────────
     `settledAt` and the trainer's own share, both of which `computeTrend`
     already argues for: the payments list dates by `createdAt` because a month's
     BILLING is what was raised in it, and "is my income going up" is a question
     about money that landed. Half of ₹6,000 collected on a gym floor is not
     income, so the cut comes out here as it does on every other income figure
     in this product. Two readings of the same rows, both right — and this file
     must never mix them, because two totals that disagree is how a trainer
     stops trusting the screen. */
  const collected = input.payments.filter(isCollected);
  const revenue = months.map((m) =>
    collected
      .filter((p) => settledAt(p) >= m.from && settledAt(p) < m.to)
      .reduce((s, p) => s + (p.amount - (p.gymShareAmount ?? 0)), 0),
  );

  /* ── sessions delivered, and who was on the floor ────────────────────────── */
  const deliveredPerMonth = months.map((m) =>
    delivered.filter((d) => d.at >= m.from && d.at < m.to).length,
  );
  const activePerMonth = months.map(
    (m) => new Set(delivered.filter((d) => d.at >= m.from && d.at < m.to).map((d) => d.clientId)).size,
  );

  /* ── acquisition ─────────────────────────────────────────────────────────
     The month the relationship started, which is `client.createdAt` — the row
     is written when the trainer adds them, and that is the moment a trainer
     would call an acquisition. A client still sitting on an unaccepted INVITE
     has not been acquired: the arrangement exists on one phone only, and
     counting them would make a trainer who typed six numbers on Sunday read as
     having won six clients. */
  const acquired = input.clients.filter((c) => c.membershipStatus !== 'invited');
  const joined = months.map(
    (m) => acquired.filter((c) => c.createdAt >= m.from && c.createdAt < m.to).length,
  );

  const lost = computeLost(input, months, delivered);

  return {
    months,
    revenue,
    delivered: deliveredPerMonth,
    active: activePerMonth,
    joined,
    lost,
    headline: computeHeadline(input, delivered),
    isEmpty: delivered.length === 0 && collected.length === 0,
  };
}

/**
 * CHURN, AND WHY THE LAST TWO BARS ARE ALWAYS ZERO.
 *
 * Nothing in this schema records a client leaving. `status = 'archived'` exists
 * and almost nobody sets it — a client who stops coming just stops coming, which
 * is exactly why churn has to be *inferred* and exactly why it is the figure a
 * trainer never has.
 *
 * So a client is counted as lost in the month of their **last delivered
 * session**, provided they have delivered nothing since and `ACTIVE_DAYS` have
 * passed. That last clause is the important one: without it, everybody who
 * trained last Tuesday and has nothing booked yet would be "lost this month",
 * and the chart would show a catastrophic churn spike every single month.
 *
 * The honest consequence is that the most recent month or so cannot report churn
 * yet, and the screen says so rather than drawing a reassuring zero. A `paused`
 * client is not lost either — a pause is a fact the trainer stated, and V30 gave
 * it a whole lifecycle precisely so a holiday stops looking like an exit.
 */
function computeLost(
  input: ReportInput,
  months: ReportMonth[],
  delivered: Array<{ clientId: string; at: number }>,
): number[] {
  const cutoff = input.now - ACTIVE_DAYS * DAY_MS;

  const lastSeen = new Map<string, number>();
  for (const d of delivered) {
    const prev = lastSeen.get(d.clientId);
    if (prev === undefined || d.at > prev) lastSeen.set(d.clientId, d.at);
  }

  const paused = new Set(
    input.clients.filter((c) => c.status === 'paused').map((c) => c.id),
  );

  const out = months.map(() => 0);
  for (const [clientId, at] of lastSeen) {
    if (at >= cutoff) continue;       // still training, or too recent to call
    if (paused.has(clientId)) continue; // a stated pause is not an exit
    const i = months.findIndex((m) => at >= m.from && at < m.to);
    if (i >= 0) out[i]++;
  }
  return out;
}

/**
 * THE FOUR TILES.
 *
 * Revenue and attendance over a quarter, clients and retention over thirty days,
 * and the mixture is deliberate rather than sloppy. Money and adherence are noisy
 * week to week and a quarter is what makes them readable; "how many people am I
 * training" is a question about *now*, and a 90-day answer to it includes people
 * who left in June.
 *
 * Every one of them carries its own previous window, because a rate without a
 * direction points the wrong way half the time — `webapp-reports.html` makes that
 * argument for the per-client column and it is just as true of a headline: 70%
 * falling from 90% and 70% climbing from 50% are opposite problems.
 */
function computeHeadline(
  input: ReportInput,
  delivered: Array<{ clientId: string; at: number }>,
): Headline {
  const { now } = input;
  const qFrom = now - HEADLINE_DAYS * DAY_MS;
  const qPrevFrom = now - 2 * HEADLINE_DAYS * DAY_MS;
  const aFrom = now - ACTIVE_DAYS * DAY_MS;
  const aPrevFrom = now - 2 * ACTIVE_DAYS * DAY_MS;

  const collected = input.payments.filter(isCollected);
  const share = (p: MoneyPayment) => p.amount - (p.gymShareAmount ?? 0);
  const revenueIn = (from: number, to: number) =>
    collected.filter((p) => settledAt(p) >= from && settledAt(p) < to).reduce((s, p) => s + share(p), 0);

  const activeIn = (from: number, to: number) =>
    new Set(delivered.filter((d) => d.at >= from && d.at < to).map((d) => d.clientId));

  /* ── attendance, over settled sessions only ───────────────────────────────
     `cancelled` is in nobody's numerator or denominator: a session called off in
     advance is not a client failing to turn up, and counting it would punish the
     trainer for their own reschedule. */
  const inWindow = input.sessions.filter((s) => s.scheduledAt >= qFrom && s.scheduledAt < now);
  const done = inWindow.filter((s) => s.status === 'done').length;
  const noShow = inWindow.filter((s) => s.status === 'no_show').length;
  const settled = done + noShow;
  const unmarked = inWindow.filter((s) => s.status === 'scheduled').length;

  /* ── retention ────────────────────────────────────────────────────────────
     Of the people training a quarter ago, how many are still here. The base is a
     30-day window ending 90 days back rather than a single instant, because
     "training with you" is not a state anything stores — it is a month of
     evidence. A client who trained then and trains now is kept, whatever they
     did in between; a break is not a departure. */
  const base = activeIn(qFrom - ACTIVE_DAYS * DAY_MS, qFrom);
  const nowActive = activeIn(aFrom, now + 1);
  let kept = 0;
  for (const id of base) if (nowActive.has(id)) kept++;

  return {
    revenue: revenueIn(qFrom, now + 1),
    revenuePrev: revenueIn(qPrevFrom, qFrom),
    activeClients: nowActive.size,
    activeClientsPrev: activeIn(aPrevFrom, aFrom).size,
    retention: base.size > 0 ? Math.round((kept / base.size) * 100) : null,
    retentionKept: kept,
    retentionBase: base.size,
    attendance: settled > 0 ? Math.round((done / settled) * 100) : null,
    attendanceDone: done,
    attendanceSettled: settled,
    unmarked,
    delivered: delivered.filter((d) => d.at >= qFrom).length,
    deliveredPrev: delivered.filter((d) => d.at >= qPrevFrom && d.at < qFrom).length,
  };
}

/* ------------------------------------------------------------------ formatting */

/** `+18%` · `−4%` · null when there is nothing to compare against or the change
 *  rounds to nothing. A `+0%` is noise dressed as a finding. */
export function changePercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return pct === 0 ? null : pct;
}

/** The sum of a series, current month excluded — an average that includes a
 *  month two days old lies for four weeks. */
export function wholeMonthAverage(values: number[], months: ReportMonth[]): number {
  const whole = values.filter((_, i) => !months[i].isCurrent);
  if (whole.length === 0) return 0;
  return Math.round(whole.reduce((s, v) => s + v, 0) / whole.length);
}

/* ══════════════════════════════════════════════════════════════════════════
   THE OTHER AUDIENCE'S INDEX
   ══════════════════════════════════════════════════════════════════════════

   Everything above this line is the trainer's own business report. This is the
   index for the second, entirely separate thing on that tab: a list of the
   clients whose PROGRESS report is worth sending.

   The brief is emphatic that the two must not be mixed — *"Two distinct
   audiences. Don't mix them"* — and they are not: no figure crosses between
   them, and the client report is a different screen with a different shape and a
   different reader. What the Reports tab holds is the DOOR to it, because a
   trainer thinking "how is the practice doing" is one thought away from "who
   should I show their progress to", and a feature nobody can find is a feature
   that does not exist.

   Ranked by sessions delivered in the window, descending. Not alphabetically:
   the card with the most on it is the one most likely to renew somebody, and
   ordering a retention tool by surname buries exactly the client it was built
   for. A client with nothing delivered in the window is left out — their report
   would be a blank page with their name on it, and sending that is worse than
   sending nothing.
   ══════════════════════════════════════════════════════════════════════════ */

export interface ReportCandidate {
  clientId: string;
  name: string;
  status: string;
  /** Days trained inside the window. */
  sessions: number;
  /** The most recent of those days. */
  lastAt: number;
}

export function reportCandidates(input: ReportInput, weeks = 12): ReportCandidate[] {
  const from = startOfDay(input.now - weeks * 7 * DAY_MS);
  const delivered = deliveredDays(input).filter((d) => d.at >= from);

  const counts = new Map<string, { sessions: number; lastAt: number }>();
  for (const d of delivered) {
    const prev = counts.get(d.clientId);
    if (prev) {
      prev.sessions++;
      prev.lastAt = Math.max(prev.lastAt, d.at);
    } else {
      counts.set(d.clientId, { sessions: 1, lastAt: d.at });
    }
  }

  const byId = new Map(input.clients.map((c) => [c.id, c]));

  return [...counts.entries()]
    .map(([clientId, c]) => {
      const client = byId.get(clientId);
      return client
        ? { clientId, name: client.name, status: client.status, sessions: c.sessions, lastAt: c.lastAt }
        : null;
    })
    .filter((r): r is ReportCandidate => r !== null)
    .sort((a, b) => b.sessions - a.sessions || b.lastAt - a.lastAt);
}
