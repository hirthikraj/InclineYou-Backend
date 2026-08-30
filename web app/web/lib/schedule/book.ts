import { isoWeekday, minuteOfDay, startOfDay } from '@/lib/today/time';
import type { ScheduleClient, ScheduleSession } from './api';

/**
 * WHO TO OFFER FIRST — AND WHY THE WEB CAN DO THIS AND THE PHONE CANNOT.
 *
 * `BookSheet.tsx` lists the first six clients alphabetically, because a phone
 * opens the sheet from a floating button with no slot attached: there is no hour
 * to rank against. Here the click IS the hour. Three of the five questions a
 * booking asks — which day, which time, and *is this a new one* — are answered
 * before the form opens, so the one question left can be answered with a ranked
 * list instead of a scroll.
 *
 * The ranking is *recognition rather than recall*, and it is deliberately not
 * cleverer than the data supports. Three bands:
 *
 *   1. **Trains at this hour** — this client has a session within half an hour of
 *      this minute on this weekday, in the fetched window. A trainer booking
 *      Wednesday 07:00 is almost always booking the person who was there last
 *      Wednesday at 07:00, and that person is one row rather than a search.
 *   2. **Trains on this day** — same weekday, a different hour.
 *   3. **Everybody else**, alphabetically, which is `BookSheet`'s own order and
 *      therefore the order a trainer already knows.
 *
 * Within a band, by name. Never by "most sessions" or "most recent" — a ranking
 * that reorders itself as the week fills is a ranking a trainer cannot learn, and
 * the whole value of band 1 is that the same face is in the same place.
 */

/** Within half an hour either side counts as "this hour". */
export const HOUR_GRACE = 30;

export interface Suggestion {
  client: ScheduleClient;
  /** 1, 2 or 3 — the band above. */
  band: 1 | 2 | 3;
  /** The words the row prints under the name. Null in band 3. */
  because: string | null;
}

export function suggestClients(
  clients: ScheduleClient[],
  sessions: ScheduleSession[],
  at: number,
): Suggestion[] {
  const weekday = isoWeekday(at);
  const minute = minuteOfDay(at);

  const sameDay = new Map<string, number>();
  const sameHour = new Map<string, number>();

  for (const s of sessions) {
    if (s.dead) continue;
    if (isoWeekday(s.at) !== weekday) continue;
    sameDay.set(s.clientId, (sameDay.get(s.clientId) ?? 0) + 1);
    if (Math.abs(minuteOfDay(s.at) - minute) <= HOUR_GRACE) {
      sameHour.set(s.clientId, (sameHour.get(s.clientId) ?? 0) + 1);
    }
  }

  const DAY_NAMES = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

  return clients
    .map((client): Suggestion => {
      if (sameHour.has(client.id)) {
        return { client, band: 1, because: `Trains around this hour on ${DAY_NAMES[weekday]}` };
      }
      if (sameDay.has(client.id)) {
        return { client, band: 2, because: `Trains on ${DAY_NAMES[weekday]}` };
      }
      return { client, band: 3, because: null };
    })
    .sort((a, b) => a.band - b.band || a.client.name.localeCompare(b.client.name));
}

/**
 * What a proposed slot collides with.
 *
 * Drawn, never blocked — the same rule the hatch follows. A trainer may book two
 * people into one hour, because sometimes they genuinely are (a handover, a
 * partner session booked as two rows), and `WorkingHoursScreen` states the
 * principle for the whole product: these constrain what a CLIENT can self-book
 * and have never constrained the trainer.
 *
 * So this returns the names rather than a boolean, because the form's job is to
 * say **who** — "Arjun S is already here" is a fact a trainer can act on, and
 * "This slot is unavailable" is a wall they will work around by guessing.
 *
 * `end` is exclusive, which is `conflicts.ts`'s rule and the reason back-to-back
 * is not a clash.
 */
export function collisionsAt(
  sessions: ScheduleSession[],
  at: number,
  minutes: number,
): ScheduleSession[] {
  const day = startOfDay(at);
  const from = minuteOfDay(at);
  const to = from + minutes;

  return sessions.filter((s) => {
    if (s.dead) return false;
    if (startOfDay(s.at) !== day) return false;
    const sFrom = minuteOfDay(s.at);
    return sFrom < to && sFrom + s.minutes > from;
  });
}

/** Whether a proposed slot sits inside the trainer's own windows for that day. */
export function insideHours(
  windows: { startMinute: number; endMinute: number }[],
  at: number,
  minutes: number,
): boolean {
  // No hours answered is not "outside hours" — the server returns `[]` rather
  // than a default week so that nothing is invented, and warning a trainer who
  // never told us when they work would be inventing it here instead.
  if (!windows.length) return true;
  const from = minuteOfDay(at);
  const to = from + minutes;
  return windows.some((w) => from >= w.startMinute && to <= w.endMinute);
}
