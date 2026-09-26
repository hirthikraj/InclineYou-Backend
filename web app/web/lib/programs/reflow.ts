'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * A BOARD THAT RE-PLACES ITSELF, ANIMATED — and the same animation on both
 * screens that draw a week board.
 *
 * This is `Builder`'s own machinery, lifted out of it unchanged and given a
 * second caller: `/clients/:id/program/:pid`, where a trainer edits ONE
 * CLIENT'S copy of a plan on the identical board. It shipped without the
 * transition and was reported the way the builder's absence of one was reported
 * before it — the cards teleport.
 *
 * `lib/programs/draft.ts` was extracted for the same reason and its header
 * carries the general form of the argument: the two screens are not the same
 * screen, and the machinery between them is identical and has sharp edges. Here
 * the edges are a `flushSync`, a class that may only live for the duration of
 * the transition, a promise that rejects as a matter of course, and a scroll
 * that has to happen before the browser paints. Four things, each of which was
 * a defect first.
 *
 * ── EVERY RULE THIS HOOK ENFORCES IS ALREADY IN `app.css` ───────────────────
 *
 * `.vt-days .wsd[data-day="N"]{view-transition-name:wsdN}` and the
 * `.pgw::view-transition-*` rules are written against the CLASSES rather than
 * against a route, so a second screen that renders `.pgw` and `.wsd` inherits
 * the whole animation by calling this. Nothing in the stylesheet changed to
 * make the client's copy move.
 */

/**
 * SCOPED VIEW TRANSITIONS, which TypeScript's DOM lib does not carry yet.
 *
 * `document.startViewTransition` is typed; the per-element form is newer and is
 * not, so this declares the one member `reflow` calls. Optional, which
 * is also how the code has to treat it — the feature is detected at runtime and
 * falls back to the document-level transition.
 */
declare global {
  interface Element {
    startViewTransition?: (callback: () => void) => ViewTransition;
  }
}

/**
 * BEFORE THE BROWSER PAINTS — `useLayoutEffect` on the client, `useEffect` on
 * the server, because React warns that the former "does nothing on the server"
 * and both callers are server-rendered.
 *
 * Chosen at module load, so the hook order is fixed for the life of the
 * environment and React never sees it change between renders.
 */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface DayReflow {
  /** Goes on `.pgw` — the scroller, and the scope the transition is started on. */
  plane: React.RefObject<HTMLDivElement | null>;
  /**
   * RUN A WRITE THAT MOVES A CARD, ANIMATED — law 5's four.
   *
   * This animates the board re-placing itself around a container that changed
   * PLACE: dropped on another day, nudged past its neighbour, pasted, deleted.
   *
   * Hand it the write — `commit(prev => moveWorkout(...))` — and nothing else:
   * it is called from an event handler and returns immediately, and the write
   * lands one frame later inside the transition. See `armed` for the frame.
   *
   * ── `names:false` FOR A WRITE THAT MOVES A CARD BETWEEN DAYS ──────────────
   *
   * MEASURED, and it is the one sharp edge in here. A container that changes
   * DAY is a different DOM node afterwards — React unmounts it from one card
   * and mounts it in the other — and for an instant inside the update callback
   * both nodes are in the document carrying the same `view-transition-name`.
   * Chrome refuses a transition whose new state ever holds a duplicate name:
   * every cross-day drop came back `InvalidStateError · Transition was aborted
   * because of invalid state`, while the identical write from *Move down* or
   * *Paste* — a reorder inside one parent, and a fresh element — animated.
   *
   * So the caller says which it is. With names the container itself travels;
   * without them the DAY CARDS are still named (`.vt-days`, which this hook
   * adds either way) and the board morphs around the change: the card it left
   * shrinks, the card it joined grows, and their contents cross-fade. One
   * movement either way — what differs is whether the box flies or dissolves,
   * and a transition that is refused outright animates nothing at all.
   */
  reflow: (write: () => void, opts?: { names?: boolean }) => void;
  /**
   * THE CONTAINERS NEED `view-transition-name` IN *BOTH* SNAPSHOTS, and this is
   * the render that puts it there.
   *
   * A day's name can be written in CSS — there are seven of them and
   * `.vt-days .wsd[data-day="4"]` is a real selector. A workout's cannot: the
   * id is minted at runtime, CSS cannot compute a name from an attribute, and
   * the imperative escape hatch does not work here either — a container that
   * moves to another day is a DIFFERENT DOM node after the re-render, so a name
   * set on the old element by hand is simply absent from the new snapshot and
   * the browser animates a disappearance and an appearance rather than a move.
   *
   * So the name has to come out of React's own render, and it has to be there
   * BEFORE the transition is captured. Hence the extra frame: `reflow` arms
   * this flag, the board re-renders with names on (nothing visibly changes),
   * and the layout effect below then captures and writes. Read it in the board
   * and set `viewTransitionName` on each container while it is true.
   */
  armed: boolean;
}

export function useDayReflow({
  libraryDay,
}: {
  /** The day the library drawer is filling, if it is open — see the reveal
   *  effect. `null` on a shell with no drawer, and on a shell whose drawer is
   *  shut. */
  libraryDay: number | null;
}): DayReflow {
  /** A view transition is animating the board's reflow. Read by the reveal
   *  effect, which must not scroll the ground out from under it. */
  const reflowing = useRef(false);
  /** THE SCROLLER, and the box the reflow has to stay inside. It is the scope
   *  the view transition is started on — see `reflow`. */
  const plane = useRef<HTMLDivElement>(null);

  /**
   * BRING THE DAY THE DRAWER IS FILLING INTO VIEW.
   *
   * Opening the library takes 380px out of `.split`, and under a ~1572px
   * viewport that also drops the plane below `@container ws`'s 900px — so the
   * balance panel moves ABOVE the board and every day card shifts down with it.
   * MEASURED at 1280×800: the first card goes from y=218 to y=309, and at 1440
   * from 249 to 340. Without this the day a trainer is filling slides ~91px
   * down the screen the moment they open the tool they are filling it with, and
   * closing the drawer reflows the same distance back — which is why the
   * dependency is the DAY and not `Boolean(library)`: both edges have to fire.
   *
   * ── NOT `requestAnimationFrame`, AND NO `behavior` KEY ───────────────────
   *
   * Both were the first attempt and both were wrong, MEASURED: in a throttled
   * frame `requestAnimationFrame` never fires at all, and `behavior:'smooth'`
   * is suppressed outright — a manual `scrollIntoView` moved the scroller
   * 426px while the identical call with `smooth` moved it **0**. So the reveal
   * would have done nothing, silently, wherever the browser had throttled the
   * frame, and it could not be verified in one. Omitting `behavior` hands the
   * animation to CSS `scroll-behavior` on `.pgw`, so the SCROLL always lands
   * and only the animation is negotiable — which is the right way round, and
   * it puts the reduced-motion opt-out where the rest of them live.
   *
   * ── AND IT RUNS BEFORE PAINT, WHICH IS WHAT MADE IT LOOK FLAKY ───────────
   *
   * This was a plain `useEffect`, and reported as *"not smooth"*. A passive
   * effect is not guaranteed to run before the browser paints, so what a
   * trainer actually saw was TWO movements: the board reflows at the old
   * scroll position, that frame paints, and only then does the scroll animate.
   * Two motions for one intent reads as a stutter no easing can fix. A layout
   * effect runs after the DOM is mutated and BEFORE the paint, so both land in
   * one frame.
   *
   * The gap above the card is `scroll-margin-top` on `.wsd`, not an offset
   * computed here — `scrollIntoView` honours it, and a spacing value belongs
   * in the stylesheet with the padding it has to match.
   *
   * SCOPED TO THE PLANE, and that is this hook's one departure from the code it
   * was lifted from. `document.querySelector` was correct while one screen drew
   * one board; two screens can now be in the tree at once — the phone shell and
   * the desk shell are both rendered and CSS picks one — so the lookup starts
   * at the scroller the transition is scoped to and cannot reach a `.wsd`
   * belonging to a board nobody is looking at.
   */
  const revealDay = useCallback((day: number) => {
    const scope: ParentNode = plane.current ?? document;
    scope.querySelector(`.wsd[data-day="${day}"]`)?.scrollIntoView({ block: 'start' });
  }, []);

  useBeforePaint(() => {
    if (libraryDay == null) return;
    /* A view transition is animating the board's reflow right now, and a scroll
       mid-transition moves the ground under an animation that was captured
       against it. */
    if (reflowing.current) return;
    revealDay(libraryDay);
  }, [libraryDay, revealDay]);

  /* THE WRITE WAITING FOR ITS FRAME, and the flag that buys the frame. See
     `armed` on the interface for why a container cannot be named any other
     way. The ref holds the write because it must not be a dependency of the
     effect that runs it — a second drop landing while the first is still
     arming would otherwise re-run the effect against a stale closure. */
  const pending = useRef<(() => void) | null>(null);
  /**
   * WHAT THE NEXT FRAME IS FOR. `idle` is nothing pending; `named` arms the
   * containers' `view-transition-name`s and then captures; `plain` captures
   * without them — see `reflow`'s second argument for the case that needs it.
   * One piece of state rather than a boolean and a ref, so the render that puts
   * the names on and the effect that starts the transition cannot disagree.
   */
  const [phase, setPhase] = useState<'idle' | 'named' | 'plain'>('idle');

  /**
   * THE SCOPED STARTER, OR NOTHING.
   *
   * Bound to a local so TypeScript keeps the narrowing across the closure, and
   * it answers `null` for the two cases the caller treats identically: no API
   * at all, and a reader who has asked for less motion.
   *
   * ── AND IT IS SCOPED TO THE SCROLLER, WHICH IS NOT A DETAIL ──────────────
   *
   * A DOCUMENT-level view transition lifts every named card out of the DOM and
   * paints it as a pseudo-element in the browser's TOP LAYER. The top layer is
   * not a descendant of `.pgw`, so `.pgw`'s `overflow-y:auto` does not clip it:
   * for the 240ms of the animation a card travelling across the board was drawn
   * OVER the toolbar, the page header and the rail. Reported as the days "going
   * up and invalid", outside the div.
   *
   * `element.startViewTransition` generates the pseudo tree inside that element
   * instead, so the snapshots are clipped by the scroller exactly as the real
   * cards are. That is the whole fix, and the reason the pseudo-element rules
   * in `app.css` are written against `.pgw::view-transition-*` as well as the
   * bare form. Falls back to the document-level transition where the scoped
   * form is missing — it will escape the scroller, which is the behaviour that
   * was reported once, but it is better than no animation.
   */
  const starter = useCallback(() => {
    const scope = plane.current;
    const onScope = scope?.startViewTransition?.bind(scope);
    const start =
      onScope ??
      (typeof document.startViewTransition === 'function'
        ? document.startViewTransition.bind(document)
        : null);
    if (!start || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    return start;
  }, []);

  /**
   * ARM THE NAMES, THEN WRITE — see `armed` on the interface for the frame.
   *
   * With no transition available (or motion turned down) the write happens
   * immediately and nothing is armed: the board still changes, it just changes
   * at once, which is what it did before this existed.
   */
  const reflow = useCallback(
    (write: () => void, opts?: { names?: boolean }) => {
      if (!starter()) {
        write();
        return;
      }
      pending.current = write;
      /* ON THE NEXT TASK, AND THIS IS THE DROP HANDLER'S FIX.
         React flushes a discrete event's updates synchronously, so arming
         inside `onDrop` put the whole capture inside the drag event's own task
         — and Chrome refuses to start a transition there: MEASURED, `ready`
         rejected with *Transition was aborted because of invalid state* on
         every drop, while the identical write from a menu item (*Move down*,
         *Paste*) animated. A task boundary is all it needs; the write still
         lands within a frame of the drop.

         `setTimeout` and not `requestAnimationFrame` — trap 36: rAF does not
         fire at all in a throttled or backgrounded tab, and the write must land
         whether or not the animation can. */
      window.setTimeout(() => setPhase(opts?.names === false ? 'plain' : 'named'), 0);
    },
    [starter],
  );

  useBeforePaint(() => {
    if (phase === 'idle') return;
    const write = pending.current;
    pending.current = null;
    const start = starter();
    /* Armed and then found unable — a reader who turned motion down between the
       click and this frame. The write still has to land. */
    if (!write || !start) {
      setPhase('idle');
      write?.();
      return;
    }
    reflowing.current = true;
    /* THE DAYS ARE NAMED TOO, and that is most of what makes this read as one
       movement rather than two: the container travels, and the two cards it
       leaves and joins change height under it in the same 240ms. Without the
       class the cards would jump to their new size instantly while the box
       animated across a board that had already re-placed itself. */
    document.documentElement.classList.add('vt-days');
    const run = start(() => {
      flushSync(write);
    });
    void run.ready.catch(() => {});
    void run.finished
      .catch(() => {})
      .finally(() => {
        document.documentElement.classList.remove('vt-days');
        reflowing.current = false;
        /* The names come off in a render of their own — see `armed`. Leaving
           them on would make every container a stacking context for good, which
           is the bug `.vt-days` exists to avoid one level up. */
        setPhase('idle');
      });
  }, [phase, starter]);

  return { plane, reflow, armed: phase === 'named' };
}
