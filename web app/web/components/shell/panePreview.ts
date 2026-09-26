'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * THE HOVER PREVIEW — which section the pointer is asking about, not which one
 * the route is on.
 *
 * `paneCollapse.ts` beside this file holds the OTHER answer: the pinned state, a
 * choice the trainer makes and this device remembers. This one is the opposite
 * kind of state in every respect — it is transient, it is never written down,
 * and it never survives the pointer leaving. Keeping the two in one hook would
 * have meant a `localStorage` write on every hover.
 *
 * ── WHAT IT IS FOR ───────────────────────────────────────────────────────────
 *
 * Resting on *Fitness* opens that section's pages without navigating, and
 * sliding down to *Business* swaps them. It is the rail's own answer to the
 * thing a collapsed pane costs: the pages are one hover away instead of a click,
 * a route change and a second click.
 *
 * ── THE TWO NUMBERS, AND WHY THEY ARE NOT THE SAME NUMBER ────────────────────
 *
 * OPENING WAITS. A rail is a column you cross on the way to somewhere else —
 * *Today* is above *Fitness* and *Business* is below it — and a pane that opens
 * on contact flashes twice on every trip down the rail. 120ms is long enough to
 * tell a sweep from a stop and short enough that a stop does not feel queried.
 *
 * SWAPPING DOES NOT WAIT. Once a pane is open the question has already been
 * asked, and re-asking it 120ms at a time down a list of sections is a column
 * that stutters. Open is a decision; swapping is reading.
 *
 * CLOSING WAITS LONGER THAN OPENING. The path from a rail row to the pane it
 * opened is diagonal — down and to the right, across the corner — and for part
 * of that path the pointer is over neither. At 0ms the pane a trainer is
 * reaching for closes under their hand. The grace is what makes the corner
 * survivable, and it is the same reason `hold()` exists: anything the preview
 * covers can cancel a pending close by saying it is under the pointer.
 */
export const OPEN_DELAY = 120;
export const SWAP_DELAY = 0;
export const CLOSE_GRACE = 200;

export type PanePreview<K extends string> = {
  /** The section being previewed, or `null`. The live answer. */
  key: K | null;
  /**
   * The last section that WAS previewed, which is not the same question and is
   * not redundant with it.
   *
   * The flyout fades and slides on its way out, so for the length of that exit
   * it is still on screen with `key` already `null` — and a pane rendered from
   * `key` would blank its own contents on frame one and fade out an empty box.
   * This is what it renders instead: the thing that was there. It is never
   * cleared, because an element that is already invisible does not need to be
   * told what it is not showing.
   */
  shown: K | null;
  /** The pointer (or the focus ring) arrived on a row. `null` means a row with
   *  no pages, which is a request to CLOSE — with the grace, not instantly. */
  enter: (next: K | null) => void;
  /** Under the pointer after all — cancel whatever close is pending. */
  hold: () => void;
  /** Left. Closes after the grace. */
  leave: () => void;
  /** Gone now, no grace. The route changed under it. */
  close: () => void;
};

export function usePanePreview<K extends string>(): PanePreview<K> {
  const [key, setKey] = useState<K | null>(null);
  const [shown, setShown] = useState<K | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  /* One timer, and every path goes through it — including the `0ms` swap, which
     could have set state directly. It does not, because a swap can land while a
     close from the row the pointer just left is still pending, and two code
     paths racing to write the same piece of state is how a pane ends up open
     with nothing in it. Scheduling everything means the last thing the pointer
     did is the only thing that happens. */
  const commit = useCallback(
    (next: K | null, delay: number) => {
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        setKey(next);
        if (next) setShown(next);
      }, delay);
    },
    [clear],
  );

  const enter = useCallback(
    (next: K | null) => {
      if (next === null) {
        commit(null, CLOSE_GRACE);
        return;
      }
      /* `key` and not `shown`: what decides between opening and swapping is
         whether a pane is OPEN right now, not whether one was open a moment
         ago. `shown` outlives the close by the length of the exit. */
      commit(next, key ? SWAP_DELAY : OPEN_DELAY);
    },
    [commit, key],
  );

  const hold = useCallback(() => clear(), [clear]);
  const leave = useCallback(() => commit(null, CLOSE_GRACE), [commit]);
  const close = useCallback(() => {
    clear();
    setKey(null);
  }, [clear]);

  /* A pending open outliving the component would call `setKey` on something
     that has unmounted — and this shell unmounts on sign-out, with a pointer
     that was on the rail a hundred milliseconds ago. */
  useEffect(() => clear, [clear]);

  return { key, shown, enter, hold, leave, close };
}
