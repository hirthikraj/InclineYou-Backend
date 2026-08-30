'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * THE KEYBOARD CONTRACT THE COMPONENT LIBRARY PUBLISHED AND NOTHING BUILT.
 *
 * §01.5 of `webapp-schedule.html` is about a promise made in print: the library
 * specified that the week is a grid, that each block's name is the whole
 * sentence, and that *"arrows move, ↵ opens the panel"*. The file it audits had
 * `role="grid"` zero times and 102 `<div>`s.
 *
 * This is that contract, minus the part of it that would be a lie. What is NOT
 * built is `role="grid"` itself, and the reason is the same finding read the
 * other way: a `role="grid"` promises a screen reader a rectangular table it can
 * walk cell by cell, and a week of sessions is not one — a day with no session
 * has no cell at all, two clashing sessions share one, and a 90-minute block
 * spans an hour and a half of an axis that has no rows. Announcing a grid that
 * cannot be navigated as a grid is worse than announcing a group of buttons,
 * which is what it actually is. §01 exists to catch published-and-unbuilt; this
 * declines to publish rather than half-building.
 *
 * What IS built is the part that costs a keyboard user real time:
 *
 *   · **One tab stop for the whole grid.** A roving `tabIndex` — twenty-three
 *     sessions is twenty-three tab stops otherwise, on a screen reached by
 *     tabbing past the rail's ten destinations, which is the same arithmetic
 *     that put a skip link on `/today`.
 *   · **↑ / ↓ move within a day**, in time order, which is how the day reads.
 *   · **← / →** move to the nearest session in the previous or next day —
 *     *nearest*, not "the first", because a trainer arrowing right from Tuesday
 *     17:00 is looking for Wednesday's evening, not Wednesday's 06:00.
 *   · **Home / End** jump to the first and last session of the visible range.
 *   · **↵ / Space** open the panel, which is what a `<button>` already does.
 *
 * The order is read from the DOM at the moment a key is pressed rather than held
 * in state, because the blocks are re-rendered whenever the clock ticks, a filter
 * changes or a move lands — and an index into a stale list is how a keyboard
 * lands on the wrong client.
 */

interface Block {
  el: HTMLElement;
  day: number;
  start: number;
}

function read(container: HTMLElement | null): Block[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>('[data-block]'))
    .map((el) => ({
      el,
      day: Number(el.dataset.day ?? 0),
      start: Number(el.dataset.start ?? 0),
    }))
    .sort((a, b) => a.day - b.day || a.start - b.start);
}

export function useGridKeys() {
  const ref = useRef<HTMLDivElement | null>(null);
  /**
   * Which block holds the single tab stop, or null for "whichever is first".
   *
   * NULL IS THE DEFAULT AND THERE IS NO EFFECT TO SET IT, which is the second
   * version of this hook. The first one synchronised `activeId` to the first
   * block in a `useEffect` — and an effect whose whole body is a `setState` is a
   * cascading render on every tick of the clock, on a screen that re-renders
   * every thirty seconds. The caller already knows which block is first (it has
   * the grid), so the fallback is computed there and this only ever holds a
   * choice the trainer actually made.
   *
   * Identified by id, not by index: an index survives a re-render and points at
   * a different session after one.
   */
  const [activeId, setActiveId] = useState<string | null>(null);

  /** Focusing a block by any means — a click, a Tab, an arrow — makes it the tab
   *  stop, so leaving the grid and coming back returns to where you were. */
  const onFocusCapture = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const el = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-block]');
    if (el?.dataset.block) setActiveId(el.dataset.block);
  }, []);

  const move = useCallback((to: Block | undefined) => {
    if (!to) return;
    setActiveId(to.el.dataset.block ?? null);
    // `preventScroll` is deliberately NOT set: a block a key moved to must be
    // brought into view, and on a week that scrolls in both axes the browser's
    // own scroll-into-view is the only thing that knows about the sticky gutter.
    to.el.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const key = event.key;
      if (
        key !== 'ArrowUp' && key !== 'ArrowDown'
        && key !== 'ArrowLeft' && key !== 'ArrowRight'
        && key !== 'Home' && key !== 'End'
      ) return;

      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-block]');
      if (!target) return;

      const blocks = read(ref.current);
      const i = blocks.findIndex((b) => b.el === target);
      if (i === -1) return;

      event.preventDefault();
      const here = blocks[i];

      if (key === 'Home') return move(blocks[0]);
      if (key === 'End') return move(blocks[blocks.length - 1]);

      if (key === 'ArrowUp' || key === 'ArrowDown') {
        const sameDay = blocks.filter((b) => b.day === here.day);
        const j = sameDay.indexOf(here) + (key === 'ArrowDown' ? 1 : -1);
        return move(sameDay[j]);
      }

      // Sideways: the next day that HAS a session, then the block in it closest
      // in time to where we are. Skipping empty days is the point — arrowing
      // through four blank Wednesdays to reach Thursday is not navigation.
      const days = Array.from(new Set(blocks.map((b) => b.day))).sort((a, b) => a - b);
      const d = days.indexOf(here.day) + (key === 'ArrowRight' ? 1 : -1);
      if (d < 0 || d >= days.length) return undefined;

      const column = blocks.filter((b) => b.day === days[d]);
      const nearest = column.reduce((best, b) =>
        Math.abs(b.start - here.start) < Math.abs(best.start - here.start) ? b : best,
      );
      return move(nearest);
    },
    [move],
  );

  return { ref, activeId, onKeyDown, onFocusCapture };
}
