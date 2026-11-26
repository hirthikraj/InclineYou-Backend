'use client';

import { useState } from 'react';

import type { CloseOutSession } from '@/lib/today/deck';
import { clockParts, dayStamp, startOfDay } from '@/lib/today/time';
import { Agenda, AgendaDay, AgendaRow } from '@/web-components/ui/Agenda';
import { Avatar } from '@/web-components/ui/Avatar';
import { Button } from '@/web-components/ui/Button';
import { Slab } from '@/web-components/ui/Slab';
import { MarkAnswer } from './MarkAnswer';
import { useMarkRows } from './useMarkRows';

/**
 * UNMARKED FROM LAST WEEK — past sessions nobody marked, one row each, two
 * answers, and *Mark all* for the usual case where everybody came.
 *
 * A pack only moves on *done* or *no-show*, so every session here is a pack
 * figure that is wrong right now, and so is every total built on it. Oldest
 * first: the oldest is the one closest to falling out of the week-long window.
 *
 * ── THE REVAMP (26 Nov 2026) ────────────────────────────────────────────────
 *
 * Redrawn as the reference's card: the title says WHICH sessions (*Unmarked
 * from last week* — it was *Close out the last week*, a verb for a card of
 * answers), the lead says what it costs, and the rows are the same `AgendaRow`
 * the day's list draws, with the date as the row's `meta`. Approved removals:
 * the *Diary* column (the same word on every row) and *· −1* on *No-show*
 * (the lead says it once — see `MarkAnswer`).
 *
 * *Mark all N done* is the SECONDARY plate here and the ink plate on today's
 * card, which is the reference's own ranking: today's sessions are the ones a
 * trainer remembers; last week's are where a no-show is likelier, so bulk
 * marking them should not be the loudest thing in the card.
 */
/**
 * THREE ROWS, NOT SIX (revamp review, 26 Nov 2026). The reference shows three
 * and folds the rest, and six pushed *Needs you today* — the money and the
 * renewals — a screen further down on exactly the mornings a week was left
 * unmarked. The fold states its count, and every *Mark* verb states its own.
 */
const CLOSE_CAP = 3;

export function CloseOut({ sessions }: { sessions: CloseOutSession[] }) {
  const { stateOf, answer, markAll, holding } = useMarkRows();
  const [expanded, setExpanded] = useState(false);

  if (sessions.length === 0) return null;

  const open = sessions.filter((s) => stateOf(s.id).kind !== 'done');
  const answerable = open.filter((s) => {
    const k = stateOf(s.id).kind;
    return k === 'rest' || k === 'failed';
  });
  const visible = expanded ? sessions : sessions.slice(0, CLOSE_CAP);
  const folded = sessions.length - visible.length;

  /* Grouped by day, oldest first — `sessions` arrives sorted. A day's verb
     marks every unanswered session of THAT day, folded ones included, and its
     count says how many: *Mark the day done* is the commonest answer to a past
     week ("Monday, everyone came"). */
  const days: { at: number; rows: CloseOutSession[] }[] = [];
  for (const s of visible) {
    const at = startOfDay(s.at);
    const last = days[days.length - 1];
    if (last && last.at === at) last.rows.push(s);
    else days.push({ at, rows: [s] });
  }
  const dayAnswerable = (at: number) =>
    answerable.filter((s) => startOfDay(s.at) === at);
  const dayTotal = (at: number) => sessions.filter((s) => startOfDay(s.at) === at).length;

  return (
    <Slab
      title="Unmarked from last week"
      count={open.length}
      flush
      lead="Pack balances are off until these are marked. A no-show still uses one session from the pack."
      button={
        answerable.length > 1 ? (
          <Button variant="secondary" disabled={holding} onClick={() => markAll(answerable)}>
            Mark all {answerable.length} done
          </Button>
        ) : undefined
      }
    >
      <Agenda label="Unmarked sessions from last week">
        {days.flatMap((day) => {
          const open = dayAnswerable(day.at);
          const total = dayTotal(day.at);
          return [
            <AgendaDay
              key={`d${day.at}`}
              title={dayStamp(day.at).replace(' · ', ' ')}
              aside={`${total} session${total === 1 ? '' : 's'}`}
              action={
                open.length > 1 ? (
                  <button
                    type="button"
                    className="agn__day-b"
                    disabled={holding}
                    onClick={() => markAll(open)}
                  >
                    Mark the day done{open.length < total ? ` (${open.length})` : ''}
                  </button>
                ) : undefined
              }
            />,
            ...day.rows.map((s) => {
              const clock = clockParts(s.at);
              const state = stateOf(s.id);
              return (
                <AgendaRow
                  key={s.id}
                  href={`/clients/${s.clientId}/sessions`}
                  avatar={<Avatar name={s.clientName} id={s.clientId} />}
                  name={s.clientName}
                  state={state.kind === 'done' ? 'done' : 'idle'}
                  meta={
                    <>
                      <span className="tnum">
                        {clock.time} {clock.meridiem}
                      </span>
                      {s.dayLabel && <span className="agn__meta-l"> · {s.dayLabel}</span>}
                    </>
                  }
                  actions={
                    <MarkAnswer
                      state={state}
                      clientName={s.clientName}
                      onAnswer={(came) => void answer(s, came)}
                    />
                  }
                />
              );
            }),
          ];
        })}
      </Agenda>
      {folded > 0 && (
        <button className="slab__more" type="button" onClick={() => setExpanded(true)}>
          Show {folded} more
        </button>
      )}
      {expanded && sessions.length > CLOSE_CAP && (
        <button className="slab__more" type="button" onClick={() => setExpanded(false)}>
          Show the oldest {CLOSE_CAP} only
        </button>
      )}
    </Slab>
  );
}
