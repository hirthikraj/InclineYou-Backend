'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';

import type { ClientSessionWire } from '@/lib/clients/client-api';
import { buildClientMonth, shiftMonth, statesOnFile } from '@/lib/clients/calendar';
import { SessionCalendar, type CalendarLegendItem, type CalendarState } from '@/web-components/ui/SessionCalendar';
import { startOfMonth } from '@/lib/today/time';

/* Done, booked and missed are always keyed, because a zero there is a fact about
   the month. Unmarked and cancelled are keyed only when this client has them. */
const ALWAYS: CalendarState[] = ['done', 'booked', 'missed'];
const WHEN_PRESENT: CalendarState[] = ['unmarked', 'cancelled'];

/** `yyyy-MM` of a local instant — the route's `?month=`. */
function monthParam(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * ONE MONTH, AND THE MONTH IS A PLACE. The route reads `?month=yyyy-MM` and
 * loads that month alone (±7 days for the grid's edge weeks), so the arrows are
 * navigations rather than state over a four-month download — and a month has no
 * edge any more: every month is one read away, older history included.
 */
export function CalendarTab({
  clientId,
  sessions,
  month: monthKey,
  now,
}: {
  clientId: string;
  sessions: ClientSessionWire[];
  month: string | null;
  now: number;
}) {
  const router = useRouter();
  const anchor = useMemo(() => {
    const m = /^(\d{4})-(\d{2})$/.exec(monthKey ?? '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1).getTime() : startOfMonth(now);
  }, [monthKey, now]);

  const month = useMemo(() => buildClientMonth(sessions, anchor, now), [sessions, anchor, now]);

  const legend: CalendarLegendItem[] = useMemo(() => {
    const onFile = statesOnFile(sessions, now);
    const keys = [...ALWAYS, ...WHEN_PRESENT.filter((k) => onFile.has(k))];
    return keys.map((state) => ({ state, count: month.counts[state] }));
  }, [month, sessions, now]);

  /* The legend counts THIS month; the dimmed days at the grid's edges are drawn with their
     own sessions. Said in a line, so "Missed 1" beside two red cells is not a contradiction
     a trainer has to resolve alone. */
  const outside = month.weeks.flat().reduce((n, d) => (d.inMonth ? n : n + d.sessions.length), 0);

  const total = month.sessions === 1 ? '1 session' : `${month.sessions} sessions`;
  const go = (delta: number) =>
    router.push(`/clients/${clientId}/calendar?month=${monthParam(shiftMonth(anchor, delta))}`);

  return (
    <SessionCalendar
      monthLabel={month.label}
      weeks={month.weeks}
      legend={legend}
      total={total}
      onPrev={() => go(-1)}
      onNext={() => go(1)}
      footnote={
        outside > 0
          ? `Counts are for ${month.label}. ${outside} more ${outside === 1 ? 'session sits' : 'sessions sit'} on the dimmed days from the neighbouring months.`
          : undefined
      }
    />
  );
}
