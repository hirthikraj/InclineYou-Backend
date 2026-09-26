import type { DragEvent } from 'react';

import { EXERCISE_MIME, carriesExercise } from '../week/dnd';

/**
 * WHAT THE POINTER IS CARRYING INSIDE THE WORKOUT BUILDER.
 *
 * The library's own type is REUSED rather than re-minted — `EXERCISE_MIME` is
 * *a movement dragged out of the exercise library*, and that is exactly what
 * the left pane hands over here. A second private type for the same payload
 * would mean two answers to one question, and the first surface to test the
 * wrong one silently refuses every drop.
 */
export { EXERCISE_MIME, carriesExercise };

/**
 * A CARD ALREADY ON THE CANVAS, picked up by its grip.
 *
 * A second type rather than a flag on the first, for the reason `week/dnd.ts`
 * gives: the two drags mean different things to whatever is being dragged over.
 * One COPIES out of a library that is not emptied by being drawn from; the
 * other MOVES a card that leaves a hole behind it. The canvas tests which it is
 * before it says it accepts, and the cursor tells the trainer the same thing.
 */
export const CARD_MIME = 'application/x-inclineyou-workout-card';

export function carriesCard(e: DragEvent) {
  return e.dataTransfer.types.includes(CARD_MIME);
}

/**
 * A LABELLED BREAK, dragged out of the library or picked up off the canvas.
 *
 * A THIRD TYPE, and the reason is the same one that splits the first two: what
 * is being carried decides what the canvas may answer. A movement can land
 * between two cards OR onto one, because two movements make a circuit. A
 * heading has no such gesture — *Warm-up* dropped onto a bench press is not a
 * thing a session can mean — so the canvas reads the type and offers insertion
 * points alone. Testing a flag in React state instead would miss the first
 * `dragover`, which lands in the same task as `dragstart`; the type list is
 * readable mid-drag and that is exactly what it is for.
 *
 * The payload is the LABEL for a drag out of the library and the divider's uid
 * for one off the canvas — `carriedDivider` in the builder carries which, for
 * the reason `getData` cannot be read until the drop.
 */
export const DIVIDER_MIME = 'application/x-inclineyou-workout-divider';

export function carriesDivider(e: DragEvent) {
  return e.dataTransfer.types.includes(DIVIDER_MIME);
}

/**
 * A WHOLE SAVED SESSION, dragged out of the library's *Workout Templates*.
 *
 * A FOURTH TYPE, for the reason the first three are separate: what is carried
 * decides what the canvas may answer. This one carries a dozen movements, their
 * circuits and the headings that block them out — so it inserts and never
 * chains, exactly as a heading does. *Push · full gym* dropped ONTO a bench
 * press is not a thing a session can mean; a circuit inside the arriving
 * template would have to be broken to say it.
 *
 * The payload is the template's id, and it is read only as the fallback the
 * heading's is: the row itself rides in the builder's state, because the drop
 * needs the name to fetch the movements by.
 */
export const TEMPLATE_MIME = 'application/x-inclineyou-workout-template';

export function carriesTemplate(e: DragEvent) {
  return e.dataTransfer.types.includes(TEMPLATE_MIME);
}

/**
 * WHERE A DROP WOULD LAND — and there are TWO answers, not one.
 *
 * `week/dnd.ts`'s `locateDrop` only ever computes an insertion point, because a
 * day has one way to receive a row. This canvas has two: a movement can go
 * BETWEEN two cards, or it can go ONTO one, which chains them into a circuit.
 * So the card's own box is split — the middle band is the card, the edges are
 * the gaps either side of it — and the trainer's aim decides which gesture they
 * made.
 *
 * `EDGE` IS A FRACTION OF THE CARD AND NOT A PIXEL COUNT. A card holding one
 * set is ~120px and one holding six is ~340px; a fixed 40px edge is a third of
 * the first card and a ninth of the last, so the same gesture would mean
 * different things depending on how much the trainer had already written. A
 * third either way keeps the middle band the largest target on every card,
 * which is right: chaining is the deliberate act and inserting is the default.
 *
 * `top` comes back in the canvas' own coordinates, because the insertion
 * indicator is one absolutely positioned rule rather than a border on a card —
 * a target that grows by 2px as you approach it is how a drop lands one place
 * off. The same reasoning, and the same repair, as the day card's.
 */
const EDGE = 0.34;

export type DropTarget =
  | {
      kind: 'insert';
      before: string | null;
      top: number;
      /**
       * THE HEADINGS THAT HAVE TO COME WITH THE NEW CARD — and this is the
       * whole of the fix for *a divider at the foot can never have anything
       * under it*.
       *
       * A heading anchored to movement B is DRAWN above B. So the gap under
       * *Strength* and the gap above *Strength* are two different places on
       * screen that were both `before: B` in the model, and every drop resolved
       * to the same one: above. At the foot of the workout — `before: null`,
       * the commonest case, since a heading is written before the block it
       * opens — that meant the block could never be filled at all.
       *
       * The slot decides it. Every heading drawn between the last card and the
       * pointer is a heading the trainer has aimed BELOW, so it re-anchors onto
       * whatever lands there and stays where it was drawn. `addExercise` and
       * `moveExercise` take this list; nothing has to compare anchors.
       */
      adopt: string[];
    }
  | { kind: 'chain'; onto: string };

/**
 * The card an insertion at this slot lands above, or null for the end.
 *
 * THE CARD BEING DRAGGED IS NOT ONE OF THEM, and skipping it is the whole of a
 * defect: a movement sitting under a heading could not be dragged back above
 * it. The slot above *Strength* resolved to *before: the dragged card itself*,
 * because that card is the next one drawn after the heading — and a move to
 * where you already are is a no-op, so letting go did nothing at all. The card
 * is leaving that position; what lands at the slot is whatever is drawn after
 * the hole it left.
 */
function nextCard(blocks: HTMLElement[], from: number, exclude?: string | null): string | null {
  for (let i = from; i < blocks.length; i += 1) {
    const uid = blocks[i].dataset.block;
    if (uid && uid !== exclude) return uid;
  }
  return null;
}

/** The run of headings immediately ABOVE this slot — see `adopt`. */
function adoptedAt(blocks: HTMLElement[], slot: number): string[] {
  const out: string[] = [];
  for (let i = slot - 1; i >= 0; i -= 1) {
    const uid = blocks[i].dataset.divider;
    if (!uid) break;
    out.unshift(uid);
  }
  return out;
}

export function locateWorkoutDrop(
  canvas: HTMLElement,
  clientY: number,
  /** Chaining is offered only where it would mean something. A card being
   *  dragged cannot be chained onto itself, and the library's drag has no
   *  card to exclude. */
  exclude?: string | null,
  /** A heading has no chain gesture — see `DIVIDER_MIME`. The card's middle
   *  band then belongs to whichever gap it is nearer, so every pixel of the
   *  canvas answers with a place rather than a third of it answering with a
   *  gesture the payload cannot make. */
  insertOnly?: boolean,
): DropTarget | null {
  /* THE HEADINGS ARE MEASURED TOO, and that is the second half of the same
     repair. They were invisible here — only `[data-block]` was read — so the
     nearest gap to a pointer sitting on *Strength* was computed off the card
     ABOVE it, and the slot under the heading did not exist as a place at all.
     In DOM order, so the list is the canvas as it is drawn. */
  const blocks = [...canvas.querySelectorAll<HTMLElement>('[data-block],[data-divider]')];
  const origin = canvas.getBoundingClientRect().top;

  /* AN EMPTY CANVAS IS A TARGET, and answering `null` here was a real refusal:
     `Empty` says *let go anywhere in here to add it* and the drop did nothing,
     because there was no card to measure against. There is exactly one place a
     first movement — or a first heading — can go, so it is named rather than
     computed. */
  if (blocks.length === 0) return { kind: 'insert', before: null, top: 0, adopt: [] };

  const slot = (at: number, top: number): DropTarget => ({
    kind: 'insert',
    before: nextCard(blocks, at, exclude),
    top,
    adopt: adoptedAt(blocks, at),
  });

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const box = block.getBoundingClientRect();
    if (clientY >= box.bottom) continue;

    const uid = block.dataset.block ?? null;
    /* A HEADING IS A LINE, NOT A BOX — there is nothing to drop ONTO it, and it
       is ~20px tall, so the midpoint is the only division that fits. The same
       split is right for a card while a heading is being carried. */
    if (!uid || insertOnly) {
      return clientY < box.top + box.height / 2
        ? slot(i, box.top - origin)
        : slot(i + 1, box.bottom - origin);
    }

    const edge = box.height * EDGE;
    if (clientY < box.top + edge) return slot(i, box.top - origin);
    if (clientY > box.bottom - edge) return slot(i + 1, box.bottom - origin);
    if (uid !== exclude) return { kind: 'chain', onto: uid };
    /* The card being dragged, aimed at itself. Not *nothing* — a drag that
       reports no target at all draws no indicator and reads as broken — so it
       falls through to the gap below it, which is where letting go puts it
       back exactly where it came from. */
    return slot(i + 1, box.bottom - origin);
  }

  const last = blocks[blocks.length - 1].getBoundingClientRect();
  return slot(blocks.length, last.bottom - origin);
}
