'use client';

import { useMemo } from 'react';

import { formatMinute, formatSpan, minuteOfDay, rupees } from '@/lib/today/time';
import { dayMoney, gapWorth, type Gap } from '@/lib/today/day';
import type { RateSource } from '@/lib/today/day';
import {
  hoursWord, laneStyle, ticksFor,
  type GridRow, type Placed, type ScheduleDay, type ScheduleGrid, type Segment,
} from '@/lib/schedule/grid';
import { SNAP_MINUTES } from '@/lib/schedule/result';
import { SessionBlock } from './SessionBlock';
import { useGridKeys } from './useGridKeys';
import { useCwScale } from './useCwScale';
import { Fold, Unfold, WarnTriangle } from './Icons';

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
  grid, rates, gymSharePercent, now, showGaps, lane,
  onToggleBand, onOpenSession, onOpenDay, onBook, justMovedId, placing,
}: TimeGridProps) {
  /* The pixels-per-minute the whole grid is drawn at. One number, measured from
     the scroll container, shared by every vertical measurement below — see
     `useCwScale` for why it is no longer the constant 1. */
  const { scale, foot, ref: scrollRef } = useCwScale(grid);
  const { ref: gridRef, activeId, onKeyDown, onFocusCapture } = useGridKeys();
  const nowMinute = minuteOfDay(now);

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
    /* `track` is minutes and the cards are pixels, so the comparison only
       holds once the track is converted. Before the hour became a measurement
       these were numerically the same and the bug was invisible; at 90px/hour a
       segment holds nearly twice the cards it used to. */
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
          <DayHead key={day.at} day={day} />
        ))}
        {laneFits && (
          <div className="cal__hd cw__lanehd">
            <p className="cal__d">Plan · package · money</p>
          </div>
        )}

        {grid.rows.map((row) =>
          row.kind === 'band' ? (
            <BandRow
              key={`band-${row.from}`}
              row={row}
              open={row.open}
              onToggle={() => onToggleBand(row.from)}
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
              showGaps={showGaps}
              lane={laneFits}
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

function DayHead({ day }: { day: ScheduleDay }) {
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
      aria-label={
        `${DAY_SHORT[day.weekday]} ${day.dayOfMonth}, `
        + `${day.count} ${day.count === 1 ? 'session' : 'sessions'}`
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
        {day.count ? (
          <span className={day.hasClash ? 'cw__hdc cw__hdc--clash' : 'cw__hdc'}>
            {day.count}
          </span>
        ) : (
          '—'
        )}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ band ── */

function BandRow({
  row, open, onToggle,
}: {
  row: Extract<GridRow, { kind: 'band' }>;
  open: boolean;
  onToggle: () => void;
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
          <span title={`${formatMinute(row.from)} – ${formatMinute(row.to)} is outside your working hours, and ${row.heldOpen}`}>
            <b>
              {formatMinute(row.from)} – {formatMinute(row.to)}
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
            `${formatMinute(row.from)} – ${formatMinute(row.to)}: `
            + `${hoursWord(row.to - row.from)} that fall outside your working hours on every `
            + 'day shown, with nothing booked in them'
          }
        >
          <b>
            {formatMinute(row.from)} – {formatMinute(row.to)}
          </b>{' '}
          · {hoursWord(row.to - row.from)} outside your hours
        </span>{' '}
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
  showGaps: boolean;
  lane: boolean;
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

  return (
    <>
      <div className="cw__seg cw__seg--gut" style={{ height }}>
        {/* The leading label is RANGED from the origin rather than centred on it.
            A tick is `left:<minute>` with `translateY(-50%)`, so the first one
            straddles the segment's top edge — and content overflowing the
            inline-start edge of a scroll container is unreachable overflow. The
            same bug the day ribbon's ruler had, in the other axis. */}
        <span className="cw__tl cw__tl--first">{formatMinute(seg.from)}</span>
        {ticksFor(seg).map((tick) => (
          <span key={tick.minute}>
            <span
              className="cw__l cw__l--h"
              style={{ top: (tick.minute - seg.from) * scale }}
            />
            <span
              className={tick.last ? 'cw__tl cw__tl--last' : 'cw__tl'}
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
  day, seg, rates, gymSharePercent, nowMinute, showGaps,
  activeId, onOpenSession, onOpenDay, onBook, justMovedId, scale,
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
  const bookHere = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    // A click that landed on a block or a gap has already been handled by it.
    if (target.closest('button')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    /* Pixels back to minutes, and this is the direction that has to be right.
       Every other conversion on this screen only misdraws; this one WRITES. At
       90px/hour an unscaled ordinate turns a click on 12:00 into a booking at
       08:00 — off by a third of a day, in a panel that opens showing the wrong
       time as if the trainer had chosen it. */
    const raw = seg.from + (event.clientY - rect.top) / scale;
    const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES;
    onBook(day.at, Math.max(seg.from, Math.min(seg.to - SNAP_MINUTES, snapped)));
  };

  const classes = ['cw__seg'];
  if (day.isToday) classes.push('cw__seg--today');

  return (
    <div className={classes.join(' ')} style={{ height }} onClick={bookHere}>
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
      {offRunsIn(day, seg).map((run) => (
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

/** The parts of a segment that fall outside this day's merged working windows. */
function offRunsIn(day: ScheduleDay, seg: Segment): { from: number; to: number }[] {
  // No hours answered at all means no hatch, not a fully hatched day: the server
  // returns `[]` rather than a default week precisely so nothing is invented, and
  // hatching the whole grid would be inventing the opposite.
  if (!day.windows.length) return [];

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
        {formatMinute(gap.startMinute)} – {formatMinute(gap.endMinute)}
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
 * The day view's context lane — one card per session, positioned at the same
 * minute as the block it belongs to.
 *
 * The wide screen's real advantage over the phone is not a taller hour, it is
 * room to say WHY each block matters. Aligned to the same axis rather than listed
 * beside it, so the day reads as one timeline and not as a grid next to a table.
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
  const rows = laneRows(day, seg, scale);

  /*
   * ── FOUND BY RENDERING REAL ROWS · THE LANE ESCAPED ITS OWN SEGMENT ────────
   *
   * `laneRows` gives up alignment where it cannot be kept, and on a 26-session
   * Tuesday it has to give it up almost everywhere: twenty-two cards at one row
   * each need 900px inside a 06:00–11:00 segment that is 300px tall. The cards
   * did not stop at the segment's foot — nothing clipped them — so they carried
   * on straight through the quiet band and over the segment beneath it, and the
   * lane's last third was printed on top of two other rows of the grid.
   *
   * A lane that has drifted this far is not a context lane any more; it is a
   * list wearing a list's shape and lying about its position. So it becomes one
   * honestly, and the switch is measured rather than guessed: if the aligned
   * layout fits the segment, it is used unchanged — which is every day this
   * lane was designed against. If it does not, the cards flow and the segment
   * scrolls, and each card grows the one thing the aligned version never needed
   * and the flowing one cannot do without: **its own start time**.
   */
  const dense = rows.length > 0 && rows[rows.length - 1].top + rows[rows.length - 1].height > height;

  const card = (p: Placed, style?: React.CSSProperties) => {
    const rate = rates.perSession.get(p.session.clientId);
    return (
      <div key={p.session.id} className={dense ? 'dtl dtl--flow' : 'dtl'} style={style}>
        <span className="dtl__p">
          {/* The time is drawn only when the card has stopped standing at it.
              In the aligned layout the position IS the time, and printing it as
              well is the redundancy the design deliberately left out. */}
          {dense && <i className="dtl__at">{formatMinute(p.startMinute)}</i>}
          <b>{p.session.detail}</b>
          {!dense && p.endMinute - p.startMinute >= 45 ? <br /> : ' · '}
          {p.session.clientName}
        </span>
        <span className="dtl__m">
          {rate ? rupees(rate) : money.partial ? 'No rate set' : ''}
        </span>
        {/*
          THE TAG SAYS WHAT STATE THE SESSION IS IN, AND NOTHING ELSE.

          It used to read "Clash" for anything sharing a minute, which on a real
          Tuesday meant twenty-six identical red tags down a single lane — a
          column of danger tone carrying no information, since a tag that is
          always on distinguishes nothing. Overlap is already said three times on
          this screen and each time in a place the eye can act on: the ring on
          the block, the bracket in the gutter, and the underline on the day
          head. It did not need a fourth, least of all as the loudest thing in a
          lane whose subject is plan, package and money.
        */}
        <span
          className={`tag tag--${p.session.done ? 'ok' : p.session.noShow ? 'danger' : 'info'}`}
        >
          {p.session.done ? 'Done' : p.session.noShow ? 'No-show' : 'Booked'}
        </span>
        <button
          className="btn btn--sm btn--secondary"
          type="button"
          onClick={() => onOpenSession(p.session.id)}
        >
          Open
        </button>
      </div>
    );
  };

  return (
    <div
      className={dense ? 'cw__seg cw__seg--dtl cw__seg--dense' : 'cw__seg cw__seg--dtl'}
      style={{ height }}
    >
      {!dense
        && ticksFor(seg).map((tick) => (
          <span
            key={tick.minute}
            className="cw__l cw__l--h"
            style={{ top: (tick.minute - seg.from) * scale }}
            aria-hidden="true"
          />
        ))}
      {dense
        ? rows.map(({ p }) => card(p))
        : rows.map(({ p, top, height: h }) => card(p, { top, height: h }))}
    </div>
  );
}

/**
 * MEASURED BUG, FOUND BY RENDERING A THREE-WAY CLASH.
 *
 * The lane positioned every card at `top: startMinute`, which is right for a day
 * whose sessions do not overlap and is §01.4 all over again for one whose do:
 * three sessions starting at 16:30, 17:00 and 17:15 produced three cards inside
 * 45px, printed on top of each other — three plan lines, three rupee figures and
 * three *Open* buttons in one illegible stack. The spine had already solved this
 * by splitting sideways; the lane has no sideways to split into.
 *
 * So the lane keeps alignment wherever the day allows it and gives it up exactly
 * where it cannot be kept. A card sits at its own minute unless that would put it
 * inside the card above, in which case it is pushed to just below it. A card in a
 * clash group takes one ROW's height rather than its duration's, because three
 * durations stacked would run 195px past the minute they describe and into the
 * next segment's cards.
 *
 * The alternative — a lane that stays aligned and overlaps — is the one thing a
 * context lane cannot be, since its whole job is to be read.
 */
const LANE_ROW = 38;

function laneRows(day: ScheduleDay, seg: Segment, scale: number) {
  const out: { p: Placed; top: number; height: number }[] = [];
  let cursor = -Infinity;

  for (const p of day.placed) {
    if (p.startMinute < seg.from || p.startMinute >= seg.to) continue;
    /* LANE_ROW is a card's own height in pixels and does not scale; a duration
       does. Mixing the two unconverted is what made the lane overrun its
       segment in the first place, one scale factor earlier. */
    const height = p.lanes > 1 ? LANE_ROW : (p.endMinute - p.startMinute) * scale;
    const top = Math.max((p.startMinute - seg.from) * scale, cursor);
    out.push({ p, top, height });
    cursor = top + height + 3;
  }
  return out;
}
