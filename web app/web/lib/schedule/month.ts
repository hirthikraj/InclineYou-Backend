import { startOfMonth } from '@/lib/today/time';
import type { ScheduleDay } from './grid';

/**
 * THE MONTH IS THE ONE VIEW THAT MUST NOT BE THE WEEK'S GRID.
 *
 * The week is one minute to one pixel. A month at that scale is roughly 28,000px,
 * so this view answers a different question — *which weeks are thin, and when am
 * I away* — and therefore needs a different encoding. webapp.css's `.mo` block
 * publishes it as three channels, each doing exactly one job so that **no axis
 * changes meaning between the two views**:
 *
 *   length of the bar — utilisation, booked minutes over that day's OWN working
 *                       minutes, which is why a Sunday with four sessions can
 *                       read fuller than a Monday with four
 *   fill of the bar   — floor against remote, the set's single colour axis, kept
 *                       intact as a stacked segment
 *   the figure        — the session count, exact and uncapped
 *
 * The phone's grid caps its dots at three, so six sessions and eleven look
 * identical there; a 46px cell has no better option. This one has room and no
 * excuse. `full` marks the FIGURE and never the bar, because a count is a count
 * fact and the bar is a time fact.
 */

/** The phone's own six-or-more rule, so a full day means the same on both halves. */
export const FULL_DAY_SESSIONS = 6;

export interface MonthCell {
  day: ScheduleDay;
  inMonth: boolean;
  /**
   * Booked over available, as a percentage, and **NOT capped at 100** — see
   * `barFor`. Null when that weekday has no working hours answered.
   */
  utilisation: number | null;
  /** Percentages of the BAR's track, floor first. They sum to at most 100. */
  floorPct: number;
  remotePct: number;
  /** More is booked than the day has hours: the bar is full and still short. */
  over: boolean;
  full: boolean;
}

export interface MonthWeek {
  index: number;
  cells: MonthCell[];
  sessions: number;
  booked: number;
  work: number;
  utilisation: number | null;
  over: boolean;
  /** The thinnest week of the month — the one worth a trainer's attention. */
  thin: boolean;
}

export interface MonthModel {
  cells: MonthCell[];
  weeks: MonthWeek[];
  sessions: number;
  booked: number;
  utilisation: number | null;
  over: boolean;
}

/**
 * THE FIGURE IS NOT CAPPED AND THE BAR IS, AND THAT SPLIT IS THE WHOLE POINT.
 *
 * FOUND BY RENDERING AGAINST REAL ROWS. The first version ran both through one
 * clamped helper, so a Tuesday carrying 26 sessions in nine working hours drew a
 * full bar and printed **100%** — while the week view, whose totals are computed
 * in `grid.ts` and never clamped, printed **294%** for the same day. Two views of
 * one schedule, two different answers about one Tuesday, and the clamped one is
 * the lie: it says the day is exactly full at the moment it is three times
 * oversold, which is the single fact a month grid exists to surface.
 *
 * So they are separated. `rate` is the honest ratio and feeds every number a
 * trainer reads. `barFor` is geometry — a track cannot be 294% long — and when
 * the ratio exceeds the track it keeps the floor/remote PROPORTIONS, fills the
 * bar, and raises `over` so the drawing can say *and there is more* instead of
 * silently rounding the overflow away.
 */
function rate(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((100 * part) / whole);
}

function barFor(floor: number, remote: number, whole: number) {
  if (whole <= 0) return { floorPct: 0, remotePct: 0, over: false };
  const f = (100 * Math.max(0, floor)) / whole;
  const r = (100 * Math.max(0, remote)) / whole;
  const total = f + r;
  if (total <= 100) return { floorPct: f, remotePct: r, over: false };
  // Proportions kept, track filled: the mix is still readable at a glance, and
  // `over` carries the part that no longer fits.
  return { floorPct: (100 * f) / total, remotePct: (100 * r) / total, over: true };
}

export function buildMonth(days: ScheduleDay[], anchor: number): MonthModel {
  const month = new Date(startOfMonth(anchor)).getMonth();
  const year = new Date(startOfMonth(anchor)).getFullYear();

  const cells: MonthCell[] = days.map((day) => {
    const d = new Date(day.at);
    const work = day.workMinutes;
    return {
      day,
      inMonth: d.getMonth() === month && d.getFullYear() === year,
      utilisation: rate(day.bookedMinutes, work),
      ...barFor(day.floorMinutes, day.remoteMinutes, work),
      full: day.count >= FULL_DAY_SESSIONS,
    };
  });

  const weeks: MonthWeek[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const row = cells.slice(i, i + 7);
    const sessions = row.reduce((n, c) => n + c.day.count, 0);
    const booked = row.reduce((n, c) => n + c.day.bookedMinutes, 0);
    const work = row.reduce((n, c) => n + c.day.workMinutes, 0);
    weeks.push({
      index: i / 7,
      cells: row,
      sessions,
      booked,
      work,
      utilisation: rate(booked, work),
      over: work > 0 && booked > work,
      thin: false,
    });
  }

  /*
   * The thin week is marked, not merely computed. It is the row a trainer would
   * act on — the one with room to sell — and a month grid that leaves it to be
   * spotted by eye answers nothing the week view did not.
   *
   * FOUND BY RENDERING, AND THE RULE IS NARROWER THAN IT LOOKS: the first version marked the thinnest week of any month
   * with two weeks of working hours, and on a month with one week of bookings
   * that is a week with NOTHING in it. "Your emptiest week is the one you have
   * not reached yet" is not a finding, and printing it in warn beside five
   * identical empty rows reads as arbitrary — which is worse than silence,
   * because a mark nobody can explain is a mark nobody trusts.
   *
   * So the comparison is between weeks that are actually being worked: at least
   * two of them must hold sessions before there is a thinnest one to name.
   */
  const rated = weeks.filter((w) => w.utilisation !== null && w.sessions > 0);
  if (rated.length >= 2) {
    const min = Math.min(...rated.map((w) => w.utilisation as number));
    const floor = rated.find((w) => w.utilisation === min);
    if (floor) floor.thin = true;
  }

  const inMonth = cells.filter((c) => c.inMonth);
  const booked = inMonth.reduce((n, c) => n + c.day.bookedMinutes, 0);
  const work = inMonth.reduce((n, c) => n + c.day.workMinutes, 0);

  return {
    cells,
    weeks,
    sessions: inMonth.reduce((n, c) => n + c.day.count, 0),
    booked,
    utilisation: rate(booked, work),
    over: work > 0 && booked > work,
  };
}
