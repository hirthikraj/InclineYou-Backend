'use client';

import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * EXPAND AND COLLAPSE FOR TABLE ROWS, WHICH CANNOT ANIMATE THEIR HEIGHT.
 *
 * A `<tr>` has no height to transition and is removed from the DOM the moment
 * state drops it, so a disclosure inside a table either snapped or needed every
 * cell wrapped. This animates where the rows GO instead (FLIP): measure every
 * row marked `data-flip="<stable key>"`, apply the change, and slide each row
 * that moved from its old position to its new one. Rows that arrived fade and
 * drop in, staggered; rows that are leaving fade out first and the change is
 * applied after, so the rows under them glide up rather than jump.
 *
 * Transform and opacity only, 140–240ms on the system's curves. Under
 * `prefers-reduced-motion`, or without the Web Animations API, the change is
 * applied at once and nothing moves.
 */
const ENTER = 'cubic-bezier(.2,.8,.2,1)';
const EXIT = 'cubic-bezier(.4,0,1,1)';

function rowsIn(root: HTMLElement | null): HTMLElement[] {
  return root ? [...root.querySelectorAll<HTMLElement>('[data-flip]')] : [];
}

function still(): boolean {
  return (
    typeof window === 'undefined' ||
    typeof Element.prototype.animate !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function useFlipRows<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  /** Apply `change`; `leaving` names the `data-flip` keys it will remove. */
  flip: (change: () => void, leaving?: string[]) => void;
} {
  const ref = useRef<T | null>(null);
  const before = useRef<Map<string, number> | null>(null);

  useLayoutEffect(() => {
    const prev = before.current;
    if (!prev) return;
    before.current = null;
    let arrived = 0;
    for (const row of rowsIn(ref.current)) {
      const key = row.dataset.flip ?? '';
      const top = row.getBoundingClientRect().top;
      const was = prev.get(key);
      if (was !== undefined) {
        const dy = was - top;
        if (Math.abs(dy) > 0.5) {
          row.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
            duration: 240,
            easing: ENTER,
          });
        }
      } else {
        row.animate(
          [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }],
          { duration: 220, delay: Math.min(arrived++, 6) * 35, easing: ENTER, fill: 'backwards' },
        );
      }
    }
  });

  const flip = useCallback((change: () => void, leaving: string[] = []) => {
    if (still()) {
      change();
      return;
    }
    const measure = () => {
      const m = new Map<string, number>();
      for (const row of rowsIn(ref.current)) m.set(row.dataset.flip ?? '', row.getBoundingClientRect().top);
      before.current = m;
    };
    const going = rowsIn(ref.current).filter((r) => leaving.includes(r.dataset.flip ?? ''));
    if (going.length === 0) {
      measure();
      change();
      return;
    }
    const outs = going.map((row, i) =>
      row.animate(
        [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }],
        { duration: 140, delay: Math.min(going.length - 1 - i, 6) * 20, easing: EXIT, fill: 'forwards' },
      ),
    );
    /* The change never waits on the animation clock: a backgrounded tab pauses
       it, and a disclosure that only closed once the fade finished would not
       close at all. Whichever comes first — the fades, or 260ms — applies it. */
    let done = false;
    const apply = () => {
      if (done) return;
      done = true;
      measure();
      change();
    };
    void Promise.all(outs.map((a) => a.finished.catch(() => undefined))).then(apply);
    window.setTimeout(apply, 260);
  }, []);

  return { ref, flip };
}
