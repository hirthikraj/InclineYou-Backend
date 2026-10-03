import type { Practice, PracticeTopClient } from './types';

/**
 * THE PRACTICE REPORT'S MODEL — the server's twelve rows, laid out for the page.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
 *
 * It used to BUILD the report: a year of sessions, every workout log, every client
 * and every payment pulled into the Next server and folded here — about two
 * thousand five hundred rows plus the whole money book to draw twelve bars. The
 * server answers `GET /v1/reports/practice` now, one row per month, and this file
 * only arranges what came back: parallel series for the charts, the headline
 * tiles as ratios of those series, and nothing it has to fetch.
 *
 * ── WHAT THE OLD PAGE SHOWED THAT THIS CANNOT ────────────────────────────────
 *
 * Said plainly, because a figure that quietly changes meaning is worse than one
 * that goes:
 *
 * - **The *unmarked sessions* warning is gone.** It counted past sessions nobody
 *   closed off; the report returns delivered, no-show and cancelled, and has no
 *   count of the rest. A session that was never marked is therefore in no figure,
 *   as it was before — it is just no longer NAMED.
 * - **Sessions logged in the console are folded in by the server**, so *delivered*
 *   is its figure and not the roster's two-source fold.
 * - **Clients lost is *archived*** — the clients the trainer actually archived
 *   that month. The old figure was inferred from silence (someone whose last
 *   session was that month and who then stopped), which could not report the most
 *   recent months at all; archived can, but it counts a decision and not a drift.
 * - **Retention is over the span** (twelve months): the clients on the books at the
 *   start who are still on them at the end. The old tile was quarter against
 *   quarter, and the server does not offer that window.
 * - **Active is calendar months**, not a rolling thirty days.
 */

/** How many bars every chart on this screen draws. A year is the shortest window
 *  that can show a trainer their own seasonality — Indian gym floors empty in
 *  December and fill in January, and six months cannot say so. */
export const REPORT_MONTHS = 12;

export interface ReportMonth {
  year: number;
  month: number;
  /** `Aug` — the axis label. */
  label: string;
  /** The last month of the series: in progress, drawn in the accent, and kept out
   *  of every average, because a month in progress is not a month. */
  isCurrent: boolean;
}

export interface Headline {
  /** The trainer's own share of what arrived in the last three months. */
  earned: number;
  /** The same for the three months before them, for the delta. */
  earnedPrev: number;
  /** Clients with a delivered session this month so far, and in the month before. */
  activeNow: number;
  activePrev: number;
  prevLabel: string;
  /** Null when nobody was on the books at the start of the year. */
  retention: number | null;
  /** `delivered / (delivered + no-shows)` over the last three months. Null when nothing settled. */
  attendance: number | null;
  attendanceDone: number;
  attendanceSettled: number;
  delivered: number;
  busiestMonth: string | null;
  sessionsPerClientWeek: number | null;
}

export interface PracticeReport {
  months: ReportMonth[];
  /** The trainer's share of money that ARRIVED each month — after the gym's cut. */
  takeHome: number[];
  billed: number[];
  collected: number[];
  delivered: number[];
  /** Distinct clients with at least one delivered session that month. */
  active: number[];
  /** Clients whose relationship started that month. */
  joined: number[];
  /** Clients the trainer archived that month. */
  archived: number[];
  headline: Headline;
  /** The ten who earn the most, with what they paid and what was yours of it. */
  topClients: PracticeTopClient[];
  /** True when some of what was collected went to a gym — which is when take-home is a different figure from collected. */
  hasGym: boolean;
  /** Not one delivered session and not one payment: an empty state rather than twelve bars of zero. */
  isEmpty: boolean;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function cell(month: string, isCurrent: boolean): ReportMonth {
  const [y, m] = month.split('-').map(Number);
  return { year: y, month: m, label: MONTHS_SHORT[m - 1], isCurrent };
}

const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);

export function buildReport(p: Practice): PracticeReport {
  const rows = p.months;
  const months = rows.map((r, i) => cell(r.month, i === rows.length - 1));
  const col = (pick: (r: Practice['months'][number]) => number) => rows.map(pick);

  const takeHome = col((r) => r.takeHome);
  const collected = col((r) => r.collected);
  const delivered = col((r) => r.delivered);

  const last3 = rows.slice(-3);
  const prev3 = rows.slice(-6, -3);
  const done = sum(last3.map((r) => r.delivered));
  const settled = done + sum(last3.map((r) => r.noShows));

  const now = rows[rows.length - 1];
  const before = rows[rows.length - 2];
  const beforeCell = months[months.length - 2];

  const busiest = p.headline.busiestMonth ? cell(p.headline.busiestMonth, false) : null;

  return {
    months,
    takeHome,
    billed: col((r) => r.billed),
    collected,
    delivered,
    active: col((r) => r.activeClients),
    joined: col((r) => r.newClients),
    archived: col((r) => r.archived),
    headline: {
      earned: sum(last3.map((r) => r.takeHome)),
      earnedPrev: sum(prev3.map((r) => r.takeHome)),
      activeNow: now?.activeClients ?? 0,
      activePrev: before?.activeClients ?? 0,
      prevLabel: beforeCell?.label ?? '',
      retention: p.headline.retentionPercent,
      attendance: settled > 0 ? Math.round((done / settled) * 100) : null,
      attendanceDone: done,
      attendanceSettled: settled,
      delivered: p.headline.delivered,
      busiestMonth: busiest ? `${busiest.label} ${busiest.year}` : null,
      sessionsPerClientWeek: p.headline.averageSessionsPerClientPerWeek,
    },
    topClients: p.topClients,
    hasGym: sum(collected) - sum(takeHome) > 0.5,
    isEmpty: sum(delivered) === 0 && sum(collected) === 0,
  };
}

/** `+18%` · `−4%` · null when there is nothing to compare against or the change
 *  rounds to nothing. A `+0%` is noise dressed as a finding. */
export function changePercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return pct === 0 ? null : pct;
}

/** The mean of a series, current month excluded — an average that includes a
 *  month two days old lies for four weeks. */
export function wholeMonthAverage(values: number[], months: ReportMonth[]): number {
  const whole = values.filter((_, i) => !months[i].isCurrent);
  if (whole.length === 0) return 0;
  return Math.round(whole.reduce((s, v) => s + v, 0) / whole.length);
}
