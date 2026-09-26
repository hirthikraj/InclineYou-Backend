'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hold a leaving surface on screen for exactly as long as its exit motion runs.
 *
 * ── THE DEFECT THIS CLOSES ───────────────────────────────────────────────────
 *
 * Every side panel in this app arrived and none of them left. `.panel` carries
 * `tx-slide-l` in webapp.css, so a panel slid in over 240ms — and then vanished
 * between two frames, because closing it is `setOpen(null)` and React unmounts
 * the box. A keyframe cannot be run backwards on an element that no longer
 * exists, so the motion was only ever half specified: the arrival was designed
 * and the dismissal was a disappearance.
 *
 * A transition CAN do the other half, but only while the box is still there. So
 * the close becomes two steps — put the closed state back, wait, then tell the
 * screen to unmount — and this hook is the wait.
 *
 * ── WHY IT ASKS THE ELEMENT INSTEAD OF COUNTING ──────────────────────────────
 *
 * Lifted, with its reasoning, from `Clients.tsx`, which solved this for its
 * phone sheet first and is now one of eight callers. The three obvious waits are
 * all wrong here:
 *
 * A TIMER duplicates `--tx-t-fast` in JS, and a number that has to match a
 * stylesheet by hand is the drift this codebase keeps a list of.
 *
 * `transitionend` NEVER ARRIVES on paths that really exist in this app.
 * `webapp.css` flattens every duration to .001ms under `prefers-reduced-motion`
 * and the phone sheet's own exit is inside a `max-width:900px` query, so on a
 * desk — or for a trainer who asked for less motion — there can be nothing to
 * end, and a panel waiting for the event would never close at all.
 *
 * So it ASKS: `getAnimations()` reports what is actually running on the element,
 * and their `finished` promises say when it stops. Empty means nothing is
 * moving, and the close is immediate — which is the behaviour those two cases
 * already had. One mechanism, no duration in JS, no breakpoint in JS.
 *
 * Filtered to TRANSITIONS (`'transitionProperty' in a`) so the ENTRANCE does not
 * count: `.panel` still runs `tx-slide-l` on mount, and a trainer who opens and
 * closes inside its 240ms would otherwise be made to wait out an animation that
 * is arriving, not leaving. `allSettled`, because a cancelled transition REJECTS
 * `finished` and a rejection here still means "done".
 *
 * ── USING IT ─────────────────────────────────────────────────────────────────
 *
 *   const { closing, dismiss, ref } = useDismiss(onClose);
 *   <div className={`scrim scrim--soft${closing ? ' scrim--out' : ''}`} onClick={dismiss} />
 *   <aside ref={ref} className={`panel${closing ? ' panel--out' : ''}`}>
 *
 * `dismiss` replaces every call to `onClose` INSIDE the panel — the close
 * button, Escape, the scrim, and the last step of a save. `onClose` itself is
 * then the parent's unmount and nothing else calls it.
 *
 * `dismissThen(fn)` is for the panels that leave by SUCCEEDING rather than by
 * being closed: `BookPanel` finishes on `onBooked`, which unmounts it and
 * refreshes the grid in one call, and a panel that glides away when you give up
 * on it and snaps shut when you complete it has the reward and the retreat the
 * wrong way round. Same wait, a different callback at the end of it. It is a
 * second function rather than an argument to the first because `dismiss` is
 * passed straight to `onClick`, and React would hand an argument to it.
 */
export function useDismiss<T extends HTMLElement = HTMLElement>(onClose: () => void) {
  const [closing, setClosing] = useState(false);
  const ref = useRef<T>(null);

  /* The callers pass an inline arrow — `onClose={() => setOpenId(null)}` is the
     shape of six of the eight call sites — so a fresh identity arrives on every
     render of the screen behind the panel. In the dependency list that would
     re-run the wait mid-exit and unmount early; a ref keeps the effect keyed on
     the one thing that actually changes, which is `closing`. */
  const latest = useRef(onClose);
  useEffect(() => { latest.current = onClose; }, [onClose]);

  /* Set by `dismissThen`, and read INSTEAD of `onClose` when the wait is over.
     Kept apart from `latest`, which is re-synced from the prop on every render
     and would throw an override away on the first one after the click. */
  const after = useRef<(() => void) | null>(null);

  /* A TRANSITION NEEDS A BEFORE-CHANGE STYLE, and both ends of that have to be
     forced by hand here. This read flushes the OPEN state — the pose the exit
     travels from — while it is still the truth; the read in the effect below
     flushes the closed one. Without the first, the browser can coalesce both
     into a single recalculation, see one style where a transition needs two,
     and start nothing. */
  const flush = () => {
    if (ref.current) void ref.current.getBoundingClientRect();
  };

  const dismiss = useCallback(() => {
    flush();
    setClosing(true);
  }, []);
  const dismissThen = useCallback((then: () => void) => {
    flush();
    after.current = then;
    setClosing(true);
  }, []);

  useEffect(() => {
    if (!closing) return;
    const el = ref.current;
    /* MEASURED, AND THE ONE LINE THAT MAKES THE REST WORK. React has put the
       closed-state class on the box by the time this effect runs, but Chrome has
       not recalculated style for it yet — and a transition is CREATED during
       that recalculation. `getAnimations()` does not force it, so without this
       read the list comes back empty on a panel that is about to move, the wait
       is skipped, and the surface unmounts in the same frame it was told to
       leave. Which is the exact bug this hook exists to fix, wearing the fix.
       Verified by hand in the running app: `classList.add('panel--out')` alone
       reports `[]`; the same call after a forced reflow reports
       `["opacity:180","transform:180"]`. `getBoundingClientRect()` is the read
       that forces it — layout cannot be answered without style. */
    if (el) void el.getBoundingClientRect();
    const leaving = el
      ? el.getAnimations().filter((a) => 'transitionProperty' in a)
      : [];
    const done = () => (after.current ?? latest.current)();
    if (leaving.length === 0) {
      done();
      return;
    }
    let live = true;
    Promise.allSettled(leaving.map((a) => a.finished)).then(() => {
      if (live) done();
    });
    return () => {
      live = false;
    };
  }, [closing]);

  return { closing, dismiss, dismissThen, ref } as const;
}
