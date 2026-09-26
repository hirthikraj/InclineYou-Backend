import type { DragEvent } from 'react';

/**
 * WHAT THE POINTER IS CARRYING, ACROSS THE WHOLE BOARD.
 *
 * The dock's click adds to the day the dock is pinned to — right for the day
 * being built, and wrong for the other three on screen, where repinning the
 * dock to place one movement is two clicks of bookkeeping for one prescription.
 * So the grip is the shorthand: a movement dragged out of the library lands on
 * whichever day it is let go over, and clicking is left exactly as it was.
 *
 * A PRIVATE TYPE, so a day only ever accepts a movement dragged out of THIS
 * library — a file, a link or a selection dragged in from elsewhere is not a
 * prescription. `DayColumn` carries its own for rows for the same reason.
 */
export const EXERCISE_MIME = 'application/x-inclineyou-exercise';

/**
 * Does this drag carry a library movement?
 *
 * ASKED OF THE PAYLOAD'S TYPE, NOT OF REACT STATE. `dragstart` and the first
 * `dragover` land in the same task, so a gate on a prop misses that one —
 * harmless in a real drag, where a second `dragover` arrives a pixel later, and
 * wrong in principle. The type list is readable mid-drag where `getData` is
 * not, which is exactly what it is there for; the exercise itself rides in the
 * board's state, because a day needs the whole record to name the row it adds.
 */
export function carriesExercise(e: DragEvent) {
  return e.dataTransfer.types.includes(EXERCISE_MIME);
}

/**
 * A WHOLE WORKOUT, PICKED UP BY ITS HEADER — law 5's gesture.
 *
 * A SECOND TYPE, because what a day does with the drop differs. A movement is
 * COPIED out of a library that is not emptied by being drawn from; a container
 * is MOVED, whole — eight rows, their supersets and the name, landing above
 * another container rather than between two exercises. A day that could not
 * tell them apart would be one gesture with two meanings.
 *
 * The payload is the container's id; `moveWorkout` reads its rows out of the
 * draft, so the drag carries no rows and nothing has to be serialised.
 */
export const WORKOUT_MIME = 'application/x-inclineyou-workout';

export function carriesWorkout(e: DragEvent) {
  return e.dataTransfer.types.includes(WORKOUT_MIME);
}

/**
 * WHERE, MEASURED OFF THE BLOCKS THEMSELVES.
 *
 * A SUPERSET IS ONE BLOCK AND THEREFORE ONE TARGET: an insertion point between
 * 4a and 4b would be offering to put a row inside a pair, which `blocksOf`
 * would then read back as two blocks nobody asked for. So the elements measured
 * are the block wrappers, and the answer is the uid of the block the drag would
 * land ABOVE — null for the tail.
 *
 * `top` comes back with it, in the card's own coordinates, because the
 * indicator is drawn as one absolutely positioned rule rather than as a border
 * on the block: a target that grows by 2px as you approach it is how a drop
 * lands one place off.
 */
export function locateDrop(
  card: HTMLElement,
  clientY: number,
  /* WHAT IS BEING AIMED AT, and it is the one thing that differs between the
     two drags. A movement or a row lands between BLOCKS (`data-block`); a
     workout lands between CONTAINERS (`data-workout`), because an insertion
     point inside somebody else's session is not a place a session can go —
     `settleWorkouts` would absorb it and the trainer would watch two workouts
     become one. Same measurement, same floating rule, one selector apart. */
  selector: '[data-block]' | '[data-workout]' = '[data-block]',
): { before: string | null; top: number } | null {
  const blocks = [...card.querySelectorAll<HTMLElement>(selector)];
  if (blocks.length === 0) return null;
  const origin = card.getBoundingClientRect().top;
  for (const block of blocks) {
    const box = block.getBoundingClientRect();
    if (clientY < box.top + box.height / 2) {
      const id = selector === '[data-block]' ? block.dataset.block : block.dataset.workout;
      return { before: id ?? null, top: box.top - origin };
    }
  }
  const last = blocks[blocks.length - 1].getBoundingClientRect();
  return { before: null, top: last.bottom - origin };
}
