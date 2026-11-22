'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Clamp text — one line of a longer text that opens to all of it, and only when there is more to see.
 * `.clmp`, catalogue entry `c-clamptext`. Written 22 Nov 2026 for the portal's inbox.
 *
 * ── ONE TEXT, NOT A PREVIEW AND A BODY ──────────────────────────────────────
 *
 * The inbox first drew a one-line preview and, on open, hid it and revealed a second copy of the message at a
 * larger size inside a `<details>`. Two boxes changing at once — one folding, one growing, in different type — read as
 * a wobble however the curves were tuned. Here there is one paragraph. Closed, its box is one line tall (`1lh`) and the
 * end of the line fades out; open, the same box grows to the paragraph's height. The only thing that moves is the
 * box's HEIGHT, and the words never re-flow, because the type is the same in both states (the colour steps up, which
 * is a transition and not a layout).
 *
 * ── IT OPENS ONLY WHEN SOMETHING IS HIDDEN ──────────────────────────────────
 *
 * The box measures itself (and again whenever its width changes) and tells the caller through `onFits`. A message
 * that fits on its line is shown whole, with nothing to press — a chevron on a row that opens to the same words is a
 * control that does nothing. Until the first measurement the text is drawn clamped, which is the common case and the
 * one that does not jump.
 *
 * ── HOW THE HEIGHT ANIMATES ─────────────────────────────────────────────────
 *
 * CSS cannot transition to `height:auto` everywhere yet, so the open/close is the two-step every disclosure uses:
 * pin the current height in pixels, force a style read, set the target in pixels, and when the transition ends hand
 * the height back to the stylesheet (`1lh` closed, `auto` open) — which is the same number, so nothing jumps. Pressed
 * again mid-flight it starts from wherever it is. With reduced motion there is no transition and the height is
 * handed back at once. The inline height is ANIMATION STATE, set and cleared here; it never carries layout.
 *
 * Not a button: the caller owns the control (in the inbox, the row's header is the `aria-expanded` button and the
 * whole row is the pointer target), and passes `id` so that control can name this as what it opens. A screen reader
 * reads the whole text either way — the clamp is visual.
 */
export function ClampText({
  text,
  open,
  onFits,
  id,
  className,
}: {
  text: string;
  open: boolean;
  /** Called after each measurement: true when the whole text fits on its one line. */
  onFits?: (fits: boolean) => void;
  id?: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState<boolean | null>(null);
  const fitsRef = useRef(onFits);
  useLayoutEffect(() => {
    fitsRef.current = onFits;
  });

  /* MEASURE: is there more than one line? Read with the box at its closed height, which is how it rests whenever this
     runs (an open box has already been found not to fit). Repeated on a width change, never on height. */
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    let width = -1;
    const measure = () => {
      if (el.dataset.state === 'open') return;
      const w = el.clientWidth;
      if (w === width) return;
      width = w;
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
      const next = el.scrollHeight <= lh + 1;
      setFits(next);
      fitsRef.current?.(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  /* ANIMATE: from where the box is now to where the new state wants it, in pixels, then back to the stylesheet. */
  const first = useRef(true);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (first.current) {
      first.current = false;
      return;
    }
    if (fits) return;
    const from = el.getBoundingClientRect().height;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const to = open ? el.scrollHeight : lh;
    el.style.height = `${from}px`;
    void el.offsetHeight;
    el.style.height = `${to}px`;
    const instant = getComputedStyle(el).transitionDuration.split(',').every((d) => parseFloat(d) === 0);
    if (instant || from === to) {
      el.style.height = '';
      return;
    }
    const release = () => {
      el.style.height = '';
      el.removeEventListener('transitionend', done);
      window.clearTimeout(timer);
    };
    const done = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === 'height') release();
    };
    el.addEventListener('transitionend', done);
    /* A transition in a hidden tab may never end; the pinned pixels would then outlive a later width change. The
       fallback hands the height back a little after the transition should have finished, whatever happened. */
    const ms = Math.max(...getComputedStyle(el).transitionDuration.split(',').map((d) => parseFloat(d) * (d.includes('ms') ? 1 : 1000)));
    const timer = window.setTimeout(release, ms + 80);
    return () => {
      el.removeEventListener('transitionend', done);
      window.clearTimeout(timer);
    };
  }, [open, fits]);

  const state = fits ? 'fits' : open ? 'open' : 'closed';
  return (
    <div ref={box} id={id} className={['clmp', className].filter(Boolean).join(' ')} data-state={state}>
      <p className="clmp__t">{text}</p>
    </div>
  );
}
