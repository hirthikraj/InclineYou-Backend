import { rupees } from '@/lib/today/time';

import type { Notification } from './types';

/**
 * The words. All of them, in one file, on purpose — the wire sends facts and
 * this is the only place that turns them into English, so a copy pass is a
 * diff here and nowhere else.
 *
 * Every line follows one shape: **who**, then what they did, then the figure.
 * The name leads because it is what a trainer scans a feed for, and it is the
 * one word bolded in the row — `.ntf__l b`.
 */

/** The first line, split so the panel can bold the name and only the name. */
export interface Line {
  /** Bolded. Null on an event with no person in it. */
  who: string | null;
  /** The rest of the sentence, starting lowercase where `who` leads. */
  said: string;
}

export function lineFor(n: Notification): Line {
  const who = n.clientName;
  switch (n.kind) {
    case 'payment':
      /* The amount is in the LINE and not in the detail, because it is the
         only thing on this row anybody reads twice. Rupees are grouped the
         Indian way by `rupees()`, the same call the payments list makes, so the two
         screens never print the same payment two different ways. */
      return { who, said: `paid ${rupees(n.amount ?? 0)}` };
    case 'cancelled':
      return { who, said: `cancelled ${sessionWhen(n)}` };
    case 'metric':
      return { who, said: `recorded a new weight` };
    case 'team':
      /* `text` is the coach who now has them. Written as a sentence about the
         CLIENT rather than about the coach — the trainer's question on seeing
         this row is "who did I lose", and the answer has to be the subject. */
      return { who, said: n.text ? `moved to ${n.text}` : 'was moved to another coach' };
  }
}

/**
 * The second line, or null when the first one has said everything.
 *
 * Null is the common case and that is deliberate. A feed where every row is two
 * lines is a feed of paragraphs; the detail is here for the rows where a fact
 * changes what the trainer does about it — where the money actually went, what
 * the reading actually was.
 */
export function detailFor(n: Notification): string | null {
  switch (n.kind) {
    case 'payment':
      /* WHERE IT LANDED, WHICH THE AMOUNT DOES NOT SAY. A gym-counter payment
         is money the trainer never handled and owes 30% of; their own UPI row
         is money already in their account. Same figure, two different facts,
         and the money book's whole gym half turns on the difference. */
      return n.text === 'gym' ? 'Collected at the gym counter' : `Paid by ${n.text ?? 'cash'}`;
    case 'metric':
      return n.text;
    case 'cancelled':
      return n.text;
    case 'team':
      return null;
  }
}

/** "Thursday's 07:00" — the session a cancellation is about, in the line. */
function sessionWhen(n: Notification): string {
  if (n.subjectAt === null) return 'a session';
  const d = new Date(n.subjectAt);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${WEEKDAYS[d.getDay()]}'s ${hh}:${mm}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DAY_MS = 86_400_000;
const startOfDay = (at: number) => new Date(at).setHours(0, 0, 0, 0);

/**
 * The stamp in the right-hand column — "4 m", "2 h", "3 d".
 *
 * Deliberately NOT `relativePast()` from `lib/today/time.ts`, which is the
 * activity feed's and answers "2 hours ago" / "Yesterday" / "Thursday". Those
 * are sentences, and this column is 34px of mono beside a two-line row: the
 * long form wraps, and once it wraps it takes the row's second line with it.
 *
 * The day the row belongs to is not lost by shortening it — the heading above
 * the row already says *Yesterday*, in words. This says how far into that day,
 * which the heading cannot. Between them nothing is missing and neither
 * repeats the other.
 */
export function stampFor(at: number, now: number): string {
  const mins = Math.max(0, Math.round((now - at) / 60_000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins} m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days < 7) return `${days} d`;
  return `${Math.round(days / 7)} w`;
}

/**
 * The sticky heading over each run of rows.
 *
 * *Today* and *Yesterday* are named rather than dated because that is how a
 * trainer says them; past that the weekday leads, because within a three-week
 * window "Thursday 21 Aug" is found by its weekday and confirmed by its date.
 * The window is short enough that the year never has to appear.
 */
export function dayHeading(at: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const d = new Date(at);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/**
 * The feed, cut into days.
 *
 * ── AND IT IS SORTED BY TIME, NOT BY UNREAD ─────────────────────────────────
 *
 * Floating unread rows to the top is the obvious move and it is wrong for this
 * surface. A feed is read as a sequence — *what happened while I was on the
 * floor* — and a list whose order changes as rows are read is a list that moves
 * under the pointer: mark the third row read and the fourth becomes the third.
 * The unread rows are already marked, twice (ink and a dot), and the *Unread*
 * chip is there for a trainer who wants only those. Nothing is gained by
 * reordering and the place they had is lost.
 */
export function byDay<T extends { at: number }>(
  rows: T[],
  now: number,
): { heading: string; rows: T[] }[] {
  const out: { heading: string; rows: T[] }[] = [];
  for (const row of [...rows].sort((a, b) => b.at - a.at)) {
    const heading = dayHeading(row.at, now);
    const last = out[out.length - 1];
    if (last && last.heading === heading) last.rows.push(row);
    else out.push({ heading, rows: [row] });
  }
  return out;
}

/**
 * "4 minutes ago", "2 hours ago", "3 days ago" — the spoken form of `stampFor`.
 *
 * ── IT IS HERE BECAUSE THE ABBREVIATION IS NOT A DURATION ──────────────────
 *
 * `stampFor` renders 34px of mono beside a two-line row, so it says "2 h" — and
 * "2 h" read aloud is two letters. The row's accessible name gets this instead,
 * and `NotificationPanel` assembles the rest of the sentence, because two of
 * its four pieces are things only the panel knows: the row's read state changes
 * in the browser after any adapter has run, and the clock is the one the host
 * fixed when the panel opened.
 *
 * Deliberately NOT `relativePast()` from `lib/today/time.ts`, which answers
 * "Yesterday" and "Thursday". A screen reader is walking a list already grouped
 * under a heading that says *Yesterday*; what is missing is how far into that
 * day, which is the same division of labour the visible stamp makes.
 */
export function longAgo(at: number, now: number): string {
  const mins = Math.max(0, Math.round((now - at) / 60_000));
  if (mins < 60) return `${mins} minutes ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} hours ago`;
  return `${Math.round(mins / (60 * 24))} days ago`;
}
