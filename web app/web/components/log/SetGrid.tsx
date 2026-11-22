'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { LogExerciseViewX as LogExerciseView, LogSetRowX as LogSetRow } from '@/lib/sessionlog/select';
import { EFFORT, LOAD, parseRpe } from '@/lib/sessionlog/kinds';
import {
  effortHead, effortStepLabel, effortText, hasLoadBox, loadHead, loadStepLabel, loadText,
  parseEffort, parseLoad, stepEffort, stepLoad,
} from './kindfields';
import { Note, Plus, Swap, Timer, Tick } from './Icons';
import { ActionBar } from '@/web-components/ui/ActionBar';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { RowMenu } from '@/web-components/ui/RowMenu';
import { NumPad, type NumPadField } from '@/web-components/ui/NumPad';
import { Tag } from '@/web-components/ui/Tag';

/**
 * THE SET GRID — FIVE COLUMNS, AND THE FIRST OF THEM IS THE ARGUMENT.
 *
 * `# · Last time · Load kg · Reps · RPE · tick`. Four of the six are the phone's
 * and are ported unchanged. Two are the desk being wider rather than merely
 * different, and both need saying:
 *
 * **RPE is a column here and a sheet there.** §09 fixes the phone at five
 * columns because that is what fits at 360dp with Previous intact. A desk has
 * the width, and RPE is what the trainer knows and the client's own app never
 * records — so it goes in the row, and the sheet keeps the note.
 *
 * **Previous is a column, not a placeholder.** Hevy solved this years ago and
 * there is no reason to redraw a solved table; Strong offers last time's numbers
 * as placeholder text inside the field instead, and a placeholder disappears the
 * moment you type — which is exactly the moment you want it. §09 makes this the
 * one thing on the screen that may never collapse, truncate or hide.
 *
 * ── THE ROW THAT HAS NOT CLAIMED ANYTHING ────────────────────────────────────
 *
 * An open slot shows last time's numbers IN the field, at the quiet ink behind a
 * dashed border (`.ctl.said`). One press takes them exactly as shown — the desk
 * equivalent of the app's one-tap tick. Until somebody presses, **the log has
 * not claimed a weight nobody lifted**, and nothing here auto-progresses a load:
 * §09's rule is that the app never puts a number in a row that nobody lifted.
 *
 * ── AND THE ACCELERATORS HAVE POINTER PATHS ──────────────────────────────────
 *
 * NN/g's rule (Krause & Harley 2024): *"an accelerator is not a new feature — it
 * is merely an additional way of completing an existing action"*, and *"those
 * users who never discover the accelerator should be able to complete the same
 * task in another way."* That is the rule the page this replaces broke — it drew
 * a keyboard bar and no pointer path for the tick, the note or the swap. Every
 * shortcut in the bar at the foot of this screen has a button in this component.
 */

export interface GridHandlers {
  /** A tick, or a commit from the keyboard. Values come from the row's fields. */
  commit: (exerciseId: string, row: LogSetRow, values: Draft) => void;
  /** Un-tick: the set goes, the slot stays. */
  remove: (exerciseId: string, row: LogSetRow) => void;
  /** Open frame 1b for this set. */
  openSet: (exerciseId: string, setNumber: number) => void;
  /** Open frame 3b for this exercise. */
  openSwap: (exerciseId: string) => void;
  /** The last sessions and the record, as a sheet. The phone's half of the
      third column, which a 390px screen cannot draw beside the fields. */
  openHistory: (exerciseId: string) => void;
  /** One more slot than the plan asked for. */
  addSlot: (exerciseId: string) => void;
  /** Change the rest for this exercise. */
  changeRest: (exerciseId: string) => void;
  /** Skip a set not yet done (this tab only — see `Console`'s *a skipped set*). */
  skip: (exerciseId: string, row: LogSetRow) => void;
  unskip: (exerciseId: string, setNumber: number) => void;
  /** Take back one extra slot nobody logged. */
  removeSlot: (exerciseId: string) => void;
}

export interface Draft {
  load?: string;
  reps?: string;
  rpe?: string;
}

const KEY = (exerciseId: string, n: number) => `${exerciseId}:${n}`;

export function draftKey(exerciseId: string, n: number): string {
  return KEY(exerciseId, n);
}

/** What is actually in a field: what was typed, else what is logged. */
export function fieldValue(row: LogSetRow, draft: Draft | undefined, which: keyof Draft): string {
  const typed = draft?.[which];
  if (typed !== undefined) return typed;
  if (which === 'load') return loadText(row.loadValue);
  if (which === 'reps') return effortText(row.effortKind, row.effortValue);
  return row.rpe != null ? String(row.rpe) : '';
}

/**
 * The number an open slot OFFERS: last time's, else the plan's target (21 Nov 2026).
 *
 * It is drawn dashed in the field and in the phone's *Log set* button, and it is
 * written only when the trainer presses — so §09's rule holds: nothing is logged
 * that nobody confirmed. What changed is that a set with no history (a client's
 * first session on a movement) offers what the program asked for instead of
 * nothing, so one press logs it there too. Last time still wins where it exists:
 * it is what the client actually did.
 */
function suggestion(row: LogSetRow, which: 'load' | 'reps'): string {
  if (row.done) return '';
  // Kilograms and repetitions only — the two the history and the target both map onto.
  if (which === 'load' ? !LOAD[row.loadKind].kilograms : !EFFORT[row.effortKind].repetitions) return '';
  const value = which === 'load' ? row.previousLoad : row.previousReps;
  if (value != null) return String(value);
  const target = which === 'load' ? row.target?.load : row.target?.effort;
  return target != null ? String(target) : '';
}

/** Whether an open slot offers anything a single press could log. */
function offers(row: LogSetRow): boolean {
  return !row.done && (suggestion(row, 'load') !== '' || suggestion(row, 'reps') !== '');
}

/** What is actually in the field: what was typed, else what last time offers. */
function shownValue(
  row: LogSetRow,
  draft: Draft | undefined,
  which: 'load' | 'reps',
  said: boolean,
): string {
  return fieldValue(row, draft, which) || (said ? suggestion(row, which) : '');
}

/** `2:00`, `0:45`. The clock's own format, and the strip's at rest. */
function clock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * What the spent clock says — and it is an INSTRUCTION, not a fact.
 *
 * "Rest is over" is a statement about the past and the trainer already half
 * knows it. What they cannot see without counting rows is which set is up, so
 * the sentence carries the number: *Set 3 of bench press is up.* And when
 * there is no open slot left it says that instead, which is the more useful
 * thing at the end of an exercise — the trainer is about to move on, and the
 * strip is the only thing on the card that knows the exercise is finished.
 *
 * `plain` drops the `<u>`, for the live region that reads it aloud.
 */
function restOverLine(name: string, nextSet: number | null, plain = false): React.ReactNode {
  const exercise = name.toLowerCase();
  const named = plain ? exercise : <u>{exercise}</u>;
  return nextSet === null ? (
    <>Rest over — and that was the last {named} set.</>
  ) : (
    <>
      Rest over. Set {nextSet} of {named} is up.
    </>
  );
}

/**
 * IS THIS THE PHONE ON THE RACK?
 *
 * 620px is the console's own reflow breakpoint — the width at which the set
 * row stops being a table and RPE leaves it — so the dock arrives at exactly
 * the width the rest of the card already changed shape at, rather than at a
 * second number nobody can find.
 *
 * ── WHY A MEDIA QUERY AND NOT `display:none` ────────────────────────────────
 *
 * Both copies would be in the DOM, and one of them holds a `role="timer"` and
 * a `role="status"`. A live region in a `display:none` subtree is not reliably
 * silent — and where it is not, the trainer hears the rest announced twice.
 * `Clients.tsx` records the matching bug for a menu that focused itself inside
 * a hidden container; this is the same rule for a clock.
 *
 * `false` until mounted, which is also the honest SSR answer: the server does
 * not know the viewport, and a bar rendered on the server and removed on
 * hydration is a flash of a bar.
 */
function useThumbDock(): boolean {
  const [dock, setDock] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width:620px)');
    const read = () => setDock(mq.matches);
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);
  return dock;
}

/** How much of the rest is left, 0…1. Clamped: `+15` may exceed what it started at. */
function bar(remaining: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, remaining / total));
}

/**
 * What a row's boxes hold, as numbers — by the set's OWN kinds, so a hold is read
 * as `1:30` and a percentage as a percentage. An untouched slot takes last time's
 * numbers exactly as the field shows them (`useSuggestion`); `error` is the first
 * box whose text cannot be that kind's number, said in a sentence.
 */
export function readDraft(row: LogSetRow, draft: Draft | undefined, useSuggestion: boolean): {
  load: number | null;
  effort: number | null;
  rpe: number | null;
  error: string | null;
} {
  const hasLoad = hasLoadBox(row.loadKind, row.effortKind);
  const loadRaw = hasLoad ? fieldValue(row, draft, 'load') || (useSuggestion ? suggestion(row, 'load') : '') : '';
  const effortRaw = fieldValue(row, draft, 'reps') || (useSuggestion ? suggestion(row, 'reps') : '');
  const rpeRaw = fieldValue(row, draft, 'rpe');
  const load = parseLoad(row.loadKind, loadRaw);
  const effort = parseEffort(row.effortKind, effortRaw);
  const rpe = parseRpe(rpeRaw);
  const bad = [load, effort, rpe].find((p) => !p.ok);
  return {
    load: load.ok ? load.value : null,
    effort: effort.ok ? effort.value : null,
    rpe: rpe.ok ? rpe.value : null,
    error: bad && !bad.ok ? bad.message : null,
  };
}

export function SetGrid({
  view,
  drafts,
  onDraft,
  handlers,
  busy,
  error,
  skipped,
  restEditable,
  restScope,
  rest,
  onAdjustRest,
  onSkipRest,
  next,
}: {
  view: LogExerciseView;
  drafts: Record<string, Draft>;
  onDraft: (key: string, patch: Draft) => void;
  handlers: GridHandlers;
  /** Set keys with a request in flight. The tick shows it and does not stack. */
  busy: Set<string>;
  /** Set key → what went wrong, said in the row it happened in. */
  error: Record<string, string>;
  /** Draft keys of the sets skipped in this tab. */
  skipped: Set<string>;
  restEditable: boolean;
  /**
   * Which row a change lands on, and it is a real difference the trainer should
   * see before they press it: `program` is an edit to the plan and is still 90
   * seconds next Tuesday; `today` is this session's card only.
   */
  restScope: 'program' | 'today';
  /** The rest running for THIS exercise, or null. Owned by the console. */
  rest: { total: number; remaining: number; over: boolean } | null;
  onAdjustRest: (deltaSeconds: number) => void;
  onSkipRest: () => void;
  /**
   * The next exercise with a slot still open, for the thumb dock only.
   *
   * On a desk the whole plan is a column three inches to the left and this
   * would be a second control for a list already on screen. On a phone that
   * list is a chip rail at the top of a page the trainer has scrolled away
   * from, so finishing an exercise ends with a scroll UP to find out where to
   * go next — which is the one moment in the session the screen has nothing to
   * say. `null` where there is nowhere left to go, and the dock says that
   * instead by not being drawn.
   */
  next: { name: string; onOpen: () => void } | null;
}) {
  const table = useRef<HTMLTableElement | null>(null);
  // The boxes follow the set's own kinds; for weight × reps this is exactly the old `logType` test.
  const weights = hasLoadBox(view.loadKind, view.effortKind);
  const dock = useThumbDock();

  /* ── the keyboard model ─────────────────────────────────────────────────
     ↵ commits and opens the next set. ⌘↵ takes last time's numbers — the one
     non-obvious binding, printed in the bar and duplicated as a button. ↑ ↓
     move between sets in the same column, so a trainer entering twelve loads
     from a notebook never leaves the load column. Nothing here rebinds copy,
     paste, select-all, print or ⌘Z. */
  const move = useCallback((from: HTMLElement, rows: number) => {
    const cell = from.closest('td');
    const row = from.closest('tr');
    if (!cell || !row || !table.current) return;
    const columnIndex = [...(row.children as unknown as HTMLElement[])].indexOf(cell);
    const all = [...table.current.querySelectorAll('tbody tr[data-set]')] as HTMLElement[];
    const index = all.indexOf(row);
    const next = all[index + rows];
    if (!next) return;
    const target = next.children[columnIndex]?.querySelector('input') as HTMLInputElement | null;
    (target ?? (next.querySelector('input') as HTMLInputElement | null))?.focus();
    target?.select();
  }, []);

  const onKeyDown = (row: LogSetRow) => (event: React.KeyboardEvent<HTMLInputElement>) => {
    const key = KEY(view.exerciseId, row.number);

    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        // Accept last time's numbers exactly as shown.
        onDraft(key, {
          load: suggestion(row, 'load') || fieldValue(row, drafts[key], 'load'),
          reps: suggestion(row, 'reps') || fieldValue(row, drafts[key], 'reps'),
        });
      }
      handlers.commit(view.exerciseId, row, drafts[key] ?? {});
      move(event.currentTarget, 1);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(event.currentTarget, 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(event.currentTarget, -1);
      return;
    }
    if (event.key === 'n' || event.key === 'N') {
      // The fields are decimal, so a letter in one is never wanted. The pointer
      // path is the Note button on the same row's panel.
      event.preventDefault();
      handlers.openSet(view.exerciseId, row.number);
    }
  };

  const isSkipped = (row: LogSetRow) => skipped.has(KEY(view.exerciseId, row.number));
  /* The open slot is the first set neither logged nor skipped — what *Log set* presses. */
  const openSlot = view.sets.find((s) => !s.done && !isSkipped(s)) ?? null;

  /* ── THE NUMBER PAD (phase C, 21 Nov 2026) ─────────────────────────────────
     On a phone the load and the reps fields no longer raise the OS keyboard — it
     took half the screen, covered the row, and had no *one plate more*. They open
     `c-numpad` for that set instead: both figures, the plate step and ±1 as chips,
     and the pad's own verb, which logs the set and moves the pad to the next open
     one, so a whole movement is typed without the pad closing. A done set's verb
     saves the correction. Time-written efforts (`1:30`) keep the OS keyboard — a
     digits pad cannot write the colon — and so does any load that is not weight. */
  const [pad, setPadState] = useState<{ exerciseId: string; row: number; field: 'load' | 'reps' } | null>(null);
  /* Leaving: the pad is still drawn while it slides down, then `onExited` clears it. */
  const [padOut, setPadOut] = useState(false);
  const setPad = (next: { exerciseId: string; row: number; field: 'load' | 'reps' } | null) => {
    if (next) {
      setPadOut(false);
      setPadState(next);
    } else if (pad) {
      setPadOut(true);
    }
  };
  /* A move to another movement closes the pad (render-time adjustment, trap 21). */
  const [padEx, setPadEx] = useState(view.exerciseId);
  if (padEx !== view.exerciseId) {
    setPadEx(view.exerciseId);
    setPadState(null);
    setPadOut(false);
  }
  const padLoad = (row: LogSetRow) => dock && weights && LOAD[row.loadKind].kilograms;
  const padReps = (row: LogSetRow) => dock && EFFORT[row.effortKind].repetitions;
  const padRow = pad && pad.exerciseId === view.exerciseId ? (view.sets.find((s) => s.number === pad.row) ?? null) : null;
  const openPad = (row: LogSetRow, field: 'load' | 'reps') =>
    setPad({ exerciseId: view.exerciseId, row: row.number, field });

  /* The row being typed into sits above the pad, not under it. */
  const padAt = padRow?.number ?? null;
  useEffect(() => {
    if (padAt === null || !table.current) return;
    table.current
      .querySelector(`tbody tr[data-set="${padAt}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [padAt]);

  /* ── SWIPE LEFT ON A ROW (phone, touch) · 21 Nov 2026 ───────────────────────
     Strong's and Hevy's gesture, with this screen's one rule for it: undo after,
     never confirm before. What a swipe does follows what the row IS — a logged set
     is un-logged (the Undo bar), a planned set not done is skipped (a toast with
     Undo), a skipped one is un-skipped, an extra slot nobody logged is taken back.
     It locks to an axis on the first 8px, so a vertical scroll that starts on a row
     stays a scroll; `touch-action: pan-y` on the rows (app.css) is what lets the
     browser hand the horizontal part to us. The row follows the finger with an
     inline transform — a gesture's live position, not layout — cleared on release. */
  const swipe = useRef<{
    key: string; x: number; y: number; dx: number; axis: 'x' | 'y' | null; el: HTMLTableRowElement; frame: number;
  } | null>(null);
  /* THE TRIGGER, AND HOW THE ROW FEELS PAST IT. Up to 72px the row follows the finger
     one to one; past it, it follows at a third — the resistance that says *this is far
     enough* without a hard stop, which is what makes a swipe feel like an object rather
     than a scroll. */
  const SWIPE_AT = 72;
  const resist = (dx: number) => (dx >= -SWIPE_AT ? dx : -SWIPE_AT + (dx + SWIPE_AT) / 3);
  const swipeFor = (row: LogSetRow): { label: string; act: () => void } | null => {
    if (row.done) return row.setId && row.planSetId ? { label: 'Un-log', act: () => handlers.remove(view.exerciseId, row) } : null;
    if (isSkipped(row)) return { label: 'Undo skip', act: () => handlers.unskip(view.exerciseId, row.number) };
    if (!row.planSetId) return { label: 'Remove', act: () => handlers.removeSlot(view.exerciseId) };
    return { label: 'Skip', act: () => handlers.skip(view.exerciseId, row) };
  };
  const swipeProps = (row: LogSetRow, key: string) => {
    const action = dock ? swipeFor(row) : null;
    if (!action) return {};
    const end = (e: React.PointerEvent<HTMLTableRowElement>) => {
      const sw = swipe.current;
      if (!sw || sw.key !== key) return;
      swipe.current = null;
      cancelAnimationFrame(sw.frame);
      const fire = e.type === 'pointerup' && sw.axis === 'x' && sw.dx <= -SWIPE_AT;
      /* Home again on the same curve the sheets use, a touch longer than a tap's
         feedback so the eye can follow it — and only now does `will-change` go. */
      sw.el.style.transition = 'transform 280ms cubic-bezier(.2,.8,.2,1)';
      sw.el.style.transform = '';
      delete sw.el.dataset.armed;
      const el = sw.el;
      window.setTimeout(() => {
        el.style.transition = '';
        el.style.willChange = '';
      }, 300);
      if (fire) {
        navigator.vibrate?.(12);
        action.act();
      }
    };
    return {
      'data-swipe': action.label,
      onPointerDown: (e: React.PointerEvent<HTMLTableRowElement>) => {
        if (e.pointerType !== 'touch') return;
        swipe.current = { key, x: e.clientX, y: e.clientY, dx: 0, axis: null, el: e.currentTarget, frame: 0 };
      },
      onPointerMove: (e: React.PointerEvent<HTMLTableRowElement>) => {
        const sw = swipe.current;
        if (!sw || sw.key !== key) return;
        const dx = e.clientX - sw.x;
        const dy = e.clientY - sw.y;
        if (sw.axis === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
          sw.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
          if (sw.axis === 'x') {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            /* Its own layer for the length of the gesture: the row moves on the compositor. */
            sw.el.style.willChange = 'transform';
            sw.el.style.transition = 'none';
          }
        }
        if (sw.axis !== 'x') return;
        sw.dx = Math.max(-140, resist(Math.min(0, dx)));
        /* ONE WRITE PER FRAME. A finger reports moves faster than the screen draws, and
           writing each one is work the eye never sees and the main thread pays for. */
        if (sw.frame) return;
        sw.frame = requestAnimationFrame(() => {
          sw.frame = 0;
          sw.el.style.transform = `translate3d(${sw.dx}px,0,0)`;
          const armed = sw.dx <= -SWIPE_AT ? 'true' : 'false';
          if (sw.el.dataset.armed !== armed) {
            if (armed === 'true') navigator.vibrate?.(8);
            sw.el.dataset.armed = armed;
          }
        });
      },
      onPointerUp: end,
      onPointerCancel: end,
    };
  };

  /* ── THE OPEN SLOT HAS TO BE IN THE PANE · 21 Sep 2026 ──────────────────
     The card's body is a scrollport on a desk now (`app.css`, *the console is
     a console*), and a scrollport opens at the top. MEASURED at 1536x639 on a
     four-set exercise with two logged: the body window is 214px against 276px
     of rows, so set 3 — the ACTIVE one, the row the screen exists to be typed
     into — was cut in half by the fold on arrival, and on an exercise already
     six sets in it would be off the pane entirely.

     `block:'nearest'` and not `'center'`: an open slot that already fits is
     not moved at all, which matters because this runs on every commit and a
     grid that jumps a few pixels after each tick is worse than one that never
     scrolls. `behavior:'auto'` for the same reason — this is the pane being
     in the right place, not a journey, and a smooth scroll under a trainer
     mid-set is motion nobody asked for.

     Keyed on the exercise and the set NUMBER, so it fires on arriving at a
     card and on the slot advancing, and not on every keystroke in it. */
  const openNumber = openSlot?.number ?? null;
  useEffect(() => {
    if (!table.current || openNumber === null) return;
    table.current
      .querySelector(`tbody tr[data-set="${openNumber}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    /* `openNumber` and not `openSlot`: the row object is rebuilt by `.find` on
       every render, so the whole object as a dependency would re-run this on
       every keystroke in the grid. The number is what the effect reads. */
  }, [view.exerciseId, openNumber]);

  /**
   * Last time's numbers, taken exactly as shown.
   *
   * One function and two call-sites: the foot's primary button on a desk, the
   * dock's only control on a phone. It was inline in the foot, and a second
   * copy in the dock would be a second place for `suggestion()` and the commit
   * to drift apart — which on this screen means two buttons with the same
   * label writing different rows.
   */
  const acceptLastTime = useCallback(() => {
    if (!openSlot) return;
    navigator.vibrate?.(12);
    const values = {
      load: suggestion(openSlot, 'load'),
      reps: suggestion(openSlot, 'reps'),
    };
    onDraft(KEY(view.exerciseId, openSlot.number), values);
    handlers.commit(view.exerciseId, openSlot, values);
  }, [openSlot, onDraft, handlers, view.exerciseId]);

  /* ── THE THUMB DOCK ───────────────────────────────────────────────────────
     Below 620px, the one thing this screen is for at this moment, pinned to the
     bottom edge of the viewport: the rest while there is one, and under it the
     one-press log of the open set (or *Next* once the movement is done) —
     see *the one press* below for why it became two layers on 21 Nov 2026.

     ── IT IS PORTALLED, AND THAT IS NOT TIDINESS ──────────────────────────
     `.wkcw` carries `container-type:inline-size`, and a size container is a
     containing block for `position:fixed` descendants exactly as a `transform`
     is. A dock rendered in place would be pinned to the bottom of a 1240px
     grid rather than to the viewport — off-screen, on the screen it exists to
     stay on, and every geometry probe would report it correctly placed.
     `document.body` and not `.app`: the shell is a grid with named areas, and
     an extra child of it is a child with no area.

     The component returns a FRAGMENT rather than putting this inside `.wkc`
     for a second reason of the same kind: `app.css` addresses that grid's
     columns as `>:first-child`, `>:nth-child(2)` and `>:nth-child(3)`, so a
     fourth child there is a silent fourth column.

     ── AND NOTHING IN IT WRAPS ────────────────────────────────────────────
     MEASURED at 390: with the clock and three buttons on it, the running state
     has 95px of text track left, which is not a sentence. So the running state
     carries no prose at all — the exercise is named in the card header
     directly above, and the whole line is on the timer's `aria-label`, where
     the reader who cannot see that header gets it. */
  /* ── THE ONE PRESS (21 Nov 2026) ──────────────────────────────────────────
     The phone's bar used to be ONE of four things: a running rest, a spent rest,
     *take last time's numbers* (only where there was a last time) or *Next*. So
     during a rest there was no way to log the set the client had already started,
     and on a first session there was no one-press log at all. It is two layers now:
     the rest, while there is one, and under it — always, while a set is open — the
     button that logs that set with exactly the numbers its fields show (typed, else
     last time's, else the plan's). A slot with nothing to offer asks for numbers and
     puts the cursor in its row instead. */
  const openKey = openSlot ? KEY(view.exerciseId, openSlot.number) : '';
  const openDraft = openSlot ? drafts[openKey] : undefined;
  const openSaid = openSlot ? offers(openSlot) : false;
  const shownLoad = openSlot && weights ? shownValue(openSlot, openDraft, 'load', openSaid) : '';
  const shownReps = openSlot ? shownValue(openSlot, openDraft, 'reps', openSaid) : '';
  const kg = openSlot ? LOAD[openSlot.loadKind].kilograms : false;
  const logLabel =
    shownLoad && shownReps
      ? `${shownLoad}${kg ? ' kg' : ''} × ${shownReps}`
      : shownReps
        ? `${shownReps} ${effortHead(openSlot!.effortKind).toLowerCase()}`
        : shownLoad
          ? `${shownLoad}${kg ? ' kg' : ''}`
          : '';

  const logOpen = () => {
    if (!openSlot || busy.has(openKey)) return;
    navigator.vibrate?.(12);
    const values: Draft = { load: shownLoad, reps: shownReps, ...(openDraft?.rpe ? { rpe: openDraft.rpe } : {}) };
    onDraft(openKey, values);
    handlers.commit(view.exerciseId, openSlot, values);
  };
  const focusOpen = () => {
    if (!openSlot || !table.current) return;
    table.current.querySelector<HTMLInputElement>(`tbody tr[data-set="${openSlot.number}"] input`)?.focus();
  };

  const restBar = rest?.over ? (
    <ActionBar tone="ok" role="status" label={`Rest over after a ${view.name.toLowerCase()} set`}>
      <ActionBar.Lead icon={<Tick />} figure="0:00" />
      <ActionBar.Text>
        {openSlot ? (
          <>
            Set <b>{openSlot.number}</b> is up
          </>
        ) : (
          'Rest over'
        )}
      </ActionBar.Text>
      <ActionBar.Acts>
        <Button variant="ghost" size="sm" onClick={() => onAdjustRest(15)}>
          +15
        </Button>
        <Button variant="secondary" size="sm" onClick={onSkipRest}>
          Got it
        </Button>
      </ActionBar.Acts>
    </ActionBar>
  ) : rest ? (
    <ActionBar
      tone="accent"
      role="timer"
      progress={bar(rest.remaining, rest.total)}
      label={`${clock(rest.remaining)} rest remaining`}
    >
      <ActionBar.Lead icon={<Timer />} figure={clock(rest.remaining)} />
      <ActionBar.Text>Rest</ActionBar.Text>
      <ActionBar.Acts>
        <Button variant="ghost" size="sm" onClick={() => onAdjustRest(-15)}>
          &minus;15
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onAdjustRest(15)}>
          +15
        </Button>
        <Button variant="secondary" size="sm" onClick={onSkipRest}>
          Skip
        </Button>
      </ActionBar.Acts>
    </ActionBar>
  ) : null;

  const pressBar = openSlot ? (
    <ActionBar>
      {logLabel ? (
        <Button variant="primary" onClick={logOpen} disabled={busy.has(openKey)} className="abar__go logdock__go">
          <Tick /> Log set {openSlot.number} &middot; {logLabel}
        </Button>
      ) : (
        <Button variant="secondary" onClick={focusOpen} className="abar__go">
          Set {openSlot.number}: enter the numbers
        </Button>
      )}
    </ActionBar>
  ) : next ? (
    /* Every set of this movement is in. On a phone the chip rail is at the top of a page the trainer has
       scrolled away from, so finishing a movement would otherwise end in a scroll up to find the next. */
    <ActionBar>
      <Button variant="secondary" onClick={next.onOpen} className="abar__go">
        Next &middot; {next.name}
      </Button>
    </ActionBar>
  ) : null;

  /* ── the pad, for the set it is on ─────────────────────────────────────── */
  let padEl: React.ReactNode = null;
  if (padRow && pad) {
    const k = KEY(view.exerciseId, padRow.number);
    const d = drafts[k];
    const offered = offers(padRow);
    const load = weights ? shownValue(padRow, d, 'load', offered) : '';
    const reps = shownValue(padRow, d, 'reps', offered);
    const kgUnit = LOAD[padRow.loadKind].kilograms;
    const stepKg = LOAD[padRow.loadKind].step;
    const fields: NumPadField[] = [
      ...(padLoad(padRow)
        ? [{
            key: 'load', label: loadHead(padRow.loadKind), value: load, unit: kgUnit ? 'kg' : undefined,
            decimal: LOAD[padRow.loadKind].inputMode === 'decimal', min: LOAD[padRow.loadKind].min,
            chips: [
              { label: `−${stepKg}`, delta: -stepKg },
              { label: `+${stepKg}`, delta: stepKg },
              { label: `+${stepKg * 2}`, delta: stepKg * 2 },
            ],
          }]
        : []),
      ...(padReps(padRow)
        ? [{
            key: 'reps', label: effortHead(padRow.effortKind), value: reps, min: 1,
            chips: [{ label: '−1', delta: -1 }, { label: '+1', delta: 1 }],
          }]
        : []),
    ];
    const label =
      load && reps ? `${load}${kgUnit ? ' kg' : ''} × ${reps}` : reps ? `${reps} ${effortHead(padRow.effortKind).toLowerCase()}` : load ? `${load}${kgUnit ? ' kg' : ''}` : '';
    const press = () => {
      const values: Draft = { load, reps, ...(d?.rpe ? { rpe: d.rpe } : {}) };
      navigator.vibrate?.(12);
      onDraft(k, values);
      handlers.commit(view.exerciseId, padRow, values);
      if (padRow.done) {
        setPad(null);
        return;
      }
      /* On to the next open set of this movement; none left → the pad goes. */
      const nextRow = view.sets.find((x) => x.number > padRow.number && !x.done && !isSkipped(x));
      setPad(nextRow ? { exerciseId: view.exerciseId, row: nextRow.number, field: padLoad(nextRow) ? 'load' : 'reps' } : null);
    };
    padEl = (
      <NumPad
        title={<>Set {padRow.number} · {view.name}</>}
        aside={rest && !rest.over ? <>Rest {clock(rest.remaining)}</> : undefined}
        fields={fields}
        active={fields.some((f) => f.key === pad.field) ? pad.field : (fields[0]?.key ?? 'load')}
        onActive={(key) => setPad({ ...pad, field: key as 'load' | 'reps' })}
        onChange={(key, value) => onDraft(k, { [key]: value } as Draft)}
        onClose={() => setPad(null)}
        closing={padOut}
        onExited={() => {
          setPadState(null);
          setPadOut(false);
        }}
        action={{
          label: padRow.done ? <>Save set {padRow.number}</> : <><Tick /> Log set {padRow.number}{label ? <> · {label}</> : null}</>,
          onPress: press,
          disabled: busy.has(k) || (!padRow.done && !load && !reps),
        }}
      />
    );
  }

  const dockBar =
    !dock || typeof document === 'undefined' || (!restBar && !pressBar) || padRow
      ? null
      : createPortal(
          /* One fixed stack, so the two bars cannot overlap; each `.abar` inside is static. */
          <div className="logdock">
            {restBar}
            {pressBar}
          </div>,
          document.body,
        );

  return (
    <>
    <Card>
      <Card.Head title={<>{view.name}</>} className="setg__hd">
        
        {view.verdict === 'record' || view.verdict === 'quiet' ? (
          <Tag tone="pr">
            Record{view.verdict === 'quiet' ? ' · quiet' : ''}
            {view.sets.find((s) => s.pr) ? ` · set ${view.sets.find((s) => s.pr)?.number}` : ''}
          </Tag>
        ) : view.verdict === 'matched' ? (
          <Tag>Matched</Tag>
        ) : view.verdict === 'first' ? (
          <Tag tone="info">First time</Tag>
        ) : null}
        <span className="small mono setg__meta">
          {view.historySets > 0
            ? `${view.historySets} set${view.historySets === 1 ? '' : 's'} before today`
            : view.swappedFrom
              ? `swapped from ${view.swappedFrom}`
              : view.unplanned
                ? 'not on the program'
                : 'first time'}
        </span>
        {/* What the exercise list gives up when it becomes a chip rail below
            980px — `4 of 4 sets · top 112.5 kg × 4`, for the exercise the
            trainer is actually in. Drawn only there: above that width the list
            column is still saying it for every exercise on the plan, and a
            second copy in this header would be the duplication `.ph--named`
            and `.mny__dup` were each written to remove. */}
        <span className="small setg__sum">{view.summary}</span>

        {/* ── THE TWO PER-EXERCISE ACTIONS, IN THE HEADER ───────────────────
            Both are about the exercise rather than about a set, so they belong
            beside its name and not under a 360px table.

            **Swap moved up from the foot row**, at every width. It was a
            `btn--ghost` — the system's quietest tone — third in a wrapping row
            below the sets, which on a phone put the answer to *the rack is
            busy* at y=1196. It is the same button, in the place that names what
            it changes.

            **In the HEADER and not at the top of the body**, which is where the
            first version put it and is the second thing this pass measured and
            reversed: a row of its own inside `.card__b` cost the DESK ~40px it
            gained nothing for, on a page already 1.7 screens long. `.card__hd`
            is a flex row with 14px of padding around a 20px title, so a 28px
            button drops into it for ~7px — and on a phone the header is wrapping
            anyway, so the cost there is the same either way.

            **History is the phone's half of the third column.** On a desk the
            timeline is beside the fields and this is a duplicate control, so
            the rule below 620px is the only one that draws it. */}
        {/* ON A PHONE, ONE ⋯ (21 Nov 2026): the two buttons below took a row of their own above the
            first set — Last sessions & PR and Swap are each reached a few times a session, the sets
            every few seconds. Both are drawn and CSS picks one, so nothing branches on a width. */}
        <RowMenu
          className="setg__more"
          label={`More for ${view.name}`}
          items={[
            { key: 'hist', label: 'Last sessions & PR', onSelect: () => handlers.openHistory(view.exerciseId) },
            { key: 'swap', label: 'Swap this exercise', onSelect: () => handlers.openSwap(view.exerciseId) },
            { key: 'rest', label: 'Change the rest', onSelect: () => handlers.changeRest(view.exerciseId) },
          ]}
        />
        <span className="setg__acts">
          <Button
            variant="secondary"
            size="sm"
            className="setg__hist"
            onClick={() => handlers.openHistory(view.exerciseId)}
          >
            <Timer /> Last sessions &amp; PR
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handlers.openSwap(view.exerciseId)}
          >
            <Swap /> Swap
          </Button>
        </span>
      </Card.Head>

      <Card.Body>
        {/* Live and PERSISTENT — it is in the DOM whether or not it has
            anything to say, because a live region inserted at the same moment
            as its text is announced unreliably across screen readers. The
            running clock carries `role="timer"` and announces nothing, which
            is right; the end of it is the one thing worth interrupting for. */}
        <span className="vh" role="status">
          {rest?.over ? restOverLine(view.name, openSlot?.number ?? null, true) : ''}
        </span>
        <table className="sets sets--entry setlog" ref={table} style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className="n">
                <span className="vh">Set</span>
              </th>
              <th className="prev">Last time</th>
              <th className="num">{weights ? loadHead(view.loadKind) : 'Load'}</th>
              <th className="num">{effortHead(view.effortKind)}</th>
              <th className="num">RPE</th>
              <th>
                <span className="vh">Logged</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {view.sets.map((row) => {
              const key = KEY(view.exerciseId, row.number);
              const draft = drafts[key];
              const active = openSlot?.number === row.number;
              const said = offers(row);
              const working = busy.has(key);

              return [
                <tr
                  key={key}
                  data-set={row.number}
                  data-state={row.done ? 'done' : isSkipped(row) ? 'skipped' : active ? 'active' : undefined}
                  className={row.pr ? 'pr' : undefined}
                  {...swipeProps(row, key)}
                >
                  <td className="n">
                    {/* THE SET NUMBER OPENS THE SET (21 Nov 2026) — RPE and a note, Hevy's place for
                        them. It replaces the *RPE and a note* row a phone drew under every set,
                        which made each set two rows. A dot says this set already has one. */}
                    <button
                      type="button"
                      className="setg__no"
                      onClick={() => handlers.openSet(view.exerciseId, row.number)}
                      aria-label={`Set ${row.number}: RPE and a note`}
                    >
                      {row.number}
                      {row.rpe != null || row.note ? <i className="setg__dot" aria-hidden="true" /> : null}
                    </button>
                  </td>
                  {/* `data-l` on the four value cells is what the phone reflow
                      below 620px draws its labels from — the mechanism
                      `.pk__tbl` and `.sets--plan` already use. It is inert
                      above that width, where the `<thead>` is the label. */}
                  <td className="prev" data-l="Last time">
                    {row.previous ?? <em>first time</em>}
                  </td>
                  <td className="num sets__load" data-l={weights ? loadHead(row.loadKind) : 'Load'}>
                    {weights ? (
                      <div className="nstp">
                        <Step
                          label={loadStepLabel(row.loadKind, -1, row.number)}
                          sign="minus"
                          onPress={() =>
                            onDraft(key, {
                              load: stepLoad(row.loadKind, shownValue(row, draft, 'load', said), -1),
                            })
                          }
                        />
                        <input
                          className={`ctl${said && !draft?.load ? ' said' : ''}${padRow?.number === row.number && pad?.field === 'load' ? ' ctl--pad' : ''}`}
                          inputMode={padLoad(row) ? 'none' : LOAD[row.loadKind].inputMode}
                          readOnly={padLoad(row) || undefined}
                          data-numpad-field={padLoad(row) ? '' : undefined}
                          onFocus={padLoad(row) ? () => openPad(row, 'load') : undefined}
                          onClick={padLoad(row) ? () => openPad(row, 'load') : undefined}
                          autoComplete="off"
                          value={shownValue(row, draft, 'load', said)}
                          onChange={(e) => onDraft(key, { load: e.target.value })}
                          onKeyDown={onKeyDown(row)}
                          aria-label={`${LOAD[row.loadKind].kilograms ? 'Load' : LOAD[row.loadKind].label}, set ${row.number}`}
                        />
                        <Step
                          label={loadStepLabel(row.loadKind, 1, row.number)}
                          sign="plus"
                          onPress={() =>
                            onDraft(key, {
                              load: stepLoad(row.loadKind, shownValue(row, draft, 'load', said), 1),
                            })
                          }
                        />
                      </div>
                    ) : (
                      /* §09: a time or a reps-only exercise RELABELS the two
                         input columns; it never adds one. The load column is not
                         removed and no column is added — it says no load and
                         stays, because a sixth column would have to come out of
                         Previous. */
                      <span className="small ink3">— no load</span>
                    )}
                  </td>
                  <td className="num sets__reps" data-l={effortHead(row.effortKind)}>
                    <div className="nstp">
                      <Step
                        label={effortStepLabel(row.effortKind, -1, row.number)}
                        sign="minus"
                        onPress={() =>
                          onDraft(key, {
                            reps: stepEffort(row.effortKind, shownValue(row, draft, 'reps', said), -1),
                          })
                        }
                      />
                      <input
                        className={`ctl${said && !draft?.reps ? ' said' : ''}${padRow?.number === row.number && pad?.field === 'reps' ? ' ctl--pad' : ''}`}
                        inputMode={padReps(row) ? 'none' : EFFORT[row.effortKind].inputMode}
                        readOnly={padReps(row) || undefined}
                        data-numpad-field={padReps(row) ? '' : undefined}
                        onFocus={padReps(row) ? () => openPad(row, 'reps') : undefined}
                        onClick={padReps(row) ? () => openPad(row, 'reps') : undefined}
                        autoComplete="off"
                        value={shownValue(row, draft, 'reps', said)}
                        onChange={(e) => onDraft(key, { reps: e.target.value })}
                        onKeyDown={onKeyDown(row)}
                        aria-label={`${EFFORT[row.effortKind].label}, set ${row.number}`}
                      />
                      <Step
                        label={effortStepLabel(row.effortKind, 1, row.number)}
                        sign="plus"
                        onPress={() =>
                          onDraft(key, {
                            reps: stepEffort(row.effortKind, shownValue(row, draft, 'reps', said), 1),
                          })
                        }
                      />
                    </div>
                  </td>
                  {/* RPE IS A DESK COLUMN, AND THIS CLASS IS HOW IT SAYS SO.
                      This component's own header states it: *"RPE is a column
                      here and a sheet there — §09 fixes the phone at five
                      columns because that is what fits at 360dp with Previous
                      intact."* The console had it in the row at every width,
                      and on a phone that pushed the tick 224px off the right
                      edge. Below 620 it goes back to being the sheet's, which
                      is where the phone always kept it — and the `RPE and a
                      note` button under every row is the pointer path to it,
                      drawn for open rows too now rather than only for done. */}
                  <td className="num sets__rpe" data-l="RPE">
                    <input
                      className="ctl"
                      style={{ maxWidth: 56 }}
                      inputMode="decimal"
                      autoComplete="off"
                      value={fieldValue(row, draft, 'rpe')}
                      onChange={(e) => onDraft(key, { rpe: e.target.value })}
                      onKeyDown={onKeyDown(row)}
                      aria-label={`RPE, set ${row.number}`}
                    />
                  </td>
                  <td className="tick">
                    {isSkipped(row) ? (
                      <button
                        type="button"
                        className="tk tk--skip"
                        onClick={() => handlers.unskip(view.exerciseId, row.number)}
                        aria-label={`Set ${row.number} skipped — undo the skip`}
                        title="Skipped — tap to undo"
                      >
                        Skip
                      </button>
                    ) : (
                    <button
                      type="button"
                      className={`tk${row.done ? ' tk--on' : ''}`}
                      aria-pressed={row.done}
                      disabled={working}
                      onClick={() =>
                        row.done
                          ? handlers.remove(view.exerciseId, row)
                          : handlers.commit(view.exerciseId, row, draft ?? {})
                      }
                      aria-label={row.done ? `Set ${row.number} logged — un-log it` : `Log set ${row.number}`}
                      title={row.done ? `Set ${row.number} logged` : `Log set ${row.number}`}
                    >
                      <Tick />
                    </button>
                    )}
                  </td>
                </tr>,

                row.note ? (
                  <tr key={`${key}-note`} className="note">
                    <td />
                    <td colSpan={5}>
                      <p>
                        <Note /> {row.note}
                      </p>
                    </td>
                  </tr>
                ) : null,

                error[key] ? (
                  <tr key={`${key}-err`} className="note">
                    <td />
                    <td colSpan={5}>
                      <p style={{ color: 'var(--tx-danger)', borderLeftColor: 'var(--tx-danger)' }}>
                        {error[key]}
                      </p>
                    </td>
                  </tr>
                ) : null,

                /* Drawn for a logged row at every width, for the OPEN slot on a
                   phone, and for nothing else.

                   `note--open` is the desk's rule and is unchanged: above 620
                   the RPE column is in the row, so this button on an untouched
                   slot is a second control for a field already on screen.

                   `note--later` is the phone's, and it is a measurement. The
                   button was drawn under every row including slots the session
                   has not reached — 49px each at 390, four sets, **196px of a
                   628px window** spent on a disclosure for a set nobody has
                   done yet. RPE is a judgement about a set that happened, so
                   there is nothing to write there until the slot is the open
                   one, and it appears when it becomes it. A done row keeps it,
                   which is what it has always been for. */
                <tr
                  key={`${key}-act`}
                  className={`note note--act${row.done ? '' : active ? ' note--open' : ' note--later'}`}
                >
                  <td />
                  <td colSpan={5} style={{ paddingBottom: 6 }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlers.openSet(view.exerciseId, row.number)}
                    >
                      <Note /> RPE and a note
                    </Button>
                  </td>
                </tr>,
              ];
            })}
          </tbody>
        </table>

      </Card.Body>

      {/* ── THE FOOT ON A DESK, AND HALF A FOOT ON A PHONE ──────────────────
          The block this replaces records why these two things left the body:
          on a desk the card is a pane, the body is its scrollport, and the
          button that writes a set and the clock that says when the next one
          starts were the first two things to scroll off the only screen a
          trainer is looking at mid-set.

          A PHONE HAS NO PANE. The card is as tall as its content and the page
          is the scroller, so a foot is simply the bottom of a 900px card —
          MEASURED at 390×844, y=1007 inside a 628px window. The fix that works
          at 1440 does nothing at 390, and the same two controls are off the
          screen again for the same reason.

          So below 620px they are not in the foot at all. They are in
          `ActionBar`, pinned to the bottom edge of the viewport where a
          one-handed thumb already is — see the dock at the end of this
          component. What is left here is what a foot is genuinely for: the
          control that appends a row to the table above it, the session figure,
          and the rest LABEL, which is reference rather than a live clock. */}
      <Card.Foot className="setg__ft">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', width: '100%' }}>
          {openSlot && !dock ? (
            <>
              <Button
                variant="primary"
                size="sm"
                disabled={!offers(openSlot)}
                onClick={acceptLastTime}
              >
                <Tick /> {openSlot.previous !== null ? <>Take last time&rsquo;s numbers</> : <>Take the plan&rsquo;s numbers</>}
              </Button>
              <span className="small mono">&#8984;&#8629;</span>
            </>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => handlers.addSlot(view.exerciseId)}>
            <Plus /> Add a set
          </Button>
          {/* Swap used to sit here. It is in `.setg__acts` at the head of the
              card now — see that block for why. */}
          <span style={{ flex: 1 }} />
          <span className="small mono">volume {view.volumeKg.toLocaleString('en-IN')} kg</span>
        </div>

        {/* Rest is per exercise, not per trainer: 90 seconds after a bench set
            and 20 after a curl is one trainer, not two preferences.

            It used to live only on the program row, so an exercise off the plan
            had nowhere to keep one and this strip said so rather than offering a
            dead control. `workout_exercise.rest_seconds` — V13's column, on REST
            since 28 Aug 2026 — is where an off-plan card keeps it, so the
            control is live for every card now and the strip says which row a
            change would land on instead.

            THE TWO LIVE STATES ARE THE DOCK'S ON A PHONE, and they are not
            drawn twice: a clock announced from a `display:none` copy as well as
            from a visible one is the bug `useThumbDock` exists to avoid. The
            third — the resting rest, which is a LABEL and not a clock — stays
            here at every width, because `Change` is a program edit and a
            program edit does not belong in the thumb's arc. */}
        {rest && dock ? null : rest?.over ? (
          /* Spent. The strip does not disappear at zero — see `Rest.over` in
             `Console.tsx` for why — it turns green and says which set is up.
             That sentence is the whole point of the state: "rest over" is a
             fact about the past, and the trainer needs the instruction. */
          <div className="rst2 rst2--over">
            <Tick />
            <b>0:00</b>
            <span>{restOverLine(view.name, openSlot?.number ?? null)}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* Not a stopped clock's controls — the only two things left to
                  say are "they need longer" and "we are going". */}
              <Button variant="ghost" size="sm" onClick={() => onAdjustRest(15)}>
                +15 more
              </Button>
              <Button variant="secondary" size="sm" onClick={onSkipRest}>
                Got it
              </Button>
            </span>
          </div>
        ) : rest ? (
          /* Counting. Same strip, same place — the number the trainer was
             already reading starts moving, rather than a clock appearing
             somewhere else on the screen and asking to be found. */
          <div
            className="rst2 rst2--run"
            role="timer"
            aria-label={`${clock(rest.remaining)} rest remaining after a ${view.name.toLowerCase()} set`}
          >
            <Timer />
            <b>{clock(rest.remaining)}</b>
            <span className="rst2__bar" aria-hidden="true">
              <span
                className="rst2__fill"
                style={{ width: `${bar(rest.remaining, rest.total) * 100}%` }}
              />
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* At the two ends of the clock on the phone because it is used
                  one-handed at arm's length. On a desk they are a pair, next
                  to the thing they change. */}
              <Button variant="ghost" size="sm" onClick={() => onAdjustRest(-15)}>
                &minus;15
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onAdjustRest(15)}>
                +15
              </Button>
              <Button variant="secondary" size="sm" onClick={onSkipRest}>
                Skip
              </Button>
            </span>
          </div>
        ) : (
          <div className="rst2">
            <Timer />
            <b>{view.restSeconds ? clock(view.restSeconds) : '—'}</b>
            {/* *Per exercise, not per trainer* came off the end of this
                sentence on 21 Sep 2026. It is the argument for the FEATURE and
                it is already made in three places a builder reads — this
                component's own header, the rest modal it opens, and
                `AGENTS.md`. On the strip it was a claim about the product
                sitting in the row that states this exercise's rest, and the
                `on the program` / `today only` label 8px to its right already
                says the only part of it a trainer acts on. */}
            <span>
              {view.restSeconds ? 'rest after a ' : 'no rest set for '}
              <u>{view.name.toLowerCase()}</u> {view.restSeconds ? 'set.' : 'yet.'}
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="small ink3">
                {restScope === 'program' ? 'on the program' : 'today only'}
              </span>
              {restEditable ? (
                <Button variant="ghost" size="sm" onClick={() => handlers.changeRest(view.exerciseId)}>
                  Change
                </Button>
              ) : null}
            </span>
          </div>
        )}
      </Card.Foot>
    </Card>

    {dockBar}
    {padEl}
    </>
  );
}

/**
 * One stepper button.
 *
 * ── Why it is not in the tab order ────────────────────────────────────────
 *
 * Tab order down this row is Load → Reps → RPE, and it is the whole reason the
 * console beats the phone at *catching up a session logged on paper*: twelve
 * sets out of a notebook is tab-type-tab-type. Four extra tab stops per row
 * would make the keyboard path 2.3× longer to serve a control the keyboard
 * user does not need — they are typing the number.
 *
 * So `tabIndex={-1}`, and WCAG 2.1.1 is met by the input, not by the button:
 * the FUNCTION — setting a load or a rep count — is fully keyboard operable
 * where it always was. This is the same argument `app.css` already makes for
 * hiding the accelerator bar on a touch screen, pointing the other way: a
 * redundant path for one input device does not get to tax the other.
 *
 * Still a real `<button>`, so it takes a click, an Enter or a Space once
 * focused, and reads its own label to a screen reader that lands on it.
 */
function Step({
  label,
  sign,
  onPress,
}: {
  label: string;
  sign: 'minus' | 'plus';
  onPress: () => void;
}) {
  return (
    <button
      className="nstp__b"
      type="button"
      tabIndex={-1}
      onClick={onPress}
      aria-label={label}
      title={label}
    >
      {/* An SVG rather than a glyph: `−` and `+` at 13px in the UI face sit on
          different optical centres, so a text pair never lines up vertically
          however the box is padded. Two strokes do. */}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        <path d={sign === 'plus' ? 'M12 5v14M5 12h14' : 'M5 12h14'} />
      </svg>
    </button>
  );
}
