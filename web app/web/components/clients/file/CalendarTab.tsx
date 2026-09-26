'use client';

import { useMemo, useState } from 'react';

import type { ClientSessionWire } from '@/lib/clients/client-api';
import {
  buildClientMonth,
  monthBounds,
  monthLabel,
  shiftMonth,
  statesOnFile,
} from '@/lib/clients/calendar';
import { SessionCalendar, type CalendarLegendItem, type CalendarState } from '@/web-components/ui/SessionCalendar';
import { startOfMonth } from '@/lib/today/time';

/**
 * CALENDAR — the same rows as the Sessions tab, on a month.
 *
 * Asked for on 14 Sep 2026, beside Overview: *highlight the sessions assigned
 * to this client, with legends for completed, booked and missed*.
 *
 * ── WHY A SECOND VIEW OF ONE LIST IS NOT A DUPLICATE ────────────────────────
 *
 * The Sessions tab is a HISTORY — newest first, with what each session did to
 * the pack in its own column — and it is the right shape for *what happened on
 * the 3rd* and for *how many did we burn*. It is the wrong shape for the two
 * questions a trainer asks with a finger on a screen: **which days do they
 * come**, and **where are the holes**. A list ordered by time can only answer
 * those by being counted, and a month answers both by being looked at.
 *
 * So neither replaces the other, and the two share their vocabulary rather than
 * their layout: one `classifySession`, one set of five tones, one route per
 * session. `lib/clients/calendar.ts` holds the mapping and says why.
 *
 * ── THE LEGEND IS THE WHOLE CLIENT'S, AND THE COUNTS ARE THE MONTH'S ────────
 *
 * Which keys are drawn is decided over every session on the file; the figure
 * beside each key is the month on screen. Drawn the other way — keys for the
 * states this month happens to contain — the legend would gain and lose rows as
 * a trainer pressed the arrow, which is a key that has to be re-read every time
 * it changes and therefore is not a key. Drawn as all five always, a client who
 * has never missed or cancelled anything reads two rows of vocabulary about
 * outcomes that have never happened to them.
 *
 * `Completed`, `Booked` and `Missed` are drawn even at zero, because those are
 * the three the brief names and a trainer should be able to learn the tones off
 * a quiet month. `Not marked` and `Cancelled` appear only where they exist.
 */

/** The three the brief names. Always drawn, so the tones can be learnt. */
const ALWAYS: CalendarState[] = ['done', 'booked', 'missed'];
/** The two the file only sometimes has. Drawn when this client has one. */
const WHEN_PRESENT: CalendarState[] = ['unmarked', 'cancelled'];

export function CalendarTab({
  sessions,
  now,
}: {
  sessions: ClientSessionWire[];
  now: number;
}) {
  /*
   * The month is STATE, not a search param, and that is this codebase's own
   * rule read straight: the URL carries what is FETCHED, and nothing here is.
   * Every session the calendar can draw arrived with the client file — paging
   * to August is a different slice of one payload, so making it a route would
   * buy a shareable link at the cost of a server round trip per arrow press.
   */
  const [anchor, setAnchor] = useState(() => startOfMonth(now));

  const month = useMemo(() => buildClientMonth(sessions, anchor, now), [sessions, anchor, now]);
  const bounds = useMemo(() => monthBounds(sessions, now), [sessions, now]);

  const legend: CalendarLegendItem[] = useMemo(() => {
    const onFile = statesOnFile(sessions, now);
    const keys = [...ALWAYS, ...WHEN_PRESENT.filter((k) => onFile.has(k))];
    return keys.map((state) => ({ state, count: month.counts[state] }));
  }, [month, sessions, now]);

  const total = month.sessions === 1 ? '1 session' : `${month.sessions} sessions`;

  return (
    <SessionCalendar
      monthLabel={month.label}
      weeks={month.weeks}
      legend={legend}
      total={total}
      onPrev={() => setAnchor((a) => shiftMonth(a, -1))}
      onNext={() => setAnchor((a) => shiftMonth(a, 1))}
      prevDisabled={month.at <= bounds.first}
      nextDisabled={month.at >= bounds.last}
      footnote={
        <>
          The last three months and everything booked ahead —{' '}
          {monthLabel(bounds.first)} to {monthLabel(bounds.last)}. Older sessions are on
          the record and are not drawn here.
        </>
      }
    />
  );
}
