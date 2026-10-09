'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import {
  EFFORT_KINDS,
  LOAD_KINDS,
  effortOption,
  effortTakesNumber,
  loadOption,
  loadTakesNumber,
  type DraftExercise,
  type DraftSet,
  type KindOption,
  setsSummary,
} from '@/lib/workouts/draft';
import { parseRest, restLabel } from '@/lib/workouts/estimate';
import { plainText } from '@/lib/text/markup';
import { Markup } from '@/web-components/ui/Markup';
import { useEscapeGuard } from '@/web-components/ui/Modal';
import { AltIcon, CheckIcon, ChevronDown, CloseIcon, LinkIcon, TrashIcon } from '../Icons';
import { More } from '../week/DayCard';
import { Grip, NoteIcon } from './Icons';
import { CARD_MIME } from './dnd';
import { ExerciseSheet, type SheetPosition } from './ExerciseSheet';

/** Under 900px — the builder's own phone line. Read through the store so the server render and the first client render agree. */
function usePhone(): boolean {
  return useSyncExternalStore(
    cb => {
      const m = window.matchMedia('(max-width: 900px)');
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia('(max-width: 900px)').matches,
    () => false,
  );
}

/**
 * ONE MOVEMENT ON THE CANVAS, with its sets written out.
 *
 * ── THE SETS ARE LINES, NOT A COUNT AND A PAIR OF NUMBERS ───────────────────
 *
 * The week board's row prints four figures — sets, reps, load, rest — one line
 * per movement, which is the right shape for a WEEK: a trainer scanning five days
 * is asking *how much of this is there*, and `4 × 6 @ 60` answers it in a line.
 * This dialog is one session, and the question inside a session is the opposite
 * one: *what happens on set three*. A pyramid, a drop set and a top set with
 * back-offs are all normal here and none of them can be said in that grid — the
 * week sheet needs a whole second model (`setDetail`) to express any of them.
 *
 * So each set is a line and the count is what their number is. The cost is
 * height, and it is paid back by the head, which states the count as one chip a
 * trainer can type over: four sets of the same thing is still one number typed
 * once.
 *
 * ── NO THUMBNAIL AND NO AUDIO NOTE ──────────────────────────────────────────
 *
 * Both are in the design this was drawn from and both are deliberately absent.
 * The poster for the same reason `LibraryPane` has none — the library is
 * text-only and V22 dropped the media columns, so a still frame here is a box
 * drawn over a file that does not exist. The microphone because there is no
 * audio store, no player and no transcript anywhere in this product; the note
 * beside it is real and writes to a column that exists.
 */
export interface CardActions {
  onSetCount: (uid: string, count: number) => void;
  onAddSet: (uid: string) => void;
  onRemoveSet: (uid: string, setUid: string) => void;
  onPatchSet: (uid: string, setUid: string, patch: Partial<Omit<DraftSet, 'uid'>>) => void;
  /** THE NOTE DIALOG IS THE BUILDER'S, NOT THIS CARD'S — it is a surface over a
   *  surface, and the Escape ladder only works if whoever owns both rungs owns
   *  the state (`ModalHost`'s `covered`). So the card asks and the builder
   *  opens it. */
  onNote: (uid: string, setUid: string) => void;
  /** THE ALTERNATE'S DIALOG IS THE BUILDER'S TOO, and for the reason stated
   *  one field up: whoever owns both rungs of the Escape ladder owns the
   *  state. */
  onAlternates: (uid: string) => void;
  onRemove: (uid: string) => void;
  onUnchain: (uid: string) => void;
  /** One place up or down. The phone's alternative to dragging. */
  onMove: (uid: string, direction: -1 | 1) => void;
  /** Make this movement and the one after it a circuit. */
  onChainNext: (uid: string) => void;
  /** Put a heading above this movement. The phone's way to place one without dragging. */
  onHeading: (uid: string) => void;
}

export function ExerciseCard({
  entry,
  ordinal,
  chained,
  actions,
  onCarry,
  carrying,
  chainTarget,
  position,
}: {
  /** Where this card sits in the whole workout, for the phone sheet's Move up / Move down. */
  position: SheetPosition;
  entry: DraftExercise;
  ordinal: string;
  /** Drawn inside a circuit — the head loses its ✕ to the chain's own menu and
   *  gains a way out of the group. */
  chained: boolean;
  actions: CardActions;
  onCarry: (uid: string | null) => void;
  carrying: boolean;
  /** The drag would chain onto this card if it were let go now. */
  chainTarget: boolean;
}) {
  /* SHUT ON ARRIVAL. A day is four or five exercises deep and each open card
     is three or more set rows tall, so an all-open editor opens on a wall the
     trainer has to scroll past to see what the day even contains. The list of
     names is the overview; the sets are what you come for after picking one. */
  const [open, setOpen] = useState(false);
  /* ON A PHONE A TAP OPENS THE EXERCISE SHEET and the card never unfolds in place. */
  const phone = usePhone();
  const [sheet, setSheet] = useState(false);
  const nameBtn = useRef<HTMLButtonElement>(null);
  const [armed, setArmed] = useState(false);

  /* The same disarm `LibraryRow` needs, and for the same reason: a grip
     pressed and released without a drag would otherwise leave the card
     draggable under a pointer that has moved on. */
  useEffect(() => {
    if (!armed) return;
    const up = () => setArmed(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [armed]);

  const klass = [
    'wke',
    carrying ? 'wke--lifted' : null,
    chainTarget ? 'wke--onto' : null,
    open ? null : 'wke--shut',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={klass}
      /* `data-block` IS THE DROP TARGET, and it is on the card rather than on
         the circuit that may wrap it — chaining is a gesture aimed at one
         movement, and `locateWorkoutDrop` measures the edges off these. */
      data-block={entry.uid}
      draggable={armed || undefined}
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(CARD_MIME, entry.uid);
        e.dataTransfer.setData('text/plain', entry.name);
        onCarry(entry.uid);
      }}
      onDragEnd={() => {
        setArmed(false);
        onCarry(null);
      }}
    >
      <div className="wke__hd">
        <span
          className="wke__g"
          aria-hidden="true"
          title={`Move ${entry.name}, or drop it onto another movement to chain them`}
          onMouseDown={() => setArmed(true)}
        >
          <Grip />
        </span>
        <span className="wke__o">{ordinal}</span>

        <SetCount
          count={entry.sets.length}
          name={entry.name}
          onCount={n => actions.onSetCount(entry.uid, n)}
        />

        {/* THE NAME IS THE HANDLE. The chevron at the far right is 28px of a
            head that is a whole card wide, and a shut card is asking to be
            opened by the one thing on it a trainer is reading — the movement.
            Both stay: the chevron is the affordance, the name is the target. */}
        <button
          className="wke__n"
          type="button"
          ref={nameBtn}
          aria-expanded={phone ? sheet : open}
          onClick={() => (phone ? setSheet(true) : setOpen(v => !v))}
        >
          {entry.name}
          {entry.meta && <span className="wke__mt">{entry.meta}</span>}
          {/* THE PHONE'S READING of the sets: one line, where the desk shows a count chip and a panel. */}
          <span className="wke__sum">{setsSummary(entry.sets)}</span>
          {/* THE SAME LINE `DayColumn` DRAWS, word for word — *or* is what a
              trainer says, and a workout template and a program row that carry
              the same fact must not read as two different ones.

              THE FIRST ONE, AND A COUNT FOR THE REST. The list is the trainer's
              ranking (see `DraftExercise.alternatives`), so its head is the
              substitute they would actually give and the only one worth the
              width on a card that has a name to print. `+2` says the others are
              there; the panel is where they are read. */}
          {entry.alternatives.length > 0 && (
            <span className="wke__alt">
              <AltIcon />
              or <b>{entry.alternatives[0].name}</b>
              {entry.alternatives.length > 1 && (
                <span className="wke__altn">+{entry.alternatives.length - 1}</span>
              )}
            </span>
          )}
        </button>

        <More
          label={`More actions for ${entry.name}`}
          /* ── TWO ITEMS, AND THE THREE THAT WERE HERE ARE GONE ──────────
             This menu was five long and three of them were a second way to do
             something the card already does in front of the trainer:

             · *Add a set* — the `+ Add a new set` button sits at the foot of
               the set list, and the `3 ×` chip in this very head takes a typed
               count, which is the faster of the two by a distance.
             · *Hold for time instead* / *Prescribe a load* — every set line
               carries both kind pickers. They were a bulk shortcut, and a
               shortcut is not worth a third of a menu.

             What is left is the two things that CANNOT be done anywhere else on
             the card, which is the test a menu item has to pass. *Request a
             video* from the design this was drawn from is not among them: there
             is no video store, no upload and no request table anywhere in this
             product, and `LibraryPane`'s own note refuses the thumbnail for the
             same reason. A menu item over a thing that does not exist is worse
             than no menu item. */
          items={close => (
            <>
              <button
                className="menu__i"
                role="menuitem"
                type="button"
                onClick={() => {
                  actions.onAlternates(entry.uid);
                  close();
                }}
              >
                <AltIcon size={14} />
                Alternative exercises
                {/* THE COUNT, not a tick: it is how many approved swaps this
                    movement has, and at one it still answers the question the
                    trainer opened the menu with — *did I set any?* */}
                {entry.alternatives.length > 0 && (
                  <span className="menu__n">{entry.alternatives.length}</span>
                )}
              </button>
              {chained && (
                /* KEPT, AND ONLY INSIDE A CIRCUIT. It is not a duplicate of
                   anything: a chained card gives up its ✕ to the group, so
                   this item is the one way out of a circuit that does not
                   involve dragging the card somewhere else. It is drawn on the
                   two or three cards that are in one and on none of the rest. */
                <button
                  className="menu__i"
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    actions.onUnchain(entry.uid);
                    close();
                  }}
                >
                  <LinkIcon size={13} />
                  Take it out of the circuit
                </button>
              )}
              <button
                className="menu__i menu__i--danger"
                role="menuitem"
                type="button"
                onClick={() => {
                  actions.onRemove(entry.uid);
                  close();
                }}
              >
                <TrashIcon size={14} />
                Remove from this workout
              </button>
            </>
          )}
        />

        <button
          className="wke__fold"
          type="button"
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${entry.name}`}
          onClick={() => setOpen(v => !v)}
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {/* IT IS ALWAYS RENDERED NOW, and `data-open` is what opens it.

          It was `{open && …}` — a hard mount — so the sets appeared and vanished
          between two frames while the chevron beside them took 240ms to turn.
          One control, two speeds, and the faster half is the one that moves the
          page: a card three set-rows deep drops everything under it by ~150px
          with nothing connecting the press to the movement.

          The panel cannot animate its way in if it is not there to animate, so
          the mount goes and the state becomes an attribute. `.wke__sets` is a
          `grid-template-rows: 0fr → 1fr` wrapper — `.stp__rec` in `app.css`
          names that as the right instrument for exactly this case, a list too
          SHORT for the `max-height` ceiling it argues for itself: one to five
          set rows, and a guessed ceiling would ease toward a number the content
          never reaches and spend the last third of the curve doing nothing.

          `display` stays in the transition (`allow-discrete`), which is what
          keeps a shut card's inputs out of the tab order and the accessibility
          tree — `max-height:0` alone would leave a trainer tabbing off the
          chevron into a panel that is not on the screen. */}
      {sheet && (
        <ExerciseSheet
          entry={entry}
          position={position}
          chained={chained}
          actions={actions}
          onClose={() => {
            setSheet(false);
            /* back to the movement that was opened, not wherever focus was before the tap */
            queueMicrotask(() => nameBtn.current?.focus({ preventScroll: true }));
          }}
        />
      )}

      <div className="wke__sets" data-open={open ? 'true' : 'false'}>
        {/* ONE child, and it is load-bearing: `grid-template-rows:0fr` sizes the
            FIRST row, so a panel with six children collapses one of them and
            leaves five at `auto`. The wrapper is also what carries the
            `overflow:hidden` the collapse clips against, and the padding — left
            on the outer box it would not collapse with it. */}
        <div className="wke__setsin">
          {entry.sets.map((set, i) => (
            <SetLine
              key={set.uid}
              n={i + 1}
              set={set}
              name={entry.name}
              /* ONE SET IS NOT A SET THAT CAN BE REMOVED. The ✕ would delete
                 the last line of a movement that is still on the canvas,
                 leaving a card with a head and nothing under it — removing the
                 MOVEMENT is what the head's menu is for, and it says so. */
              onRemove={entry.sets.length > 1 ? () => actions.onRemoveSet(entry.uid, set.uid) : null}
              onPatch={patch => actions.onPatchSet(entry.uid, set.uid, patch)}
              onNote={() => actions.onNote(entry.uid, set.uid)}
            />
          ))}
          <button className="wke__add" type="button" onClick={() => actions.onAddSet(entry.uid)}>
            <span aria-hidden="true">+</span> Add a new set
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * THE COUNT CHIP — `3 ×`, typed over.
 *
 * It commits on blur and on Enter rather than on every keystroke, which is the
 * rule `NumCell` establishes and the reason is sharper here: typing `12` over
 * `3` passes through `1`, and a commit per keystroke would delete eleven
 * written sets on the way to twelve, with the undo stack holding the wreckage.
 */
function SetCount({
  count,
  name,
  onCount,
}: {
  count: number;
  name: string;
  onCount: (n: number) => void;
}) {
  const shown = String(count);
  const [draft, setDraft] = useState(shown);
  const [focused, setFocused] = useState(false);

  /* Adjusted during render, never in an effect (trap 21) — the model is the
     authority whenever this box is not being typed into, so an undo or a
     dropped set reaches it. */
  const [last, setLast] = useState(shown);
  if (shown !== last) {
    setLast(shown);
    if (!focused) setDraft(shown);
  }

  function commit() {
    setFocused(false);
    const n = Number(draft);
    if (!Number.isFinite(n)) {
      setDraft(shown);
      return;
    }
    onCount(n);
  }

  return (
    <span className="wke__c">
      <input
        className="wke__cin"
        type="text"
        inputMode="numeric"
        value={draft}
        autoComplete="off"
        aria-label={`How many sets of ${name}`}
        onFocus={() => setFocused(true)}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            /* Consumed, so one Escape abandons the edit rather than also
               closing the dialog behind it. */
            e.stopPropagation();
            setFocused(false);
            setDraft(shown);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <span className="wke__cx" aria-hidden="true">
        ×
      </span>
    </span>
  );
}

/**
 * One set line: what it is measured in, the two numbers, the rest, the tempo,
 * a note, and the way to take it off.
 *
 * EXPORTED FOR `AltPanel`, which writes the same seven controls against a
 * substitute's sets. A second copy of this row would be a second place for the
 * rest parser, the kind pickers and the value-clears-with-the-unit rule to
 * drift, and a substitute whose lines behaved differently from the movement's
 * is the one thing that panel must not produce.
 */
export function SetLine({
  n,
  set,
  name,
  onRemove,
  onPatch,
  onNote,
}: {
  n: number;
  set: DraftSet;
  name: string;
  onRemove: (() => void) | null;
  onPatch: (patch: Partial<Omit<DraftSet, 'uid'>>) => void;
  /** `null` draws no ✎ and no cue. A substitute's prose is written once for the
   *  whole substitute — `AltPanel`'s *Add instructions* — rather than per set,
   *  so there is nothing for this button to open there and a button that opens
   *  nothing is worse than a gap. */
  onNote: (() => void) | null;
}) {
  const load = loadOption(set.loadKind);
  const effort = effortOption(set.effortKind);

  return (
    <div className="wks">
      <span className="wks__n">{n}</span>

      <span className="wks__k">
        <KindPicker
          options={LOAD_KINDS}
          value={set.loadKind}
          label={`What set ${n} of ${name} is loaded with`}
          /* THE VALUE GOES WITH THE KIND. `60` meant kilograms and means
             nothing as an RPE, so switching clears it rather than carrying a
             number across into a unit nobody typed it in. */
          onPick={kind => onPatch({ loadKind: kind, loadValue: null })}
        />
        {/* BODYWEIGHT DRAWS NO BOX, and that is `NumCell`'s rule restated: a
            dead field is text, not a disabled input. There is nothing to set,
            so there is nothing to type into and nothing to grey out. */}
        {loadTakesNumber(set.loadKind) ? (
          <NumBox
            value={set.loadValue}
            unit={load.unit}
            label={`${load.label} for set ${n} of ${name}`}
            onValue={v => onPatch({ loadValue: v })}
          />
        ) : (
          <span className="wks__off">—</span>
        )}
      </span>

      <span className="wks__k">
        <KindPicker
          options={EFFORT_KINDS}
          value={set.effortKind}
          label={`What set ${n} of ${name} is counted in`}
          onPick={kind => onPatch({ effortKind: kind, effortValue: null })}
        />
        {/* AND MAX DRAWS NONE EITHER, for the same reason: *as much as you can*
            is the whole prescription, and a box beside it asks for a number
            that would contradict it. */}
        {effortTakesNumber(set.effortKind) ? (
          <NumBox
            value={set.effortValue}
            unit={effort.unit}
            label={`${effort.label} for set ${n} of ${name}`}
            onValue={v => onPatch({ effortValue: v })}
          />
        ) : (
          <span className="wks__off">MAX</span>
        )}
      </span>

      <span className="wks__k wks__k--rest">
        <span className="wks__lb">Rest</span>
        <TextBox
          value={restLabel(set.restSeconds)}
          placeholder="00:00"
          label={`Rest after set ${n} of ${name}`}
          /* `1:30` and `90` both mean ninety seconds. `parseRest` returning
             null is *that is not a rest*, and the box goes back to what it
             held rather than writing a zero nobody typed. */
          onText={text => {
            const seconds = parseRest(text);
            if (seconds !== null) onPatch({ restSeconds: seconds });
            return seconds !== null;
          }}
        />
      </span>

      <span className="wks__k wks__k--tempo">
        <span className="wks__lb">Tempo</span>
        <TextBox
          value={set.tempo ?? ''}
          placeholder="0-0-0-0"
          label={`Tempo for set ${n} of ${name}`}
          onText={text => {
            onPatch({ tempo: text.trim() || null });
            return true;
          }}
        />
      </span>

      {onNote ? (
        <button
          className={`wks__i${set.notes ? ' wks__i--on' : ''}`}
          type="button"
          aria-haspopup="dialog"
          aria-label={set.notes ? `Edit the note on set ${n} of ${name}` : `A note on set ${n} of ${name}`}
          /* THE MARKERS COME OFF for a tooltip and for the label below: an
             attribute cannot draw a `<strong>`, and showing `**` to a screen
             reader is reading punctuation nobody typed as text. */
          title={set.notes ? plainText(set.notes) : undefined}
          onClick={onNote}
        >
          <NoteIcon size={13} />
        </button>
      ) : (
        /* `.wks__i` IS WHAT PUSHES THE TAIL RIGHT — `margin-left:auto` lives on
            the note button, so a line without one needs something else to carry
            it or the ✕ walks left to meet the tempo box. */
        <span className="wks__sp" />
      )}

      {onRemove ? (
        <button
          className="wks__x"
          type="button"
          aria-label={`Remove set ${n} of ${name}`}
          onClick={onRemove}
        >
          <CloseIcon size={13} />
        </button>
      ) : (
        <span />
      )}

      {/* WRITTEN IN THE DIALOG, READ ON THE LINE. The note is why the trainer
          came to this row and it belongs where the set is, so it stays drawn
          under it — as the sentence itself rather than as a box, which is what
          `.wsmx__cue` does with the same text on the week sheet. Clicking it
          opens the same dialog the ✎ does. */}
      {set.notes && onNote && (
        <button
          className="wks__cue"
          type="button"
          aria-haspopup="dialog"
          aria-label={`Edit the note on set ${n} of ${name}`}
          onClick={onNote}
        >
          <Markup value={set.notes} />
        </button>
      )}
    </div>
  );
}

/**
 * THE KIND PICKER — a menu, and deliberately not a `<select>`.
 *
 * Three of the seven effort kinds are the SAME sentence — *As much as possible
 * (MAX)* in reps, on a clock, and in metres — and the unit is the only thing
 * that separates them. A native option list can print one string per row and
 * style none of it, so the three would read identically and a trainer would
 * pick the wrong one by coin toss. Here the unit is a second column, greyed,
 * and the chosen row carries it as a chip with a tick beside it: the closed
 * picker shows only the short word, so the line stays a line.
 *
 * The list is taller than the menu, on purpose — the arrow at the foot says so.
 * Capping the height keeps the menu inside the dialog rather than running past
 * its edge, which is where an unclipped seven-row list lands on the shorter
 * cards.
 */
function KindPicker<K extends string>({
  options,
  value,
  label,
  onPick,
}: {
  options: KindOption<K>[];
  value: K;
  label: string;
  onPick: (kind: K) => void;
}) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  /* FIXED, FROM THE BUTTON'S RECT. The sets panel is `overflow:hidden` (it collapses), so an absolutely positioned menu
     was clipped at the card's foot — three of seven rows visible. A fixed box escapes that clip, and flips upward when
     there is no room below. */
  const [at, setAt] = useState<{ top?: number; bottom?: number; left: number; listMax: number } | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const menuEl = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLSpanElement>(null);
  const current = options.find(o => o.kind === value) ?? options[0];

  /* The same dismissal `More` uses. Escape used to be consumed in CAPTURE here
     with the note that the builder has its own ladder — and that never worked:
     the builder's `ModalHost` bound its capture listener first, so one press
     closed the whole dialog while this menu, which claimed to have consumed the
     key, never saw it. `useEscapeGuard` is the repair, at the host. */
  useEscapeGuard(open);

  useEffect(() => {
    if (!open) return;
    function away(e: MouseEvent) {
      const t = e.target as Node;
      if (box.current && !box.current.contains(t) && !menuEl.current?.contains(t)) setOpen(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    /* A fixed menu does not follow its button, so any scroll of the canvas puts it away. */
    const shut = (e: Event) => {
      const t = e.target;
      /* A resize's target is the window, which is not a Node; it always closes. A scroll inside the list itself does not. */
      if (t instanceof Node && (box.current?.contains(t) || menuEl.current?.contains(t))) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    window.addEventListener('scroll', shut, true);
    window.addEventListener('resize', shut);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', shut, true);
      window.removeEventListener('resize', shut);
    };
  }, [open]);

  /* MEASURED, NOT ASSUMED. The arrow is drawn only while there is something
     below the fold — seven rows fit on a tall viewport and an arrow pointing at
     nothing is a lie about the list. */
  function gauge() {
    const el = list.current;
    if (!el) return;
    setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  }

  return (
    <span className="kpk" ref={box}>
      <button
        className="kpk__b"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label} — ${current.label}`}
        onClick={() => {
          if (!open) {
            const r = box.current?.getBoundingClientRect();
            if (r) {
              const CHROME = 6 + 30; // the menu's padding and the more-row
              const below = window.innerHeight - r.bottom - 16;
              const above = r.top - 16;
              const left = Math.max(12, Math.min(r.left, window.innerWidth - 12 - 260));
              /* THE SIDE WITH MORE ROOM, and the list shortened to fit it: a low set row in a tall sheet has neither 262px
                 above nor below, and a menu that cannot scroll into view is one a thumb cannot reach. */
              const useBelow = below >= 232 + CHROME || below >= above;
              const room = (useBelow ? below : above) - CHROME;
              const listMax = Math.max(96, Math.min(232, room));
              setAt(useBelow ? { top: r.bottom + 4, left, listMax } : { bottom: window.innerHeight - r.top + 4, left, listMax });
            }
          }
          setOpen(v => !v);
        }}
      >
        <span className="kpk__v">{current.short}</span>
        <ChevronDown size={11} />
      </button>

      {/* ON THE PAGE BODY, NOT INSIDE THE DIALOG. A fixed box inside `.wkb` was placed relative to the dialog (it landed
          ~160px right and ~20px down of its button) because an ancestor is a containing block for fixed descendants. */}
      {open && at && createPortal(
        <span
          className="kpk__m"
          ref={menuEl}
          style={{ position: 'fixed', zIndex: 90, top: at.top ?? 'auto', bottom: at.bottom ?? 'auto', left: at.left }}
        >
          <span
            className="kpk__sc"
            style={at ? { maxHeight: at.listMax } : undefined}
            role="listbox"
            aria-label={label}
            ref={el => {
              list.current = el;
              gauge();
            }}
            onScroll={gauge}
          >
            {options.map(option => {
              const on = option.kind === value;
              return (
                <button
                  key={option.kind}
                  className={`kpk__i${on ? ' kpk__i--on' : ''}`}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    onPick(option.kind);
                    setOpen(false);
                  }}
                >
                  <span className="kpk__l">{option.label}</span>
                  <span className="kpk__h">{option.hint}</span>
                  {on && (
                    <span className="kpk__ck" aria-hidden="true">
                      <CheckIcon size={14} />
                    </span>
                  )}
                </button>
              );
            })}
          </span>
          {more && (
            <span className="kpk__more" aria-hidden="true">
              ↓
            </span>
          )}
        </span>,
        document.body,
      )}
    </span>
  );
}

/**
 * ONE NUMBER, COMMITTED ON BLUR.
 *
 * The rule, stated once: the model owns the box whenever it is not being typed
 * into, the draft is a string, Enter commits and Escape throws away. The week
 * sheet had its own copy of this control written against `Entry` and `NumField`;
 * a shared version would have to take a getter and a setter, which is the whole
 * of what it does.
 */
function NumBox({
  value,
  unit,
  label,
  onValue,
}: {
  value: number | null;
  unit: string | null;
  label: string;
  onValue: (value: number | null) => void;
}) {
  const shown = value === null ? '' : String(value);
  const [draft, setDraft] = useState(shown);
  const [focused, setFocused] = useState(false);

  const [last, setLast] = useState(shown);
  if (shown !== last) {
    setLast(shown);
    if (!focused) setDraft(shown);
  }

  function commit() {
    setFocused(false);
    const text = draft.trim();
    /* EMPTY IS A REAL ANSWER, not a zero. A template is written for nobody in
       particular and *whatever you can manage today* is a prescription a
       trainer means — `null` is what the wire carries for it. */
    if (!text) {
      onValue(null);
      return;
    }
    const n = Number(text.replace(',', '.'));
    if (!Number.isFinite(n)) {
      setDraft(shown);
      return;
    }
    onValue(Math.max(0, n));
  }

  return (
    <span className="wks__f">
      <input
        className="wks__in"
        type="text"
        inputMode="decimal"
        value={draft}
        autoComplete="off"
        aria-label={label}
        onFocus={() => setFocused(true)}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            setFocused(false);
            setDraft(shown);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {unit && (
        <span className="wks__u" aria-hidden="true">
          {unit}
        </span>
      )}
    </span>
  );
}

/** The same control for a value that is not a bare number — a rest written
 *  `01:30`, a tempo written `3-1-1-0`. `onText` answers whether it took.
 *
 *  ITS WIDTH IS THE PARENT'S, never an inline `style` (trap 2): the two
 *  callers want different widths and `.wks__k--rest`/`--tempo` already name
 *  which is which, so the stylesheet can say it and a media query can still
 *  win. An inline width outranks every selector, including one. */
function TextBox({
  value,
  placeholder,
  label,
  onText,
}: {
  value: string;
  placeholder: string;
  label: string;
  onText: (text: string) => boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (!focused) setDraft(value);
  }

  function commit() {
    setFocused(false);
    if (!onText(draft)) setDraft(value);
  }

  return (
    <input
      className="wks__tin"
      type="text"
      value={draft}
      placeholder={placeholder}
      autoComplete="off"
      aria-label={label}
      onFocus={() => setFocused(true)}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          e.stopPropagation();
          setFocused(false);
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
