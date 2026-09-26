import { DAY_MS, isoWeekday, minuteOfDay, startOfDay } from '@/lib/today/time';
import { SNAP_MINUTES } from './result';
import type { BookSession, ScheduleClient } from './session';
import { gridStart, type ScheduleView } from './view';

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
  sessions: BookSession[],
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
  sessions: BookSession[],
  at: number,
  minutes: number,
): BookSession[] {
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

/* ------------------------------------------------------------- the slot ── */

/**
 * WHERE *NEW SESSION* LANDS WHEN IT WAS NOT OPENED FROM A CLICK ON THE GRID.
 *
 * The next whole hour, on the anchor's own day — not 09:00, and not now. A form
 * that opens at 14:37 asks the trainer to fix a time they did not choose, and one
 * that opens at a fixed hour asks them to fix it every single time.
 *
 * It lived in `Schedule.tsx` while the schedule was the only screen that could
 * open the form. Today opens it in place now, and a second copy of this rule is a
 * second answer to *what time did you mean* — the two screens' + would drift
 * apart the first time either was touched. Today calls it with `'day'` and
 * today's midnight, which is the only slot that screen can mean.
 */
export function defaultSlot(anchor: number, view: ScheduleView, now: number) {
  const day = view === 'week' ? pickDay(anchor, now) : startOfDay(anchor);
  const isToday = day === startOfDay(now);
  const minute = isToday
    ? Math.min(23 * 60, Math.ceil(minuteOfDay(now) / 60) * 60)
    : 9 * 60;
  return { dayAt: day, minute: Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES };
}

/**
 * WHAT TIME *THIS CLIENT* MEANS, ON A SURFACE WITH NO MINUTE AXIS.
 *
 * `defaultSlot` answers *what time did you mean* for a button that was pressed
 * from nowhere in particular. This answers it for a cell in the week-by-client
 * pivot, where the click has named a person and a day and cannot name a minute:
 * the row is a client and the column is a whole day, and `ClientWeek` is right
 * that no y-coordinate in it stands for an hour.
 *
 * So the minute comes from the client instead of from the pointer, and it is
 * the same fact `suggestClients` ranks band 1 on, read the other way round:
 * that function asks *who trains at this hour on Thursdays* and this asks
 * *which hour does this person train at on Thursdays*. One rule, two
 * directions — a second, cleverer rule here would put a different answer in the
 * form than the one the ranked list is built on.
 *
 * Four bands, in order, and the ladder stops at the first that can speak:
 *
 *   1. **Their own sessions on this weekday.** Somebody who trains Thursdays at
 *      06:00 gets 06:00. This is the answer nearly every time on this book —
 *      measured, 15 of 21 clients are on exactly two standing slots a week.
 *   2. **Their own sessions on any day**, for a client whose Thursday is new
 *      but whose hour is not.
 *   3. **The day's first working window**, for a client with no history at all.
 *      The trainer's own morning is a better guess than a constant.
 *   4. **09:00**, which is `defaultSlot`'s own fallback and is only reached when
 *      nobody has answered the hours either.
 *
 * Ties go to the EARLIER minute rather than to whichever row the array happened
 * to hold first, so the same client and the same day give the same answer on
 * every render. Nothing here is a commitment: the form opens with a time field
 * the trainer can change, which is the difference between a default and a rule.
 */
export function usualMinuteFor(
  sessions: BookSession[],
  clientId: string,
  dayAt: number,
  windows: { startMinute: number; endMinute: number }[],
): number {
  const weekday = isoWeekday(dayAt);

  const tally = (sameDay: boolean) => {
    const counts = new Map<number, number>();
    for (const s of sessions) {
      if (s.dead || s.clientId !== clientId) continue;
      if (sameDay && isoWeekday(s.at) !== weekday) continue;
      const minute = minuteOfDay(s.at);
      counts.set(minute, (counts.get(minute) ?? 0) + 1);
    }
    let best: number | null = null;
    let bestN = 0;
    for (const [minute, n] of counts) {
      if (n > bestN || (n === bestN && best !== null && minute < best)) {
        best = minute;
        bestN = n;
      }
    }
    return best;
  };

  const minute = tally(true) ?? tally(false) ?? windows[0]?.startMinute ?? 9 * 60;
  return Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES;
}

/** Today if the week contains it, otherwise the Monday the trainer is looking at. */
function pickDay(anchor: number, now: number) {
  const start = gridStart('week', anchor);
  const today = startOfDay(now);
  return today >= start && today < start + 7 * DAY_MS ? today : start;
}
