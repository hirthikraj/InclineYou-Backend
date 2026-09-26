import { DAY_MS, daysBetween, dayStamp, startOfDay } from '@/lib/today/time';

/**
 * THE DAY SPINE UNDER THE WORKOUTS LIST.
 *
 * Pure, and with no `server-only`, for `lib/workouts/estimate.ts`'s reason
 * (trap 18): the page reads it to slice a page of rows and the client component
 * reads it to draw the rules over them, and two implementations of *which day
 * is this row in* is two answers at midnight.
 *
 * ── WHY THE GROUPING HAPPENS AFTER THE SLICE AND NOT BEFORE ─────────────────
 *
 * A page is twenty-five ROWS, not twenty-five days. Grouping first and paging
 * the groups would give pages of wildly different heights — one day with nine
 * sessions and the next with one — and a pager whose pages are not the same
 * size is a pager that cannot say "25 of 361" about anything. So the list is
 * filtered, sliced, and only then cut at the day boundaries that survive; a day
 * straddling a page break appears as a rule at the foot of one page and again
 * at the head of the next, which is correct — both halves are that day.
 */

export interface DayGroup<T> {
  /** Midnight local, and the key. */
  at: number;
  /** "Thu · 17 Sep". */
  label: string;
  /** "Today", "Yesterday", "Tomorrow", "In 3 days" — or null past the week. */
  relative: string | null;
  rows: T[];
}

/**
 * Cut an ALREADY SORTED run of rows at its day boundaries.
 *
 * Sorted is the caller's promise and is not re-established here: the three
 * buckets come out of `getSessions` in the order each is meant to be read
 * (scheduled forwards, the other two back), and a sort in this function would
 * silently undo that for whichever bucket it disagreed with.
 */
export function groupByDay<T>(rows: readonly T[], at: (row: T) => number, now: number): DayGroup<T>[] {
  const out: DayGroup<T>[] = [];
  for (const row of rows) {
    const day = startOfDay(at(row));
    const last = out[out.length - 1];
    if (last && last.at === day) {
      last.rows.push(row);
      continue;
    }
    out.push({ at: day, label: dayStamp(day), relative: relativeDay(day, now), rows: [row] });
  }
  return out;
}

/**
 * The day said the way somebody would say it, or `null`.
 *
 * `null` past six days in either direction is the whole point of the function.
 * "Today" and "Tomorrow" are worth their ink; "In 63 days" is a subtraction
 * printed fifty times down a page, and the date beside it already said it
 * better. `relativePast` in `time.ts` answers a different question — how long
 * ago a thing happened, to the minute — and reaches for the weekday at exactly
 * this boundary for the same reason.
 */
export function relativeDay(day: number, now: number): string | null {
  const delta = daysBetween(startOfDay(now), day);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  if (delta > 1 && delta < 7) return `In ${delta} days`;
  if (delta < -1 && delta > -7) return `${-delta} days ago`;
  return null;
}

/**
 * Whether a row is inside the window the trainer asked for.
 *
 * Counted in DAYS from today's midnight and not in milliseconds from `now`:
 * *last 7 days* means seven dates a trainer could name, and a millisecond
 * window drops this morning's 6am session out of "last 7 days" at 6:01pm while
 * leaving last Thursday's evening in. `0` and anything falsy mean no window.
 */
export function withinDays(at: number, days: number, now: number): boolean {
  if (!days) return true;
  const today = startOfDay(now);
  const delta = (startOfDay(at) - today) / DAY_MS;
  /* Symmetric, so one parameter serves a list read backwards and one read
     forwards — the caller decides which options to offer, not which sign. */
  return Math.abs(delta) < days;
}
