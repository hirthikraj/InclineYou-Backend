'use client';

import { useEffect, useRef, useState } from 'react';

import {
  blocksOf,
  ordinalDayWord,
  ordinalLabel,
  partsToText,
  prescribe,
  workoutFigures,
  workoutsOf,
  type DayWorkout,
  type Entry,
  type Part,
} from '@/lib/programs/blueprint';
import { figures } from '@/lib/programs/weeksheet';
import type { ExerciseNameWire } from '@/lib/programs/api';
import { DotsIcon } from '../Icons';
import { useEscapeGuard } from '@/web-components/ui/Modal';
import {
  carriesExercise,
  carriesWorkout,
  locateDrop,
  WORKOUT_MIME,
} from './dnd';
import {
  RowMenuItems,
  DayMenuItems,
  WorkoutMenuItems,
  hasDayActions,
  hasRowActions,
  hasWorkoutActions,
  type DayActions,
  type WorkoutActions,
} from './menus';

/**
 * ONE DAY, at ONE level.
 *
 * The card is a SUMMARY — what is on this day, in the order it is done, with the
 * figures the day states about itself — and that is the whole card. It used to
 * have a second level: clicking the header replaced the summary with an inline
 * four-column editor that spanned every track of the board, so one card grew
 * ~400px, the other six re-placed themselves around it, and the week stopped
 * being readable as a week while any day of it was being written.
 *
 * THE EDITOR IT REPLACED HAS A HOME ALREADY. Law 5 put every session in a
 * container, and clicking a container opens the workout dialog — the whole
 * session on one screen, with its rows, its numbers and its ordering. That is
 * where a day is written now, so the inline level was a second, narrower route
 * to the same writes and the only one that cost the board its shape. Removed:
 * every day is fixed in the week, and the week always reads as seven cards.
 */
export interface DayCardProps extends DayActions, WorkoutActions {
  day: number;
  /** What this day is CALLED — `DAY 2` on a blueprint, `TUE` on a client's own
   *  copy. `ordinalDayWord` is the default and `blueprint.ts` carries why. */
  dayWord?: (day: number) => string;
  label: string;
  rows: Entry[];
  names: Record<string, ExerciseNameWire | undefined>;
  /** This week has nothing of its own and is showing week 1's rows (law 3). */
  repeat: boolean;
  /**
   * THIS CARD IS THE ONE BEING REACHED FOR — the DAY axis, and nothing else.
   *
   * A day board is every week of one day, and `Builder`'s writes all land in
   * ONE of them. This used to be a decision the trainer made out loud: seven
   * read-only cards, a header that clicked, and a week strip in the toolbar
   * keyed *EDITING*. It is now read off the gesture instead — the first
   * pointer, focus or drag to reach this card says which week the trainer
   * means, and the click, drop or blur that actually writes is a LATER event,
   * by which time `Builder` has re-rendered around the new week.
   *
   * Fired on `pointerdowncapture`, `focuscapture` and `dragover`, so it cannot
   * be swallowed by a control inside the card and cannot be missed by a drag
   * that never pressed a button here. It is cheap and idempotent by contract:
   * the board hands over `setWeek`, which React drops when the week is already
   * the one it is being told.
   */
  onActivate?: () => void;
  /**
   * NAME THIS DAY, and it is the card's own affordance now.
   *
   * The `DAY NAME` field lived in the inline editor, so *Name this day* in the
   * menu did not rename anything — it OPENED the day and left the trainer in
   * front of an input. With the editor gone the menu item does the write where
   * it is asked for: the header strip becomes a text box until Enter, Escape or
   * a blur ends it. Absent — a read-only card — and the item is not drawn.
   *
   * The label is still the name of a SLOT rather than of the work: what it
   * changes on THIS board is what an unnamed container on the day is called.
   */
  onRelabel?: (value: string) => void;
  onAdd: () => void;
  /**
   * WRITE THE WHOLE DAY AT ONCE — the tail control, where *+ Add exercise* was.
   *
   * A day of a program is a WORKOUT, and a trainer writing one is not choosing a
   * movement, they are writing a session: eight movements, their sets, the
   * headings between them. The library dock serves the other job — *this day is
   * written and needs one more thing* — and it is still the tail control of the
   * OPEN editor, one click away, because that is the surface where a single row
   * arriving has somewhere to land under SETS/REPS/LOAD/REST.
   *
   * Collapsed, the day is a summary, and the thing a summary's one button should
   * do is the thing that fills it. So this opens the workout dialog and the
   * session it saves lands on this day, named.
   *
   * Absent — the certified preview, a repeat week — the button is not drawn, and
   * `onAdd` remains the fallback for any board that has a library and no dialog.
   */
  onCreateWorkout?: () => void;
  /**
   * A WORKOUT IS ON THE CLIPBOARD — the second half of *Copy to day…*.
   *
   * `source` is the day it was copied FROM, which draws the cancel rather than
   * the paste: offering to paste a session onto the day it is already on is
   * offering to duplicate it in place, which is a different action nobody asked
   * for. Every other day draws *Paste {name}*, so the target is chosen by
   * looking at the board rather than by reading seven slot numbers in a submenu.
   */
  paste?: { name: string; source: boolean; onPaste: () => void; onCancel: () => void };
  /** The container in flight, anywhere on the board — the day it came from
   *  draws it lifted, every other day becomes a target. */
  carryingWorkout?: string | null;
  onDragWorkout?: (workoutId: string | null) => void;
  /** Land the carried container here, above `before` or at the tail. The id is
   *  read off the drop's own payload — see `takesWorkout`. */
  onDropWorkout?: (workoutId: string, before: string | null) => void;
  /** A container write is about to be captured as a view transition, so every
   *  container needs a `view-transition-name` in THIS render — `DayReflow.armed`
   *  carries the whole argument, including why it cannot be done in CSS. */
  vt?: boolean;
  /** A movement is in flight from the library, so every day on the board is a
   *  target. Clicking still fills the day the dock is pinned to; this is what
   *  lets one drag reach the other three days without repinning it. */
  carrying?: boolean;
  /** Land the carried movement on this day, above `before` or at the tail. */
  onDropExercise?: (before: string | null) => void;
  /**
   * NOTHING HERE WRITES — the certified preview's whole mode.
   *
   * A day is the same two levels either way: a summary that says what is on it
   * and an editor that lays the numbers out in four columns. Read-only, the
   * second one is the same four columns with the boxes taken out, which is why
   * this is a flag on one component rather than a second component — `DayBand`
   * was that second component, and the drift it produced is what this replaces:
   * a preview whose day header, ordinals, superset footer and duplicate note
   * were all a second author's version of the builder's.
   *
   * It suppresses the AFFORDANCES and never the information: every figure the
   * editable card states, this one states.
   */
  readOnly?: boolean;
  /**
   * THIS CARD IS ONE WEEK OF A DAY BOARD — `DayBoard`'s axis, and the three
   * things that change when a board holds several cards for the SAME day.
   *
   * `data-day` is an ADDRESS and it stops being unique the moment eight weeks
   * of Day 1 are on one board. It is not decoration: `.vt-days
   * .wsd[data-day="4"]` is how `reflow.ts` gives a card a
   * `view-transition-name`, and two elements carrying the same one makes
   * Chrome refuse the transition outright — so a day board addresses its cards
   * `w3d1` and matches that selector nowhere, which is the honest answer: on
   * this axis the cards are not the thing that travels.
   *
   * The ACCESSIBLE NAME goes the same way. Eight cards all called *Day 1* is a
   * screen reader reading the same name eight times for eight different weeks.
   *
   * It carried a third field, `live`, for the one card a day board let you
   * type in; that card is now every card, so the flag and the accent bar it
   * drew (`.wsd--live`) are both gone. The WEEK is not — it is what makes the
   * address and the accessible name unique across eight cards of one day.
   */
  weekOf?: { week: number };
}

export function DayCard(props: DayCardProps) {
  const { day, label, rows, names, repeat, onAdd } = props;
  /** The header strip is a text box — *Name this day*, taken up. */
  const [renaming, setRenaming] = useState(false);
  const dayWord = props.dayWord ?? ordinalDayWord;
  const readOnly = Boolean(props.readOnly);
  /* LAW 5 — a day is a run of CONTAINERS, and the blocks are read inside each
     one. `blocksOf` is still the only thing that knows what a superset is; what
     changed is that it is asked per workout rather than per day, so a superset
     can no longer be read across the seam between two sessions. */
  const workouts = workoutsOf(rows);
  const repeated = repeatedNames(rows, names);

  /* THE DAY MENU, with *Name this day* pointed at this card's own strip rather
     than at a surface that no longer exists. Everything else is the board's. */
  const dayActions: DayCardProps = {
    ...props,
    onRenameDay: props.onRelabel ? () => setRenaming(true) : props.onRenameDay,
  };

  /* WHAT THE HEADER PRINTS, built once and worn by either element. The two
     branches below differ only in whether the strip is pressable; drawing the
     day word, the spacer and the figures twice is how the two would start
     saying different things. */
  /**
   * A WEEK WITH NOTHING OF ITS OWN, SAID ON THE CARD — day axis only.
   *
   * `tpl_004` is four weeks and only week 1 is authored, so the day board drew
   * **four byte-identical columns** and nothing on any of them said why. The
   * one fact worth knowing about that block — that nothing changes across it —
   * took four columns of reading to discover, and the only place it was stated
   * was 12px of italic grey in the toolbar, 900px to the right. This is the
   * failure `PROGRAM-VIEW-REDESIGN.md` records against the old certified
   * viewer ("eight bands, all labelled Day 1, seven of them 'repeats week 1'
   * with identical content"), arriving again on the axis built to replace it.
   *
   * The card's own header block already promised this — *"the card keeps its
   * dashed edge"* — and the dashed edge went with `wsd--repeat` while the
   * sentence stayed. It is a chip rather than that edge, and the difference is
   * the whole argument that removed the edge: a card drawn as provisional
   * reads as one you are not meant to type in, and every card on this board
   * writes. A chip beside the week word is a FACT about the week, in the ink a
   * fact gets, with nothing about it saying *not yet*.
   *
   * WEEK AXIS NEVER. There the whole board is one week and the toolbar says
   * *weeks 2–4 repeat week 1* over all of it; a chip on every card would be
   * that sentence seven more times.
   */
  const repeatsWeekOne = repeat && props.weekOf !== undefined && props.weekOf.week > 1;

  const head = (
    <>
      <span className="wsd__d">{dayWord(day)}</span>
      {repeatsWeekOne && (
        <span
          className="wsd__rep"
          title="This week has nothing of its own — it is week 1 again. Change anything here and it becomes a week of its own."
        >
          = WK 1
        </span>
      )}
      {/* THE DAY'S NAME IS GONE FROM HERE, and the container above it is
          why — law 5. A day used to be one session, so the day header was
          the only place a session could be called anything; every workout
          on the board now carries its own name on its own header, and an
          unnamed one falls back to the day's (see `named` below). Drawn in
          both places it was the same string twice in forty pixels, which is
          what the seven-lane board could least afford and what a trainer
          reading two sessions on one day would have had to disentangle.

          The label is NOT removed from the model: `dayLabels` is on the
          wire, the phone's week tiles read it, the rest card draws it —
          it is the name of a SLOT, and the container's is the name of the
          work. Renaming the day still has a visible effect here: it is
          what an unnamed container is called. */}
      <span className="wsd__sp" />
      {/* THE DAY'S FIGURES, ONLY WHEN THEY ARE A TOTAL — law 5.
          Each container states its own `6 ex · 20 sets`, so on the ordinary
          one-workout day this line was the identical string twice, sixteen
          pixels apart, in a 145px lane that could not afford either of them
          whole. With two sessions on a day it is genuinely a sum and
          nothing else says it, so it comes back. */}
      {workouts.length > 1 && <span className="wsd__fig">{figures(rows)}</span>}
    </>
  );

  /* ── the drop ───────────────────────────────────────────────────────────
     ONE HANDLER FOR BOTH DRAGS, because a card that answered a library movement
     one way and a container another would be two drop behaviours on one target
     — and a trainer aiming at the gap under a session means the same thing
     either way. What differs is only the verb: a movement is COPIED out of a
     library that is not emptied by being drawn from, a container is MOVED and
     leaves a hole.

     THE WHOLE CARD IS THE TARGET, not its body. The header is a third of the
     height of a short day, and a drop that lands on nothing because it caught
     the day's name reads exactly like a feature that is broken.

     AND A REPEAT WEEK TAKES ONE TOO, which is the whole of what changed here.
     It used to refuse, on the argument that "the first row written against this
     week stops it repeating week 1 and week 1's other five movements would
     vanish under the one just dropped" — and the premise of that was a write
     that REPLACED the week. It does not: `ownWeek` copies week 1 into this week
     first and the dropped row joins the other five. There is no longer a
     decision for the pointer to make in flight, so the card takes the drop the
     way every other card does.

     NEITHER IS THE ONLY ROUTE, which is what keeps this off the keyboard's
     critical path (SC 2.5.7): *+ Add exercise* on any day repins the dock to
     it, *Move up* / *Move down* reorder inside a day, and the row menu's *Move
     to…* names every other day as a target. This is the shorthand for all
     three, not the way to reach any of them. */
  const box = useRef<HTMLElement>(null);
  /** Where the drop would land: the block it goes above (null for the tail) and
   *  the rule's offset in the card's own coordinates. `undefined` is *nothing in
   *  flight over this card*, which is not the same as *at the tail*. */
  const [at, setAt] = useState<{ before: string | null; top: number } | null | undefined>(
    undefined,
  );

  /* NO ROW DRAG ON THIS BOARD ANY MORE, and the reason is the level that was
     removed rather than a decision about the gesture. The only surface that
     ever handed a row a grip was the inline day editor; the rows in a card are
     a SUMMARY — read, not written — and every reorder inside a session is in
     the workout dialog, which has its own. What a day still takes is a movement
     out of the library and a whole CONTAINER off another day. */
  const takesNew = Boolean(props.carrying && props.onDropExercise && !readOnly);
  /* A CONTAINER IN FLIGHT — and a day takes one even when it is the day it came
     from, because reordering two sessions inside one day is the same gesture as
     moving one between days. `moveWorkout` returns the same array when nothing
     moved, so a drag that lands where it started costs nothing.

     GATED ON THE HANDLER, NOT ON `carryingWorkout`: `dragstart` and the first
     `dragover` land in the same task, so a gate on state misses that one — the
     state React has not re-rendered with yet. The payload's TYPE is readable mid-drag and the
     payload itself carries the container's id, so this day can answer both
     *would I take this* and *what did I take* without asking the board. */
  const takesWorkout = Boolean(props.onDropWorkout && !readOnly);
  const takes = takesNew || takesWorkout;
  const accepts = (e: React.DragEvent) =>
    (takesNew && carriesExercise(e)) ||
    (takesWorkout && carriesWorkout(e));

  function over(e: React.DragEvent) {
    if (!accepts(e)) return;
    /* A DRAG NEVER PRESSES A BUTTON HERE, so this is the only place a card
       crossed by a row from the dock gets to say it is the one being aimed at
       — and it fires frames before the drop, which is what makes the drop land
       in this week rather than in whichever one was last clicked. */
    props.onActivate?.();
    // Without this the browser refuses the drop and animates the row back to
    // where it came from, which reads as a rejection rather than as a miss.
    e.preventDefault();
    e.dataTransfer.dropEffect = carriesExercise(e) ? 'copy' : 'move';
    setAt(locateDrop(box.current!, e.clientY, carriesWorkout(e) ? '[data-workout]' : '[data-block]'));
  }

  return (
    <section
      ref={box}
      /* CAPTURE, both of them: the press that matters is usually on a control
         INSIDE the card — the `+`, a row, a number field, the `⋮` — and a
         bubbling handler would run after that control's own. See `onActivate`. */
      onPointerDownCapture={props.onActivate}
      onFocusCapture={props.onActivate}
      /* NO `wsd--repeat`. The dashed edge and the canvas fill were the last
         thing on the card that said *this week is not really a week yet*, and
         with the sentence and the button gone they were saying it alone — a
         card drawn as provisional beside seven solid ones reads as one you are
         not meant to type in, which is the belief this pass exists to remove.
         A repeating week IS week 1 until somebody writes in it, and writing in
         it is now the same act on every card, so the cards are one card. The
         fact still has two places to live that cost the trainer nothing: the
         toolbar's *weeks 2–8 repeat week 1* and the ghost chip on the strip. */
      className={`wsd${
        takes ? ' wsd--takes' : ''
      }${at !== undefined ? ' wsd--over' : ''}`}
      aria-label={
        props.weekOf
          ? `Week ${props.weekOf.week} · ${label ? `Day ${day} · ${label}` : `Day ${day}`}`
          : label
            ? `Day ${day} · ${label}`
            : `Day ${day}`
      }
      /* AN ADDRESS, so the board can bring this card into view and so
         `reflow.ts` can give it a `view-transition-name` in CSS. Not a ref
         chain: the cards are mapped, and a `Map` of refs kept in sync with
         `days` is more machinery than one attribute. */
      data-day={props.weekOf ? `w${props.weekOf.week}d${day}` : day}
      onDragOver={over}
      onDragLeave={e => {
        // Only when the pointer has actually left the card — a `dragleave`
        // fires on every child boundary crossed on the way down it.
        if (!box.current?.contains(e.relatedTarget as Node | null)) setAt(undefined);
      }}
      onDrop={e => {
        if (!accepts(e)) return;
        e.preventDefault();
        const workout = carriesWorkout(e);
        const where = locateDrop(
          box.current!,
          e.clientY,
          workout ? '[data-workout]' : '[data-block]',
        );
        setAt(undefined);
        /* THE ID COMES OUT OF THE PAYLOAD — readable here, where `getData` is
           allowed, and it is the same value the board is holding in state. Read
           from the drop rather than from the state for the reason `takesWorkout`
           is gated the way it is. */
        if (workout) props.onDropWorkout?.(e.dataTransfer.getData(WORKOUT_MIME), where?.before ?? null);
        else props.onDropExercise?.(where?.before ?? null);
      }}
    >
      {/* WHERE IT LANDS, as one rule floating over the card rather than as a
          border on the block underneath — an indicator that adds 2px to the
          thing you are aiming at moves the target as you approach it. */}
      {at && <span className="wsd__drop" style={{ top: at.top }} aria-hidden="true" />}
      <div className="wsd__hd">
        {/* THE HEADER IS A LABEL, NOT A SWITCH, on BOTH axes now. It was a
            `<button aria-expanded>` that opened the inline editor; with that
            level gone there is nothing on a week board for a press here to do.
            The day axis kept it for a while as *make this week the live one*,
            and that press is gone with the mode it served: every card writes,
            so a header that only announced which one did is a control that
            answers with nothing. See `onActivate`. */}
        {renaming && props.onRelabel ? (
          <DayName
            day={day}
            label={label}
            dayWord={dayWord}
            onSave={props.onRelabel}
            onDone={() => setRenaming(false)}
          />
        ) : (
          <h3 className="wsd__open wsd__open--flat">{head}</h3>
        )}
        {/* ASKED FOR, not assumed. Read-only there is no day action at all —
            renaming, copying, clearing and removing are every item in that
            menu — so the button would open an empty box. `hasDayActions`
            carries the argument. */}
        {hasDayActions(dayActions) && (
          <More
            label={`More actions for Day ${day}${label ? ` · ${label}` : ''}`}
            items={close => <DayMenuItems day={day} actions={dayActions} close={close} />}
          />
        )}
      </div>

      {/* THE SAME MOVEMENT, TWICE, SAID ONCE — AND IT IS A NOTE.
          `Upper A` in the seed holds *Barbell Bench Press* at 4x6 and again at
          3x10, six rows apart, and nothing on the screen mentioned it. That is
          an ordinary prescription (heavy, then volume) and it is also the shape
          a slip makes when a trainer adds from the dock without scrolling the
          day — the two are indistinguishable from the model, so this states
          the fact and refuses to guess which it is. Quiet ink, no icon, no
          amber: a warning on a legitimate pattern is a warning a trainer
          learns to ignore, and then misses the slip.

          ABOVE the body rather than inside it, because it is a fact about the
          DAY and not about any one container on it. */}
      {repeated.length > 0 && (
        <p className="wsd__dup">
          {repeated.map(r => `${r.name} ×${r.count}`).join(' · ')} on this day
        </p>
      )}

      <div className="wsd__b">
        {/* LAW 5 — ONE CARD PER WORKOUT, and the exercises are inside it.
            A day used to be a flat list, and *what is Tuesday* was answered
            by reading fourteen rows and inferring the seam in the middle.
            Drawn as containers the seam is the thing you see first: two
            named sessions, each one object a trainer can pick up, copy onto
            Thursday, or open and rewrite. It is also the only drawing under
            which *one day, several workouts* is legible at all — the model
            could hold it before this and the card could not say it. */}
        {workouts.length === 0 ? (
          <p className="wsd__none">Nothing on this day.</p>
        ) : (
          workouts.map((workout, i) => (
            <WorkoutCard
              key={workout.id}
              workout={workout}
              dayLabel={label}
              alone={workouts.length === 1}
              first={i === 0}
              last={i === workouts.length - 1}
              names={names}
              actions={props}
              onEdit={
                readOnly || !props.onEditWorkout
                  ? undefined
                  : () => props.onEditWorkout?.(workout.id)
              }
              workoutDrag={
                readOnly || !props.onDragWorkout
                  ? undefined
                  : {
                      carrying: props.carryingWorkout ?? null,
                      onDrag: props.onDragWorkout,
                    }
              }
              vt={props.vt}
              readOnly={readOnly}
            />
          ))
        )}

        {/* WHERE THE COPY LANDS. Drawn on every day BUT the one it came from
            — see the prop — and it is the whole of the second step: the
            trainer has a session on the clipboard and the board is a row of
            places to put it, each one saying so in its own words. */}
        {props.paste && !readOnly && (
          props.paste.source ? (
            <button className="wsd__paste wsd__paste--src" type="button" onClick={props.paste.onCancel}>
              Copying {props.paste.name} — cancel
            </button>
          ) : (
            <button className="wsd__paste" type="button" onClick={props.paste.onPaste}>
              + Paste {props.paste.name}
            </button>
          )
        )}

        {/* ── AND A REPEAT WEEK ENDS THE SAME WAY EVERY OTHER DAY DOES ──
            *Nothing of its own — repeats week 1* stood here with *Make this
            week its own* under it, and between them they made law 3 — a
            STORAGE rule about what the wire carries — into a permission the
            trainer had to spend a click on before week 4 would accept a
            single exercise. The write does that copy itself now, at the
            moment there is something to copy INTO (`ownWeek`), so the card
            needs no sentence about it and no button.

            THE FACT IS NOT LOST, it moved to where a fact belongs: the
            toolbar says *weeks 2–8 repeat week 1* over the whole strip, the
            chip for such a week is a ghost, and the card keeps its dashed
            edge. None of the three is in the way of typing a number.

            READ-ONLY IS THE EXCEPTION, and it is the half that was never a
            gate. The certified preview has nothing to unblock, so the
            sentence costs it nothing and carries what somebody deciding
            whether to copy an eight-week block most needs to know: that six
            of those weeks are week 1 again. */}
        {repeat && readOnly && (
          <p className="wsd__none" style={{ textAlign: 'left', padding: 8 }}>
            Nothing of its own — repeats week 1.
          </p>
        )}

        {!readOnly &&
          (props.onCreateWorkout ? (
            <button className="wsd__add" type="button" onClick={props.onCreateWorkout}>
              + Create workout
            </button>
          ) : (
            <button className="wsd__add" type="button" onClick={onAdd}>
              + Add exercise
            </button>
          ))}
      </div>
    </section>
  );
}

/**
 * THE HEADER STRIP, AS A TEXT BOX — *Name this day*, taken up.
 *
 * Autofocused and selected, because it is only ever mounted by a menu item the
 * trainer just chose: landing with the old name selected means typing a new one
 * is one gesture and keeping it is Escape.
 *
 * COMMITS ON BLUR AS WELL AS ON ENTER. A field that throws away what was typed
 * because the trainer clicked the next day instead of pressing a key is a field
 * that loses work; Escape is the way to mean *no*, and it restores the name it
 * opened with.
 */
function DayName({
  day,
  label,
  dayWord,
  onSave,
  onDone,
}: {
  day: number;
  label: string;
  dayWord: (day: number) => string;
  onSave: (value: string) => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState(label);
  return (
    <span className="wsd__open wsd__open--flat">
      <span className="wsd__d">{dayWord(day)}</span>
      <input
        className="wsd__nmin"
        autoFocus
        value={value}
        placeholder="Name this day"
        aria-label={`Name for ${dayWord(day)}`}
        onChange={e => setValue(e.target.value)}
        onBlur={() => {
          onSave(value.trim());
          onDone();
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSave(value.trim());
            onDone();
          } else if (e.key === 'Escape') {
            /* CAPTURED HERE so the shell's Escape ladder does not spend a rung
               on it — trap 49, one press one rung. */
            e.preventDefault();
            e.stopPropagation();
            onDone();
          }
        }}
      />
    </span>
  );
}

/**
 * WHICH MOVEMENTS THIS DAY HOLDS MORE THAN ONCE.
 *
 * Keyed on `exerciseId` and not on the rendered name: two rows can print the
 * same string only by being the same exercise, but an unnamed row — one whose
 * exercise the library could not resolve — prints *Exercise not in your
 * library* on every instance, and calling two different unknown movements a
 * duplicate is a claim about rows nobody can read. Unnamed rows are skipped.
 *
 * In prescription order, so the sentence lists them the way the day does.
 */
function repeatedNames(
  rows: Entry[],
  names: Record<string, ExerciseNameWire | undefined>,
): { name: string; count: number }[] {
  const seen = new Map<string, number>();
  for (const row of rows) seen.set(row.exerciseId, (seen.get(row.exerciseId) ?? 0) + 1);
  const out: { name: string; count: number }[] = [];
  const done = new Set<string>();
  for (const row of rows) {
    const count = seen.get(row.exerciseId) ?? 0;
    if (count < 2 || done.has(row.exerciseId)) continue;
    const name = names[row.exerciseId]?.name;
    if (!name) continue;
    done.add(row.exerciseId);
    out.push({ name, count });
  }
  return out;
}

/**
 * ONE WORKOUT ON ONE DAY — law 5's container, drawn.
 *
 * ── WHY THIS IS A BOX AND NOT A HEADING ─────────────────────────────────────
 *
 * The rows it holds were already grouped in the model; what a heading over them
 * would have said is *these six belong together*, and what the box says is
 * *this is one thing*. The difference is the whole feature: a thing can be
 * picked up, and the gesture the trainer asked for is dragging a session from
 * Monday onto Wednesday. A heading has no edges to grab and no obvious end —
 * with two sessions on a day, the second heading is the only mark saying where
 * the first one stopped, and a trainer scanning for *what is Tuesday* has to
 * find it and hold it in their head. A border does that work without being read.
 *
 * IT CARRIES ITS OWN FIGURES AND ITS OWN `⋯`, because both questions are now
 * asked of the workout rather than of the day: *how much is this session* and
 * *what can I do with it*. The day header keeps the same two one level up,
 * about the whole slot.
 *
 * IT DOES NOT CARRY A `+`. It had one — the library dock opened pinned to this
 * container — and it was the last control inside the box that wrote to the
 * session without opening it. The card is a SUMMARY, and the dialog behind a
 * click on it is where a session is written: adding a movement there puts it
 * in the list the trainer is about to order, name and prescribe, rather than
 * dropping it at the foot of a box and leaving them to find it. The day's own
 * *+ Create workout* is untouched — that writes a NEW session, which is a
 * question about the day and not about any container on it — and the OPEN
 * day's editor keeps its per-container *+ Add exercise*, because that surface
 * has somewhere for a single row to land under SETS/REPS/LOAD/REST.
 *
 * THE NAME FALLS BACK TO THE DAY'S, and that is the pre-law-5 case rather than
 * a default: a blueprint written before containers existed is one unnamed
 * workout per day, and the name it has always had is the day's. *Workout 2* is
 * the last resort, and it is a position rather than a name because a second
 * unnamed session on a day has nothing else true to say about itself.
 */
function WorkoutCard({
  workout,
  dayLabel,
  alone,
  first,
  last,
  names,
  actions,
  workoutDrag,
  onEdit,
  vt,
  readOnly,
}: {
  workout: DayWorkout;
  dayLabel: string;
  /** The day holds this one and nothing else — see `named`. */
  alone: boolean;
  first: boolean;
  last: boolean;
  names: Record<string, ExerciseNameWire | undefined>;
  actions: DayActions & WorkoutActions;
  workoutDrag?: { carrying: string | null; onDrag: (id: string | null) => void };
  /** OPEN THE WORKOUT DIALOG ON THIS CONTAINER — the card's own click, and
   *  the ONLY door into this session from the collapsed day. */
  onEdit?: () => void;
  vt?: boolean;
  readOnly?: boolean;
}) {
  /* WHAT THE HEADER SAYS.
     A container with a name of its own says it. One without — every day of
     every blueprint written before law 5 — takes the DAY's name, which is the
     name that session has always had and which the day header no longer draws.
     `Workout 2` is the last resort and it is a POSITION rather than a name:
     two unnamed containers on one day cannot both be called *Upper A*, and a
     second session that has never been named has nothing else true to say
     about itself. `nameTheUnnamed` normally writes a real name before a day
     ever reaches that state. */
  const named = workout.name || (alone ? dayLabel : `Workout ${workout.ordinal}`);
  /** What a menu item, a drag tooltip and the aria-label call it — never empty,
   *  because "Delete" and "Drag" need a subject even where the header has room
   *  for none. */
  const title = workout.name || dayLabel || `Workout ${workout.ordinal}`;
  const lifted = workoutDrag?.carrying === workout.id;
  const grip = useWorkoutGrip(workout.id, title, workoutDrag);

  /* THE WHOLE BOX OPENS THE DIALOG — and it is the only route into editing
     anything inside it.

     A container was a box you could pick up and a menu you could open, and the
     six rows inside it each carried their own `⋯` and their own grip: four
     affordances stacked inside 150px of lane, three of which edited ONE row of
     a session the trainer had already decided to open. The rows in a collapsed
     day are a SUMMARY — what this session is — and a summary is read, not
     written. So the card states the session and the dialog writes it: one
     click, one surface, every row and every ordering in front of the trainer at
     once rather than a movement at a time through a dropdown.

     A CLICK IS NOT A DRAG, and the browser already separates them: a completed
     HTML5 drag fires no `click`. What it does not separate is a click that was
     a SELECTION — a trainer dragging across `3 × 12 · 60s rest` to read it —
     so a live selection stands the open down. Anything inside a control of its
     own (the `⋯` and its menu, `+ Add exercise`) is that control's click and
     never the card's.

     NOT A `role="button"`: the box holds two real buttons, and a button inside
     a button is markup no AT can resolve. The keyboard and screen-reader route
     into the same dialog is the `⋯` menu's *Edit workout*, which is where it
     has always been — this is the pointer shorthand for it, the trade
     `DayCard`'s own drop handler makes against SC 2.5.7. */
  const openEdit = (e: React.MouseEvent) => {
    if (!onEdit) return;
    if ((e.target as HTMLElement).closest('button,a,[role="menu"]')) return;
    if (!window.getSelection()?.isCollapsed) return;
    onEdit();
  };

  return (
    <section
      className={`wsk${lifted ? ' wsk--lifted' : ''}${onEdit ? ' wsk--opens' : ''}`}
      onClick={onEdit ? openEdit : undefined}
      /* THE ADDRESS A CONTAINER DROP MEASURES OFF — `locateDrop`'s second
         selector. A workout lands above another workout, never inside one. */
      data-workout={workout.id}
      aria-label={`Workout · ${title}`}
      /* THE NAME THE TRANSITION MOVES IT BY, and only while one is being
         captured — `DayReflow.armed`. Sanitised because a view transition name
         is an ident: minted ids are `w12-ab3cd` and the seeded ones are
         `w-seed-1-4`, both of which contain characters an ident may not start
         with or hold. */
      style={vt ? { viewTransitionName: `wk-${workout.id.replace(/[^a-zA-Z0-9]/g, '_')}` } : undefined}
      {...grip.box}
    >
      {/* THE WHOLE CARD IS THE HANDLE — which is the strip's own argument
          (*a container with no name of its own has no name to grab*) followed
          one step further, and it is what the click above pays for. Once the
          rows inside stopped being draggable there was nothing left in the box
          competing for a press, so the surface a trainer aims at to MOVE a
          session is the same surface they aim at to OPEN one — drag it and it
          moves, release without moving and it opens. The `⋯` and `+` stop the
          press, so neither arms a drag. */}
      <div {...grip.handle}>
        {named && <span className="wsk__nm">{named}</span>}
        <span className="wsk__fig">{workoutFigures(workout.entries)}</span>
        <span className="wsk__sp" />
        {!readOnly && hasWorkoutActions(actions) && (
          <More
            label={`More actions for ${title}`}
            items={close => (
              <WorkoutMenuItems
                workoutId={workout.id}
                name={title}
                first={first}
                last={last}
                actions={actions}
                close={close}
              />
            )}
          />
        )}
      </div>

      {/* THE ROWS ARE READ HERE AND WRITTEN IN THE DIALOG — no actions handed
          down and no drag. A row's `⋯` held *Open*, *Move up/down*, *Link*,
          *Duplicate*, *Remove* and *Move to…*, every one of which is a way of
          editing one movement of a session from a surface that is summarising
          it, and the ordinal was a grip that reordered the session in place.
          Both are in the workout dialog, on one screen, where a trainer can see
          what they are reordering against. `actions` still arrives because the
          CONTAINER's menu is built from it. */}
      <div className="wsk__b">
        {workout.blocks.map(block => (
          <Block key={block.entries[0].uid} block={block} names={names} actions={{}} />
        ))}
      </div>
    </section>
  );
}

/**
 * THE WHOLE CARD IS THE HANDLE.
 *
 * It was the header strip alone, on the argument that *a container draggable
 * everywhere cannot have a selectable rep count in it*. That argument was
 * about the rows, and the rows have stopped competing: nothing inside the box
 * is draggable any more, nothing inside it has a menu, and the one gesture a
 * pointer can make on a summary is aimed at the session rather than at a line
 * of it. A trainer moving Monday's workout onto Wednesday should not have to
 * find a 28px band first.
 *
 * ARMED ON MOUSEDOWN, like a row, so a drag can only begin where a press began
 * — and the two real controls in the card (`⋯`, `+ Add exercise`) stop the
 * press, so neither arms one. Selecting text still works: `draggable` is only
 * set while the button is down over the card, and a selection drag that starts
 * inside it is a container drag, which is the same trade the strip made.
 */
function useWorkoutGrip(
  workoutId: string,
  title: string,
  drag?: { carrying: string | null; onDrag: (id: string | null) => void },
) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const up = () => setArmed(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [armed]);

  if (!drag) return { box: {}, handle: { className: 'wsk__hd' } };
  return {
    box: {
      draggable: armed || undefined,
      title: `Drag ${title} onto another day, or above another workout`,
      onMouseDown: (e: React.MouseEvent) => {
        // A press on a control of its own is that control's, never a drag —
        // the `⋯` must be able to open its menu without arming the card.
        if ((e.target as HTMLElement).closest('button,a,[role="menu"]')) return;
        setArmed(true);
      },
      onDragStart: (e: React.DragEvent) => {
        /* ONLY THE SECTION'S OWN DRAG IS THIS ONE. Written for a bug the
           harness found while the rows inside a container were draggable too:
           React dispatches by bubbling, so picking up *Back Squat* ran this
           handler as well and every day read the drag as a container. MEASURED:
           one row dragged, six rows moved. The rows carry no grip any more, and
           the guard stays — it is one line, and it is what keeps the next
           draggable thing put inside a container from doing it again. */
        if (e.target !== e.currentTarget) return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(WORKOUT_MIME, workoutId);
        // Firefox starts no drag without the plain type.
        e.dataTransfer.setData('text/plain', workoutId);
        e.stopPropagation();
        drag.onDrag(workoutId);
      },
      /* Likewise: a row's `dragend` bubbles here, and clearing the board's
         container-in-flight record on it is harmless — there is none — but
         clearing it on the row's END of a genuine container drag is what keeps
         the lifted styling from sticking. Guarded the same way. */
      onDragEnd: (e: React.DragEvent) => {
        if (e.target !== e.currentTarget) return;
        setArmed(false);
        drag.onDrag(null);
      },
    },
    /* The strip keeps the grab cursor and the hover fill — it is still where a
       pointer lands first and the only part of the card that reads as a
       handle — but the press that arms the drag is the box's now. */
    handle: { className: 'wsk__hd wsk__hd--grab' },
  };
}

/**
 * A SUPERSET IS ONE BLOCK, not two rows — the thing a trainer scans a day for is
 * "how many blocks is this", and the rest is stated once because it belongs to
 * the round. Printing it on both members is how a superset becomes two straight
 * sets on the gym floor.
 */
function Block({
  block,
  names,
  actions,
}: {
  block: ReturnType<typeof blocksOf>[number];
  names: Record<string, ExerciseNameWire | undefined>;
  actions: DayActions;
}) {
  const grouped = block.entries.length > 1;
  const rest = block.entries.find(e => e.restSeconds)?.restSeconds ?? null;

  const rows = block.entries.map((entry, i) => (
    <Row
      key={entry.uid}
      entry={entry}
      ordinal={ordinalLabel(block, i)}
      meta={names[entry.exerciseId]}
      altName={entry.altExerciseId ? names[entry.altExerciseId]?.name : undefined}
      grouped={grouped}
      actions={actions}
      /* An ungrouped row IS its block, so the drop measures off the row itself
         and there is no wrapper to hang `data-block` on. */
      block={grouped ? undefined : block.entries[0].uid}
    />
  ));

  if (!grouped) return <>{rows}</>;

  return (
    <div className="wsd__grp" data-block={block.entries[0].uid}>
      {rows}
      <p className="wsd__gr">
        <b>Superset</b>
        {rest ? ` · ${rest}s rest after the round` : ' · no rest set'}
      </p>
    </div>
  );
}

/**
 * ONE MOVEMENT, READ — and read only.
 *
 * No grip and no menu: the collapsed day is the summary of a session, and
 * every write against a row of it is in the workout dialog the card above
 * opens. See `WorkoutCard`'s `openEdit` for the whole argument.
 */
function Row({
  entry,
  ordinal,
  meta,
  altName,
  grouped,
  actions,
  block,
}: {
  entry: Entry;
  ordinal: string;
  /** The library's record for this exercise, when it still has one. */
  meta?: ExerciseNameWire;
  altName?: string;
  grouped: boolean;
  actions: DayActions;
  /** Set on an ungrouped row only: this row IS its block. */
  block?: string;
}) {
  /* THE NUMBERS ONLY. `prescribe` appends `entry.notes` to the line, which is
     right on a phone's L3 and in the row panel — the prescription and the cue
     under it read as one instruction there — and it is what broke this row the
     first time it met a copy with a cue on it.

     MEASURED on `/clients/:id/program/:pid` at 1440: `.wsd__p` is
     `white-space:nowrap`, deliberately, so `3 × 12 · 60s rest` cannot wrap —
     so a one-sentence cue rendered a **1,166px** cell inside a 411px card,
     blew the row's `minmax(0,1fr)` name track down to a few characters (every
     name wrapping one word per line) and put 823px of horizontal scroll inside
     the plane.

     A cue is not a prescription and does not belong in a cell that may not
     wrap. It gets its own line below, which is also the better reading: the
     numbers are scanned down the column and the sentence is read once. */
  const parts = prescribe({ ...entry, notes: null }, grouped);
  const name = meta?.name;
  const label = name ?? 'Exercise not in your library';

  /* THE SECOND LINE, Full density only — hidden by one CSS rule on the plane
     rather than dropped from the tree, so the two densities cannot drift into
     two different rows. Written from the library's own record, so a movement
     that has left the library simply has nothing to say here.
 
     NOT the prototype's `.wsd__rs` rest column beside it, which it drops
     because its own `prescribe` is `reps · load` and says nothing about rest.
     Ours prints `150s rest` in every row in both densities (the phone and the
     row panel read the same function), so the column would have been the same
     number twice on one line — density buying a duplicate rather than a fact. */
  const about = [meta?.muscleGroup, meta?.equipment, meta?.level].filter(Boolean).join(' · ');

  return (
    <div
      className={`wsd__r${name ? '' : ' wsd__r--ghost'}`}
      /* The cue is in the accessible name because it is part of the
         instruction, even though it is drawn on a line of its own. */
      aria-label={`${label} — ${partsToText(parts) || 'no prescription set'}${
        entry.notes ? `. ${entry.notes}` : ''
      }`}
      data-block={block}
    >
      <span className="wsd__o">{ordinal}</span>
      <span className="wsd__n">
        {label}
        {altName && <span className="wsd__alt"> or {altName}</span>}
      </span>
      <span className="wsd__p">
        {parts.map((p, i) => (
          <PartText key={i} part={p} />
        ))}
      </span>
      {/* The track is held either way — `.wsd__r` is a four-track grid, so
          dropping the cell would shift every prescription a few pixels right of
          the rows above it. Same trade `.dayc__ex` already made for its
          ordinal. */}
      {hasRowActions(actions) ? (
        <More
          label={`More actions for ${label}`}
          items={close => (
            <RowMenuItems entry={entry} name={label} actions={actions} close={close} />
          )}
        />
      ) : (
        <span />
      )}
      <span className="wsd__m">{about}</span>
      {/* THE TRAINER'S OWN LINE FOR THIS CLIENT, at BOTH densities — where
          `.wsd__m` is Full's alone. `muscle · equipment · level` is a fact
          about the movement that the exercise page also carries; a cue exists
          on exactly one row of one person's plan, and hiding it behind a
          density toggle would hide the one thing on the row that is nobody
          else's. */}
      {entry.notes ? <span className="wsd__note">{entry.notes}</span> : null}
    </div>
  );
}

export function PartText({ part }: { part: Part }) {
  if (part.tone === 'fail') return <span className="fail">{part.text}</span>;
  if (part.tone === 'changed') return <em>{part.text}</em>;
  return <>{part.text}</>;
}


/**
 * ONE OVERFLOW BUTTON, and the menu is where the actions go — the rule the
 * roster page produced and the reason this system needed a menu component at
 * all. Five glyph-only actions at 18px are indistinguishable in a hurry.
 */
export function More({
  label,
  items,
}: {
  label: string;
  items: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEscapeGuard(open);

  useEffect(() => {
    if (!open) return;
    function away(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    function esc(e: KeyboardEvent) {
      /* NOT CONSUMED HERE. `stopImmediatePropagation` in capture cannot keep Escape from the dialog around this menu
         (the host's listener was bound first), so one press closed the menu AND opened *Close without saving?*. The
         guard below holds the key away from the host instead (trap 49). */
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc, true);
    };
  }, [open]);

  return (
    <span className="wsd__mw" ref={box}>
      <button
        className="wsd__more"
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={e => {
          e.stopPropagation();
          setOpen(v => !v);
        }}
      >
        <DotsIcon size={15} />
      </button>
      {open && (
        <span className="menu" role="menu">
          {items(() => setOpen(false))}
        </span>
      )}
    </span>
  );
}
