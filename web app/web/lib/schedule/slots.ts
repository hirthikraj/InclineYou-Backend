import { DAY_MS, isoWeekday, minuteOfDay, startOfDay, startOfWeek } from '@/lib/today/time';
import { mergeWindows, type WorkWindow } from '@/lib/today/day';
import type { BookSession } from './session';

/**
 * OPEN TIMES — what the booking panel's week strip and time grid offer.
 *
 * A time is open when a session of `minutes` starting there fits wholly inside
 * one of that day's working windows, overlaps no live session, and (today) has
 * not already started. Offered every `step` minutes from each window's start.
 *
 * This is an OFFER, not a rule: the panel keeps *Another time* for anything the
 * trainer means outside it, because working hours constrain what a client can
 * self-book and have never constrained the trainer (`book.ts`).
 */
export const OPEN_STEP = 30;

export function windowsOn(hours: WorkWindow[], dayAt: number) {
  const weekday = isoWeekday(dayAt);
  return mergeWindows(hours.filter((w) => w.weekday === weekday));
}

export function openTimes(
  windows: { startMinute: number; endMinute: number }[],
  sessions: BookSession[],
  dayAt: number,
  minutes: number,
  now: number,
  step = OPEN_STEP,
): number[] {
  const day = startOfDay(dayAt);
  const today = startOfDay(now);
  if (day < today) return [];
  const earliest = day === today ? minuteOfDay(now) : -1;

  const busy = sessions
    .filter((s) => !s.dead && startOfDay(s.at) === day)
    .map((s) => ({ from: minuteOfDay(s.at), to: minuteOfDay(s.at) + s.minutes }));

  const out: number[] = [];
  for (const w of windows) {
    for (let m = w.startMinute; m + minutes <= w.endMinute; m += step) {
      if (m <= earliest) continue;
      const to = m + minutes;
      if (busy.some((b) => b.from < to && b.to > m)) continue;
      out.push(m);
    }
  }
  return out;
}

/** The seven midnights of the Monday-first week holding `at`. */
export function weekDays(at: number): number[] {
  const start = startOfWeek(at);
  return Array.from({ length: 7 }, (_, i) => startOfDay(start + i * DAY_MS + DAY_MS / 2));
}

/** "This week · 23 – 29 Nov", "Next week · 30 Nov – 6 Dec", or the bare range. */
export function weekTitle(weekStart: number, now: number): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = weekDays(weekStart);
  const a = new Date(days[0]);
  const b = new Date(days[6]);
  const range = a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
  const offset = Math.round((startOfWeek(weekStart) - startOfWeek(now)) / (7 * DAY_MS));
  const label = offset === 0 ? 'This week' : offset === 1 ? 'Next week' : offset === -1 ? 'Last week' : null;
  return label ? `${label} · ${range}` : range;
}

/** "India time (GMT+5:30)" on an Indian clock, "GMT+1:00" elsewhere. */
export function zoneLabel(at: number): string {
  const off = -new Date(at).getTimezoneOffset();
  const sign = off >= 0 ? '+' : '−';
  const h = Math.floor(Math.abs(off) / 60);
  const m = String(Math.abs(off) % 60).padStart(2, '0');
  const gmt = `GMT${sign}${h}:${m}`;
  return off === 330 ? `India time (${gmt})` : gmt;
}
