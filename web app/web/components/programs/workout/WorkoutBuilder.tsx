'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition } from 'react';

import type { ExerciseWire } from '@/lib/exercises/api';
import type { WorkoutTemplateWire } from '@/lib/workouts/api';
import {
  fetchWorkoutTemplate,
  removeWorkoutTemplate,
  saveWorkoutTemplate,
} from '@/lib/workouts/actions';
import {
  addAlternative,
  addAlternativeSet,
  addDivider,
  addExercise,
  addSet,
  addWorkoutTemplate,
  chainExercise,
  chainsOf,
  emptyDraft,
  moveDivider,
  moveExercise,
  ordinalsOf,
  patchAlternativeSet,
  patchAlternativeSets,
  patchSet,
  patchSets,
  raiseAlternative,
  removeAlternative,
  removeAlternativeSet,
  removeDivider,
  removeExercise,
  removeSet,
  renameDivider,
  setCount,
  setSetCount,
  toWire,
  unchainExercise,
  type Draft,
  type DraftDivider,
  type DraftSet,
} from '@/lib/workouts/draft';
import { durationLabel, estimateKcal, estimateMinutes, kcalLabel, restLabel } from '@/lib/workouts/estimate';
import { Button } from '@/web-components/ui/Button';
import { Modal, ModalHost } from '@/web-components/ui/Modal';
import { AltPanel, type AltActions } from './AltPanel';
import { ExerciseCard, type CardActions } from './ExerciseCard';
import { LibraryPane } from './LibraryPane';
import { NoteDialog } from './NoteDialog';
import { ClockIcon, DumbbellIcon, FlameIcon, Grip, RedoIcon, SlidersIcon, UndoIcon } from './Icons';
import { TrashIcon } from '../Icons';
import {
  DIVIDER_MIME,
  carriesCard,
  carriesDivider,
  carriesExercise,
  carriesTemplate,
  locateWorkoutDrop,
  type DropTarget,
} from './dnd';

const UNDO_CAP = 20;

/**
 * THE WORKOUT BUILDER — the dialog behind *New workout template*.
 *
 * ── WHY THIS IS A DIALOG WHEN THE WEEK SHEET IS A SCREEN ────────────────────
 *
 * `LibraryDock`'s own note rejects a modal in as many words, and it is right
 * about the surface it is on: the week board is what a trainer is filling, it
 * stays on screen, and a 420px `aria-modal` panel with a scrim is the thing
 * that takes it away.
 *
 * Nothing on `/programs/workouts` is being filled. That screen is a LIST — four
 * tabs of rows about sessions that already happened — and a workout being
 * written has no relationship to any of them. There is nothing underneath worth
 * keeping visible, and the thing being built needs the whole frame: a library
 * that can be searched, a canvas that can hold a dozen movements, and set lines
 * seven controls wide. So the scrim covers the app (`cover="frame"`) rather than
 * the content area, and the dialog is the screen for as long as it is open.
 *
 * ── IT DOES NOT AUTOSAVE, AND THAT IS THE OTHER DIFFERENCE ──────────────────
 *
 * The week sheet has no Save button — it debounces a write of the whole
 * blueprint — and that is right for a template that already exists and is being
 * tuned. A workout written from nothing is not that: there is no row on any
 * shelf until the trainer says so, autosaving would put half-written sessions on
 * it, and *Close* has to be able to mean *forget this*. So there is one Save, it
 * is the dialog's only primary, and closing a dirty draft asks.
 *
 * The undo stack is `lib/programs/draft.ts`'s, at 20, and the reason carries
 * over unchanged: every edit is a pure function from one draft to another, so
 * the stack is a stack of drafts rather than a set of inverse operations
 * somebody has to keep in step with the forward ones.
 */
/* ═══════════════════════════════════════════════════════ the undo stack ══

   ONE REDUCER, AND IT FIXED TWO DEFECTS THAT A HARNESS FOUND AND `tsc` COULD
   NOT.

   This was four `useState`s with a `write` that read `draft` off the render.
   Both bugs fall out of that:

   · **THREE CLICKS ADDED ONE MOVEMENT.** Clicking three library rows inside one
     tick ran `write` three times against the SAME captured draft, so the third
     result overwrote the first two. Measured: three clicks, one card. A
     reducer's actions queue against the state each one lands on, which is
     exactly the property that was missing.
   · **UNDOING A SET COUNT WIPED THE WORKOUT'S NAME.** A name is not an undo
     step — it is typed a character at a time and twenty rungs would be gone
     before the word was — so `field` deliberately does not push. But the
     snapshots on the stack still CARRIED whatever the name was when they were
     taken, and restoring one restored that too: type the name last, undo once,
     and the name a trainer had just typed silently reverted to empty.

   So the stack is a stack of drafts and `undo`/`redo` **keep the current name
   and note**. That is the honest reading of what those two controls are for:
   the stack holds the structure of the session, and the two text fields have
   the browser's own undo inside them.                                        */

interface BuilderState {
  draft: Draft;
  past: Draft[];
  future: Draft[];
  /** Anything typed or dropped since the last save. Drives the *Draft* pill and
   *  whether Close has to ask. */
  dirty: boolean;
}

type Action =
  /** A structural edit — a drop, a reorder, a set, a chain. Goes on the stack. */
  | { kind: 'edit'; fn: (draft: Draft) => Draft }
  /** The name or the note. Does NOT go on the stack — see above. */
  | { kind: 'field'; patch: Partial<Pick<Draft, 'name' | 'notes'>> }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'saved' };

function start0(initial: Draft | undefined): BuilderState {
  return { draft: initial ?? emptyDraft(), past: [], future: [], dirty: false };
}

function reduce(state: BuilderState, action: Action): BuilderState {
  switch (action.kind) {
    case 'edit': {
      const draft = action.fn(state.draft);
      /* An edit that changed nothing is not an undo rung. Every function in
         `lib/workouts/draft.ts` returns its input unchanged when it has nothing
         to do, which is what makes this test an identity check. */
      if (draft === state.draft) return state;
      return {
        draft,
        past: [...state.past, state.draft].slice(-UNDO_CAP),
        /* A redo past a branch is a redo into a workout that was never
           written. */
        future: [],
        dirty: true,
      };
    }
    case 'field':
      return { ...state, draft: { ...state.draft, ...action.patch }, dirty: true };
    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        draft: { ...previous, name: state.draft.name, notes: state.draft.notes },
        past: state.past.slice(0, -1),
        future: [state.draft, ...state.future].slice(0, UNDO_CAP),
        dirty: true,
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        draft: { ...next, name: state.draft.name, notes: state.draft.notes },
        past: [...state.past, state.draft].slice(-UNDO_CAP),
        future: state.future.slice(1),
        dirty: true,
      };
    }
    case 'saved':
      return { ...state, dirty: false };
  }
}

export function WorkoutBuilder({
  initial,
  templateId,
  onClose,
  onSaved,
  onLocalSave,
}: {
  /** A draft to open on. Absent is a new workout. */
  initial?: Draft;
  /** Present when this is editing a workout that already exists. */
  templateId?: string;
  onClose: () => void;
  onSaved?: (row: WorkoutTemplateWire) => void;
  /**
   * SAVE IT WHERE IT CAME FROM, AND NOWHERE ELSE — the week sheet's *Edit
   * workout*.
   *
   * The dialog's ordinary Save writes a row on the Workouts shelf, which is
   * exactly right for a session being written: a workout is a reusable thing
   * and the shelf is where it is reused from. Editing a container that is
   * already on a program is the other case. The rows on that day are a COPY —
   * `copyWorkoutTo`'s own note argues why, and `apply`'s *a copy is a copy* is
   * the same rule one level up — so writing the edit back to the shelf would
   * rewrite a template the trainer may have on four other programs, from a
   * screen that is about one day of one of them.
   *
   * So this hands the draft back and saves nothing. The caller puts it on the
   * day; the shelf keeps whatever it had. Present it also takes the Save
   * button's label, because *Save* on a dialog that writes nowhere the trainer
   * can name is the ambiguity this note exists to remove.
   */
  onLocalSave?: (draft: Draft) => void;
}) {
  const [state, dispatch] = useReducer(reduce, initial, start0);
  const { draft, past, future, dirty } = state;

  const [carriedExercise, setCarriedExercise] = useState<ExerciseWire | null>(null);
  const [carriedCard, setCarriedCard] = useState<string | null>(null);
  /* WHAT A HEADING DRAG IS CARRYING, and the two cases are one piece of state
     because the canvas answers both the same way. `{ label }` is a new heading
     out of the library; `{ uid }` is one already on the canvas being moved, and
     the drop branches on which is present. */
  const [carriedDivider, setCarriedDivider] = useState<
    { label: string; uid?: string } | null
  >(null);
  /* THE WHOLE SESSION a pointer is carrying out of *Workout Templates*. The
     shelf row, not its movements: those are fetched on the drop, by the read
     the click already makes. */
  const [carriedTemplate, setCarriedTemplate] = useState<WorkoutTemplateWire | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);

  const [noteOpen, setNoteOpen] = useState(Boolean(initial?.notes));
  /* `'discard'` is the close confirm; `'delete'` is the destructive one. One
     piece of state, because the two are the same rung of the Escape ladder and
     two booleans could both be true. */
  const [asking, setAsking] = useState<'discard' | 'delete' | null>(null);
  /* THE SET NOTE'S DIALOG LIVES HERE AND NOT ON THE CARD, for the reason
     `ModalHost`'s `covered` states: two hosts both bind Escape in capture, the
     outer one was bound first and therefore answers first, so a note dialog
     that owned its own state would close the BUILDER on the first press and
     lose the session behind it. Whoever owns both rungs owns the state. */
  const [noting, setNoting] = useState<{ uid: string; setUid: string } | null>(null);
  /* And the alternate's, for the same reason and on the same rung. */
  const [alting, setAlting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  const canvas = useRef<HTMLDivElement>(null);

  /** Every structural edit is one `edit` action. See `reduce`. */
  const write = useCallback((fn: (d: Draft) => Draft) => dispatch({ kind: 'edit', fn }), []);

  const minutes = estimateMinutes(draft.exercises);
  const kcal = estimateKcal(draft.exercises);
  const ordinals = useMemo(() => ordinalsOf(draft.exercises), [draft.exercises]);
  const chains = useMemo(() => chainsOf(draft.exercises), [draft.exercises]);

  /* THE HEADINGS, BUCKETED BY WHAT THEY SIT ABOVE — and the bucket is the
     CHAIN, not the card. A divider anchored to the second movement of a circuit
     would otherwise draw between two rows the card wraps in one bracket, which
     is a picture of a session split through the middle of a round. Anchored
     anywhere inside a chain, it opens the chain. `null` is the foot. */
  const dividersAt = useMemo(() => {
    const out = new Map<string | null, DraftDivider[]>();
    const chainOf = new Map<string, string>();
    for (const chain of chains) for (const e of chain) chainOf.set(e.uid, chain[0].uid);
    for (const d of draft.dividers) {
      const key = d.before === null ? null : chainOf.get(d.before) ?? null;
      out.set(key, [...(out.get(key) ?? []), d]);
    }
    return out;
  }, [chains, draft.dividers]);

  const countFor = useCallback(
    (exerciseId: string) => draft.exercises.filter(e => e.exerciseId === exerciseId).length,
    [draft.exercises],
  );

  const actions: CardActions = useMemo(
    () => ({
      onSetCount: (uid, count) => write(d => setSetCount(d, uid, count)),
      onAddSet: uid => write(d => addSet(d, uid)),
      onRemoveSet: (uid, setUid) => write(d => removeSet(d, uid, setUid)),
      onPatchSet: (uid, setUid, patch: Partial<Omit<DraftSet, 'uid'>>) =>
        write(d => patchSet(d, uid, setUid, patch)),
      onRemove: uid => write(d => removeExercise(d, uid)),
      onUnchain: uid => write(d => unchainExercise(d, uid)),
      onNote: (uid, setUid) => setNoting({ uid, setUid }),
      onAlternates: setAlting,
    }),
    [write],
  );

  /* ── the drop ─────────────────────────────────────────────────────────────
     GATED ON THE PAYLOAD'S TYPE, NEVER ON REACT STATE — `week/dnd.ts` carries
     the argument: `dragstart` and the first `dragover` land in the same task,
     so a gate on a prop misses that one. The type list is readable mid-drag
     where `getData` is not, which is exactly what it is there for. */
  function over(e: React.DragEvent) {
    const exercise = carriesExercise(e);
    const card = carriesCard(e);
    const heading = carriesDivider(e);
    const session = carriesTemplate(e);
    if (!exercise && !card && !heading && !session) return;
    e.preventDefault();
    /* MOVE for the two drags that leave a hole — a card, and a heading picked
       up off the canvas. Everything out of the library is a copy. */
    e.dataTransfer.dropEffect = card || (heading && carriedDivider?.uid) ? 'move' : 'copy';
    if (!canvas.current) return;
    /* A WHOLE SESSION INSERTS AND NEVER CHAINS, for the reason a heading does
       not: a dozen movements dropped ONTO one card is not a circuit anybody
       described, and the template's own circuits would have to be broken to
       make it one. So the card's middle band belongs to the nearer gap and
       every pixel of the canvas answers with a place. */
    setDrop(
      locateWorkoutDrop(canvas.current, e.clientY, card ? carriedCard : null, heading || session),
    );
  }

  function landed(e: React.DragEvent) {
    const target = drop;
    setDrop(null);
    if (!target) return;

    if (carriesExercise(e) && carriedExercise) {
      e.preventDefault();
      const movement = carriedExercise;
      write(d =>
        target.kind === 'chain'
          ? /* Dropped onto a card: it goes in below that card and then joins
               its chain. Two writes rather than one `addExercise` that takes a
               group, because `chainExercise` already knows where the last
               member of a chain is and duplicating that is duplicating the one
               rule that keeps members adjacent. */
            chainOnto(addExercise(d, movement, null, []), target.onto)
          : addExercise(d, movement, target.before, target.adopt),
      );
      setCarriedExercise(null);
      return;
    }

    if (carriesCard(e) && carriedCard) {
      e.preventDefault();
      const uid = carriedCard;
      write(d =>
        target.kind === 'chain'
          ? chainExercise(d, uid, target.onto)
          : moveExercise(d, uid, target.before, target.adopt),
      );
      setCarriedCard(null);
      return;
    }

    /* A WHOLE SAVED SESSION, POURED IN WHERE IT WAS DROPPED — every movement,
       its circuits and its headings, in the structure the shelf holds them in.
       `pour` is the click's own path and takes the place as an argument, so the
       two gestures cannot drift into meaning two different things.

       IT INSERTS ONLY, told so by the type in `over` — a `chain` target here
       would be a bug in that call rather than a gesture to interpret, so it is
       ignored rather than guessed at. */
    if (carriesTemplate(e) && carriedTemplate && target.kind === 'insert') {
      e.preventDefault();
      pour(carriedTemplate, target.before, target.adopt);
      setCarriedTemplate(null);
      return;
    }

    /* A HEADING, AND IT ONLY EVER INSERTS. `locateWorkoutDrop` was told so by
       the type, so a `chain` target here would be a bug in that call rather
       than a gesture to interpret — it is ignored rather than guessed at.

       `getData` is read as the fallback for the LABEL and not for the branch:
       a drag that began in another tab's library carries a type this canvas
       accepts and no React state to go with it. */
    if (carriesDivider(e) && target.kind === 'insert') {
      e.preventDefault();
      const carried = carriedDivider;
      const label = carried?.label || e.dataTransfer.getData(DIVIDER_MIME) || 'New section';
      const { before } = target;
      write(d =>
        carried?.uid ? moveDivider(d, carried.uid, before) : addDivider(d, label, before),
      );
      setCarriedDivider(null);
    }
  }

  /** The movement just appended, chained onto its target. It is the last row by
   *  construction, which is the only thing this helper knows that the caller
   *  would otherwise have to work out. */
  function chainOnto(d: Draft, onto: string): Draft {
    const last = d.exercises[d.exercises.length - 1];
    return last ? chainExercise(d, last.uid, onto) : d;
  }

  /**
   * A SAVED SESSION, POURED INTO THIS ONE.
   *
   * The shelf row the library pane holds carries a count and no sets, so the
   * movements are fetched here — `fetchWorkoutTemplate` is the read the dialog
   * already uses to OPEN a workout, names and all, and a second endpoint that
   * returned the same thing for a different verb would be two answers to one
   * question.
   *
   * ONE `edit` ACTION for the whole template, which is what makes *undo* mean
   * *take that workout back out again* rather than twelve presses.
   *
   * `before` IS WHERE, and the click passes nothing: it has no pointer position
   * to read, so it lands on the end, which is where clicking has put things
   * since the dialog was built. A drag passes `locateWorkoutDrop`'s answer, and
   * the session arrives whole at the slot the indicator drew.
   */
  function pour(row: WorkoutTemplateWire, before: string | null = null, adopt?: string[]) {
    setError(null);
    start(async () => {
      const result = await fetchWorkoutTemplate(row.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      write(d => addWorkoutTemplate(d, result.template, result.names, before, adopt));
    });
  }

  function save() {
    setError(null);
    if (onLocalSave) {
      onLocalSave(draft);
      dispatch({ kind: 'saved' });
      onClose();
      return;
    }
    start(async () => {
      const result = await saveWorkoutTemplate(toWire(draft), templateId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      dispatch({ kind: 'saved' });
      onSaved?.(result.value);
      onClose();
    });
  }

  /* A draft with nothing written is closed without asking — there is nothing to
     lose, and a confirm over an empty canvas is a dialog asking a trainer to
     confirm that they changed their mind. */
  function close() {
    if (dirty && draft.exercises.length > 0) setAsking('discard');
    else onClose();
  }

  function destroy() {
    if (!templateId) return;
    setError(null);
    start(async () => {
      const result = await removeWorkoutTemplate(templateId);
      if (!result.ok) {
        setAsking(null);
        setError(result.message);
        return;
      }
      onClose();
    });
  }

  const empty = draft.exercises.length === 0;

  /* READ OUT OF THE DRAFT EVERY RENDER, never copied into the dialog's state:
     an undo while the note is open would otherwise leave the chips describing
     a set list that no longer exists. Undefined is the movement being removed
     under the dialog — an undo of the drop that added it — and the dialog goes
     with it rather than drawing a note against nothing. */
  const noted = noting ? draft.exercises.find(e => e.uid === noting.uid) : undefined;
  /* The same read, for the same reason — an undo that drops the movement takes
     its alternate's dialog with it. */
  const alted = alting ? draft.exercises.find(e => e.uid === alting) : undefined;

  /* KEYED ON THE OPEN MOVEMENT, so every handler closes over the uid the panel
     is actually about rather than reading `alting` out of a later render. The
     memo is on `alting` and not on `alted` for the same reason the card's
     actions are memoised on `write`: the row changes on every edit the panel
     makes, and rebuilding seven callbacks per keystroke would remount the set
     lines being typed into. */
  const altActions: AltActions | null = useMemo(
    () =>
      alting === null
        ? null
        : {
            onAdd: exercise => write(d => addAlternative(d, alting, exercise)),
            onRemove: altUid => write(d => removeAlternative(d, alting, altUid)),
            onRaise: altUid => write(d => raiseAlternative(d, alting, altUid)),
            onAddSet: altUid => write(d => addAlternativeSet(d, alting, altUid)),
            onRemoveSet: (altUid, setUid) =>
              write(d => removeAlternativeSet(d, alting, altUid, setUid)),
            onPatchSet: (altUid, setUid, patch) =>
              write(d => patchAlternativeSet(d, alting, altUid, setUid, patch)),
            onInstruct: (altUid, notes) =>
              write(d => patchAlternativeSets(d, alting, altUid, { notes })),
          },
    [alting, write],
  );

  return (
    <ModalHost
      onClose={close}
      cover="frame"
      covered={
        asking !== null ||
        (noting !== null && noted !== undefined) ||
        (alting !== null && alted !== undefined)
      }
      initialFocus=".wkb__name"
    >
      <div className="wkb" role="dialog" aria-modal="true" aria-label="Write a workout">
        <header className="wkb__hd">
          <button
            className={`wkb__gear${noteOpen ? ' wkb__gear--on' : ''}`}
            type="button"
            aria-expanded={noteOpen}
            aria-label="A note on this workout"
            onClick={() => setNoteOpen(v => !v)}
          >
            <SlidersIcon size={16} />
          </button>

          {/* THE STATE, SAID BEFORE THE NAME. Nothing in here is on any shelf
              until Save, and a dialog that looks like an editor over a saved
              row is one a trainer closes expecting their work to be there. */}
          <span className={`wkb__st${dirty ? ' wkb__st--on' : ''}`}>
            <i aria-hidden="true" />
            {templateId ? (dirty ? 'Unsaved changes' : 'Saved') : 'Draft'}
          </span>

          <input
            className="wkb__name"
            type="text"
            value={draft.name}
            placeholder="Workout name"
            autoComplete="off"
            aria-label="What this workout is called"
            /* NOT AN `edit` ACTION. A name is typed a character at a time and
               an undo step per keystroke would fill all twenty rungs of the
               stack before the word was finished — the same argument `NumCell`
               makes for committing a number on blur. `reduce` keeps it off the
               stack in BOTH directions; see the note there. */
            onChange={e => dispatch({ kind: 'field', patch: { name: e.target.value } })}
          />

          <span className="wkb__sp" />

          <button
            className="wkb__ic"
            type="button"
            disabled={past.length === 0}
            aria-label="Undo"
            title="Undo"
            onClick={() => dispatch({ kind: 'undo' })}
          >
            <UndoIcon />
          </button>
          <button
            className="wkb__ic"
            type="button"
            disabled={future.length === 0}
            aria-label="Redo"
            title="Redo"
            onClick={() => dispatch({ kind: 'redo' })}
          >
            <RedoIcon />
          </button>

          {/* ONLY WHEN THERE IS SOMETHING TO DELETE. A new workout has no row
              anywhere, so the verb would be a control that can only be refused
              — and *Close* already means *forget this* for a draft. */}
          {templateId && (
            <Button variant="ghost" size="sm" onClick={() => setAsking('delete')}>
              Delete
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={close}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            /* AN EMPTY WORKOUT IS NOT SAVEABLE, and the disabled primary is
               allowed here for the reason `SaveRow` draws none: there is one
               obvious thing missing, the canvas beside it says what, and the
               button is the only primary on the surface. */
            disabled={empty || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : onLocalSave ? 'Save to this day' : 'Save'}
          </Button>
        </header>

        {noteOpen && (
          <div className="wkb__note">
            <input
              type="text"
              className="ctl"
              value={draft.notes ?? ''}
              placeholder="What this session is for — “heavy press day, runs about 50 minutes”"
              aria-label="A note on this workout"
              onChange={e => dispatch({ kind: 'field', patch: { notes: e.target.value || null } })}
            />
          </div>
        )}

        {error && (
          <p className="wkb__err" role="alert">
            {error}
          </p>
        )}

        <div className="wkb__b">
          <LibraryPane
            countFor={countFor}
            onCarry={setCarriedExercise}
            onAdd={movement => write(d => addExercise(d, movement, null))}
            onAddTemplate={pour}
            onCarryTemplate={setCarriedTemplate}
            onAddDivider={label => write(d => addDivider(d, label, null))}
            onCarryDivider={label => setCarriedDivider(label === null ? null : { label })}
          />

          <div className="wkb__pane">
            {/* THE THREE FIGURES, AND TWO OF THEM ARE ESTIMATES DRAWN AS
                ESTIMATES. `lib/workouts/estimate.ts` carries the rule; the
                short version is that nothing here knows this client's
                bodyweight or how long they take to change a plate, so the
                duration wears a tilde and the calories are a band. */}
            <div className="wkb__stats" role="status">
              <span className="wkb__stat">
                <ClockIcon />
                <span className="wkb__sk">Duration</span>
                <b>{empty ? '—' : durationLabel(minutes)}</b>
              </span>
              <span className="wkb__stat">
                <FlameIcon />
                <span className="wkb__sk">Calories</span>
                <b>{kcalLabel(kcal)}</b>
              </span>
              <span className="wkb__stat">
                <DumbbellIcon />
                <span className="wkb__sk">Exercises</span>
                <b>{empty ? '—' : draft.exercises.length}</b>
              </span>
              {!empty && (
                <span className="wkb__stat wkb__stat--tail">
                  <span className="wkb__sk">Sets</span>
                  <b>{setCount(draft)}</b>
                </span>
              )}
            </div>

            <div
              className={`wkb__canvas${drop ? ' wkb__canvas--over' : ''}`}
              ref={canvas}
              onDragOver={over}
              onDragLeave={e => {
                /* Only when the pointer has actually left the canvas. A
                   `dragleave` fires on every child boundary crossed, so an
                   unguarded handler clears the indicator on the way INTO a
                   card — which is the one place the trainer is aiming. */
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(null);
              }}
              onDrop={landed}
            >
              {empty && draft.dividers.length === 0 ? (
                <Empty carrying={Boolean(carriedExercise || carriedTemplate)} />
              ) : (
                <>
                  {drop?.kind === 'insert' && (
                    <span className="wkb__ind" style={{ top: drop.top }} aria-hidden="true" />
                  )}
                  {chains.map(chain => {
                    const heads = (dividersAt.get(chain[0].uid) ?? []).map(d => (
                      <Divider
                        key={`${d.uid}:${d.label}`}
                        divider={d}
                        write={write}
                        onCarry={setCarriedDivider}
                        carrying={carriedDivider?.uid === d.uid}
                      />
                    ));
                    const cards = chain.map(entry => (
                      <ExerciseCard
                        key={entry.uid}
                        entry={entry}
                        ordinal={ordinals[entry.uid] ?? ''}
                        chained={chain.length > 1}
                        actions={actions}
                        onCarry={setCarriedCard}
                        carrying={carriedCard === entry.uid}
                        chainTarget={drop?.kind === 'chain' && drop.onto === entry.uid}
                      />
                    ));
                    if (chain.length === 1) return [...heads, ...cards];
                    const rest = chain[chain.length - 1].sets[0]?.restSeconds ?? null;
                    return (
                      <div key={chain[0].uid} className="wkcir__wrap">
                        {heads}
                        <div className="wkcir">
                        {cards}
                        {/* THE REST BELONGS TO THE ROUND, which is the same
                            thing `estimateSeconds` counts. Said once, under the
                            chain, rather than on each member's last line where
                            it would read as three separate waits. */}
                        <p className="wkcir__f">
                          <b>Circuit</b> · {chain.length} movements
                          {rest ? ` · ${restLabel(rest)} rest after the round` : ' · no rest set'}
                        </p>
                        </div>
                      </div>
                    );
                  })}
                  {/* THE FOOT — a heading dropped from the library lands here,
                      which is where every click in that pane lands, and stays
                      here until movements arrive under it. */}
                  {(dividersAt.get(null) ?? []).map(d => (
                    <Divider
                      key={`${d.uid}:${d.label}`}
                      divider={d}
                      write={write}
                      onCarry={setCarriedDivider}
                      carrying={carriedDivider?.uid === d.uid}
                    />
                  ))}
                  <p className="wkb__hint">
                    Drop an exercise onto another to chain them into a circuit.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* `.wkb__ask` LIFTS THE CONFIRM ABOVE THIS DIALOG. §24's `.modal` is
          z-41 against `.wkb`'s 61, so without the wrapper the question opens
          behind the thing it is about. The stylesheet carries the rest. */}
      {/* The same lift, for the same reason — and `initialFocus` is the BOX
          rather than the ✕ the trap would otherwise land on, which is
          `ModalHost`'s own note about a form with a close button in its head. */}
      {noting && noted && (
        <div className="wkb__ask">
          <ModalHost onClose={() => setNoting(null)} cover="frame" initialFocus=".mkpf__ed">
            <NoteDialog
              name={noted.name}
              sets={noted.sets}
              setUid={noting.setUid}
              onSave={(scope, notes) => {
                const { uid } = noting;
                write(d => (scope === null ? patchSets(d, uid, { notes }) : patchSet(d, uid, scope, { notes })));
                setNoting(null);
              }}
              onClose={() => setNoting(null)}
            />
          </ModalHost>
        </div>
      )}

      {/* The same lift and the same rung as the note's dialog above — and the
          panel does NOT close on an edit, because a trainer writing three
          substitutes writes them in one sitting. */}
      {alted && altActions && (
        <div className="wkb__ask">
          <ModalHost onClose={() => setAlting(null)} cover="frame" initialFocus=".wkalt .search input">
            <AltPanel entry={alted} actions={altActions} onClose={() => setAlting(null)} />
          </ModalHost>
        </div>
      )}

      {asking && (
        <div className="wkb__ask">
          <ModalHost onClose={() => setAsking(null)} cover="frame">
            {asking === 'discard' ? (
              <Modal
                title="Close without saving?"
                confirm={{ label: 'Discard it', danger: true, onClick: onClose }}
                cancel={{ label: 'Keep writing', onClick: () => setAsking(null) }}
              >
                {/* TWO SENTENCES, AND THE WRONG ONE WAS BEING SAID TO EVERY
                    TRAINER EDITING A TEMPLATE THAT ALREADY EXISTS. It read
                    *"has not been saved. Closing now leaves nothing behind"*
                    unconditionally — true of a workout written from nothing,
                    and flatly false of `Push · full gym` opened off the shelf,
                    where closing leaves the SAVED version exactly where it was
                    and loses only the edits since. It is the scariest possible
                    direction for a confirm to be wrong in: the dialog claims a
                    template a trainer has had for months is about to evaporate,
                    on the one control whose whole job is to discard.

                    `templateId` is the same test the status chip 250 lines up
                    already makes to choose between *Saved* and *Draft*; this is
                    that test, applied to the sentence that acts on it. */}
                {templateId ? (
                  <p>
                    {/* `initial`, NOT `draft` — the saved name, not the one being
                        typed. Renaming `Push · full gym` to `Push · full gym X`
                        and pressing Close drew *"Push · full gym X stays on your
                        shelf"* about a title that has never been on it, which is
                        a smaller copy of the same mistake this branch exists to
                        fix. `initial` is the wire's own draft and does not move
                        while the dialog is open. */}
                    <b>{initial?.name.trim() || 'This workout'}</b> stays on your shelf exactly
                    as it was saved. What closing now discards is the changes you have made
                    since &mdash; nothing else.
                  </p>
                ) : (
                  <p>
                    This workout has {draft.exercises.length}{' '}
                    {draft.exercises.length === 1 ? 'movement' : 'movements'} on it and has
                    never been saved. Closing now leaves nothing behind.
                  </p>
                )}
              </Modal>
            ) : (
              <Modal
                title={`Delete ${draft.name.trim() || 'this workout'}?`}
                confirm={{ label: 'Delete it', danger: true, onClick: destroy }}
                cancel={{ label: 'Keep it', onClick: () => setAsking(null) }}
              >
                <p>
                  It comes off the shelf for good. Any program a copy of it was dropped into
                  keeps that copy — a workout dropped into a week is copied, not linked, which
                  is the same rule a program template&rsquo;s apply follows.
                </p>
              </Modal>
            )}
          </ModalHost>
        </div>
      )}
    </ModalHost>
  );
}

/**
 * A LABELLED BREAK IN THE SESSION — *Warm-up*, *Main set*, *Cool-down*.
 *
 * AN INPUT, NOT A LABEL WITH A PENCIL. There is one thing to do to a heading
 * once it is down, and a control that has to be found before it can be used is
 * a rename nobody performs — the divider rows in the library are ten common
 * words precisely so that this box is usually left alone.
 *
 * COMMITTED ON BLUR, AND THAT IS THE SAME ARGUMENT `NumCell` AND THE WORKOUT'S
 * NAME BOTH MAKE. An `edit` per keystroke would spend all twenty rungs of the
 * undo stack on one word and put the drop that added the heading out of reach;
 * the local state is what the box reads back while it is being typed in.
 *
 * NOT A DROP TARGET. `locateWorkoutDrop` measures the canvas's cards, and the
 * heading sits between them without claiming a position of its own: a movement
 * dropped just under *Main set* lands as the first movement of that block,
 * which is what the pointer said.
 */
function Divider({
  divider,
  write,
  onCarry,
  carrying,
}: {
  divider: DraftDivider;
  write: (fn: (d: Draft) => Draft) => void;
  /** The heading a pointer has picked up, held by the builder — a drag that
   *  starts here ends on the canvas, and the canvas owns the drop. */
  onCarry: (carried: { label: string; uid?: string } | null) => void;
  carrying: boolean;
}) {
  /* An undo that restores an older name has to reach the box, and the box holds
     its own value while it is being typed in. Both, by MOUNTING a new box when
     the draft's label changes — the caller's `key` carries the label, which is
     React's own answer to *this input is about a different thing now* and is
     the arrangement that does not sync two copies of one string in an effect.
     Nothing is lost to the remount: the commit is on blur, so the box that goes
     away has already written what was in it. */
  const [label, setLabel] = useState(divider.label);
  /* ARMED BY THE GRIP, like every other draggable thing in this dialog. It
     matters more here than on a card: the heading's name is an INPUT, and a row
     that is permanently draggable is a row a trainer cannot put a caret in — a
     click to rename would start a drag instead. */
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const up = () => setArmed(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [armed]);

  return (
    <div
      className={`wkdv${carrying ? ' wkdv--lifted' : ''}`}
      /* `data-divider` IS A POSITION IN THE DROP ARITHMETIC, the way
         `data-block` is on a card. Without it `locateWorkoutDrop` measured the
         canvas as if the headings were not drawn, and the gap UNDER a heading
         was not a place a movement could be aimed at — see `DropTarget.adopt`. */
      data-divider={divider.uid}
      draggable={armed || undefined}
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(DIVIDER_MIME, divider.label);
        e.dataTransfer.setData('text/plain', divider.label);
        onCarry({ label: divider.label, uid: divider.uid });
      }}
      onDragEnd={() => {
        setArmed(false);
        onCarry(null);
      }}
    >
      <span
        className="wkdv__g"
        aria-hidden="true"
        title={`Move the ${divider.label} heading`}
        onMouseDown={() => setArmed(true)}
      >
        <Grip />
      </span>
      <input
        className="wkdv__t"
        type="text"
        value={label}
        placeholder="Section"
        aria-label="What this block of the workout is called"
        onChange={e => setLabel(e.target.value)}
        onBlur={() => {
          const next = label.trim();
          /* AN EMPTY HEADING IS THE ONE IT HAD. A trainer who clears the box and
             clicks away has not written a nameless break — they have abandoned a
             rename, and the ✕ beside it is how a heading is actually removed. */
          if (!next || next === divider.label) {
            setLabel(divider.label);
            return;
          }
          write(d => renameDivider(d, divider.uid, next));
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setLabel(divider.label);
            e.currentTarget.blur();
          }
        }}
      />
      <button
        className="wkdv__x"
        type="button"
        aria-label={`Remove the ${divider.label} heading`}
        title="Remove this heading"
        onClick={() => write(d => removeDivider(d, divider.uid))}
      >
        <TrashIcon size={13} />
      </button>
      {/* THE RULE CARRIES TO THE EDGE OF THE CANVAS, and the name sits at the
          head of it rather than in the middle. A centred name reads as a title
          for the whole session; a name at the left margin, level with the
          ordinals under it, reads as the start of a block — which is the one
          thing this line is for. */}
      <span className="wkdv__r" aria-hidden="true" />
    </div>
  );
}

/**
 * THE STATE THIS SCREEN OPENS IN, every time, for every trainer.
 *
 * So it carries the way forward rather than only the news that it is empty —
 * `EmptyDay` in the week sheet makes the same trade. Not `EmptyState`: that
 * component is built around a glyph, a heading and a body in a centred column,
 * which is right, and it also has no state for *the pointer is carrying
 * something right now*. The second line changes under a live drag, which is the
 * one moment a trainer needs to know this whole area is a target.
 */
function Empty({ carrying }: { carrying: boolean }) {
  return (
    <div className={`wkb__none${carrying ? ' wkb__none--armed' : ''}`}>
      <span className="wkb__nicon" aria-hidden="true">
        <DumbbellIcon size={30} />
      </span>
      <h2>This workout is empty</h2>
      <p>
        {carrying
          ? 'Let go anywhere in here to add it.'
          : 'Click an exercise on the left to add it, or drag one in by its grip. An empty workout saves nothing.'}
      </p>
    </div>
  );
}
