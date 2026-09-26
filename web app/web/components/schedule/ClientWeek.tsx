'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatMinute, formatMinuteRange } from '@/lib/today/time';
import { EMPTY_CAP, type PivotDay, type PivotRow, type WeekPivot } from '@/lib/schedule/pivot';
import type { Placed } from '@/lib/schedule/grid';
import { Check } from '@/components/shell/Icons';
import { Cross, Remote } from './Icons';
import { Button } from '@/web-components/ui/Button';
import { Avatar } from '@/web-components/ui/Avatar';

/** 0 = Monday … 6 = Sunday — `working_hours.weekday`'s convention, as everywhere. */
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * THE WEEK BY CLIENT — the second arrangement, and a real `<table>`.
 *
 * `lib/schedule/pivot.ts` carries the argument for why this view exists at all
 * and the measurements behind it. This file is what it looks like.
 *
 * ── IT IS A TABLE, AND THAT IS NOT A LAYOUT CHOICE ──────────────────────────
 *
 * Rows are clients, columns are days, and every cell is the intersection of the
 * two — which is the definition of a table and not merely a shape that could be
 * drawn with one. The payoff is entirely in the accessibility tree: `scope="row"`
 * on the name and `scope="col"` on the weekday mean a chip announces as
 * **"Aarav Iyer, Wed 2, 6:00 AM"** without a word of `aria-label` doing the
 * work, and a reader can walk the row the same way the eye does.
 *
 * This is the one place on this screen where a table is right. `.cw` is NOT one
 * and `TimeGrid` says why — an hour is a line drawn ON the track rather than a
 * row, because a cell cannot express an 07:30 start. Here there is no minute
 * axis to lose: a cell is a whole day.
 *
 * Two `<tbody>` elements rather than one, which is valid and is what puts a
 * heading between the two groups without inventing a row type.
 *
 * ── THE CHIPS WEAR THE LEGEND'S VOCABULARY, NOT A SECOND ONE ────────────────
 *
 * `ScheduleKey` teaches four things about a block: the FILL is delivery, the
 * 3px left BAR is status, a triangle is a clash, a tick is done. A chip here is
 * the same fill and the same bar off the same tokens, so the key drawn nine
 * pixels above the grid is true of this arrangement too and nothing had to be
 * added to it. A second colour language for the same facts would make the
 * toggle cost a re-learn, which is most of what a toggle is supposed to save.
 *
 * ── AND AN EMPTY CELL IS A PLACE TO PUT SOMEBODY ────────────────────────────
 *
 * This file used to end with the opposite rule, and it was argued from a real
 * measurement — 119 of 161 cells hold nothing, and an affordance over something
 * that does not respond is the defect `DayColumn`'s grip was fixed for. The
 * argument it hung on was that "booking from here would need a minute this
 * arrangement does not have", and that half is still true: a column is a whole
 * day and no y-coordinate in it stands for an hour.
 *
 * What changed is where the minute comes from. `usualMinuteFor` reads it off
 * THE CLIENT — the row is a person, and a person who trains Thursdays at 06:00
 * is telling us the hour the pointer cannot. So the two axes of a cell answer
 * two of the booking's five questions and the person answers the third, which
 * is one more than the hours view can supply from a click: that click knows a
 * minute and has to ask who.
 *
 * So the cell books, and the empty week stops being the one thing on this
 * screen a trainer can see and not act on. It is a POINTER accelerator and
 * nothing here is focusable — 119 new tab stops to reach the same panel `n`
 * already opens would be a worse screen for the keyboard, which is the trade
 * `markSlot` states for the same affordance on the track.
 *
 * ── AND WHILE A MOVE IS IN FLIGHT, THE CELL IS THE TARGET ───────────────────
 *
 * MEASURED, and it is a dead end rather than a defect of taste: open any
 * session's panel from this table, press *Move*, and the move bar appears over
 * an arrangement with nothing that can receive a placement. The only way out
 * was *Cancel* — a mode with no exit except the one that undoes it.
 *
 * A pivot cell cannot say a minute, so a move through it KEEPS the session's
 * own: *the same time, on a different day*, which is the move this arrangement
 * is shaped to make. And it is offered on one row only — the moving client's —
 * because the cell's other axis is a person, and dropping Meera's Tuesday onto
 * Rahul's Thursday is not a move, it is a different booking for a different
 * human being.
 */
export function ClientWeek({
  pivot, moving, onOpenSession, onCell,
}: {
  pivot: WeekPivot;
  /** The session waiting to be placed, or null. See the note above. */
  moving: { sessionId: string; clientId: string } | null;
  onOpenSession: (id: string) => void;
  /** A click on a cell: place the moving session, or book this client that day. */
  onCell: (clientId: string, dayAt: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  const folded = !showAll && pivot.empty.length > EMPTY_CAP;
  const empty = folded ? pivot.empty.slice(0, EMPTY_CAP) : pivot.empty;

  /* An empty row means something different behind us than it does ahead: in a
     week that has happened it is somebody who did not train, and in one that has
     not it is somebody with nothing booked YET. The same row, two readings, and
     a heading that guessed would be wrong half the year. */
  const emptyHeading = pivot.isPastWeek ? 'Did not train this week' : 'Nothing booked this week';

  const rowProps = {
    days: pivot.days,
    moving,
    onOpen: onOpenSession,
    onCell,
  };

  return (
    <div className="cwk__wrap">
      <table className={moving ? 'cwk cwk--placing' : 'cwk'}>
        <caption className="vh">
          The week by client. {pivot.totals.onBook} of {pivot.totals.clients} clients
          on the book, {pivot.totals.sessions} sessions.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="cwk__corner">Client</th>
            {pivot.days.map((day, i) => (
              <DayHead key={day.at} day={day} short={DAY_SHORT[i] ?? ''} />
            ))}
          </tr>
        </thead>

        <tbody>
          {pivot.booked.map((row) => (
            <Row key={row.client.id} row={row} {...rowProps} />
          ))}
        </tbody>

        {pivot.empty.length > 0 && (
          <tbody className="cwk__tail">
            <tr className="cwk__grp">
              <th scope="colgroup" colSpan={8}>
                {emptyHeading}
                <em>{pivot.empty.length}</em>
              </th>
            </tr>
            {empty.map((row) => (
              <Row key={row.client.id} row={row} {...rowProps} />
            ))}
            {folded && (
              <tr>
                <td colSpan={8} className="cwk__more">
                  {/* The count is in the label, which is what makes this a
                      disclosure rather than a truncation — `QUEUE_CAP`'s rule
                      one screen over. */}
                  <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                    Show {pivot.empty.length - EMPTY_CAP} more
                  </Button>
                </td>
              </tr>
            )}
          </tbody>
        )}
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ head ── */

/**
 * ONE COLUMN HEAD, AND IT CARRIES THE COUNT THE HOURS VIEW'S HEAD CARRIES.
 *
 * `.cal__hd` prints a day's session count under its date and this printed only
 * the date, which left the two arrangements of one week disagreeing about what
 * a head is for: on the hours grid a column's weight is readable at a glance
 * and here it had to be counted off the chips. MEASURED on this week — Mon 9,
 * Tue 6, Wed 8, Thu 9, Fri 8, Sat 3, Sun 0 — which is a shape worth one line.
 *
 * ── AND SUNDAY SAYS WHY IT IS EMPTY ─────────────────────────────────────────
 *
 * The seeded trainer works Monday to Saturday. So the Sunday column is 175px
 * of blank cells under a bare date, and a blank column in a table whose whole
 * subject is who did not train reads as twenty-three people who did not train.
 * It is a day off, which is the product's own phrase for it on `/today`, and a
 * rest day drawn as a failed working day is the same false reading `WeekDots`
 * refuses when it makes a rest cell identical in weight to a missed one.
 *
 * `pivot.closed` is only ever true when the hours HAVE been answered, so a
 * trainer who has told us nothing gets seven ordinary columns rather than seven
 * days off — see `buildWeekPivot`.
 */
function DayHead({ day, short }: { day: PivotDay; short: string }) {
  const classes = ['cwk__dh'];
  if (day.isToday) classes.push('cwk__dh--today');
  if (day.closed) classes.push('cwk__dh--closed');
  /* The clash is a DAY-level fact and it is said in a day-level place: a 2px
     danger underline across the whole head, which is `.cal__hd--clash`'s own
     mark on the hours grid. Never on the count — that view already found out
     what `⚠ 26` reads as, and it is *twenty-six warnings*. */
  if (day.hasClash) classes.push('cwk__dh--clash');

  return (
    <th
      scope="col"
      className={classes.join(' ')}
      aria-current={day.isToday ? 'date' : undefined}
    >
      <span className="cwk__dh__t">
        <span className="cwk__dh__d">{short}</span>
        <span className="cwk__dh__n">{day.dayOfMonth}</span>
      </span>
      {/* The second line is one of three things and never two of them: a day off
          says so, a day with sessions says how many, and an ordinary empty day
          says nothing rather than drawing a `0` — a column of noughts is the
          `.chip--zero` finding in typography, a figure shouting about an absence
          the blank cells under it have already made plain. */}
      {day.closed ? (
        <span className="cwk__dh__c cwk__dh__c--off">Day off</span>
      ) : day.count > 0 ? (
        <span className="cwk__dh__c">
          {day.count}
          {/* Spoken, never drawn: seven figures in a row read as counts already,
              and `sessions` seven times is 44px of repetition per column. */}
          <i className="vh"> {day.count === 1 ? 'session' : 'sessions'}</i>
        </span>
      ) : (
        <span className="cwk__dh__c" />
      )}
    </th>
  );
}

/* ------------------------------------------------------------------- row ── */

function Row({
  row, days, moving, onOpen, onCell,
}: {
  row: PivotRow;
  days: PivotDay[];
  moving: { sessionId: string; clientId: string } | null;
  onOpen: (id: string) => void;
  onCell: (clientId: string, dayAt: number) => void;
}) {
  const { client } = row;
  /* Whose row can take the placement. See the head of the file: the cell's two
     axes are a day and a PERSON, so a move across rows would be changing who
     the session is for. */
  const takesDrop = moving !== null && moving.clientId === client.id;

  const classes = ['cwk__r'];
  if (row.absence) classes.push('cwk__r--off');
  if (moving) classes.push(takesDrop ? 'cwk__r--drop' : 'cwk__r--mute');

  return (
    <tr className={classes.join(' ')}>
      <th scope="row" className="cwk__who">
        <Link href={`/clients/${client.id}`} className="cwk__who__l">
          <Avatar name={client.name} id={client.id} size="sm" className="cwk__av" />
          <span className="cwk__who__t">
            <b>{client.name}</b>
            <Rhythm row={row} />
          </span>
        </Link>
      </th>

      {row.days.map((cell, i) => {
        const day = days[i];
        const cellClasses = ['cwk__c'];
        if (day?.isToday) cellClasses.push('cwk__c--today');
        if (day?.closed) cellClasses.push('cwk__c--closed');
        /* Inert while another client's session is looking for a day. A cell
           that lit up under the pointer and then did nothing is exactly the
           affordance-over-nothing this table spent years not drawing. */
        if (moving && !takesDrop) cellClasses.push('cwk__c--inert');

        return (
          <td
            key={day?.at ?? i}
            className={cellClasses.join(' ')}
            /* A cell is not a control and must not announce as one: the click
               is a pointer accelerator over a `<td>`, and everything it reaches
               — the booking panel, the move — has a keyboard route of its own.
               `title` is the pointer's own hint and is never the only copy. */
            title={
              moving
                ? (takesDrop ? `Move to ${dayLabel(day)}` : undefined)
                : `Book ${client.name} on ${dayLabel(day)}`
            }
            onClick={(event) => {
              if (moving && !takesDrop) return;
              // A click that landed on a chip has already been handled by it.
              if ((event.target as HTMLElement).closest('button')) return;
              if (!day) return;
              onCell(client.id, day.at);
            }}
          >
            {cell.map((placed) => (
              <Chip key={placed.session.id} placed={placed} onOpen={onOpen} />
            ))}
          </td>
        );
      })}
    </tr>
  );
}

/** `Thu 17` — the pointer hint's half of a date the head already prints. */
function dayLabel(day: PivotDay | undefined) {
  if (!day) return 'this day';
  return `${DAY_SHORT[day.weekday] ?? ''} ${day.dayOfMonth}`;
}

/**
 * The figure under the name, and it is a COMPARISON wherever the roster can
 * make one.
 *
 * A bare `2` says nothing — two is a full week for one client and half a week
 * for another. `sessionsPerWeek` is what this book is actually organised around
 * (measured: 15 of 21 clients on exactly two), so the row states booked against
 * usual and tones the ones that fall short. Where the roster has never been told
 * the rhythm it states the count alone rather than inventing a denominator,
 * which is `utilisation`'s own rule about refusing to guess one.
 *
 * ── THE TWO FAULTS ARE LISTED, NEVER RANKED ─────────────────────────────────
 *
 * `missed` and `late` are independent and a week can hold both. Printing only
 * the first would be the chain the chip below was fixed for — two facts made to
 * compete, and the rarer one always losing. A row that wraps to a third line to
 * say both is a taller row saying something true.
 */
function Rhythm({ row }: { row: PivotRow }) {
  if (row.absence === 'paused') return <span className="cwk__tag">Paused</span>;
  if (row.absence === 'prospect') return <span className="cwk__tag">Not started</span>;
  if (row.absence === 'none') return <span className="cwk__tag cwk__tag--warn">Nothing booked</span>;

  const parts: string[] = [];
  if (row.usual === null) {
    parts.push(`${row.booked} ${row.booked === 1 ? 'session' : 'sessions'}`);
  } else {
    parts.push(`${row.booked} of ${row.usual}`);
  }
  if (row.missed) parts.push(`${row.missed} missed`);
  /* The word is the one the session panel uses for the same state. "Unmarked"
     would be a second name for it three clicks away from the first. */
  if (row.late) parts.push(`${row.late} not marked`);

  const warn = row.short || row.missed > 0 || row.late > 0;
  return (
    <span className={warn ? 'cwk__n cwk__n--warn' : 'cwk__n'}>
      {parts.join(' · ')}
    </span>
  );
}

/* ------------------------------------------------------------------ chip ── */

function Chip({ placed, onOpen }: { placed: Placed; onOpen: (id: string) => void }) {
  const s = placed.session;

  /*
   * FOUR AXES, FOUR CHANNELS, AND NOT ONE OF THEM IS A CHAIN.
   *
   * FOUND BY COUNTING: this read `done ? … : noShow ? … : lanes > 1 ? clash`,
   * and in a week that has happened 35 of 38 sessions are done — so **every
   * clash in the past drew nothing at all**. It is `SessionBlock`'s own bug,
   * which the block was fixed for and which I wrote again one file over: a
   * chain makes two independent facts compete, and the rarer one always loses.
   *
   *   fill        delivery — floor or online
   *   3px bar     lifecycle — booked, done, no-show
   *   ring        sharing a minute with somebody else
   *   ink         NOT MARKED — it has happened and nobody has said what happened
   *
   * The fourth is new and it was the one this chip could not say at all. A
   * booking on Tuesday that has come and gone with no outcome on it looked
   * exactly like Friday's — same fill, same bar, same grey — so the one state
   * on this table a trainer has to DO something about was the only one it drew
   * nothing for. MEASURED on the live week: one session, `2 of 2` on a row that
   * has trained once. `.ev--late` has coloured it on the hours grid all along.
   *
   * `session.late` is the same flag the block reads (`api.ts`: not done, not
   * dead, and its end is behind us), so a no-show is already excluded and there
   * is no second rule here to disagree with the first.
   */
  const classes = ['cwk__s'];
  if (s.mode === 'remote') classes.push('cwk__s--remote');
  if (s.done) classes.push('cwk__s--done');
  else if (s.noShow) classes.push('cwk__s--noshow');
  else if (s.late) classes.push('cwk__s--late');
  if (placed.lanes > 1) classes.push('cwk__s--clash');

  /* Two independent slots, the same split `SessionBlock` makes: a done ONLINE
     session is two marks and not a choice between them. */
  const mode = s.mode === 'remote' ? <Remote size={10} /> : null;
  const state = s.done ? <Check size={10} /> : s.noShow ? <Cross size={10} /> : null;

  return (
    <button
      type="button"
      className={classes.join(' ')}
      onClick={() => onOpen(s.id)}
      /* The row's `<th scope="row">` and the column's `<th scope="col">` are
         already announced with this cell, so the name and the day are NOT
         repeated here — a label reading "Aarav Iyer, Wed 2, Aarav Iyer, Wed 2,
         6:00 AM" is what a hand-written one costs on a table that is doing its
         job. What is added is only what the chip's own paint is saying. */
      aria-label={[
        formatMinuteRange(placed.startMinute, placed.endMinute),
        s.mode === 'remote' ? 'online' : 'in person',
        s.done ? 'done' : s.noShow ? 'no-show' : s.late ? 'not marked' : null,
        placed.lanes > 1 ? 'shares this time' : null,
      ].filter(Boolean).join(', ')}
      title={`${s.clientName} · ${formatMinuteRange(placed.startMinute, placed.endMinute)}`}
    >
      {/*
        TWO SPELLINGS OF ONE FACT, AND THE COLUMN'S WIDTH PICKS.

        The chip is as wide as its column and the column is a seventh of the
        table: MEASURED, 168px at 1536 and 230px at 1920, both of them holding
        44px of `6:00 AM`. Three quarters of every chip on the screen was empty,
        and the fact it had room for is the one the pivot drops — a 30-minute
        session and a two-hour one drew the identical mark.

        So a wide column prints the RANGE. `formatMinuteRange` collapses the
        repeated meridiem for exactly this reason and comes to ~88px, which
        needs ~130px of column once the icons and the padding are paid for —
        true from 1240px up, and `.cwk` keeps the start alone below it rather
        than ellipsising a time. A clipped clock face is the one thing
        `lib/today/time.ts` will not ship.

        Both are in the DOM and CSS chooses, which costs a reader nothing: the
        button's name is its `aria-label` and its children are not announced.
      */}
      <span className="cwk__s__t">{formatMinute(placed.startMinute)}</span>
      <span className="cwk__s__r">
        {formatMinuteRange(placed.startMinute, placed.endMinute)}
      </span>
      {(mode || state) && (
        <span className="cwk__s__g" aria-hidden="true">
          {mode && <i className="cwk__s__m">{mode}</i>}
          {state && <i className="cwk__s__st">{state}</i>}
        </span>
      )}
    </button>
  );
}
