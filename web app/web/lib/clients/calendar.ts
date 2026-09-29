import { MONTHS_LONG, dayLong, startOfDay, startOfMonth, startOfWeek } from '@/lib/today/time';
import { classifySession, shortTime, type SessionFilter } from '@/components/clients/file/shared';
import type { CalendarDay, CalendarSession, CalendarState } from '@/web-components/ui/SessionCalendar';

import type { ClientSessionWire } from './client-api';

/**
 * THE CLIENT CALENDAR'S MONTH — the arithmetic, kept out of the component.
 *
 * `ui/SessionCalendar.tsx` takes rows of cells and draws them. Which six rows a
 * month is, where a week starts, and what state a session is in are decisions
 * with one right answer per product, so they live here: the library can then
 * render the component against a fixture without pulling a date library in
 * behind it, and this file can be reasoned about without a browser.
 *
 * ── THE STATE IS `classifySession`'S, RE-SPELT ONCE ─────────────────────────
 *
 * `shared.tsx` already decides what a session row IS — its five-way
 * `SessionFilter` is what the Sessions tab's chips filter on and what its tags
 * are toned by. This file does not re-decide it. It maps that vocabulary onto
 * the calendar's, which differs in exactly one word: `no_show` is drawn as
 * *Missed*, because a month grid has no room for a hyphenated compound and
 * *Missed* is the word the brief asked for.
 *
 * Deriving the state a second time — `status === 'done' ? … ` in a cell — is how
 * two views of one set of rows start disagreeing about a Tuesday, and the
 * disagreement always surfaces on the unmarked-past case that neither author
 * remembered.
 */
const STATE: Record<SessionFilter, CalendarState> = {
  done: 'done',
  booked: 'booked',
  no_show: 'missed',
  cancelled: 'cancelled',
  not_marked: 'unmarked',
  /* `all` is a filter chip, never a classification. It cannot reach here — the
     map is total so that adding a sixth outcome to `SessionFilter` fails to
     compile rather than falling through to a default nobody chose. */
  all: 'unmarked',
};

/** What a reader hears for each state, inside the pill's sentence. */
const SPOKEN: Record<CalendarState, string> = {
  done: 'completed',
  booked: 'booked',
  missed: 'missed',
  unmarked: 'no outcome recorded yet',
  cancelled: 'cancelled',
};

export interface ClientMonth {
  /** Midnight of the first of the month. The anchor everything else derives from. */
  at: number;
  /** `September 2026`. */
  label: string;
  /** Six rows of seven, Monday first. */
  weeks: CalendarDay[][];
  /** How many sessions fell inside the month itself, ignoring the padding days. */
  sessions: number;
  /** In-month counts per state, for the legend. */
  counts: Record<CalendarState, number>;
}

/** `September 2026`. */
export function monthLabel(at: number): string {
  const d = new Date(at);
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** The first of the month `delta` months away from `at`. */
export function shiftMonth(at: number, delta: number): number {
  const d = new Date(startOfMonth(at));
  return new Date(d.getFullYear(), d.getMonth() + delta, 1).getTime();
}

/**
 * The grid is always SIX rows, and that is a layout decision rather than a
 * date one.
 *
 * A month needs four, five or six depending on which weekday it opens on, so a
 * grid sized to the month changes height as a trainer pages through the year —
 * and on a tab whose content sits in a scroller, a 96px jump between September
 * and October moves everything below it. Six rows is the maximum any month can
 * need, so the box is still.
 */
const ROWS = 6;

/**
 * The one state a whole cell may be washed in, or null.
 *
 * On this product a client trains once a day, so almost every cell that holds
 * anything holds exactly one outcome and the cell IS the session — which is
 * what makes washing it honest rather than decorative.
 *
 * A day whose sessions DISAGREE gets null. A background is one value and cannot
 * say *completed and cancelled*, and picking a winner — the first, the worst,
 * the latest — would be a rule a trainer has to know to read the colour. So the
 * cell stays plain and the pills inside it say it themselves, which is the
 * arrangement the whole grid had before the wash. It is the uncommon case
 * (a reschedule, a double) and it is the one the wash must not lie about.
 */
function washOf(sessions: CalendarSession[]): CalendarState | null {
  if (sessions.length === 0) return null;
  const first = sessions[0].state;
  return sessions.every((s) => s.state === first) ? first : null;
}

export function buildClientMonth(
  sessions: ClientSessionWire[],
  anchor: number,
  now: number,
): ClientMonth {
  const first = startOfMonth(anchor);
  const month = new Date(first).getMonth();
  const year = new Date(first).getFullYear();
  const today = startOfDay(now);

  /* Bucketed by midnight rather than searched per cell: 42 cells against a
     four-month window of rows is 42 linear scans, and the map is one. */
  const byDay = new Map<number, CalendarSession[]>();
  /* Sorted ONCE, before bucketing, so every bucket comes out in clock order.
     Sorting the buckets afterwards was the first version and it sorted on the
     formatted string — where "10:00 AM" precedes "6:00 AM", and a Tuesday with
     a morning and a mid-morning session read backwards. The instant is the
     thing with an order; its rendering is not. */
  for (const s of [...sessions].sort((a, b) => a.scheduledAt - b.scheduledAt)) {
    const state = STATE[classifySession(s, now)];
    const key = startOfDay(s.scheduledAt);
    const pill: CalendarSession = {
      id: s.id,
      time: shortTime(s.scheduledAt),
      label: s.workout?.name ?? null,
      state,
      href: `/sessions/${s.id}`,
      spoken: `${dayLong(s.scheduledAt)}, ${shortTime(s.scheduledAt)}`
        + `${s.workout ? `, ${s.workout.name}` : ''}, ${SPOKEN[state]}`,
    };
    const bucket = byDay.get(key);
    if (bucket) bucket.push(pill);
    else byDay.set(key, [pill]);
  }
  const start = startOfWeek(first);
  const weeks: CalendarDay[][] = [];
  const counts: Record<CalendarState, number> = {
    done: 0, booked: 0, missed: 0, unmarked: 0, cancelled: 0,
  };
  let total = 0;

  for (let w = 0; w < ROWS; w += 1) {
    const row: CalendarDay[] = [];
    for (let i = 0; i < 7; i += 1) {
      /* Rebuilt through `Date` rather than added as milliseconds. India has no
         DST, but the arithmetic is the same arithmetic every other screen here
         does and a 23-hour day would silently shift a whole row of the grid. */
      const d = new Date(start);
      const at = startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + w * 7 + i).getTime());
      const inMonth = new Date(at).getMonth() === month && new Date(at).getFullYear() === year;
      const daySessions = byDay.get(at) ?? [];
      if (inMonth) {
        total += daySessions.length;
        for (const s of daySessions) counts[s.state] += 1;
      }
      row.push({
        at,
        dayOfMonth: new Date(at).getDate(),
        inMonth,
        isToday: at === today,
        sessions: daySessions,
        wash: washOf(daySessions),
      });
    }
    weeks.push(row);
  }

  return { at: first, label: monthLabel(first), weeks, sessions: total, counts };
}

/**
 * Every outcome this client's file actually contains.
 *
 * Asked of the whole file rather than of the month on screen, because it
 * decides which legend keys are DRAWN — and a key that appears and disappears
 * as a trainer presses the arrow has to be re-read every time it changes, which
 * makes it not a key. The figure beside each key is still the month's.
 */
export function statesOnFile(sessions: ClientSessionWire[], now: number): Set<CalendarState> {
  const seen = new Set<CalendarState>();
  for (const s of sessions) seen.add(STATE[classifySession(s, now)]);
  return seen;
}
