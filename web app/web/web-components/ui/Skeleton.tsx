'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * SKELETON — the shape of the content that is coming, while it comes.
 *
 * ── WHY IT EXISTS, AND WHY IT IS LATE ───────────────────────────────────────
 *
 * §24's 2026 pass wrote the rule down and never shipped the component:
 * *"skeletons for structured content, spinners for single actions, NOTHING
 * under ~300ms."* So every list in this product that waits on a request has
 * been answering with a sentence — `Loading the library…`, `Loading your
 * workouts…` — one 11.5px line in a 329 × 428px column. That is a spinner made
 * of words: it says a wait is happening and nothing about what is arriving, and
 * the pane jumps from one line to nine rows when it lands.
 *
 * The exercise library is the case that forced it. `LibraryPane` fetches 1,324
 * movements plus their filter metadata on mount — inside the dialog, after it
 * has opened — so a trainer who clicks a saved workout gets the canvas
 * immediately and an empty column beside it for as long as the catalogue takes.
 *
 * ── THE 300ms IS THE COMPONENT'S, NOT THE CALLER'S ──────────────────────────
 *
 * A skeleton that flashes for 80ms is worse than no skeleton: it is a visible
 * flicker reporting that something was slow when nothing was. The rule says
 * nothing under ~300ms, so the delay lives HERE rather than in each caller —
 * a rule re-implemented at four call-sites is a rule three of them get wrong.
 * `delay={0}` is available for a surface that is certain to be slow.
 *
 * ── IT SPENDS NO KEYFRAME BUDGET ────────────────────────────────────────────
 *
 * §24: *"the motion vocabulary is SEVEN keyframe names, and eight is the
 * budget. Anything else animates as a transition or not at all."* A shimmer
 * would be the eighth and would spend the spare name on a placeholder. So the
 * bone is a fixed tint with a lighter plate over it, and the PLATE runs
 * `tx-fade` on `alternate` — an existing keyframe, pulsing a highlight over a
 * base that never disappears. Under `prefers-reduced-motion` §24's global
 * collapse lands it on `to{opacity:1}`, which is a steady, legible placeholder
 * rather than a blank one.
 *
 * ── AND THE BONES ARE HIDDEN FROM THE SCREEN READER ─────────────────────────
 *
 * Nine grey rectangles announced one at a time is noise. The bones are
 * `aria-hidden` and the wait is a polite live region instead — which is what
 * the sentence this replaces was doing for free, and the thing a skeleton most
 * often quietly removes.
 *
 * The region is mounted EMPTY and filled when the bones appear. The console's
 * rest clock records why: *"a live region inserted at the same moment as its
 * content is read unreliably"* — so the element is there from the first render
 * and the label arriving is a real content change.
 */
export function Skeleton({
  label,
  delay = 300,
  children,
  className,
}: {
  /** What is being waited for: "Loading the exercise library". Required — a
   *  screen reader is told nothing at all by a box. */
  label: string;
  /** Milliseconds before the bones are drawn. §24's rule; 0 to opt out. */
  delay?: number;
  children: ReactNode;
  className?: string;
}) {
  const [shown, setShown] = useState(delay === 0);

  useEffect(() => {
    if (delay === 0) return;
    const t = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <>
      <p className="vh" role="status">{shown ? label : ''}</p>
      {shown && (
        <div className={['skel', className].filter(Boolean).join(' ')} aria-hidden="true">
          {children}
        </div>
      )}
    </>
  );
}

/**
 * One row of the list that is coming.
 *
 * `height` is the REAL row's height and the caller is expected to have MEASURED
 * it rather than guessed: `.wkl__w` renders **47.43px** — `min-height:38px` plus
 * 14px of padding, resolved against a 12.5px name over a 10.5px meta line — and
 * not the 48 it looks like. A skeleton at a guessed height is a layout shift
 * with a nicer texture.
 *
 * What matching buys is the RHYTHM, not the scroll extent: nine bones can never
 * predict the 77 rows the catalogue actually returns, so the scrollbar resizes
 * either way. What it prevents is the rows landing on a different pitch from the
 * placeholder they replace, which is the part the eye reads as a jump.
 */
export function SkeletonRow({
  height,
  ruled = true,
  children,
}: {
  height: number;
  /** The hairline under a row of a ruled list. Off for a card or a grid cell. */
  ruled?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={ruled ? 'skel__row' : 'skel__row skel__row--bare'}
      style={{ height }}
    >
      {children}
    </div>
  );
}

/**
 * One line of text that is coming.
 *
 * `width` takes a percentage string on purpose: real names are not all the same
 * length, and nine bones of identical width read as a table rather than as
 * prose about to arrive. Callers vary it down the list.
 */
export function SkeletonLine({
  width,
  height = 10,
}: {
  width: number | string;
  height?: number;
}) {
  return <span className="skel__l" style={{ width, height }} />;
}

/* ── THE PARTS ARE NAMED EXPORTS FIRST AND DOT-PROPERTIES SECOND ───────────
   `Card` and `DockPanel` declare theirs this way and it reads as a style
   choice. On a `'use client'` module it is not one, and this file is one.

   A client module imported by a SERVER component does not hand over the
   function — it hands over a proxy per EXPORTED BINDING, and a property hung
   off one of those functions is not an exported binding. So `Skeleton.Row`
   resolved to `undefined` inside `Skeleton.entry.tsx`, which is a Server
   Component, and `/library/c-skeleton` answered **500** while `tsc` and
   `eslint` were clean and the product screen — a client component, importing
   the real module — rendered perfectly. The catalogue was the only thing that
   broke, which is exactly the failure the catalogue exists to catch.

   Both forms are kept: `Skeleton.Row` for a client call-site that wants the
   family to read as one, `SkeletonRow` for a server one that must. */
Skeleton.Row = SkeletonRow;
Skeleton.Line = SkeletonLine;
