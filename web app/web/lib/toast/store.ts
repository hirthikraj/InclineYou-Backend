'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * THE DECK'S STATE, AND THE ONE THING CSS COULD NOT DO ALONE.
 *
 * Everything the toast deck looks like is in `webapp.css` — the depth
 * transform, the two entrances, the spring. Three things are not, and this file
 * is exactly those three:
 *
 *   1. A card has to SURVIVE ITS OWN REMOVAL. `@starting-style` gives an element
 *      an entrance for free; nothing gives it an exit, because by the time the
 *      exit would run the element is gone. So dismissing marks a toast
 *      `leaving`, the host renders it one more time with `data-leaving`, and it
 *      is dropped from the array after the transition has had its 520ms.
 *
 *   2. DEPTH IS COUNTED OVER LIVE CARDS ONLY. A leaving card must not hold a
 *      slot — the deck has to close over it as it goes, which is the whole
 *      reason the motion reads as a stack settling rather than a gap appearing.
 *      `visible()` is that count.
 *
 *   3. A RECEIPT HAS A DEADLINE. Five seconds, and the timer belongs with the
 *      state rather than in the component, because a re-render must not restart
 *      it and an unmount must not leak it.
 *
 * ── WHY NOT A LIBRARY ────────────────────────────────────────────────────────
 *
 * `package.json` has three runtime dependencies and none of them animate
 * anything. A toast library brings its own portal, its own stylesheet, its own
 * z-index and its own opinion about what a confirm looks like — four things
 * this design system already has and has written down. The part a library would
 * actually have saved is below, and it is ninety lines.
 */

/** The four tones `.toast` draws, and the two `aria-live` values they pick. */
export type ToastTone = 'neutral' | 'ok' | 'warn' | 'danger';

/**
 * WHICH OF THE TWO MOTIONS THIS CONFIRM GETS, and it is a statement about the
 * news rather than about the screen.
 *
 * `notice` — one of a run, rises from below into the deck, stays until it is
 * dismissed. *Copied into your programs.* The trainer may be about to make five
 * of these and the fifth must not bury the first.
 *
 * `receipt` — a single fact with a clock on it: flies in from the right edge,
 * holds five seconds, shrinks in place. *Booked.* *Cancelled.* It is the shape
 * that can be swiped away and the only one whose Undo has a deadline, because
 * an Undo that waits forever is a second delete button in the corner of the
 * screen.
 */
export type ToastVariant = 'notice' | 'receipt';

export type ToastAction = {
  label: string;
  /** One undo, at most. A toast with two choices is a modal that got away. */
  onClick: () => void;
};

export type ToastSpec = {
  tone?: ToastTone;
  variant?: ToastVariant;
  /** Lead with what happened, in a bolded clause; then the detail. */
  title: ReactNode;
  body?: ReactNode;
  action?: ToastAction;
  /**
   * Milliseconds before it dismisses itself. Defaults to 5000 on a `receipt`
   * and to *never* on a `notice`. `null` pins it open explicitly.
   */
  duration?: number | null;
};

export type ToastRecord = ToastSpec & {
  id: string;
  /** Dismissed, and being held in the DOM for one exit transition. */
  leaving: boolean;
};

/** Radix's default, and the reference's. Long enough to read an Undo. */
const RECEIPT_MS = 5000;

/**
 * How long a dismissed card is kept mounted. `--tx-t-spring` is 520ms; this is
 * that plus a frame's grace, because a card unmounted ON the last frame of its
 * own transition flickers.
 */
const EXIT_MS = 560;

/**
 * The cap, and it is not the four the deck draws.
 *
 * Four are visible and a fifth sits under them at zero opacity so that it can
 * fade UP into the deck when the front card goes — a fifth that was not already
 * mounted would have to appear, and appearing is the thing this component
 * exists to stop. Six would be a card nobody will ever see.
 */
const MAX = 5;

type Ctx = {
  toasts: ToastRecord[];
  /** @returns the id, so a caller can dismiss its own toast early. */
  show: (spec: ToastSpec) => string;
  dismiss: (id: string) => void;
};

const ToastCtx = createContext<Ctx | null>(null);

/**
 * The hook every call site uses. It throws rather than no-oping when the host
 * is missing: a confirm that silently does not appear is the exact failure the
 * deck was built to fix, and it would only ever be noticed in support.
 */
export function useToast(): Ctx {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast() outside <ToastHost>. Mount it in the app shell.');
  return ctx;
}

export const ToastProvider = ToastCtx.Provider;

/** The depth a card is drawn at — leaving cards do not hold a slot. See (2). */
export function depthOf(toasts: ToastRecord[], index: number): number {
  let depth = 0;
  for (let i = 0; i < index; i++) if (!toasts[i].leaving) depth++;
  return depth;
}

/**
 * The state itself, lifted out of the host so the host is only markup.
 *
 * Newest FIRST in the array, which is the order the deck draws in — index 0 is
 * the front card, nearest the thumb. That is worth stating because it is the
 * reverse of the order a log would keep, and every `--i` in the stylesheet
 * depends on it.
 */
export function useToastStore(): Ctx {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  /* Every timer this store owns, by id: the auto-dismiss and the unmount. Kept
     in a ref rather than in state because clearing one must not re-render, and
     held so the effect below can cancel every one of them on unmount. */
  const timers = useRef(new Map<string, number[]>());

  const clearTimers = useCallback((id: string) => {
    timers.current.get(id)?.forEach(t => window.clearTimeout(t));
    timers.current.delete(id);
  }, []);

  const track = useCallback((id: string, timer: number) => {
    const list = timers.current.get(id);
    if (list) list.push(timer);
    else timers.current.set(id, [timer]);
  }, []);

  const drop = useCallback(
    (id: string) => {
      clearTimers(id);
      setToasts(prev => prev.filter(t => t.id !== id));
    },
    [clearTimers],
  );

  const dismiss = useCallback(
    (id: string) => {
      let found = false;
      setToasts(prev =>
        prev.map(t => {
          if (t.id !== id || t.leaving) return t;
          found = true;
          return { ...t, leaving: true };
        }),
      );
      /* The auto-dismiss timer is cancelled the moment the card starts leaving
         — a second dismiss of a card already on its way out would schedule a
         second unmount, and the first one has already gone. */
      if (!found) return;
      clearTimers(id);
      track(id, window.setTimeout(() => drop(id), EXIT_MS));
    },
    [clearTimers, drop, track],
  );

  const show = useCallback(
    (spec: ToastSpec) => {
      const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      const variant = spec.variant ?? 'notice';
      const duration =
        spec.duration === undefined ? (variant === 'receipt' ? RECEIPT_MS : null) : spec.duration;

      setToasts(prev => {
        const next = [{ ...spec, variant, id, leaving: false }, ...prev];
        /* Over the cap, the OLDEST live card is dismissed rather than spliced:
           it leaves the way every other card leaves, which is the difference
           between a deck that settles and one that blinks. */
        const live = next.filter(t => !t.leaving);
        if (live.length > MAX) {
          const evict = live[live.length - 1].id;
          /* Deferred, because this runs inside a state updater and `dismiss`
             sets state of its own. */
          window.setTimeout(() => dismiss(evict), 0);
        }
        return next;
      });

      if (duration !== null) track(id, window.setTimeout(() => dismiss(id), duration));
      return id;
    },
    [dismiss, track],
  );

  /* One cleanup for every timer the store ever opened. Written against the ref
     itself rather than a copy: the map is mutated for the life of the host and
     the value at unmount is the one that holds the outstanding handles. */
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach(list => list.forEach(t => window.clearTimeout(t)));
      map.clear();
    };
  }, []);

  return useMemo(() => ({ toasts, show, dismiss }), [toasts, show, dismiss]);
}
