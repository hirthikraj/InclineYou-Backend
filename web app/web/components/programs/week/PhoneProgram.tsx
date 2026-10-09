'use client';

import { useEffect, useRef, useState } from 'react';

import {
  workoutFigures,
  workoutsOf,
  ordinalLabel,
  partsToText,
  prescribe,
  type Entry,
  ordinalDayWord,
} from '@/lib/programs/blueprint';
import { balanceFlags, MEV, type Balance } from '@/lib/programs/balance';
import { dayShape, fieldOf, figures, kg, type NumField } from '@/lib/programs/weeksheet';
import type { ExerciseNameWire } from '@/lib/programs/api';
import { AcrossWeeks } from './AcrossWeeks';
import { BalancePanel } from './BalancePanel';
import { PartText } from './DayCard';
import {
  RowMenuItems,
  DayMenuItems,
  hasDayActions,
  hasRowActions,
  type DayActions,
} from './menus';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CopyIcon,
  DotsIcon,
  LadderIcon,
  PlusIcon,
  WarnIcon,
} from '../Icons';
import { Button } from '@/web-components/ui/Button';
import { Chip } from '@/web-components/ui/Chip';

/**
 * THE PROGRAM ON A PHONE — a peer surface, not a narrowed board.
 *
 * §13's premise is that an Indian trainer may own no laptop at all, so this is
 * where a program gets written rather than merely checked. The rule it is built
 * to is **parity of capability, not parity of interaction**: every action the
 * board can perform is reachable here, and almost none of them by the same
 * gesture.
 *
 * Three levels, and each is a whole screen rather than a panel over one:
 *
 *   L1  the week — the strip, the balance as one line, a tile per day
 *   L2  one day, in full, with the next day in its header
 *   L3  one exercise, as steppers
 *
 * **360px is the floor**, not 390 — the budget-Android cluster and still the
 * most common mobile viewport.
 */
export interface PhoneProgramProps extends DayActions {
  /** TAPPING A DAY DESIGNS ITS WORKOUT in the workout builder — the one the desk opens from a container, so a day is designed with
   *  one set of tools at every width. When it is given, the day list and the exercise screens below are never reached; a read-only
   *  preview does not give it and keeps them. */
  onDesignDay?: (day: number) => boolean;
  /** What a day is CALLED. See `WeekBoard`'s prop of the same name. */
  dayWord?: (day: number) => string;
  programName: string;
  days: number[];
  labels: Record<string, string>;
  weeks: number;
  week: number;
  authored: Set<number>;
  onWeek: (week: number) => void;
  repeat: boolean;
  balance: Balance;
  names: Record<string, ExerciseNameWire | undefined>;
  entriesForDay: (day: number) => Entry[];
  onAdd: (day: number) => void;
  /** A BUILDER-LEVEL SURFACE IS OPEN OVER THESE LEVELS — the exercise picker,
   *  a row panel, the progression panel. It is passed rather than inferred
   *  because this component cannot see them: they are rendered by `Builder`,
   *  outside `.pgw__phone`. See the Escape effect below for what it is for. */
  covered: boolean;
  onField: (entry: Entry, field: NumField, value: number) => void;
  onAddDay?: (slot: number) => void;
  freeSlots: number[];

  /* ── THE WEEK'S OWN ACTIONS ────────────────────────────────────────────
     WHERE THE PARITY RULE ABOVE WAS BEING BROKEN, and by the shell rather
     than by this file: `Builder` puts *Add a week* and *Progression* in its
     desktop `Toolbar`, and `.pg__builder:has(.pgw) > .wsc{display:none}`
     hides that toolbar below 900px with the note "Progression is reachable
     from the phone's own controls." It was not — `onProgression` had one call
     site, inside the strip that had just been hidden. So the feature that
     replaces thirty-six cells with one form existed only on the shell §13
     says an Indian trainer may not own.

     They are the WEEK's actions and not the program's, which is why they hang
     off the week strip rather than off `.ph`: every one of them is answered
     "week 5", not "this program". */

  /** Add week N+1. `undefined` at the 52-week ceiling. */
  onAddWeek?: () => void;
  /** Open the progression panel — the ladder, written once. */
  onProgression?: () => void;
  /** The desk strip's own chip, on the shell that cannot see the strip. */
  onDuplicateWeek?: () => void;
  /** Copy the week being SHOWN onto another, replacing it.
   *
   *  ONE ARGUMENT, NOT `(from, to)` LIKE `onCopyDayTo`. A repeating week has
   *  no rows of its own, so a `from` handed up from here would have made
   *  `copyWeek(entries, 5, 3)` copy nothing onto week 3 and quietly CLEAR it.
   *  The source is the shell's own `sourceWeek`, which is what the trainer is
   *  looking at either way, so the phone never names it. */
  onCopyWeekTo?: (to: number) => void;
  /** Discard this week's own rows so it repeats week 1 again — the inverse of
   *  `onMakeOwn`, and the pair is what makes law 3 a toggle rather than a
   *  one-way door. Absent on week 1 and on a week that already repeats. */
  onRepeatWeek?: () => void;
  /** Every authored row in the program, for L2's across-weeks comparison.
   *  `entriesForDay` is scoped to the week being shown and cannot answer
   *  "the same day in week 4", which is the question a ladder is written to
   *  be read by. */
  entries: Entry[];

  /**
   * NOTHING HERE WRITES — the certified preview's phone shell.
   *
   * ── ALL THREE LEVELS SURVIVE, AND THAT IS THE POINT ────────────────────
   *
   * The tempting shortcut was to let the preview keep the DESK board at phone
   * widths, and it was live for exactly one pass: `.pgw--read` in `app.css`,
   * written so the screen would not be blank. It reads, and it is not this
   * design — L1's volume bar and muscle summary per day, and *Across weeks* as
   * a line that opens, are the three things a trainer deciding whether to copy
   * an eight-week block actually wants, and none of them are on a day card.
   *
   * So the levels are the same levels: L1 the week, L2 one day, L3 one
   * exercise. What changes is that L3 holds figures instead of steppers, and
   * every menu that would have held only writes is not drawn at all.
   *
   * `covered` still does its job here, because the preview opens the exercise
   * panel over these levels exactly as `Builder` opens its own.
   */
  readOnly?: boolean;
}

export function PhoneProgram(props: PhoneProgramProps) {
  const [day, setDay] = useState<number | null>(null);
  /* THE ROW IS HELD BY UID, NOT BY VALUE.
     FOUND BY RENDERING: holding the `Entry` itself made L3 a SNAPSHOT — the
     stepper's write landed in the model and the sheet went on drawing the copy
     it had captured, so the number never moved and the trainer pressed + four
     times. The lookup is against the live rows every render, so the sheet shows
     what the day shows, and it closes on its own if the row is removed from
     underneath it. */
  /** THE ROW SHEET'S ADDRESS, AND IT IS THREE FIELDS RATHER THAN ONE.
   *  `uid` alone stopped resolving the moment the steppers below it could
   *  write into a repeating week: the first tap makes the week its own
   *  (`ownWeek`) and every row in it is a COPY with a new uid, so the lookup
   *  failed and the sheet the trainer was tapping in closed under them. The
   *  position and the movement are what survive that copy, so they are the
   *  fallback — and only together, because position alone would silently hand
   *  the sheet the next row when this one is deleted, which is the case the
   *  sheet SHOULD close for. */
  const [openRow, setOpenRow] = useState<{
    day: number;
    uid: string;
    at: number;
    exerciseId: string;
  } | null>(null);

  /* ESCAPE / BACK UNWINDS ONE LEVEL AT A TIME — L3, then L2, then nothing. A
     single handler owning the whole ladder, in capture, so the builder's own
     Escape does not also fire and spend two levels on one press.

     AND IT STANDS DOWN WHILE SOMETHING IS OPEN OVER IT, which is the rung above
     this one rather than a special case. FOUND BY RENDERING the exercise picker,
     which is the first surface `Builder` has ever opened over these levels: the
     picker's own capture handler is registered LATER than this one, and among
     capture listeners on the same target the earlier one runs first — so this
     handler's `stopImmediatePropagation` swallowed the press and closed the DAY
     underneath a picker that stayed open. One press, the wrong rung, and the
     surface the trainer was looking at untouched.

     Registration order is not something either file can negotiate, so the fix
     is the guard: while a surface is above these levels the press is not ours to
     spend. `LibraryPanel` then consumes it if it has an inner step, and the
     builder's ladder closes the panel if it does not. */
  const lane = openRow ? props.entriesForDay(openRow.day) : [];
  const found = openRow ? (lane.find(e => e.uid === openRow.uid) ?? null) : null;
  const same = openRow ? (lane[openRow.at] ?? null) : null;
  const live =
    found ?? (openRow && same && same.exerciseId === openRow.exerciseId ? same : null);
  /* AND THE ADDRESS FOLLOWS THE ROW. Adjusted during render, which is React's
     documented pattern for deriving state from changed props and the one this
     codebase uses everywhere an effect would paint a wrong frame first —
     `Schedule.tsx`'s `?new=1`, `Builder`'s baseline. Without it the fallback
     would be re-taken on every single render after a materialisation, and any
     reorder underneath would then move the sheet to another row. */
  if (openRow && live && live.uid !== openRow.uid) {
    setOpenRow({ ...openRow, uid: live.uid });
  }

  useEffect(() => {
    if (props.covered || (day == null && !live)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      if (live) setOpenRow(null);
      else setDay(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [day, live, props.covered]);

  return (
    <div className="wsm">
      {day == null ? (
        <Week {...props} onOpenDay={setDay} />
      ) : (
        <Day
          {...props}
          day={day}
          onBack={() => setDay(null)}
          onNav={setDay}
          onRow={entry =>
            setOpenRow({
              day,
              uid: entry.uid,
              at: props.entriesForDay(day).findIndex(e => e.uid === entry.uid),
              exerciseId: entry.exerciseId,
            })
          }
        />
      )}

      {live && (
        <ExerciseSheet
          entry={live}
          name={props.names[live.exerciseId]}
          repeat={props.repeat}
          readOnly={props.readOnly}
          actions={props}
          onField={props.onField}
          onClose={() => setOpenRow(null)}
        />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── L1 · the week ── */

function Week(props: PhoneProgramProps & { onOpenDay: (day: number) => void }) {
  const dayWord = props.dayWord ?? ordinalDayWord;
  const { days, labels, week, weeks, authored, balance, entriesForDay, freeSlots } = props;
  const [balOpen, setBalOpen] = useState(false);
  /* MORE WEEKS OFF THE RIGHT EDGE. A CSS scroll timeline is inactive on this Chrome (see `.wsm__wkscroll`), so the cue is
     driven from the scroller itself: a right-edge mask while chips are hidden, gone at the end so week 8 is never veiled.
     The observer's first callback sets the initial state — nothing is set synchronously in the effect. */
  const wkRef = useRef<HTMLDivElement>(null);
  const [moreWeeks, setMoreWeeks] = useState(false);
  useEffect(() => {
    const el = wkRef.current;
    if (!el) return;
    const read = () => setMoreWeeks(el.scrollWidth - el.scrollLeft - el.clientWidth > 2);
    el.addEventListener('scroll', read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', read);
      ro.disconnect();
    };
  }, [weeks]);
  const flags = balanceFlags(balance);
  const flagCount = flags.low.length + flags.high.length;
  const maxSets = Math.max(
    0,
    ...days.map(d => dayShape(entriesForDay(d), props.names).sets),
  );

  return (
    <>
      <div className="wsm__hd">
        <div className="wsm__hb">
          <h2 className="wsm__ttl">{props.programName || 'Untitled program'}</h2>
          <p className="wsm__sub">
            {days.length} day{days.length === 1 ? '' : 's'} · {weeks} week
            {weeks === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* ONE ROW THAT SCROLLS. Eight weeks wrapped onto two lines changes the
          strip's height as the block grows, which moves the day tiles under a
          thumb that was reaching for one. */}
      <div className="wsm__wk">
        <span className="wsm__k">Week</span>
        <div className="wsm__wkscroll" ref={wkRef} data-more={moreWeeks ? '' : undefined}>
          {Array.from({ length: weeks }, (_, i) => i + 1).map(w => (
            <button
              key={w}
              className={`chip${authored.has(w) ? '' : ' chip--ghost'}`}
              type="button"
              aria-pressed={w === week}
              onClick={() => props.onWeek(w)}
            >
              {w}
            </button>
          ))}
        </div>
        {/* AND THE WEEK'S OWN CONTROLS, PINNED BESIDE THE CHIPS.
            `.wsm__wkfix` was written and styled for exactly this and rendered
            by nothing, which is how the missing capability hid: the strip
            looked finished. `+` adds a week, `⋮` opens everything else — and
            both sit inside the strip's existing 61px, so the four capabilities
            the phone was missing cost 0px of new chrome on the screen §13
            already measured as the tightest in the app. */}
        {/* NOT DRAWN AT ALL READ-ONLY, rather than drawn empty. Every item in
            `WeekMenuItems` is a write — a progression rule, a copy, making a
            week its own or putting it back to a repeat — so on the preview the
            `+` is already absent (no `onAddWeek`) and the `⋮` would open a
            sheet with nothing in it. The strip keeps its chips, which are the
            control this screen is actually for: *is week 6 different from week
            1* is the question, and the chips answer it. */}
        {!props.readOnly && (
          <div className="wsm__wkfix">
            {props.onAddWeek && (
              <Chip
                ghost
                aria-label={`Add week ${weeks + 1}`}
                onClick={props.onAddWeek}
              >
                <PlusIcon size={13} />
              </Chip>
            )}
            <Sheet
              label={`More actions for week ${week}`}
              title={`Week ${week}`}
              items={close => (
                <WeekMenuItems
                  week={week}
                  weeks={weeks}
                  repeat={props.repeat}
                  actions={props}
                  close={close}
                />
              )}
            />
          </div>
        )}
      </div>

      {/* BALANCE AS ONE LINE, opening to the whole panel. At 360px the panel is
          most of a screen, and the answer a trainer wants nine times out of ten
          is *is anything out of band* — which is a line, not a panel. */}
      <button className="wsm__balb" type="button" aria-expanded={balOpen} onClick={() => setBalOpen(v => !v)}>
        <span className="wsm__ball">Balance</span>
        {flagCount > 0 ? (
          /* AMBER IS FOR ABOVE THE CEILING ONLY. Under the floor is a gap, not a hazard — the panel's own bars already
             say so — and a 3-day circuit plan reading *7 flags* in warning colour called the trainer's own design a fault. */
          <span className={`wsm__balf${flags.high.length === 0 ? ' wsm__balf--gap' : ''}`}>
            {flags.high.length > 0 ? (
              <>
                <WarnIcon size={12} /> {flags.high.length} above the ceiling
                {flags.low.length > 0 ? ` · ${flags.low.length} light` : ''}
              </>
            ) : (
              <>
                {flags.low.length} muscle group{flags.low.length === 1 ? '' : 's'} under {MEV} sets
              </>
            )}
          </span>
        ) : (
          <span className="wsm__balok">{balance.total} sets · in band</span>
        )}
        <span className="wsm__balcv" style={{ transform: balOpen ? 'rotate(180deg)' : undefined }}>
          <ChevronDown size={13} />
        </span>
      </button>
      {balOpen && (
        <div className="wsm__balp">
          <BalancePanel balance={balance} week={week} />
        </div>
      )}

      {days.length === 0 ? (
        <p className="wsm__none">
          {props.readOnly
            ? 'This program has no days laid out.'
            : /* the sentence stays a sentence about SLOTS, which is the first law */
              'No days yet. A day is a slot this program trains — the client’s own calendar decides which weekday it lands on.'}
        </p>
      ) : (
        <div className="wsm__tiles">
          {days.map(d => (
            <Tile
              key={d}
              day={d}
              dayWord={dayWord}
              label={labels[String(d)] ?? ''}
              rows={entriesForDay(d)}
              names={props.names}
              maxSets={maxSets}
              actions={props}
              readOnly={props.readOnly}
              onOpen={() => {
                if (!props.onDesignDay?.(d)) props.onOpenDay(d);
              }}
            />
          ))}
        </div>
      )}

      {props.onAddDay && freeSlots.length > 0 && (
        <div className="wsm__addday">
          <span className="wsadd__k">+ Add a day</span>
          <span className="wsadd__h">
            A day is a slot in the program, not a weekday
            {days.length > 0 ? ` — this one runs on ${days.join(', ')}.` : '.'}
          </span>
          <span className="wsadd__s">
            {freeSlots.map(s => (
              <Chip key={s} onClick={() => props.onAddDay?.(s)}>
                Day {s}
              </Chip>
            ))}
          </span>
        </div>
      )}
    </>
  );
}

function Tile({
  day,
  dayWord,
  label,
  rows,
  names,
  maxSets,
  actions,
  readOnly,
  onOpen,
}: {
  day: number;
  /** `DAY 2` on a blueprint, `TUE` on a client's copy — `PhoneProgram` reads
   *  the default once and hands the same function to every level. */
  dayWord: (day: number) => string;
  label: string;
  rows: Entry[];
  names: Record<string, ExerciseNameWire | undefined>;
  maxSets: number;
  actions: DayActions;
  readOnly?: boolean;
  onOpen: () => void;
}) {
  const { sets, top } = dayShape(rows, names);
  const pct = maxSets > 0 ? (sets / maxSets) * 100 : 0;

  return (
    <section className="wsmt">
      <div className="wsmt__hd">
        <button
          className="wsmt__open"
          type="button"
          onClick={onOpen}
          aria-label={`Open Day ${day}${label ? ` · ${label}` : ''}`}
        >
          <span className="wsmt__t">
            <span className="wsmt__d">{dayWord(day)}</span>
            {/* *Name this day* IS A PROMPT, and read-only there is nothing to
                name it with. An unnamed day on somebody else's program prints
                the slot number and stops — the same call the desk card's own
                name field makes. */}
            {(label || !readOnly) && (
              <span className={`wsmt__nm${label ? '' : ' wsmt__nm--none'}`}>
                {label || 'Name this day'}
              </span>
            )}
          </span>
          <span className="wsmt__fig">{figures(rows)}</span>
          {sets > 0 && (
            <>
              <span className="wsmt__bar">
                <span className="wsmt__f" style={{ width: `${pct.toFixed(1)}%` }} />
              </span>
              <span className="wsmt__mus">
                {top.slice(0, 3).join(' · ')}
                {top.length > 3 ? ` +${top.length - 3}` : ''}
              </span>
            </>
          )}
        </button>
        {/* ASKED FOR, not assumed — `hasDayActions` carries the argument. The
            tile's `⋮` is a 44px target that read-only would open an empty
            sheet from, and a bottom sheet with nothing in it is worse than the
            desk's empty dropdown: it takes the whole width of the screen and
            has to be dismissed. */}
        {hasDayActions(actions) && (
          <span className="wsmt__mw">
            <Sheet
              label={`More actions for Day ${day}${label ? ` · ${label}` : ''}`}
              title={`Day ${day}${label ? ` · ${label}` : ''}`}
              items={close => (
                <DayMenuItems
                  day={day}
                  actions={actions}
                  close={close}
                  workouts={workoutsOf(rows).filter(w => w.id).length > 1 ? workoutsOf(rows).filter(w => w.id) : []}
                />
              )}
            />
          </span>
        )}
      </div>
    </section>
  );
}

/**
 * WHAT THE WEEK STRIP'S `⋮` HOLDS — the desk toolbar's two verbs, plus the two
 * writes that only ever existed in a day card's corner.
 *
 * NOT a second toolbar. `.wsc` is a row of controls that change what the board
 * is SHOWING; these four change the program, and they are gathered because on a
 * phone there is no row to spare and no hover to reveal one. Same grammar as
 * `DayMenuItems` — the constructive items, then the targets, then a separator,
 * then the one that destroys something, with the sentence that says what.
 *
 * ── AND *REPEAT WEEK 1* IS THE LAST HALF OF LAW 3 ON A MENU ─────────────────
 *
 * Its opposite — *Make this week its own* — was here and has gone from every
 * shell: a week becomes its own the moment somebody writes in it (`ownWeek`),
 * so the item had nothing left to do that typing a number does not do already.
 * This one stays, and it is the door that only ever opened one way — a trainer
 * who gave week 5 numbers of its own by mistake had no way back but deleting
 * every row by hand. With the copy now happening on the first keystroke, that
 * mistake is EASIER to make than it was, which is an argument for keeping the
 * item rather than against it. One item, and `commit` already makes it one undo.
 */
function WeekMenuItems({
  week,
  weeks,
  repeat,
  actions,
  close,
}: {
  week: number;
  weeks: number;
  repeat: boolean;
  actions: Pick<
    PhoneProgramProps,
    'onProgression' | 'onDuplicateWeek' | 'onCopyWeekTo' | 'onRepeatWeek'
  >;
  close: () => void;
}) {
  const run = (fn?: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    close();
    fn?.();
  };
  const targets = Array.from({ length: weeks }, (_, i) => i + 1).filter(w => w !== week);

  return (
    <>
      {actions.onProgression && (
        <button
          className="menu__i"
          role="menuitem"
          type="button"
          onClick={run(actions.onProgression)}
        >
          <LadderIcon size={13} />
          Set a progression rule…
        </button>
      )}

      {/* ABOVE THE CHIPS, because it answers the same question they do and
          answers it for more than one week: the chips copy onto ONE week, this
          one copies forward across the block and can ladder the copies. */}
      {actions.onDuplicateWeek && (
        <button
          className="menu__i"
          role="menuitem"
          type="button"
          onClick={run(actions.onDuplicateWeek)}
        >
          <CopyIcon size={13} />
          Duplicate week {week}…
        </button>
      )}

      {/* THE TARGETS ARE CHIPS AND NOT A LIST OF MENU ITEMS, which is the one
          place this menu departs from `DayMenuItems`. A day has at most seven
          slots; a block has up to fifty-two weeks, and fifty-two 48px rows is a
          sheet taller than the phone. `.wsm__wksheet` wraps them at 44px each,
          so twelve weeks is two lines instead of twelve. */}
      {actions.onCopyWeekTo && targets.length > 0 && (
        <>
          <div className="menu__why">Copy week {week} onto… — the week you pick is replaced.</div>
          <div className="wsm__wksheet" role="group" aria-label={`Copy week ${week} onto`}>
            {targets.map(w => (
              <Chip
                key={w}
                role="menuitem"
                onClick={e => {
                  e.stopPropagation();
                  close();
                  actions.onCopyWeekTo?.(w);
                }}
              >
                {w}
              </Chip>
            ))}
          </div>
        </>
      )}

      {!repeat &&
        week > 1 &&
        actions.onRepeatWeek && (
            <>
              <div className="menu__sep" />
              <div className="menu__why">
                Week {week} has exercises of its own. Repeating week 1 discards them.
              </div>
            <button
              className="menu__i menu__i--danger"
              role="menuitem"
              type="button"
              onClick={run(actions.onRepeatWeek)}
            >
              Repeat week 1
            </button>
          </>
        )}
    </>
  );
}

/**
 * THE WEEK PICKER, as a wrapping chip grid — L2's sheet, and the same markup
 * L1's strip draws in a row. Solid is a week somebody authored, ghost is a week
 * that repeats week 1, exactly as on the strip and on the desk, because that
 * distinction is the model and it may not be spelled two ways.
 */
function WeekChips({
  week,
  weeks,
  authored,
  onWeek,
  close,
}: {
  week: number;
  weeks: number;
  authored: Set<number>;
  onWeek: (week: number) => void;
  close: () => void;
}) {
  return (
    <div className="wsm__wksheet" role="group" aria-label="Which week">
      {Array.from({ length: weeks }, (_, i) => i + 1).map(w => (
        <button
          key={w}
          className={`chip${authored.has(w) ? '' : ' chip--ghost'}`}
          role="menuitemradio"
          aria-checked={w === week}
          type="button"
          onClick={e => {
            e.stopPropagation();
            close();
            onWeek(w);
          }}
        >
          {w}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── L2 · one day ── */

function Day(
  props: PhoneProgramProps & {
    day: number;
    onBack: () => void;
    onNav: (day: number) => void;
    onRow: (entry: Entry) => void;
  },
) {
  const { day, days, labels, week, weeks, repeat, entriesForDay, names } = props;
  const dayWord = props.dayWord ?? ordinalDayWord;
  const rows = entriesForDay(day);
  const label = labels[String(day)] ?? '';
  const i = days.indexOf(day);
  const prev = i > 0 ? days[i - 1] : null;
  const next = i >= 0 && i < days.length - 1 ? days[i + 1] : null;
  const [cmpOpen, setCmpOpen] = useState(false);
  /* Law 3 again: only weeks with something of their own get a column, because
     giving the repeats one would draw six identical columns and make a block
     that progresses look flat. `authoredWeeks` always counts week 1. */
  const compared = [...props.authored].sort((a, b) => a - b);

  return (
    <>
      {/* THREE CHEVRONS, TWO OF THEM IDENTICAL — the defect phase 2d measured
          and the reason this row is shaped rather than merely spaced. It read
          `‹ | DAY 1 Upper A | ‹ › ⋮`, and at 390px the far-left `‹` sat at x=4
          while *previous day* sat at x=245: same glyph, same 44px box, same
          colour, **241px apart**, meaning two different things. Nielsen #4 —
          and the one a trainer reaches for by mistake takes them out of the day
          they are editing.

          Two changes, and neither costs a pixel of height. LEAVING is a word,
          because it is the only control here that changes which LEVEL you are
          on and a word is what distinguishes a level change from a step within
          one. MOVING is a pair, in one bordered box, because `‹ ›` read
          together are unambiguous in a way either is alone — the border is what
          says "these two are one control, and it is not the one on the left". */}
      <div className="wsm__bar">
        <button className="wsm__back" type="button" onClick={props.onBack}>
          <ChevronLeft size={15} />
          Week
        </button>
        <span className="wsm__bt">
          <span className="wsm__bd">{dayWord(day)}</span>
          {/* the tile's rule, one level down */}
          {(label || !props.readOnly) && (
            <span className={`wsm__bn${label ? '' : ' wsm__bn--none'}`}>
              {label || 'Name this day'}
            </span>
          )}
        </span>
        {/* THE NEXT DAY IS IN THE HEADER — what a swipe pager was good at,
            without the blind swipe. */}
        <span className="wsm__nav" role="group" aria-label="Move between days">
          <button
            className="wsm__ic"
            type="button"
            disabled={prev == null}
            aria-label={prev == null ? 'No earlier day' : `Day ${prev}`}
            onClick={() => prev != null && props.onNav(prev)}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="wsm__ic"
            type="button"
            disabled={next == null}
            aria-label={next == null ? 'No later day' : `Day ${next}`}
            onClick={() => next != null && props.onNav(next)}
          >
            <ChevronRight size={16} />
          </button>
        </span>
        {hasDayActions(props) && (
          <Sheet
            label={`More actions for Day ${day}${label ? ` · ${label}` : ''}`}
            title={`Day ${day}${label ? ` · ${label}` : ''}`}
            items={close => (
              <DayMenuItems
                day={day}
                actions={props}
                close={close}
                workouts={workoutsOf(props.entriesForDay(day)).filter(w => w.id)}
              />
            )}
          />
        )}
      </div>

      {/* THE WEEK, ON THE DAY SHEET — and it is a CONTROL now rather than the
          sentence it has been printing. `.wsm__wkb` and `.wsm__wksheet` were
          written for this and rendered by nothing; `.wsm__wkb`'s own comment
          states the finding it was written from — "L2 had no week control at
          all, so 'the same day next week' meant back to L1, change the week,
          find the day again — three taps to lose your place, on the comparison
          this whole redesign exists to make easy." It is the same 46px line. */}
      <div className="wsm__sub2">
        {weeks > 1 ? (
          <Sheet
            className="wsm__wkb"
            label={`Week ${week} — show another week`}
            title="Which week"
            face={
              <>
                Week {week}
                <ChevronDown size={12} />
              </>
            }
            items={close => (
              <WeekChips
                week={week}
                weeks={weeks}
                authored={props.authored}
                onWeek={props.onWeek}
                close={close}
              />
            )}
          />
        ) : (
          <span>Week {week}</span>
        )}
        <span>
          {figures(rows)}
          {repeat ? ' · repeats week 1' : ''}
        </span>
      </div>

      {/* AND THE COMPARISON THE LADDER IS WRITTEN TO BE READ BY. On the desk it
          is the open day's second tab; here it is a line that opens, for the
          reason `.wsm__balb` gives for balance — at 360px the table is most of
          a screen, and the question is *is the bench going up*, which is a
          glance rather than a panel.

          IT COSTS 0px UNTIL IT HAS SOMETHING TO SAY. One authored week means
          every other week repeats it, so there is nothing to compare and the
          line is not drawn at all — which is the ordinary state of a program
          nobody has laddered yet, and the state this whole phase changes. */}
      {compared.length > 1 && (
        <>
          <button
            className="wsm__cmpb"
            type="button"
            aria-expanded={cmpOpen}
            onClick={() => setCmpOpen(v => !v)}
          >
            <span className="wsm__ball">Across weeks</span>
            <span className="wsm__balok">
              Day {day} in weeks {compared.join(', ')}
            </span>
            <span className="wsm__balcv">
              <ChevronDown size={13} />
            </span>
          </button>
          {cmpOpen && (
            <div className="wsm__cmpp">
              <AcrossWeeks
                day={day}
                week={week}
                entries={props.entries}
                authored={compared}
                names={names}
                readOnly={props.readOnly}
              />
            </div>
          )}
        </>
      )}

      <div className="wsm__body">
        {rows.length === 0 ? (
          <p className="wsm__none">Nothing on this day.</p>
        ) : (
          /* LAW 5 ON THE PHONE — the containers are drawn as HEADINGS rather
             than as boxes, and that is the one place the two shells part.
             `WorkoutCard`'s box exists so a session can be picked up and
             dropped on another day; there is no drag here and no room for a
             second border inside a 360px card, so what survives is the thing a
             reader needs: where one session stops and the next begins. The
             actions are the day's `⋯` and the row's, unchanged. */
          workoutsOf(rows).flatMap((workout, _wi, all) => [
            all.length > 1 || workout.name ? (
              <p className="wsm__wkh" key={`h-${workout.id}`}>
                {workout.name || label || `Workout ${workout.ordinal}`}
                <span>{workoutFigures(workout.entries)}</span>
              </p>
            ) : null,
            ...workout.blocks.map(block => {
            const grouped = block.entries.length > 1;
            const rest = block.entries.find(e => e.restSeconds)?.restSeconds ?? null;
            const inner = block.entries.map((entry, n) => (
              <PhoneRow
                key={entry.uid}
                entry={entry}
                ordinal={ordinalLabel(block, n)}
                name={names[entry.exerciseId]?.name}
                groupRest={grouped}
                onOpen={() => props.onRow(entry)}
              />
            ));
            if (!grouped) return <div key={block.entries[0].uid}>{inner}</div>;
            return (
              <div className="wsd__grp" key={block.entries[0].uid}>
                {inner}
                <p className="wsd__gr">
                  <b>Superset</b>
                  {rest ? ` · ${rest}s rest after the round` : ' · no rest set'}
                </p>
              </div>
            );
            }),
          ])
        )}
      </div>

      {/* THE FOOT IS THE DAY'S ONE VERB, so read-only there is no foot. Not an
          empty `.wsm__ft` — it carries 12px of padding and a top rule, which
          would draw a band under the last exercise announcing a control that
          is not there. */}
      {/* AND THE FOOT IS THE SAME VERB ON EVERY WEEK. A repeating one drew
          *Make this week its own* here; the week makes itself its own on the
          first write now (`ownWeek`), so the foot offers the thing the trainer
          came for. */}
      {!props.readOnly && (
        <div className="wsm__ft">
          <Button variant="secondary" onClick={() => props.onAdd(day)}>
            + Add exercise
          </Button>
        </div>
      )}
    </>
  );
}

/**
 * THE ROW IS THE BOARD'S ROW, and tapping it opens the exercise rather than a
 * menu — because on a phone the commonest thing a trainer wants from a row is
 * the numbers, and a menu between them and it is a tap spent on nothing.
 */
function PhoneRow({
  entry,
  ordinal,
  name,
  groupRest,
  onOpen,
}: {
  entry: Entry;
  ordinal: string;
  name?: string;
  groupRest: boolean;
  onOpen: () => void;
}) {
  /* THE NUMBERS ONLY — `DayCard`'s row made this same correction on the desk
     and this renderer was the half that did not get it.

     `prescribe` appends `entry.notes`, and `.wsd__p` is `white-space:nowrap`,
     deliberately, so `4 × 6 · 150s rest` cannot break across two lines. On a
     copy with a cue on it that cell wanted **778px inside a 338px row** at
     390px, so four of six rows were CUT mid-sentence — and cut invisibly:
     `.main` is `overflow:hidden`, so `documentElement.scrollWidth` reported
     zero the whole time and every gate this project has passed over it.

     A cue is a sentence and a prescription is one token. They cannot share a
     cell, and on a phone the cue is the more valuable half: it is the one thing
     on the row that was written for this client. */
  const parts = prescribe({ ...entry, notes: null }, groupRest);
  const label = name ?? 'Exercise not in your library';
  return (
    <button
      className="wsd__r wsd__r--tap"
      type="button"
      onClick={onOpen}
      /* The cue rides in the accessible name, where it always did — it is part
         of the instruction however the row chooses to draw it. */
      aria-label={`${label} — ${partsToText(parts) || 'no prescription set'}${
        entry.notes ? `. ${entry.notes}` : ''
      }`}
    >
      <span className="wsd__o">{ordinal}</span>
      <span className="wsd__n">{label}</span>
      <span className="wsd__p">
        {parts.map((p, i) => (
          <PartText key={i} part={p} />
        ))}
      </span>
      {entry.notes ? <span className="wsd__note">{entry.notes}</span> : null}
    </button>
  );
}

/* ────────────────────────────────────────────────────── L3 · one exercise ── */

function ExerciseSheet({
  entry,
  name,
  repeat,
  readOnly,
  actions,
  onField,
  onClose,
}: {
  entry: Entry;
  name?: ExerciseNameWire;
  repeat: boolean;
  readOnly?: boolean;
  actions: DayActions;
  onField: (entry: Entry, field: NumField, value: number) => void;
  onClose: () => void;
}) {
  const label = name?.name ?? 'This exercise';
  const timed = entry.durationSeconds != null;
  /* READ-ONLY, L3 STILL EARNS ITS TAP, and this was the level most at risk of
     being cut. L2's row already prints `3 × 10 · 90s rest`, so a sheet that
     only repeated it would be a tap spent on nothing.
     What it adds is the two things the row cannot hold: the four numbers
     SPLIT AND LABELLED — *Load — the starting weight: —* is how a trainer
     learns the blueprint sets no load, which `3 × 10 · 90s rest` does not say
     at all — and *What Goblet Squat is*, which is the one row action that
     survives read-only and has no other door on a phone. */

  return (
    <>
      <div className="wsm__scrim" onClick={onClose} role="presentation" />
      <div className="wsmx" role="dialog" aria-modal="true" aria-label={label}>
        <span className="wsmx__grab" aria-hidden="true" />
        <div className="wsmx__hd">
          <span className="wsmx__hb">
            <span className="wsmx__t">{label}</span>
            <span className="wsmx__m">
              {[...new Set([name?.muscleGroup, name?.target, name?.equipment].filter(Boolean))].join(' · ')}
            </span>
          </span>
          <button className="wsm__ic" type="button" aria-label="Close" onClick={onClose}>
            <ChevronDown size={16} />
          </button>
        </div>

        <div className="wsmx__b">
          {/* THE CUE, AT L3, AND IT HAD NO DOOR ON A PHONE AT ALL.
              The desk editor row used to carry `· your note` with the sentence
              in a `title`, on the reasoning that *a cue is a sentence and that
              is a metadata line*, so it lived on the exercise info panel. On a
              phone that panel is L3's row menu, so the trainer's own
              instruction for this client was TWO taps below a row that had just
              clipped it — and the desk has since drawn the sentence too, for
              the same reason read the other way round.

              Here it is first, above the numbers: this sheet is the phone's
              answer to *what does this row say*, and the cue is the half of
              that the library cannot supply. */}
          {entry.notes && <p className="wsmx__cue">{entry.notes}</p>}
          {/* NO *MAKE IT ITS OWN WEEK FIRST* — the steppers below are live on
              every week, and the first tap on one is what makes the week its
              own. See `ownWeek`. */}
          {readOnly ? (
            <>
              {/* THE REPEAT NOTE LOSES ITS SECOND SENTENCE and keeps its first.
                  *Make it its own week first* is an instruction; *these are
                  week 1's numbers* is a fact, and it is the fact that explains
                  why the four figures below are the ones they are. */}
              {repeat && (
                <p className="wsmx__note">
                  This week repeats week 1, so these are week 1&rsquo;s numbers.
                </p>
              )}
              <Figure label="Sets" entry={entry} field="sets" />
              <Figure label={timed ? 'Hold' : 'Reps'} entry={entry} field="reps" />
              <Figure label="Load" hint="the starting weight" entry={entry} field="load" />
              <Figure label="Rest" entry={entry} field="rest" />
            </>
          ) : (
            <>
              <Step label="Sets" entry={entry} field="sets" onField={onField} />
              <Step
                label={timed ? 'Hold' : 'Reps'}
                entry={entry}
                field="reps"
                onField={onField}
              />
              <Step label="Load" hint="the starting weight" entry={entry} field="load" onField={onField} />
              <Step label="Rest" entry={entry} field="rest" onField={onField} />
            </>
          )}

          {hasRowActions(actions) && (
            <>
              <div className="wsmx__sep" />
              <RowMenuItems entry={entry} name={label} actions={actions} close={onClose} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * ONE FIGURE — the stepper with its two buttons taken out.
 *
 * `.wsmx__f` and `.wsmx__fl` are shared, so the label column and the row's
 * height are the editable sheet's: read-only L3 is the same four lines in the
 * same places, which is what makes it the same screen. Only `.wsmx__st` — the
 * bordered `− value +` box — is replaced, by the value alone.
 *
 * `null` is `—` here for the identical reason it is there: a bodyweight row has
 * no load and a held row has no reps, and a zero would be a claim the blueprint
 * does not make. There is no `disabled` anything, because there is no control:
 * `Step`'s dead buttons say *this number cannot be set*, and on a program the
 * trainer does not own no number can be, which the header says once.
 */
function Figure({
  label,
  hint,
  entry,
  field,
}: {
  label: string;
  hint?: string;
  entry: Entry;
  field: NumField;
}) {
  const [key] = fieldOf(entry, field);
  const value = entry[key];
  const dead = typeof value !== 'number';
  const unit =
    key === 'targetLoad' ? ' kg' : key === 'restSeconds' || key === 'durationSeconds' ? 's' : '';

  return (
    <div className="wsmx__f">
      <span className="wsmx__fl">
        {label}
        {hint && <span className="wsmx__fh">{hint}</span>}
      </span>
      <span className={`wsmx__rv${dead ? ' wsmx__v--off' : ''}`}>
        {dead ? '—' : `${key === 'targetLoad' ? kg(value) : value}${unit}`}
      </span>
    </div>
  );
}

/**
 * ONE STEPPER. `null` is not zero — a bodyweight row has no load and a held row
 * has no reps — so the value reads `—` and BOTH buttons go dead rather than
 * offering to invent a number.
 */
function Step({
  label,
  hint,
  entry,
  field,
  onField,
}: {
  label: string;
  hint?: string;
  entry: Entry;
  field: NumField;
  onField: (entry: Entry, field: NumField, value: number) => void;
}) {
  const [key, step, min] = fieldOf(entry, field);
  const value = entry[key];
  const dead = typeof value !== 'number';
  const unit = key === 'targetLoad' ? ' kg' : key === 'restSeconds' || key === 'durationSeconds' ? 's' : '';
  const shown = dead ? '—' : `${key === 'targetLoad' ? kg(value) : value}${unit}`;
  const atMin = !dead && value <= min;

  return (
    <div className="wsmx__f">
      <span className="wsmx__fl">
        {label}
        {hint && <span className="wsmx__fh">{hint}</span>}
      </span>
      <span className="wsmx__st">
        <button
          className="wsmx__sb"
          type="button"
          disabled={dead || atMin}
          aria-label={`Less ${label.toLowerCase()}`}
          onClick={() => !dead && onField(entry, field, value - step)}
        >
          −
        </button>
        <span className={`wsmx__v${dead ? ' wsmx__v--off' : ''}`} aria-live="polite">
          {shown}
        </span>
        <button
          className="wsmx__sb"
          type="button"
          disabled={dead}
          aria-label={`More ${label.toLowerCase()}`}
          onClick={() => !dead && onField(entry, field, value + step)}
        >
          +
        </button>
      </span>
    </div>
  );
}

/**
 * A MENU BECOMES A BOTTOM SHEET on a phone. A 160px dropdown anchored to a row
 * is a dropdown a thumb cannot hit, and it opens off the bottom of the screen
 * for the last row of a long day. Same items, same order — see `menus.tsx`.
 */
function Sheet({
  label,
  title,
  items,
  face,
  className = 'wsd__more',
}: {
  label: string;
  title: string;
  items: (close: () => void) => React.ReactNode;
  /** What the trigger draws. Defaults to the `⋮` glyph.
   *
   *  THE TRIGGER IS A PARAMETER, not a second component, because the scrim, the
   *  Escape handler and the `.menu`-into-a-sheet restyle are the whole of this
   *  thing and none of them care what opened it. L2's week control is a word
   *  and a chevron rather than a dot column — that is the only difference, and
   *  a copy of this file's Escape ladder to express it would be the drift the
   *  shared `menus.tsx` exists to prevent. */
  face?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  return (
    <>
      <button
        className={className}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {face ?? <DotsIcon size={15} />}
      </button>
      {open && (
        <>
          <div className="wsm__scrim" onClick={() => setOpen(false)} role="presentation" />
          {/* `.menu` UNCHANGED — the shell restyles the shared renderer's own
              markup into a bottom sheet rather than the phone growing a second
              menu component. Four CSS rules, and the items cannot drift. */}
          <span className="menu" role="menu" aria-label={title}>
            {items(() => setOpen(false))}
          </span>
        </>
      )}
    </>
  );
}
