'use client';

import { useState } from 'react';

import type { Entry } from '@/lib/programs/blueprint';
import type { Balance } from '@/lib/programs/balance';
import type { ExerciseNameWire } from '@/lib/programs/api';
import type { ExerciseWire } from '@/lib/exercises/api';
import type { Detail } from '../Builder';
import { BalancePanel } from './BalancePanel';
import { DayCard } from './DayCard';
import { RestCard } from './RestCard';
import type { DayActions, WorkoutActions } from './menus';
import { Button } from '@/web-components/ui/Button';

/** The seven slots a week has. A program trains some of them; `fullWeek` below
 *  is what decides whether the board draws the others. */
const ALL_SLOTS = [1, 2, 3, 4, 5, 6, 7];

/**
 * THE BOARD — days down the page, the library and the balance beside them.
 *
 * Days are ROWS, not columns. Four columns of six exercises each is four
 * 236px lanes at 1440 with the rail up, which is where every truncation on the
 * old screen came from; a day laid across the page has ~1,100px for a name, its
 * prescription and its controls. The trade is that a five-day week scrolls, and
 * that is the right trade: a trainer reads one day at a time and writes one day
 * at a time.
 *
 * The side rail is a STACK, not a swap. The library sits above the balance
 * rather than replacing it, because *chest is 6 sets, under the band* is what a
 * trainer reads while adding.
 */
export interface WeekBoardProps extends DayActions, WorkoutActions {
  days: number[];
  labels: Record<string, string>;
  /** What a day is CALLED — see `blueprint.ordinalDayWord`. A blueprint's days
   *  are ordinal slots and a client's copy's are real weekdays. */
  dayWord?: (day: number) => string;
  rows: Entry[];
  names: Record<string, ExerciseNameWire | undefined>;
  week: number;
  repeat: boolean;
  balance: Balance;
  /** How much of each row to draw. One attribute on the plane, two CSS rules —
   *  Full adds a line to a row and never moves one, so there is no second
   *  renderer and no arrangement that only one density can reach. */
  detail: Detail;
  entriesForDay: (day: number) => Entry[];
  /** Rename a SLOT — the day menu's *Name this day*, written on the card's own
   *  header. See `DayCardProps.onRelabel`. */
  onRelabel?: (day: number, value: string) => void;


  /** Whether the drawer is open, and on which day. The board no longer RENDERS
   *  the library — see the note on `.ws__side` below — but it still has to know,
   *  because a dock open is what stands the balance panel down to its strip. */
  library: { day: number } | null;
  onOpenLibrary: (day: number) => void;
  /** Write a whole session onto this day — the collapsed card's tail control.
   *  See `DayCardProps.onCreateWorkout` for why it replaced the library there. */
  onCreateWorkout?: (day: number) => void;
  /** The session on the clipboard, and the day it was copied from. Every other
   *  day draws *Paste it*; the source draws the cancel. */
  copied?: { workoutId: string; name: string; day: number; week: number } | null;
  onPasteWorkout?: (day: number) => void;
  onCancelCopy?: () => void;
  /** Move a whole container onto a day, landing above `before` (a container id)
   *  or at its tail. */
  onDropWorkout?: (workoutId: string, day: number, before: string | null) => void;
  /** One render with `view-transition-name` on every container, so the write
   *  that follows can be animated — `DayReflow.armed`. */
  vt?: boolean;
  /** WHAT THE POINTER IS CARRYING, and it is the SHELL's now.
   *
   *  This was `useState` in here, which was right while the dock sat in
   *  `.ws__side`: both ends of an in-plane drag were this component's children.
   *  The dock is a drawer beside the whole builder now, so the two ends are in
   *  different subtrees and the record has to be held above both — `Builder`
   *  owns it and hands the read down here for the day cards to arm on. */
  carrying?: ExerciseWire | null;
  onCarry?: (exercise: ExerciseWire | null) => void;
  /** `before` is the row the new one lands ABOVE, or null for the tail. The
   *  dock's click passes null; a drag passes wherever it was let go. */
  onAddExercise: (day: number, exercise: ExerciseWire, before: string | null) => void;

  onAddDay?: () => void;
  /**
   * DRAW ALL SEVEN SLOTS, and the four this program does not train as REST.
   *
   * Off, the board draws `days` and nothing else — which is what a client's own
   * copy wants, because its slots are real weekdays and *Thursday is a rest day*
   * is the client's calendar talking, not the plan's.
   *
   * On — the blueprint builder AND the certified preview — the week is seven
   * cards: the trained ones are `DayCard`s, the rest are `RestCard`s, and on the
   * builder the trainer flips a slot between the two. It replaces `+ Add a day`
   * rather than joining it: with every slot already on screen there is no day
   * left to add, and two routes to the same write is the kind of drift `DayBand`
   * cost once already.
   *
   * THE PREVIEW TAKES IT READ-ONLY, and the reason is geometry as much as
   * reading. MEASURED at 1536 with the rail collapsed, the short board is
   * `repeat(auto-fill,minmax(380px,1fr))` over 1,117px — two tracks of 552
   * holding cards capped at 440, so **112px of dead gutter inside every track**
   * and a three-day week's third card orphaned on a second row. The lanes are
   * `flex` and spend the whole plane. What they add on top is the sentence the
   * tag row could only half say: *3 days a week* is on a tag, WHICH three and
   * how they are spaced was nowhere.
   */
  fullWeek?: boolean;
  /** Make a rest slot a training day. `fullWeek` only. */
  onMakeWorkout?: (day: number) => void;

  /**
   * ── WHICH AXIS THE BOARD IS LAID ON ───────────────────────────────────────
   *
   * `week` is this board as it has always been: ONE week, every day of it.
   * `day` is its transpose — ONE day, every week of it, so Day 1 of week 1
   * stands beside Day 1 of week 8 and *is the bench going up* is a thing you
   * read rather than a thing you remember.
   *
   * ONE CARD RENDERER, TWO ARRANGEMENTS, which is the same rule `PhoneProgram`
   * states for the two shells and the rule `DayBand` was deleted for breaking.
   * `dayCard` below builds the card; the two axes differ only in what they map
   * over and what they hand it. A second component drawing "a day across the
   * weeks" would be a second author's version of the day header, the container
   * cards, the superset ordinals and the duplicate note — `AcrossWeeks` (the
   * phone's strip) is deliberately NOT that: it is a four-column table that
   * answers the same question at a glance and cannot be written in.
   *
   * ── AND EVERY CARD IS WRITABLE ────────────────────────────────────────────
   *
   * Every write on this board — the day menus, the drops, the library dock —
   * is wired in `Builder` against ONE week, and for as long as that was true
   * only the selected card carried the handlers: the other seven were
   * `readOnly` and one click from becoming the live one. The click was the
   * whole cost. A trainer reading Day 1 down the block and spotting week 5's
   * bench sitting at 4x6 had to say *edit week 5* before they could say what
   * they wanted to say, and the thing they clicked to say it — the toolbar's
   * week strip, keyed *EDITING* — was a mode indicator for a mode nobody had
   * asked to be in.
   *
   * So the week is now chosen by the card you REACH FOR rather than by a
   * strip: `onPickWeek` fires on the first pointer, focus or drag that lands
   * on a card (`DayCard`'s `onActivate`), and every card is handed the full
   * set of handlers. That is safe because it is two events deep — a pointer
   * DOWN selects the week, and the click, drop or blur that writes is a later
   * event with `Builder` already re-rendered around it. One pointer, one
   * write, and no card on the board that has to be woken up first.
   */
  axis?: 'week' | 'day';
  /** Day axis: how many weeks the program has, and which day is on the board.
   *  `weekOf` answers *what is on this day in week w* — the rows already
   *  resolved through law 3, plus whether they are week 1's rather than its
   *  own. */
  weekCount?: number;
  focusDay?: number;
  weekOf?: (week: number) => { rows: Entry[]; repeat: boolean };
  /** Make another week the one `Builder`'s writes land in. Fired by REACHING
   *  for a card rather than by choosing it — see the note on `axis`. */
  onPickWeek?: (week: number) => void;
  emptyNote?: React.ReactNode;
  /**
   * READ THE WEEK, DO NOT WRITE IT — the certified preview.
   *
   * `DayCard`'s own prop carries the argument for the flag. What it means HERE
   * is the rail and the tail: no `LibraryDock` (there is nothing to add to),
   * no `+ Add a day`, and no drag state travelling between the two, so a
   * read-only board allocates neither piece of machinery. `BalancePanel`
   * stays, because it is the one panel that only reads — and it is the reason
   * this board is worth putting on the preview at all: *is 26 sets of legs a
   * week sane for my client* is the question *should I copy this* turns on.
   */
  readOnly?: boolean;
  /**
   * WHAT SITS IN `.ws__side` INSTEAD OF THE BALANCE.
   *
   * The column is the board's own, not the shell's, and that is the whole
   * reason this is a prop rather than something a call-site renders beside the
   * board: `.ws--week` places `.ws__side` at `grid-column:2 / grid-row:1 span 2`
   * and stands it down to a strip above the cards whenever a dock is open.
   * Anything drawn outside the board cannot take part in either rule.
   *
   * `/clients/:id/program/:pid` passes its review panel here while the trainer
   * is editing. It REPLACES the balance rather than joining it, and
   * `ChangeSide`'s own note carries the argument: while *what am I about to
   * send* is open it is the only question on the board with a client at the
   * other end of it, and two 280px columns competing for one glance is not a
   * reading, it is a choice the trainer has to make before they can read
   * either.
   */
  side?: React.ReactNode;
}

export function WeekBoard(props: WeekBoardProps) {
  const { days, labels, names, week, repeat, balance, entriesForDay } = props;
  const readOnly = Boolean(props.readOnly);
  const library = readOnly ? null : props.library;
  /* SEVEN CARDS OR THE TRAINED ONES — see the prop. It USED TO BE forced off
     read-only, on the argument that the two writes a rest card draws are the
     only reason the untrained slots are on screen. That argument was about the
     CARD and the question is about the BOARD: what the seven lanes say is
     *this program trains three days and rests four*, and a trainer who has
     never seen the block is the one reader who cannot get that anywhere else.
     A read-only rest card is handed no `onMakeWorkout` and so draws no button
     — see `RestCard`, which already treats the handler as optional. */
  const fullWeek = Boolean(props.fullWeek);
  const slots = fullWeek ? ALL_SLOTS : days;
  const dayWord = props.dayWord;

  /**
   * SEVEN LANES ACROSS, or the stack.
   *
   * The board's own note above argues days-as-ROWS, and that argument was made
   * about a board whose cards hold six exercises each at a density that needs
   * ~1,100px to print a name beside its prescription. It still holds for THAT
   * card. A full week is a different picture: seven slots read side by side,
   * *which days does this program train* answered in one glance instead of by
   * counting cards down a page, which is the whole reason the untrained days
   * are drawn at all.
   *
   * AND THE WEEK STAYS A WEEK. The lanes used to drop the moment a day was
   * opened — the open card spanned every track and the board fell back to a
   * stack around it — so *which days does this program train* was a picture the
   * trainer lost as soon as they went to write one of them. There is no open
   * card any more (see `DayCard`'s header): every day is fixed in the week, the
   * writes are in the workout dialog over it, and the seven lanes hold.
   *
   * OFF WHILE THE DOCK IS OPEN for the same reason `.ws--adding` stands the
   * balance panel down: 380px leaves the plane and seven lanes of what is left
   * is not a card, it is a column of truncations. The dock opens a day anyway,
   * so this is belt and braces.
   *
   * AND THE WIDTH IS CSS'S CALL, NOT THIS COMPONENT'S. The class only says
   * *this board would like to be a week*; `@container ws (min-width:1140px)`
   * decides whether the plane can hold seven of them, and under that the cards
   * stay the stack they are today — which is what a narrow window, a folded-out
   * shelf and a phone all get, none of which this component can measure.
   */
  /* AND NEVER ON THE DAY AXIS, which is not seven of anything: its track count
     is the week count, and `.ws--day` sets it. */
  const weekLanes = fullWeek && !library && props.axis !== 'day';

  /* WHAT THE POINTER IS CARRYING — read from the shell, for the reason on the
     prop. The dataTransfer carries only the id — enough for a day to test
     whether the drag is ours, not enough to name the row it adds — so the
     record itself has to sit somewhere both ends of the drag can see, and the
     drawer put those two ends in different subtrees. */
  const carrying = readOnly ? null : (props.carrying ?? null);
  const setCarrying = props.onCarry ?? (() => {});
  /** And the CONTAINER one is carrying — law 5's drag. Held beside the row's
   *  rather than in one field, because the two mean different things to a day
   *  being dragged over and a day has to answer both at once: a row drag is in
   *  flight over the same board a container drag could be. */
  const [carryingWorkout, setCarryingWorkout] = useState<string | null>(null);
  /**
   * AND, ON THE DAY AXIS, THE WEEK IT CAME OFF.
   *
   * A container drag is a MOVE, and a move across the seam between two cards
   * on a day board is a move across two WEEKS: week 1's session would leave
   * week 1 and land in week 5, which is not a thing any control on this screen
   * offers and not a thing a trainer dragging within one day means. It could
   * not happen while seven of the eight cards were read-only; every card
   * writes now, so the rule has to be stated rather than inherited.
   *
   * *Copy to day…* is the door that IS open across weeks, and it stays open —
   * it adds rather than removes, so a slip costs a delete instead of a session
   * gone from a week nobody was looking at.
   *
   * Null on the week axis and between drags. A drop is still keyed on the
   * payload rather than on this — see `DayCard`'s `takesWorkout` — this only
   * decides which cards are handed a drop handler at all.
   */
  const [carryFrom, setCarryFrom] = useState<number | null>(null);

  /* ── THE AXIS, AND THE THREE READINGS IT DECIDES ──────────────────────────
     `axis` carries the argument. The day board is only reachable with the
     three props that describe it, so a caller that asks for it and forgets one
     gets the week board rather than an empty plane. */
  const axis = props.axis === 'day' && props.weekOf && props.focusDay ? 'day' : 'week';
  const focusDay = props.focusDay ?? days[0] ?? 1;
  const weekOf = props.weekOf ?? (() => ({ rows: [] as Entry[], repeat: false }));
  /** Every week the program has, in order. Not `authoredWeeks`: law 3 makes a
   *  week with nothing of its own week 1 repeated, and a block that is eight
   *  weeks long is eight cards here whether or not six of them were typed. */
  const weekNumbers = Array.from({ length: Math.max(1, props.weekCount ?? 1) }, (_, i) => i + 1);

  /**
   * ONE CARD, WIRED ONCE — and both axes call it.
   *
   * Everything below the first six fields is the same on a week board and a day
   * board: the same drags, the same clipboard, the same container actions, the
   * same editor. What the two axes disagree about is only which DAY the card
   * draws, which WEEK's rows it is holding, and whether it may be written in —
   * so those are the arguments and the rest is closed over.
   *
   * `readOnly` is per CARD here rather than per board. It is a whole-board
   * flag today — the certified preview sets it and the two axes both write —
   * but it stays per card because that is where the question is asked, and a
   * read-only card is handed NO day actions at all: `hasDayActions` draws the
   * `⋮` from the presence of the handlers and not from the flag, so a card
   * that kept them would open a menu over a board nobody may write in.
   */
  function dayCard(o: {
    key: React.Key;
    day: number;
    rows: Entry[];
    label: string;
    repeat: boolean;
    readOnly: boolean;
    dayWord?: (day: number) => string;
    weekOf?: { week: number };
    /** Only the day axis hands this over — see `DayCardProps.onActivate`. */
    onActivate?: () => void;
  }) {
    const { day, label, rows } = o;
    const ro = o.readOnly;
    /** Which week this card is, on a day board — `undefined` on a week one. */
    const home = o.weekOf?.week;
    const actions = ro ? ({} as DayActions) : actionsOf(props, fullWeek);
    return (
      <DayCard
        key={o.key}
        day={day}
        dayWord={o.dayWord}
        weekOf={o.weekOf}
        label={label}
        rows={rows}
        names={names}
        repeat={o.repeat}
        onActivate={o.onActivate}
        onRelabel={ro || !props.onRelabel ? undefined : v => props.onRelabel?.(day, v)}
        onAdd={() => props.onOpenLibrary(day)}
        onCreateWorkout={
          ro || !props.onCreateWorkout ? undefined : () => props.onCreateWorkout?.(day)
        }
        readOnly={ro}
        carrying={Boolean(carrying)}
        onDropExercise={before => {
          if (!carrying) return;
          props.onAddExercise(day, carrying, before);
          /* Cleared on the DROP as well as on the source's `dragend`,
             because a list that refetches mid-drag unmounts the row
             that would have fired it and leaves every day armed. */
          setCarrying(null);
        }}
        /* NO VIEW-TRANSITION NAMES ON A DAY BOARD, and it is the duplicate
           that forbids them rather than taste: a week that repeats week 1 is
           drawing week 1's containers, so the same `workoutId` is on screen in
           two cards at once and two elements carrying one
           `view-transition-name` makes Chrome refuse the whole transition.
           Nothing is lost — the writes that arm it all re-place a card on the
           WEEK axis, and this axis has no card that travels. */
        vt={axis === 'day' ? false : props.vt}
        carryingWorkout={carryingWorkout}
        onDragWorkout={
          ro
            ? undefined
            : id => {
                setCarryingWorkout(id);
                /* The week the container is leaving, so every other card can
                   refuse it — see `carryFrom`. `undefined` on the week axis,
                   where `home` is not a week and the gate below never trips. */
                setCarryFrom(id === null ? null : home ?? null);
              }
        }
        onDropWorkout={
          /* NOT THIS CARD'S WEEK, NOT THIS CARD'S DROP. See `carryFrom`. */
          home !== undefined && carryFrom !== null && carryFrom !== home
            ? undefined
            : (workoutId, before) => {
                if (!workoutId) return;
                props.onDropWorkout?.(workoutId, day, before);
                /* Cleared on the DROP as well as on the source's `dragend`,
                   for `onDropExercise`'s reason: the card that would have
                   fired it may have unmounted on the write. */
                setCarryingWorkout(null);
                setCarryFrom(null);
              }
        }
        paste={
          !ro && props.copied && props.onPasteWorkout && props.onCancelCopy
            ? {
                name: props.copied.name,
                /* THE WEEK COUNTS TOO, on a day board: every card on it is the
                   same DAY, so the day alone would mark all eight as the one
                   the session was copied from and offer the paste on none. */
                source:
                  props.copied.day === day &&
                  (home === undefined || props.copied.week === home),
                onPaste: () => props.onPasteWorkout?.(day),
                onCancel: () => props.onCancelCopy?.(),
              }
            : undefined
        }
        onEditWorkout={ro ? undefined : props.onEditWorkout}
        onCopyWorkout={ro ? undefined : props.onCopyWorkout}
        onNudgeWorkout={ro ? undefined : props.onNudgeWorkout}
        onRemoveWorkout={ro ? undefined : props.onRemoveWorkout}
        {...actions}
      />
    );
  }

  return (
    <div className="wsplane">
      {/* `ws--adding` — A DOCK IS OPEN, which changes what the rail is for.
          MEASURED at a 900px viewport: the scrollport is 667px and the sticky
          rail is **1306** (dock 620 + balance 674). `position:sticky` can only
          pin a box SHORTER than its scrollport, so the rail was sticky and
          structurally unable to hold — scroll down to read the day you are
          filling and the tool you are filling it with leaves the screen.

          While a movement is being chosen the dock is the instrument and the
          balance is the reference, so the balance stands down to the one line
          it already has and the rail fits: 37 + 12 + 604 = 653 of 653. Nothing
          is hidden — the strip still says *4 flags* and opens on a click. */}
      <div
        /* `ws--read` — NOTHING ON THIS BOARD WRITES, and it is on the plane
           rather than on each card because what it changes is the plane's
           arithmetic: a read-only rest lane carries no *Make it a workout*, so
           the 116px that button was measured for goes back to the days that
           hold the work. See `app.css`'s own note on the rule. */
        className={`ws${library ? ' ws--adding' : ''}${weekLanes ? ' ws--week' : ''}${
          axis === 'day' ? ' ws--day' : ''
        }${readOnly ? ' ws--read' : ''}`}
        data-detail={props.detail}
      >
        <div className="ws__board">
          {/* ── ONE DAY, EVERY WEEK — the transpose ────────────────────────
              `weekOf` has already resolved law 3, so a week with nothing of
              its own arrives holding week 1's rows with `repeat` set. It gets
              a card that SAYS so rather than being skipped: *weeks 2–8 are
              this same session* is the most useful single thing this board can
              tell a trainer, and a board that drew only the authored weeks
              would tell it by drawing nothing. The phone's `AcrossWeeks`
              makes the other call for the reason its own header gives — six
              identical columns of numbers is a table of noise, where a card
              that reads "repeats week 1" is one line. */}
          {axis === 'day' ? (
            weekNumbers.map(w => {
              const lane = weekOf(w);
              return dayCard({
                key: `w${w}`,
                day: focusDay,
                rows: lane.rows,
                label: labels[String(focusDay)] ?? '',
                repeat: lane.repeat,
                /* EVERY CARD WRITES — see `axis`. The board is read-only only
                   when the whole board is (the certified preview). */
                readOnly,
                /* THE WEEK IS THE CARD'S NAME HERE. Eight cards all headed
                   `DAY 1` would name the one thing every card on this board
                   has in common and none of what tells them apart; the day is
                   said once, by the control that chose it. */
                dayWord: () => `WK ${w}`,
                weekOf: { week: w },
                /* THE FIRST TOUCH MOVES THE WRITE HERE. Not a click on the
                   header: the header is a label again on both axes, and a
                   trainer aiming at the `+` of week 5 has already said which
                   week they mean. See `DayCardProps.onActivate`. */
                onActivate: readOnly ? undefined : () => props.onPickWeek?.(w),
              });
            })
          ) : slots.length === 0 ? (
            <p className="wsd__none">
              {readOnly
                ? 'This program has no days laid out.'
                : 'No days laid out yet. Add one to start writing this program.'}
            </p>
          ) : (
            slots.map(day => {
              const rows = entriesForDay(day);
              const label = labels[String(day)] ?? '';

              /* A SLOT THIS PROGRAM DOES NOT TRAIN. Only reachable under
                 `fullWeek` — `slots` is `days` otherwise and every member is
                 trained by construction. `rows` is what is PARKED here, not
                 what is prescribed: marking a day as rest keeps its exercises,
                 and `RestCard`'s own note carries why. */
              if (!days.includes(day)) {
                return (
                  <RestCard
                    key={day}
                    day={day}
                    dayWord={dayWord}
                    label={label}
                    parked={rows.length}
                    onMakeWorkout={
                      readOnly || !props.onMakeWorkout
                        ? undefined
                        : () => props.onMakeWorkout?.(day)
                    }
                  />
                );
              }

              return dayCard({
                key: day,
                day,
                rows,
                label,
                repeat,
                readOnly,
                dayWord,
              });
            })
          )}

          {/* NO TILE UNDER A FULL WEEK — but the SENTENCE it carried survives.
              Every slot is already a card, so *+ Add a day* would be a second,
              vaguer route to *Make it a workout*; the thing the tile was
              actually for, though, was saying that these numbers are not
              weekdays, and seven cards make that MORE tempting to misread, not
              less — a trainer seeing 1…7 reads Monday to Sunday unless told.
              So the note stays, as a line under the week rather than as a tile
              competing with the cards. */}
          {/* WHAT A DAY BOARD IS, said once and under the cards. The week board
              spends its note on *a day is a slot, not a weekday*; this one has
              to say that the cards are WEEKS. It used to spend its second half
              naming the live week and telling you to click another to write
              there — a sentence that only existed to explain a mode, and it
              went with the mode. What replaces it is the one thing about this
              board a trainer can still get wrong: law 3, that typing into a
              week which was repeating week 1 makes it a week of its own. */}
          {axis !== 'day' && !readOnly && !fullWeek && props.onAddDay && (
            <div className="wsadd">
              <span className="wsadd__k">Another day</span>
              {/* NAME THE SLOTS, because the numbers on the cards are visibly
                  1, 2, 4, 5 and the copy that only said *not a weekday* read as
                  denying the gap a trainer had just deliberately laid out. Both
                  halves are true and the old line carried one: the SPACING is
                  the program's (two on, one off, two on), and the WEEKDAY each
                  slot lands on is the client's, chosen at assign time. The
                  phone's own tile already said it this way. */}
              <span className="wsadd__h">
                A day is a slot, not a weekday — this one runs on{' '}
                {days.length === 0 ? 'none yet' : days.join(', ')}. Which weekday each slot
                lands on is the client&rsquo;s, chosen when you assign it.
              </span>
              <span className="wsadd__s">
                <Button variant="secondary" size="sm" onClick={props.onAddDay}>
                  + Add a day
                </Button>
              </span>
            </div>
          )}

          {props.emptyNote}
        </div>

        {/* ── THE FOOT, AND IT IS OUTSIDE THE BOARD ───────────────────────
            These two sentences are footnotes to all seven cards, which is what
            `.wsweeknote`'s own rule has always said — and while they were
            CHILDREN of the board they were items in it, which the grid could
            absorb (`grid-column:1/-1`) and the seven-lane flex row could not.

            MEASURED at 1920 with the note still inside: the note's flex base is
            `100%`, but `max-width:620px` clamps the hypothetical size flexbox
            breaks lines on, so 620 + 660 of cards fitted on ONE line and never
            wrapped. The two training lanes were left splitting 33px of free
            space — **16px wide each**, beside five 116px rest lanes. A layout
            that got worse as the window got wider, and invisible at 1536 where
            the arithmetic happened to break the other way.

            A sibling of the board rather than a child of it, so neither
            arrangement has to make room for a paragraph. `.wsadd` and
            `emptyNote` stay inside: they only ever render with `fullWeek` off,
            which is the one state `.ws--week` cannot be in. */}

        {/* THE RAIL HOLDS THE BALANCE AND NOTHING ELSE AGAIN.
            The library used to sit above it here, and the sentence that put it
            there — *one click adds, and the day is the review* — is still the
            whole design. What changed is where "beside the board" is measured.

            A 280px card dropped into a rail that was ALREADY on screen, 900px
            from the *+ Add exercise* the trainer had just pressed on Day 1, is
            a surface that opens with nothing moving: no reflow, no dim, no
            change at the click site. MEASURED at 1536 — dock at x=1218, button
            at x=320, and the only motion in between was `tx-rise` on a card in
            the far corner of the eye. Reported, correctly, as the library not
            appearing to open at all.

            So it is a drawer in the SHELL's panel track now — `Builder` renders
            it beside `.split__r`, the way *Assign* already does, and the board
            visibly narrows by 380px to make room. That reflow is the thing a
            trainer actually reads as "it opened". `LibraryDock`'s own header
            argues the rest.

            No progression control here either — the toolbar's chip is the one
            entry point now, and `BalancePanel`'s header says why.

            AND NOT ON THE DAY AXIS AT ALL. The panel reads ONE week — it is
            handed `balance` for the week `Builder` is writing — and a day board
            is every week of the block side by side, so the rail would be a
            reading of one of eight cards with nothing on it saying which. The
            week board is where that reading belongs and where a trainer already
            has it; drawn twice it is the same answer to a question this board is
            not asking, and the 280px it costs are a whole extra track of weeks
            on the board that exists to be a COMPARISON. */}
        {axis !== 'day' && (
          <div className="ws__side">
            {props.side ?? <BalancePanel balance={balance} week={week} />}
          </div>
        )}

        {/* ── THE FOOTNOTES, AND READ-ONLY GETS THEM TOO ──────────────────
            Both sentences used to be `!readOnly`, which read as "these are
            instructions" — and the day-axis one was, since it ended on *every
            one of them can be written in*. The other half of each is a FACT
            about the blueprint, and the reader who most needs it is the one who
            has never seen the program: seven cards headed DAY 1…DAY 7 are read
            as Monday to Sunday unless something says otherwise, and on a
            preview nothing else does. So each note has a read-only wording that
            keeps the fact and drops the verb. */}
        <div className="ws__foot">
          {axis === 'day' &&
            (readOnly ? (
              <p className="wsweeknote">
                Day {focusDay} in every week of this block — each card is that
                week&rsquo;s copy of the session. Where a card says it repeats week 1,
                the block prescribes nothing different for that week.
              </p>
            ) : (
              <p className="wsweeknote">
                Day {focusDay} in every week of this block — each card is that week&rsquo;s
                copy of the session, and every one of them can be written in. A week
                that repeats week 1 becomes its own the moment you change something
                in it.
              </p>
            ))}

          {axis !== 'day' &&
            fullWeek &&
            (readOnly ? (
              <p className="wsweeknote">
                A day is a slot, not a weekday — this program trains{' '}
                {days.length === 0 ? 'none of them' : days.join(', ')} and rests the
                others. Which weekday each slot lands on is decided per client, when
                a copy of this is assigned.
              </p>
            ) : (
              <p className="wsweeknote">
                A day is a slot, not a weekday — this program trains{' '}
                {days.length === 0 ? 'none of them yet' : days.join(', ')} and rests the
                others. Which weekday each slot lands on is the client&rsquo;s, chosen when
                you assign it.
              </p>
            ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The action vocabulary, forwarded to the card and its editor unchanged —
 * except for the one item a full week cannot mean.
 *
 * *Remove this day* deletes the slot AND its rows. With seven slots always
 * drawn there is no slot to remove, and the two halves of what it did are both
 * already on the menu and both say what they do: *Clear every exercise* throws
 * the rows away, *Mark as rest day* stands the day down and keeps them. A third
 * item that did both under a name that mentions neither is how a trainer loses
 * six prescriptions to a click they read as "hide this".
 */
function actionsOf(p: WeekBoardProps, fullWeek = false): DayActions {
  return {
    onOpenRow: p.onOpenRow,
    onInfoRow: p.onInfoRow,
    onNudge: p.onNudge,
    onLink: p.onLink,
    onUnlink: p.onUnlink,
    onDuplicateRow: p.onDuplicateRow,
    onRemoveRow: p.onRemoveRow,
    onMoveRowTo: p.onMoveRowTo,
    moveTargets: p.moveTargets,
    onRenameDay: p.onRenameDay,
    onCopyDayTo: p.onCopyDayTo,
    onClearDay: p.onClearDay,
    onMakeRest: p.onMakeRest,
    onRemoveDay: fullWeek ? undefined : p.onRemoveDay,
  };
}
