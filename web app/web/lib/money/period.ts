/**
 * WHAT SLICE OF THE BOOK IS ON SCREEN.
 *
 * Business used to answer exactly one question — *this calendar month* — and it
 * answered it through the URL: `/business/2026-08`, with a redirect from
 * `/business` that filled in today's month. Two things were wrong with that.
 *
 * **The month was never a resource.** The route's own docstring argued the month
 * belonged in the path because "the month decides what is FETCHED", and that was
 * not true of a single line of the code beneath it: `getMoney()` pulls the whole
 * book unwindowed — `/v1/payments` with no `from`/`to`, deliberately, because a
 * full book is a couple of hundred rows — and `computeLedger` slices it in the
 * browser. The path segment named a filter over data the page already had.
 *
 * **And one month is the wrong unit for half the questions.** "Is collection
 * getting worse", "did the gym's cut move", "is this a bad month or a bad
 * quarter" are all answered by a span, and a picker that only offers a single
 * month makes the trainer open three URLs and hold three numbers in their head.
 *
 * So the period is client state and the URL is just `/business`. A period is one
 * of three things, and the two spans are ANCHORED TO TODAY rather than to a
 * chosen month — "last 3 months" means the three months ending now, which is the
 * only reading that survives being bookmarked, and is why the span variants carry
 * no date of their own.
 *
 * Nothing here is persisted. A reload lands on the current month, which is the
 * answer to the question a trainer opens this screen with; a period is a lens
 * they pick up for a minute, not a setting.
 */

import { monthLabel, monthLong } from './compute';

export type Period =
  | { kind: 'month'; year: number; month: number }
  | { kind: 'recent'; months: 3 | 6 };

/** The default: whatever month `now` falls in. */
export function currentMonth(now: number): Period {
  const d = new Date(now);
  return { kind: 'month', year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function samePeriod(a: Period, b: Period): boolean {
  if (a.kind === 'recent' && b.kind === 'recent') return a.months === b.months;
  if (a.kind === 'month' && b.kind === 'month') return a.year === b.year && a.month === b.month;
  return false;
}

/**
 * Half-open `[from, to)` in epoch ms — the same shape `monthBounds` returns, so
 * every `createdAt >= from && createdAt < to` filter in `compute.ts` is unchanged
 * apart from where the bounds come from.
 *
 * A span ends at the end of the month `now` is in rather than at `now` itself:
 * the current month is always whole on this screen, and a payment recorded later
 * today should not fall outside the range that claims to include today.
 */
export function periodRange(p: Period, now: number): { from: number; to: number } {
  if (p.kind === 'month') {
    return {
      from: new Date(p.year, p.month - 1, 1).getTime(),
      to: new Date(p.year, p.month, 1).getTime(),
    };
  }
  const d = new Date(now);
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-based
  return {
    from: new Date(y, m - (p.months - 1), 1).getTime(),
    to: new Date(y, m + 1, 1).getTime(),
  };
}

/** The picker's trigger and the page subtitle. `Aug 2026` · `Last 3 months`. */
export function periodChip(p: Period): string {
  return p.kind === 'month' ? monthLabel(p.year, p.month) : `Last ${p.months} months`;
}

/** A stat tile's key line, where the width is four or five characters of room.
 *  `Aug` · `3 months`. */
export function periodTag(p: Period): string {
  return p.kind === 'month'
    ? monthLabel(p.year, p.month).split(' ')[0]
    : `${p.months} months`;
}

/** Inside a sentence — "No write-offs in ___", "of what was billed in ___".
 *  `August 2026` · `the last 3 months`. */
export function periodProse(p: Period): string {
  return p.kind === 'month' ? monthLong(p.year, p.month) : `the last ${p.months} months`;
}

/** `Jun–Aug 2026` for a span, and nothing for a single month — the chip already
 *  says which one. Drawn under the picker's trigger so "last 3 months" is not a
 *  promise the trainer has to count out on their fingers. */
export function periodSpanLabel(p: Period, now: number): string | null {
  if (p.kind === 'month') return null;
  const { from, to } = periodRange(p, now);
  const a = new Date(from);
  const b = new Date(to - 1);
  const first = monthLabel(a.getFullYear(), a.getMonth() + 1);
  const last = monthLabel(b.getFullYear(), b.getMonth() + 1);
  return a.getFullYear() === b.getFullYear()
    ? `${first.split(' ')[0]}–${last}`
    : `${first} – ${last}`;
}
