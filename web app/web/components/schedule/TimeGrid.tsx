'use client';

import { useMemo } from 'react';

import { formatHourMark, formatMinute, formatMinuteRange, formatSpan, minuteOfDay, rupees } from '@/lib/today/time';
import { dayMoney, gapWorth, type Gap } from '@/lib/today/day';
import type { RateSource } from '@/lib/today/day';
import {
  hoursWord, laneStyle, ticksFor,
  type GridRow, type ScheduleDay, type ScheduleGrid, type Segment,
} from '@/lib/schedule/grid';
import { SNAP_MINUTES } from '@/lib/schedule/result';
import { SessionBlock } from './SessionBlock';
import { useGridKeys } from './useGridKeys';
import { useCwScale } from './useCwScale';
import { Fold, Unfold, WarnTriangle } from './Icons';
import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';

/** A lane row's own height in pixels, which does not scale — a duration does.
 *  Mixing the two unconverted is what made the lane overrun its segment one
 *  scale factor ago. `laneFits` is the surviving reader of it.
 *
 *  Module scope, not the component body: `laneFits` is a `useMemo` whose
 *  callback runs during the render that declares it, so a `const` below it is
 *  in the temporal dead zone and throws — a class `tsc` does not catch. */
const LANE_ROW = 38;

/**
 * THE WEEK AND THE DAY ARE ONE COMPONENT, BECAUSE THEY ARE ONE GEOMETRY.
 *
 * Both are a column per day on a shared minute axis; the day view has one column
 * and a context lane beside it. Building them separately is how the two drift —
 * webapp.css already carries the evidence for that in the other direction, where
 * one component was specified at three different heights across two files.
 *
 * ── WHAT IS ABSOLUTE AND WHAT IS A GRID CELL ─────────────────────────────────
 *
 * `.cw` is a CSS grid of `gutter + n` columns, and each SEGMENT contributes one
 * row of cells. Inside a cell nothing is a row: the hour rulings are `<span>`s
 * with a `top`, the blocks are buttons with a `top` and a `height`, and both are
 * measured in minutes from the segment's own start. That inversion — hours drawn
 * ON the track rather than BEING it — is the entire §02 of the design set and the
 * thing that makes an 07:30 start expressible.
 *
 * ── THE ROWS ARE NOT ALWAYS SEGMENTS ─────────────────────────────────────────
 *
 * A run of hours outside every day's working windows, holding nothing, collapses
 * to one 30px seam. It is not a generic "hide empty hours" and webapp.css is
 * emphatic about the difference: an empty hour INSIDE working hours is the
 * sellable gap this screen exists to price, and collapsing it would hide the
 * money. `buildRows` in `lib/schedule/grid.ts` draws that line.
 */

interface TimeGridProps {
  grid: ScheduleGrid;
  rates: RateSource;
  gymSharePercent: number | null;
  now: number;
  /** Whether the free time inside working hours is drawn and priced. */
  showGaps: boolean;
  /** The day view draws one column and a context lane; the week draws seven. */
  lane: boolean;
  /**
   * The trainer has answered when they work — anywhere in the week, not on the
   * day being drawn. `offRunsIn` is the only reader and its note says why the
   * question has to be asked at that scope.
   */
  hoursSet: boolean;
  onToggleBand: (from: number) => void;
  onOpenSession: (id: string) => void;
  /** A `+N` chip's destination: the day view, where nothing is capped. */
  onOpenDay: (dayAt: number) => void;
  /** A click on empty track, already snapped to the 15-minute quantum. */
  onBook: (dayAt: number, minute: number) => void;
  /** The session ringed for the ten seconds after a move. */
  justMovedId?: string | null;
  /**
   * A move is in flight and the next click is choosing its slot.
   *
   * FOUND BY RENDERING. Without this, a click that landed on an existing block
   * during a move opened THAT block's panel and left the move bar up with
   * nothing to place — a dead end reachable by tapping anywhere the week is
   * busy, which on a full week is most of it.
   *
   * The fix is not to make blocks a second kind of drop target. While a move is
   * in flight the grid is a surface for choosing a MINUTE, so the blocks and the
   * gaps stop taking pointer events and every click reaches the column
   * underneath, where the Y coordinate is read and snapped. One class, and the
   * cursor says so.
   */
  placing?: boolean;
}

export function TimeGrid({
  grid, rates, gymSharePercent, now, showGaps, lane, hoursSet,
  onToggleBand, onOpenSession, onOpenDay, onBook, justMovedId, placing,
}: TimeGridProps) {
  /* The pixels-per-minute the whole grid is drawn at. One number, measured from
     the scroll container, shared by every vertical measurement below — see
     `useCwScale` for why it is no longer the constant 1. */
  const { scale, foot, ref: scrollRef } = useCwScale(grid);
  const { ref: gridRef, activeId, onKeyDown, onFocusCapture } = useGridKeys();
  const nowMinute = minuteOfDay(now);
  /* THE NEXT SESSION, for the one column that is today. The first one that has not
     finished and is not already done or a no-show — running counts, because the
     answer to *what is next* while somebody is mid-set is the one they are in. */
  const todayCol = grid.days.find((d) => d.isToday);
  const nextPlaced = todayCol?.placed.find(
    (p) => !p.hidden && !p.session.done && !p.session.noShow && p.endMinute > nowMinute,
  );
  const nextId = nextPlaced?.session.id ?? null;
  const nextLabel = nextPlaced
    ? `${nextPlaced.session.clientName} ${formatMinute(nextPlaced.startMinute)}`
    : null;

  /*
   * ── THE CONTEXT LANE IS DROPPED WHEN IT CANNOT BE DRAWN HONESTLY ───────────
   *
   * FOUND BY RENDERING REAL ROWS. The lane is `58fr` of the day view and its job
   * is to say WHY each block matters — plan, package, money — beside the block
   * it belongs to. That works while a card can sit at its own minute. On a
   * 26-session Tuesday it cannot: twenty-two cards at one row each need 748px
   * inside a 06:00–11:00 segment that is, by the geometry this screen is built
   * on, exactly 300px tall.
   *
   * Every way of keeping the lane there is worse than not having it. Drifting
   * the cards downward makes the lane lie about which block each one describes,
   * and unclipped it printed straight over the quiet band and the segment below.
   * Scrolling inside the cell nests a scroller in a grid that already scrolls in
   * two axes, and shows nine of twenty-two behind a hairline scrollbar. Shrinking
   * the rows to fit needs 13.6px a card.
   *
   * So it goes, and the width goes to the spine — which is the same trade
   * app.css already makes at 760px, for the same stated reason: *"Everything in
   * it is on the session panel one tap away."* At full width those twenty-six
   * blocks are ~290px each instead of ~93px, which is the difference between
   * reading the day and decoding it.
   */
  const laneFits = useMemo(() => {
    if (!lane) return false;
    const day = grid.days[0];
    if (!day) return true;
    const track = grid.rows.reduce(
      (n, r) => (r.kind === 'segment' ? n + (r.to - r.from) : n),
      0,
    );
    /* `track` is minutes and the rows are pixels, so the comparison only
       holds once the track is converted. Before the hour became a measurement
       these were numerically the same and the bug was invisible; at 90px/hour a
       segment holds nearly twice the rows it used to.

       The test is UNCHANGED by the lane becoming a list, and deliberately so.
       It never measured whether alignment was keepable — `ContextLane` handled
       that itself and now does not need to. It measures whether the day's rows
       fit the day's height at all, and a day that fails it is one where the
       lane would be a 900px list inside a 300px cell: a nested scroller showing
       eight of twenty-six behind a hairline. The trade the comment above
       describes is the same trade, for the same reason, at the same threshold —
       the width goes to the spine, where those blocks are ~290px instead of
       ~93px, and everything the lane would have said is on the session panel
       one tap away. */
    return day.placed.length * (LANE_ROW + 3) <= track * scale;
  }, [lane, grid, scale]);

  /*
   * WHICH BLOCK HOLDS THE TAB STOP WHEN NOBODY HAS CHOSEN ONE.
   *
   * The first session of the earliest day that has one. Computed here rather
   * than synchronised into the hook by an effect — see `useGridKeys` for why
   * that effect was removed. The grid is already sorted, so this is a scan.
   */
  const firstBlockId =
    grid.days.find((d) => d.placed.length)?.placed[0]?.session.id ?? null;
  const tabStop = activeId ?? firstBlockId;

  return (
    <div className="cw__scroll" ref={scrollRef}>
      <div
        ref={gridRef}
        onKeyDown={onKeyDown}
        onFocusCapture={onFocusCapture}
        className={
          (lane ? (laneFits ? 'cw cw--day' : 'cw cw--day cw--solo') : 'cw')
          + (placing ? ' cw--placing' : '')
        }
        role="group"
        aria-label={
          lane
            ? 'The day, drawn to scale. Use the arrow keys to move between sessions.'
            : 'The week, drawn to scale. Use the arrow keys to move between sessions.'
        }
      >
        {/* The head row. The corner cell is empty and sticky in both axes — it is
            what the time gutter slides under when the week is scrolled sideways
            on a phone, and without it the day names would slide over the hours. */}
        <div className="cal__hd cw__corner" aria-hidden="true" />
        {grid.days.map((day) => (
          <DayHead key={day.at} day={day} hoursSet={hoursSet} />
        ))}
        {laneFits && (
          <div className="cal__hd cw__lanehd">
            {/* Column heads, on the row's own track list — see `--dtl-cols`.
                This read `Plan · package · money` at the far left of an 811px
                cell while the money it named sat 500px to its right: three
                words naming three things and standing over none of them. */}
            <p className="cal__d dtl">
              <span>Time</span>
              <span>Client</span>
              <span>Plan · package</span>
              <span className="dtl__m">Money</span>
            </p>
          </div>
        )}

        {grid.rows.map((row) =>
          row.kind === 'band' ? (
            <BandRow
              key={`band-${row.from}`}
              row={row}
              open={row.open}
              onToggle={() => onToggleBand(row.from)}
              now={todayCol ? { minute: nowMinute, next: nextLabel } : null}
            />
          ) : (
            <SegmentRow
              key={`seg-${row.from}-${row.to}`}
              seg={row}
              grid={grid}
              scale={scale}
              rates={rates}
              gymSharePercent={gymSharePercent}
              nowMinute={nowMinute}
              nextId={nextId}
              showGaps={showGaps}
              lane={laneFits}
              hoursSet={hoursSet}
              activeId={tabStop}
              onOpenSession={onOpenSession}
              onOpenDay={onOpenDay}
              onBook={onBook}
              justMovedId={justMovedId}
            />
          ),
        )}
      </div>
      {/* The grid's foot. A spacer and not padding on the scroller — see the note
          on `FOOT_MIN` in `useCwScale`: this container's height is that hook's
          own arithmetic and `clientHeight` counts padding, so padding here would
          size the track to fill it and then push past the border box by exactly
          the foot. It is 0 on any window where reserving it would have cost a
          scrollbar, and a scrolling grid does not need a terminus. */}
      {foot > 0 && <div className="cw__foot" style={{ height: foot }} aria-hidden="true" />}
    </div>
  );
}

/* ------------------------------------------------------------------ head ── */

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function DayHead({ day, hoursSet }: { day: ScheduleDay; hoursSet: boolean }) {
  /* A rest day — the trainer's hours exist and none of them are on this weekday.
     Same test as the hatch below it, so the column and its head cannot disagree
     about what kind of empty this is. */
  const closed = hoursSet && day.windows.length === 0;

  const classes = ['cal__hd'];
  if (day.isToday) classes.push('cal__hd--today');
  if (day.hasClash) classes.push('cal__hd--clash');

  /*
   * The clash is marked on the HEAD as well as on the two blocks, and the reason
   * is in webapp.css: "The gutter bracket says WHEN; across seven columns it
   * cannot say WHERE, and the head is the one row that is sticky." A red ring on
   * a block three hours below the fold is a ring nobody sees.
   */
  return (
    <div
      className={classes.join(' ')}
      /* The tint, the lime lettering and the 3px accent bar say TODAY three
         ways and a reader hears none of them. `MonthGrid` has marked its own
         cell `aria-current="date"` since it was written; this head never did,
         so the week's answer to *which column is now* was visual only. */
      aria-current={day.isToday ? 'date' : undefined}
      aria-label={
        `${DAY_SHORT[day.weekday]} ${day.dayOfMonth}${day.isToday ? ', today' : ''}, `
        + `${day.count} ${day.count === 1 ? 'session' : 'sessions'}`
        + (closed ? ', a day off' : '')
        + (day.hasClash ? ', with a clash' : '')
      }
    >
      <p className="cal__d">{DAY_SHORT[day.weekday]}</p>
      <p className="cal__n">{day.dayOfMonth}</p>
      {/*
        THE COUNT IS ALWAYS THE COUNT, AND THE TRIANGLE IS NEVER PART OF IT.

        FOUND BY RENDERING. The first version swapped the plain figure for
        `<triangle/>{count}` on a day with a clash, so a Tuesday carrying 26
        sessions and one overlap rendered as "⚠ 26" — two glyphs, one number, and
        no way to read it as anything but *twenty-six warnings*. The number never
        changed meaning; its neighbour did, which is worse, because the eye
        attributes the neighbour's tone to the figure.

        So the figure keeps its position and its weight in both states, and the
        marker sits before it as its own element with its own title. The head
        also carries `cal__hd--clash`, a 2px danger underline across the whole
        cell — that is the day-level signal, and it does not need a second one
        wearing the count's clothes.
      */}
      <p className="cal__d cw__hdn" aria-hidden="true">
        {/* A day off says so, and it takes the slot the em dash was in. That dash
            meant *no sessions*, which on a Sunday the trainer does not work is
            the least useful true thing the head could print — the column is
            hatched for the same reason, and `/today` uses this exact phrase for
            this exact state. A closed day that somehow HOLDS sessions still
            prints the count: the booking is the more surprising fact, and the
            hatch behind it is already saying the rest. */}
        {closed && !day.count ? (
          <i className="cw__hdo">Day off</i>
        ) : day.count ? (
          <>
            <span className={day.hasClash ? 'cw__hdc cw__hdc--clash' : 'cw__hdc'}>
              {day.count}
            </span>
            {/* The unit, drawn only on the DAY view — see `.cw__hdu` in app.css.
                Seven columns have no room for it and do not need it: a row of
                seven bare figures under seven dates reads as a count already.
                One column with a bare `8` under it reads as nothing, and the day
                head is the only head on that view. */}
            <i className="cw__hdu">{day.count === 1 ? 'session' : 'sessions'}</i>
          </>
        ) : (
          '—'
        )}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ band ── */

function BandRow({
  row, open, onToggle, now,
}: {
  row: Extract<GridRow, { kind: 'band' }>;
  open: boolean;
  onToggle: () => void;
  /** Present when today is a column on screen. The minute is `now`'s, and `next` is
   *  the session to name beside it. */
  now: { minute: number; next: string | null } | null;
}) {
  /*
   * A band with something booked in it is HELD OPEN and says why, rather than
   * being collapsible-but-expanded. It is not a control, because there is nothing
   * to decide: closing it would hide a session, and the trainer's own working
   * hours have never constrained the trainer.
   */
  if (row.heldOpen) {
    return (
      <div className="cw__band cw__band--held">
        <span className="cw__bandin">
          <WarnTriangle size={13} />
          <span title={`${formatMinuteRange(row.from, row.to)} is outside your working hours, and ${row.heldOpen}`}>
            <b>
              {formatMinuteRange(row.from, row.to)}
            </b>{' '}
            · outside your hours — {row.heldOpen}
          </span>
          {/* The space is not decoration. `.cw__bandin` is a flex row with a
              10px gap, so the two read as separate on screen — and ran together
              into "…booked in itheld open" for anything reading the text rather
              than the layout, which is every screen reader and every copy of the
              page into a note. */}{' '}
          <em>held&nbsp;open</em>
        </span>
      </div>
    );
  }

  return (
    <button className="cw__band" type="button" aria-expanded={open} onClick={onToggle}>
      {/* The contents are the sticky part, not the row — see `.cw__bandin`.
          The row is a seam across the whole week and has to look like one; its
          sentence has to stay where it can be read when the week is scrolled. */}
      <span className="cw__bandin">
        {open ? <Fold size={13} /> : <Unfold size={13} />}
        <span
          title={
            `${formatMinuteRange(row.from, row.to)}: `
            + `${hoursWord(row.to - row.from)} that fall outside your working hours on every `
            + 'day shown, with nothing booked in them'
          }
        >
          <b>
            {formatMinuteRange(row.from, row.to)}
          </b>{' '}
          · {hoursWord(row.to - row.from)} outside your hours
        </span>{' '}
        {/* NOW LIVES HERE WHEN IT FALLS INSIDE THE FOLD. The dashed line is drawn per
            segment, so a clock inside a collapsed band had no row to cross — at 12:48
            the week simply had no *now* (MEASURED), and nothing said what came next.
            This says the minute and names the next session in the sentence that is
            already covering the hour. */}
        {now && now.minute >= row.from && now.minute < row.to && (
          <b className="cw__bnow">
            Now {formatMinute(now.minute)}
            {now.next && <> · next {now.next}</>}
          </b>
        )}
        <em>{open ? 'hide' : 'show'}</em>
      </span>
    </button>
  );
}

/* --------------------------------------------------------------- segment ── */

interface SegmentRowProps {
  /** Pixels per minute. Every vertical number in this file is multiplied by it. */
  scale: number;
  seg: Segment;
  grid: ScheduleGrid;
  rates: RateSource;
  gymSharePercent: number | null;
  nowMinute: number;
  /** The id of today's next session, so its block can say so. */
  nextId?: string | null;
  showGaps: boolean;
  lane: boolean;
  hoursSet: boolean;
  activeId: string | null;
  onOpenSession: (id: string) => void;
  onOpenDay: (dayAt: number) => void;
  onBook: (dayAt: number, minute: number) => void;
  justMovedId?: string | null;
}

function SegmentRow(props: SegmentRowProps) {
  const { seg, grid, lane, scale } = props;
  const height = (seg.to - seg.from) * scale;

  /*
   * The clash bracket lives in the GUTTER, not on the block.
   *
   * webapp.css: "A red ring on a block is invisible when the block is below the
   * fold; the bracket lives in the gutter, which is sticky-adjacent and always in
   * the same place." Merged across days, because two clashes at the same hour on
   * two days are one bracket at that hour.
   */
  const brackets = useMemo(() => {
    const spans = grid.days
      .flatMap((d) => d.placed)
      .filter((p) => p.lanes > 1 && p.startMinute < seg.to && p.endMinute > seg.from)
      .map((p) => ({ from: p.startMinute, to: p.endMinute }))
      .sort((a, b) => a.from - b.from);

    const out: { from: number; to: number }[] = [];
    for (const span of spans) {
      const last = out[out.length - 1];
      if (last && span.from <= last.to) last.to = Math.max(last.to, span.to);
      else out.push({ ...span });
    }
    return out;
  }, [grid.days, seg.from, seg.to]);

  const nowHere = props.nowMinute >= seg.from && props.nowMinute <= seg.to;

  /* The hour labels, and which of them owns the minute it is now. `nowIn` is
     half-open so an exact hour belongs to the hour it opens and not to the one
     it closes — the same convention `.cw__now` draws its rule on. */
  const ticks = ticksFor(seg);
  const firstTick = ticks.length ? ticks[0].minute : seg.to;
  const nowIn = (from: number, to: number) =>
    nowHere && props.nowMinute >= from && props.nowMinute < to;

  return (
    <>
      <div className="cw__seg cw__seg--gut" style={{ height }}>
        {/* The leading label is RANGED from the origin rather than centred on it.
            A tick is `left:<minute>` with `translateY(-50%)`, so the first one
            straddles the segment's top edge — and content overflowing the
            inline-start edge of a scroll container is unreachable overflow. The
            same bug the day ribbon's ruler had, in the other axis. */}
        {/* The axis form, same as every `tick` below it. This one is the
            segment's own opening mark rather than an hour ruling, and it was
            reading `6:00 AM` under a column of `7 AM` / `8 AM` - the odd one
            out at the top of its own scale. A segment can open on a half hour,
            and `formatHourMark` keeps the minutes when it does. */}
        {/* WHICH HOUR IS IT — said on the rail, which is where a trainer looks
            for an hour.

            The row axis already carries three marks for the MINUTE: the rule
            across the week, the accent dot where it crosses today, and the
            `.cw__nt` pill. None of them was on a LABEL, so the one column whose
            whole job is to name hours could not name the one in progress — and
            on a week scrolled to the morning the minute marks are off screen
            entirely while the label ladder is not.

            A label owns the hour it OPENS: `--first` owns from the segment's
            start to the first whole hour (a segment can open on a half hour),
            and every tick owns sixty minutes from itself. `last` sits on the
            segment's closing edge and opens nothing, which the interval test
            gives for free. */}
        <span className={`cw__tl cw__tl--first${nowIn(seg.from, firstTick) ? ' cw__tl--now' : ''}`}>
          {formatHourMark(seg.from)}
        </span>
        {ticks.map((tick) => (
          <span key={tick.minute}>
            <span
              className="cw__l cw__l--h"
              style={{ top: (tick.minute - seg.from) * scale }}
            />
            <span
              className={
                (tick.last ? 'cw__tl cw__tl--last' : 'cw__tl')
                + (nowIn(tick.minute, tick.minute + 60) ? ' cw__tl--now' : '')
              }
              style={{ top: (tick.minute - seg.from) * scale }}
            >
              {tick.label}
            </span>
          </span>
        ))}
        {brackets.map((b) => (
          <span
            key={b.from}
            className="cw__br"
            style={{ top: (b.from - seg.from) * scale, height: (b.to - b.from) * scale }}
            aria-hidden="true"
          />
        ))}
        {nowHere && (
          <span className="cw__nt" style={{ top: (props.nowMinute - seg.from) * scale }}>
            {formatMinute(props.nowMinute)}
          </span>
        )}
      </div>

      {grid.days.map((day) => (
        <DayColumn key={day.at} day={day} {...props} />
      ))}

      {lane && <ContextLane {...props} />}
    </>
  );
}

/* ------------------------------------------------------------------- day ── */

function DayColumn({
  day, seg, rates, gymSharePercent, nowMinute, showGaps, hoursSet,
  activeId, onOpenSession, onOpenDay, onBook, justMovedId, scale, nextId,
}: SegmentRowProps & { day: ScheduleDay }) {
  const height = (seg.to - seg.from) * scale;
  const money = dayMoney(
    day.placed.map((p) => p.session),
    rates,
  );

  /**
   * A click on empty track books there.
   *
   * Snapped to fifteen minutes on the way out, which is the app's own quantum —
   * `TimeField.tsx` steps by it, and the alternative is a booking at 07:23 that
   * no other surface in the product can express. The panel that opens shows the
   * time it chose, so a click that landed a minute off is visible before anything
   * is written.
   */
  /**
   * Pixels back to minutes, and this is the direction that has to be right.
   * Every other conversion on this screen only misdraws; this one WRITES. At
   * 90px/hour an unscaled ordinate turns a click on 12:00 into a booking at
   * 08:00 — off by a third of a day, in a panel that opens showing the wrong
   * time as if the trainer had chosen it.
   *
   * Shared by the click and by the hover mark below, so the minute the ghost
   * promises and the minute the panel opens at cannot disagree — the whole
   * value of showing it is that it is the same number.
   */
  const minuteAt = (clientY: number, rect: DOMRect) => {
    const raw = seg.from + (clientY - rect.top) / scale;
    const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES;
    return Math.max(seg.from, Math.min(seg.to - SNAP_MINUTES, snapped));
  };

  const bookHere = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    // A click that landed on a block or a gap has already been handled by it.
    if (target.closest('button')) return;
    onBook(day.at, minuteAt(event.clientY, event.currentTarget.getBoundingClientRect()));
  };

  /**
   * THE BOOKABLE SLOT, WHICH THE TRACK HAS ALWAYS BEEN AND NEVER SAID.
   *
   * `bookHere` above is the fastest way to book in the product — one click at
   * the minute you want, against three for the panel — and MEASURED on the live
   * grid it was drawing nothing at all: `.cw__seg` is a plain `<div>` with
   * `cursor:auto`, no hover rule and no mark. A trainer finds it by accident or
   * never, and "never" is the safe bet, because empty track is the one part of
   * a calendar a user has been trained by every other calendar not to click.
   *
   * So the track answers the pointer: a dashed accent rule at the minute the
   * click would snap to, with that minute written beside it. Dashed and accent
   * because `.gapb` — the other bookable thing on this grid — is already dashed
   * and accent, and this is the same offer without a measured gap behind it.
   *
   * ── WHY THIS WRITES TO THE DOM AND NOT TO STATE ─────────────────────────
   *
   * A `useState` here re-renders a column on every pointer move, and a week is
   * seven of these mounted at once with 43 blocks between them. The mark is
   * presentation with no consequence — nothing reads it back, and a frame of it
   * lost to a re-render costs nothing — so it rides two custom properties set
   * straight on the node. React owns the element; this owns two properties on
   * it that React never sets, which is the same division `useCwScale` makes.
   *
   * ── AND WHY IT IS MOUSE-ONLY ────────────────────────────────────────────
   *
   * `pointerType` is checked rather than `@media (pointer:coarse)` — trap 39
   * says a desktop harness cannot see that query in either direction, and a
   * hybrid laptop answers both anyway. A finger has no hover: on touch the mark
   * would appear under the fingertip at the moment of the tap and be read as the
   * result of it, which is a promise the tap does not keep.
   *
   * There is no keyboard equivalent and none is needed. `n` opens the booking
   * panel from anywhere on this screen, `.gapb` is a real focusable button that
   * books its own gap, and a roving grid already owns the arrow keys — see
   * `useGridKeys`. This is a pointer accelerator, so it is drawn for pointers.
   */
  const markSlot = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    const el = event.currentTarget;
    const target = event.target as HTMLElement;
    // Over a block or a gap the click belongs to that button, so promise nothing.
    if (target.closest('button')) return clearSlot(event);
    const minute = minuteAt(event.clientY, el.getBoundingClientRect());
    el.style.setProperty('--cw-slot-y', `${(minute - seg.from) * scale}px`);
    el.dataset.slot = formatMinute(minute);
  };

  const clearSlot = (event: React.PointerEvent<HTMLDivElement>) => {
    delete event.currentTarget.dataset.slot;
  };

  const classes = ['cw__seg'];
  if (day.isToday) classes.push('cw__seg--today');

  return (
    <div
      className={classes.join(' ')}
      style={{ height }}
      onClick={bookHere}
      onPointerMove={markSlot}
      onPointerLeave={clearSlot}
    >
      {/* The hour rulings, drawn on the track. Decorative, and `pointer-events`
          are off in app.css so they can never eat the click that books. */}
      {ticksFor(seg).map((tick) => (
        <span
          key={tick.minute}
          className="cw__l cw__l--h"
          style={{ top: (tick.minute - seg.from) * scale }}
          aria-hidden="true"
        />
      ))}

      {/* Outside the working windows: HATCHED, never blocked. The rule
          `WorkingHoursScreen` states on itself — working hours constrain what a
          CLIENT can self-book and have never constrained the trainer. */}
      {offRunsIn(day, seg, hoursSet).map((run) => (
        <span
          key={run.from}
          className="cw__off"
          style={{ top: (run.from - seg.from) * scale, height: (run.to - run.from) * scale }}
          aria-hidden="true"
        />
      ))}

      {showGaps
        && day.gaps
          .filter((g) => g.startMinute < seg.to && g.endMinute > seg.from)
          .map((gap) => (
            <GapBlock
              key={gap.startMinute}
              gap={gap}
              segFrom={seg.from}
              scale={scale}
              worth={gapWorth(gap, money, gymSharePercent)}
              rate={money.gapRate}
              onBook={() => onBook(day.at, gap.startMinute)}
            />
          ))}

      {/* OVERLAP, not "starts inside". A session that crosses this segment's top
          edge is drawn here too — see `segTo` on `SessionBlock` for the band that
          was opened to reveal a session and revealed blank track instead. */}
      {day.placed
        .filter((p) => !p.hidden && p.startMinute < seg.to && p.endMinute > seg.from)
        .map((placed) => (
          <SessionBlock
            key={`${placed.session.id}-${seg.from}`}
            placed={placed}
            segFrom={seg.from}
            segTo={seg.to}
            scale={scale}
            dayAt={day.at}
            tabbable={placed.session.id === activeId}
            just={placed.session.id === justMovedId}
            next={day.isToday && placed.session.id === nextId}
            onOpen={onOpenSession}
          />
        ))}

      {/* What the column had no lane left for. See `Stack` in `grid.ts`: the
          week caps its lanes because a sixth of a week column is 20px, and this
          chip is what the cap owes the trainer in return — the COUNT, at the
          minute it happens, opening the one view that can draw them all. */}
      {day.stacks
        .filter((st) => st.startMinute >= seg.from && st.startMinute < seg.to)
        .map((st) => (
          <button
            key={`stack-${st.startMinute}-${st.lane}`}
            type="button"
            className="ev ev--more"
            /* In the roving walk, not beside it. `useGridKeys` reads
               `[data-block]`, so without these the chips would either be twelve
               extra Tab stops on a busy week — the exact cost the roving tab
               index was built to avoid — or unreachable by keyboard, which would
               make the sessions behind them unreachable too, since the day head
               is not a control. */
            data-block={`stack-${day.at}-${st.startMinute}`}
            data-day={day.at}
            data-start={st.startMinute}
            tabIndex={activeId === `stack-${day.at}-${st.startMinute}` ? 0 : -1}
            style={{
              ...laneStyle(st.lane, st.lanes),
              top: (st.startMinute - seg.from) * scale,
              /* The 24px floor is a TARGET floor and stays in pixels: a chip
                 standing for three sessions is still one thing to click, and
                 WCAG 2.5.8 does not care how few minutes it spans. */
              height: Math.max(24, (st.endMinute - st.startMinute) * scale),
            }}
            aria-label={
              `${st.sessions.length} more ${st.sessions.length === 1 ? 'session' : 'sessions'} `
              + `from ${formatMinute(st.startMinute)}: `
              + `${st.sessions.map((x) => x.clientName).join(', ')}. Opens the day.`
            }
            title={st.sessions.map((x) => x.clientName).join('\n')}
            onClick={(event) => {
              event.stopPropagation();
              onOpenDay(day.at);
            }}
          >
            <span className="ev__more">+{st.sessions.length}</span>
          </button>
        ))}

      {/* Now. The line is `--tx-ink` because red is taken by the clash and by the
          no-show, and lime is a FILL in this system and never a stroke — so the
          accent appears as the dot, which is a fill. The dot is only on today;
          the line crosses every column, because 09:12 is 09:12 on Thursday too. */}
      {nowMinute >= seg.from && nowMinute <= seg.to && (
        <span
          className="cw__now"
          style={{ top: (nowMinute - seg.from) * scale }}
          aria-hidden="true"
        >
          {day.isToday && <i />}
        </span>
      )}
    </div>
  );
}

/**
 * The parts of a segment that fall outside this day's merged working windows.
 *
 * ── AN EMPTY `windows` MEANS TWO DIFFERENT THINGS AND THIS READ THEM AS ONE ──
 *
 * It returned `[]` for any day with no windows, under a comment that is right
 * about one of the two cases and was being applied to both:
 *
 *   nobody has been asked   the server sends `[]` rather than a default week
 *                           precisely so that nothing is invented, and hatching
 *                           the whole grid would be inventing the opposite.
 *   this weekday is off     the trainer HAS told us when they work and this is
 *                           not one of those days. That is a fact about Sunday,
 *                           and the grid was drawing it as open track.
 *
 * MEASURED against the seeded book, which works Monday to Saturday: Sunday drew
 * **a full column of unhatched, bookable-looking track** with no mark anywhere
 * saying why it was empty — while `/today` calls the same day *A day off* on a
 * card of its own and `.cal__c--off` has been in the design system for a month
 * cell in exactly this state. The week by client now says it too, so this was
 * the one arrangement of three that did not.
 *
 * The two cases are told apart at the scope the question belongs to — the WEEK,
 * not the day: one window anywhere in the range means the hours exist, and a
 * weekday with none of them is a rest day. `hoursSet` is passed down from
 * `Schedule`, which holds the trainer's own `working_hours` rows, rather than
 * derived from `grid.days` here: the day view draws ONE column, so a grid asked
 * that question about a single Sunday would answer *nobody has been asked* and
 * draw exactly the bug this is fixing.
 *
 * Hatched, never blocked, on the same rule as every other off-hour: working
 * hours constrain what a CLIENT can self-book and have never constrained the
 * trainer. A click anywhere in that column still books there.
 */
function offRunsIn(
  day: ScheduleDay,
  seg: Segment,
  hoursSet: boolean,
): { from: number; to: number }[] {
  if (!hoursSet) return [];
  if (!day.windows.length) return [{ from: seg.from, to: seg.to }];

  const out: { from: number; to: number }[] = [];
  let cursor = seg.from;
  for (const w of day.windows) {
    if (w.endMinute <= seg.from || w.startMinute >= seg.to) continue;
    if (w.startMinute > cursor) out.push({ from: cursor, to: Math.min(w.startMinute, seg.to) });
    cursor = Math.max(cursor, w.endMinute);
  }
  if (cursor < seg.to) out.push({ from: cursor, to: seg.to });
  return out.filter((r) => r.to > r.from);
}

/* ------------------------------------------------------------------ gaps ── */

function GapBlock({
  gap, segFrom, scale, worth, rate, onBook,
}: {
  gap: Gap;
  segFrom: number;
  scale: number;
  worth: string | null;
  rate: number | null;
  onBook: () => void;
}) {
  const n = gap.slots;
  const sessions = `${n} ${n === 1 ? 'session' : 'sessions'}`;

  /*
   * A gap is labelled with what it is WORTH, because free time is the most
   * expensive thing on this screen — and it is priced only when there is a rate
   * to price it at. `dayMoney.gapRate` is null for a day whose clients are all on
   * monthly fees, and "₹0" would be a lie about a free hour rather than a blank.
   */
  const label = worth
    ? `Free, ${formatMinute(gap.startMinute)} to ${formatMinute(gap.endMinute)}, `
      + `${formatSpan(gap.minutes)}. Room for ${sessions}, worth ${worth}. Book it.`
    : `Free, ${formatMinute(gap.startMinute)} to ${formatMinute(gap.endMinute)}, `
      + `${formatSpan(gap.minutes)}. Room for ${sessions}. Book it.`;

  return (
    <button
      type="button"
      className={gap.past ? 'gapb gapb--past' : 'gapb'}
      aria-label={label}
      /* The 2px inset is a HAIRLINE, not two minutes: it exists so the ribbon
         does not sit on the hour ruling above it. It is the one number here that
         must not scale, or a gap at 90px/hour would be inset by three pixels and
         a gap at 48px by one. */
      style={{
        top: (gap.startMinute - segFrom) * scale + 2,
        height: Math.max(1, gap.minutes * scale - 4),
      }}
      onClick={onBook}
    >
      <b>
        {formatMinuteRange(gap.startMinute, gap.endMinute)}
      </b>
      <span>
        {formatSpan(gap.minutes)} · {sessions}
        {rate ? ` · ${rupees(n * rate)}` : ''}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ lane ── */

/**
 * THE DAY'S SESSIONS, AS A LIST — AND WHY IT STOPPED PRETENDING TO BE A LANE.
 *
 * This was a "context lane": one card per session, absolutely positioned at the
 * same minute as the block it describes, "so the day reads as one timeline and
 * not as a grid next to a table". It is a good idea and this file could not
 * deliver it, which it had already conceded in three separate places without
 * ever saying so on the screen:
 *
 *   · `laneRows` pushed a card down to `cursor` whenever its own minute would
 *     put it inside the card above — silently, so a card 41px below its block
 *     still looked like it was claiming that minute;
 *   · `dense` gave up alignment for a whole segment when the cards outgrew it;
 *   · `laneFits` dropped the lane entirely when the day outgrew the screen.
 *
 * MEASURED on the dev database, Wednesday 16 September, a day with one clash —
 * eight sessions, eight cards: **two sat beside their block.** Vikram Rao was
 * 41px out, Sanjay Reddy 113px, Nikhil Kumar 76px. Six of eight were somewhere
 * a reader would have to look up.
 *
 * ── THE FAILURE IS STRUCTURAL, NOT A TUNING PROBLEM ─────────────────────────
 *
 * Two sessions at the same minute occupy ONE vertical slot in the spine — it
 * splits them sideways into lanes, which is the right answer and the whole
 * reason the spine works. A lane has no sideways to split into, so it must
 * stack them, and the second one is immediately wrong about its own minute.
 * A day with a single clash therefore CANNOT be aligned, and this trainer's
 * roster runs concurrent sessions on purpose — `hasClash` is `lanes > 1` and
 * rings 68 of 81 blocks in a week.
 *
 * Alignment that holds for a quarter of the rows is worse than no alignment,
 * because it is indistinguishable from alignment that holds. So the lane stops
 * claiming it. Every row now carries its own start time — which the `dense`
 * layout had already worked out was what a list needs — and the two halves of
 * the day correspond by the two facts printed on both, the time and the client,
 * rather than by a y-coordinate that is usually a lie.
 *
 * ── WHAT IS KEPT: THE SEGMENTS ──────────────────────────────────────────────
 *
 * The list is still drawn one segment at a time, in the same grid rows as the
 * spine. So a quiet band still divides it, and "5 hours outside your hours"
 * still separates the morning's sessions from the evening's on BOTH halves of
 * the screen. That is correspondence the structure can actually keep, and it is
 * the level at which the two halves genuinely do line up.
 *
 * ── AND WHAT THE ROW BECAME ─────────────────────────────────────────────────
 *
 * Six real columns instead of a sentence and three trailing controls. MEASURED
 * before: the plan track was `minmax(0,1fr)` — **499px holding 118px of ink, so
 * 381px of every 782px row was empty**, and the client's name was jammed into
 * the plan cell behind a `·`. Giving client and plan their own tracks spends
 * that width on two columns that line up down the list, which is the only
 * reason to put things in a table at all.
 */
function ContextLane({
  seg, grid, rates, onOpenSession, scale,
}: SegmentRowProps) {
  const day = grid.days[0];
  if (!day) {
    return (
      <div className="cw__seg cw__seg--dtl" style={{ height: (seg.to - seg.from) * scale }} />
    );
  }

  const money = dayMoney(day.placed.map((p) => p.session), rates);
  const height = (seg.to - seg.from) * scale;
  /* Start-minute order, which is the order the spine reads in and therefore the
     only order that lets a reader walk the two together. `day.placed` is already
     sorted; this is the filter to this segment and nothing else. */
  const rows = day.placed.filter(
    (p) => p.startMinute >= seg.from && p.startMinute < seg.to,
  );

  return (
    <div className="cw__seg cw__seg--dtl" style={{ height }}>
      {rows.map((p) => {
        const rate = rates.perSession.get(p.session.clientId);
        return (
          <div key={p.session.id} className="dtl">
            {/* Tabular, so eight start times make a column rather than a ragged
                edge — and this is now the row's anchor to the block it is about,
                so it leads. */}
            <i className="dtl__at">{formatMinute(p.startMinute)}</i>
            {/* The client is the other fact printed on the block, and it is what
                a human scans a list of eight by. Its own track, so the names
                line up. */}
            <b className="dtl__c">{p.session.clientName}</b>
            {/* The plan is the lane's stated subject and the thing the spine has
                no room to say. Quiet, because it is read after the name. */}
            <span className="dtl__p">{p.session.detail}</span>
            <span className="dtl__m">
              {rate ? rupees(rate) : money.partial ? 'No rate set' : ''}
            </span>
            {/*
              THE TAG SAYS WHAT STATE THE SESSION IS IN, AND NOTHING ELSE.

              It used to read "Clash" for anything sharing a minute, which on a
              real Tuesday meant twenty-six identical red tags down a single lane
              — a column of danger tone carrying no information, since a tag that
              is always on distinguishes nothing. Overlap is already said three
              times on this screen and each time in a place the eye can act on:
              the ring on the block, the bracket in the gutter, and the underline
              on the day head. It did not need a fourth.
            */}
            <Tag tone={p.session.done ? 'ok' : p.session.noShow ? 'danger' : 'info'}>
              {p.session.done ? 'Done' : p.session.noShow ? 'No-show' : 'Booked'}
            </Tag>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onOpenSession(p.session.id)}
            >
              Open
            </Button>
          </div>
        );
      })}
    </div>
  );
}
