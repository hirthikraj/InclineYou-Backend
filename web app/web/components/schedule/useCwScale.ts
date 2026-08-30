'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ScheduleGrid } from '@/lib/schedule/grid';

/**
 * HOW MANY PIXELS AN HOUR IS WORTH, AND WHY THAT IS NOW A MEASUREMENT.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
 *
 * webapp.css shipped `--cw-hour:60px` with the comment *"1 min = 1 px. Changing
 * this breaks the identity"*, and app.css defended it at length: *"ONE MINUTE IS
 * ONE PIXEL, at every width, on every device… A narrow screen gets narrower
 * COLUMNS and scrolls sideways. It never gets a shorter hour."*
 *
 * Two things were wrong with that.
 *
 * **The variable had no consumers.** `grep -rn 'var(--cw-hour)'` over `app`,
 * `components` and `lib` returns nothing. Every vertical measurement on this
 * screen is an inline unitless number React serialises as px — `top: tick.minute
 * - seg.from`, `height: gap.minutes - 4` — so the 1:1 mapping was hard-coded at
 * fourteen call sites and the token that claimed to own it was decoration. The
 * comment was defending a number that could not be changed by changing it.
 *
 * **60px was never a law, it was one screen's answer.** A thirteen-hour working
 * day at 60px/hour is 780px, and a 1440×900 laptop has ~800px of track under the
 * toolbar and the day heads. That is not a coincidence: 60 is the number that
 * makes a full day fit THAT viewport exactly. On a 1920×1080 monitor the same
 * constant leaves ~200px of the page empty and still fits; on a 1366×768 laptop
 * it overflows by ~110px and the trainer scrolls to reach the evening. A constant
 * calibrated to one screen size is a constant that is wrong on every other one.
 *
 * ── WHAT SURVIVES ───────────────────────────────────────────────────────────
 *
 * The identity that actually mattered was never "one minute is one pixel" — it
 * was **two sessions of the same length are the same size, and a block's height
 * IS its duration**. That is a statement about proportion, and proportion is
 * exactly what a scale factor preserves. Every block on screen shares one
 * `scale`, so a 90-minute session is three times a 30-minute one at 48px/hour
 * just as surely as at 90px/hour. Nothing the screen exists to show is lost.
 *
 * ── THE TWO BOUNDS, BOTH MEASURED ───────────────────────────────────────────
 *
 * **0.8 (48px/hour) is a floor set by WCAG 2.5.8, not by taste.** Thirty minutes
 * is the shortest session the product can express (`LENGTHS` in `result.ts`
 * starts there), and a block is a click target. At 0.8 a 30-minute block is 24px
 * — exactly the 24×24 minimum, with nothing to spare. The blocks are flush
 * neighbours, so the spacing exception cannot be claimed. Below 0.8 every short
 * session on the screen becomes an undersized target, which is why the hour is
 * clamped rather than simply divided.
 *
 * **1.5 (90px/hour) is a ceiling set by the content ladder.** Past it a
 * 30-minute block is taller than the 45px rung it is styled for, and the block
 * starts holding more empty space than text — a calendar drawn at a magnification
 * nobody asked for.
 *
 * ── AND WHY THE SCALE LIVES IN JS RATHER THAN A CSS clamp() ──────────────────
 *
 * A `clamp(48px, 6.7vh, 90px)` would fill the viewport without a line of
 * TypeScript, and it was the first attempt. It cannot work, for one reason that
 * is not a matter of degree: **the track is not the viewport.** What has to fit
 * is this trainer's own working day minus its collapsed quiet bands — which is
 * data, different per trainer and different per week, and `vh` cannot see it. A
 * trainer working 06:00–19:00 and one working 16:00–20:00 would get the same
 * hour, and neither would get a day that fits.
 *
 * Owning it here also keeps ONE source of truth. `rung()` in `SessionBlock`
 * chooses what a block draws from its height, `laneFits` in `TimeGrid` decides
 * whether the context lane can be aligned honestly, and `bookHere` turns a click
 * ordinate back into a minute. All three need the number, and a number that only
 * CSS knows would have those three guessing at it — which is how a click on
 * 09:00 books 07:30.
 */

/** 48px/hour. A 30-minute block is 24px: WCAG 2.5.8's target floor, exactly. */
export const MIN_SCALE = 0.8;
/** 90px/hour. Past this a short block is mostly padding. */
export const MAX_SCALE = 1.5;
/** `--cw-band` plus `.cw__band`'s own two rules. A collapsed band is fixed
 *  chrome, not minutes, so it is subtracted rather than scaled. */
const BAND_PX = 32;
/** `.cw__seg`'s own `border-bottom`, one per row, and it is not minutes either. */
const SEG_BORDER_PX = 1;
/** Used until the container has been measured — and it is the old constant, so a
 *  server render and the first paint are identical to what shipped before. */
const SSR_SCALE = 1;

/**
 * THE FOOT, AND WHY IT IS CONTENT RATHER THAN PADDING.
 *
 * The month grid got a foot for a stated reason: rows that fill the container to
 * the pixel land their last rule on the window edge, and a grid whose last rule
 * IS the edge cannot say whether it ended or was cut off. The day and the week
 * have exactly the same problem for exactly the same reason — `useCwScale` fits
 * the track to the container, so it fits to the pixel by construction.
 *
 * The month could solve it with `padding-bottom` on its scroll container, because
 * `.mo` is `min-height:100%` and a percentage resolves against the containing
 * block's CONTENT box: the padding is subtracted before `100%` is computed, so
 * the rows shrink to make room on their own. This grid cannot borrow that. Its
 * height is not a percentage, it is this function's arithmetic — and
 * `clientHeight` **includes** padding. Padding the container would leave the
 * track sized to fill the padding box and then push it past the border box by
 * exactly the foot: a scrollbar bought with the fix for a scrollbar.
 *
 * Subtracting the padding back out inside `fit()` is worse, not better: this
 * function would then be reading a value it is also the cause of, one frame
 * behind, through a ResizeObserver.
 *
 * So the foot is a SPACER — a real element after the grid, whose height this
 * function reserves before it divides. `clientHeight` never sees it, there is no
 * loop, and `.cw`'s `border-left` stops with the last segment instead of hanging
 * a 1px stub down the side of the gap (the same reason the month's foot went on
 * the container and not on `.mo`).
 */
const FOOT_MIN = 12;
const FOOT_MAX = 28;
/** `2.2vh`, matching the month's `clamp(12px,2.2vh,28px)` to the pixel. */
const FOOT_VH = 0.022;

/** The minutes of real track in a grid. Bands are chrome and excluded. */
export function trackMinutes(grid: ScheduleGrid): number {
  return grid.rows.reduce(
    (n, r) => (r.kind === 'segment' ? n + (r.to - r.from) : n),
    0,
  );
}

function chromePx(grid: ScheduleGrid): number {
  let px = 0;
  for (const r of grid.rows) {
    px += r.kind === 'band' ? BAND_PX : SEG_BORDER_PX;
  }
  return px;
}

/**
 * Measures the scroll container and returns the pixels-per-minute that makes the
 * trainer's day fill it, clamped to the two bounds above.
 *
 * The ref is a callback rather than a `useRef` because the element has to be
 * observed the moment it exists: a `useRef` read in an effect gives the node but
 * not a re-render when the view switches from week to day and the container is
 * replaced, and the stale observer would then be scaling against a box that is
 * no longer on the page.
 */
export function useCwScale(grid: ScheduleGrid): {
  scale: number;
  foot: number;
  ref: (el: HTMLDivElement | null) => void;
} {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [fitted, setFitted] = useState({ scale: SSR_SCALE, foot: 0 });

  const minutes = trackMinutes(grid);
  const chrome = chromePx(grid);
  /* The day heads are inside the scroll container and sticky within it, so their
     height is track the segments cannot have. Measured rather than assumed:
     `.cal__hd` is a grid row of two text lines whose height moves with the
     trainer's font settings, and a hard-coded 44 would silently overflow for
     anyone running a larger one. */
  const rows = grid.rows.length;

  useEffect(() => {
    if (!el || minutes <= 0) return;

    const fit = () => {
      const head = el.querySelector<HTMLElement>('.cal__hd');
      const gross = el.clientHeight - (head?.offsetHeight ?? 0) - chrome;
      if (gross <= 0) return;

      /*
       * THE FOOT IS RESERVED ONLY IF THE TRACK STILL FITS WITH IT RESERVED.
       *
       * The month's rule, arrived at by measurement: a grid that SCROLLS does not
       * need a terminus, because the question the foot answers — has this ended,
       * or is it cut off? — is one a scrollbar already answers. There it is
       * spelled `@media (min-height:768px)`, which is where a six-row month
       * happens to stop fitting. Here the same condition can be asked directly
       * instead of guessed at a breakpoint: if the track cannot hold the foot
       * without dropping under the legibility floor, there is no foot.
       *
       * Which means the foot is free wherever it is drawn. It never buys a
       * scrollbar; on a screen with room it costs a slightly shorter hour (at
       * 1440×900, 61.2px becomes 59.4px) and on a screen without room it costs
       * nothing because it is not there.
       */
      const vh = el.ownerDocument.defaultView?.innerHeight ?? 0;
      const want = Math.min(FOOT_MAX, Math.max(FOOT_MIN, FOOT_VH * vh));
      const foot = (gross - want) / minutes >= MIN_SCALE ? want : 0;

      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (gross - foot) / minutes));
      /* Quantised DOWN to 1/100 of a pixel per minute. Down and not nearest:
         rounding up by a hundredth puts the track a few pixels past the container
         on a long day, which raises a scrollbar on a grid that was meant to fit —
         the exact thing this hook exists to remove. Quantised at all because a
         container reporting a fractional height through a rail-collapse animation
         would otherwise re-render the whole grid on every frame of it. */
      setFitted({ scale: Math.floor(next * 100) / 100, foot: Math.round(foot) });
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, minutes, chrome, rows]);

  const ref = useCallback((node: HTMLDivElement | null) => setEl(node), []);
  return { scale: fitted.scale, foot: fitted.foot, ref };
}
