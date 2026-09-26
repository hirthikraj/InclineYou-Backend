'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * One screen, framed at a real viewport.
 *
 * ── WHY AN IFRAME AND NOT A NARROW DIV ──────────────────────────────────────
 *
 * Because a media query tests the viewport and not the element. This product
 * carries 216 `@media` at-rules against 18 `@container` ones, and the 18 are
 * local — a chart, an event block, a week card. (Both figures are counted with
 * comments stripped, by `library/system/viewports.ts`; a bare `grep` answers
 * 228 and 24, because this codebase's comments quote the CSS they explain.)
 * Everything that makes the phone a
 * DIFFERENT layout rather than a narrower one is viewport-keyed: the rail is
 * replaced by a bottom tab bar under 900px, `--w-top` drops 56 → 46, `--w-tabs`
 * comes into existence (it is not declared on `:root` at all), tables stack at
 * 620.
 *
 * Rendered in a 390px-wide div inside a 1440px window, none of that fires. The
 * reader gets a 248px rail crushed against a 390px plane and a top bar 10px too
 * tall — a layout no device has ever shown anyone. An iframe has a viewport of
 * its own, so the CSS inside resolves against 390 and what is in the box is
 * what the phone gets.
 *
 * ── WHY THE ZOOM IS MEASURED AND NOT CHOSEN ─────────────────────────────────
 *
 * A 1440px frame has to shrink to fit a ~1236px column, and the factor depends
 * on the reader's window. Hard-coding one means the desktop frame is clipped on
 * a laptop or floats in a third of the space on a wide monitor. A
 * `ResizeObserver` on the cell gives the number the column actually has.
 *
 * `transform: scale()` and deliberately not `zoom`: scale is a paint-time
 * transform that leaves the iframe's own viewport at 1440, which is the one
 * thing this component exists to preserve. `zoom` changes the layout viewport
 * inside the frame and would quietly undo it.
 *
 * The factor is then PRINTED on the caption, because a frame at 0.55 is a frame
 * where the product's 44px minimum target measures 24px on this page. A reader
 * checking a touch target against the accessibility part has to know which of
 * the two they are looking at.
 */

export type FrameKey = 'floor' | 'phone' | 'desktop';

/**
 * The three widths this system is measured at.
 *
 * Not a device table — the product does not have one, and part 8 says why. They
 * are the widths the mobile work states its numbers in: 360×640 is the budget
 * Android floor every chrome budget is checked against, 390×844 the reference
 * device, and 1440×900 the frame the design file has always drawn in
 * (`--w-frame` / `--w-frame-h`).
 */
export const FRAMES: Record<FrameKey, { w: number; h: number; label: string; note: string }> = {
  floor: { w: 360, h: 640, label: 'Floor', note: 'budget Android, the width every budget is checked at' },
  phone: { w: 390, h: 844, label: 'Phone', note: 'the reference device' },
  desktop: { w: 1440, h: 900, label: 'Desktop', note: 'the design file’s own frame' },
};

/**
 * The narrowest a desktop frame may be squeezed to before it wraps to its own
 * row. Below about this, 1440px of layout is scaled past the point where a
 * reader can tell a table from a list, and two unreadable frames side by side
 * are worth less than one readable one under the other.
 */
const DESK_MIN = 460;

function Frame({ k, src, title }: { k: FrameKey; src: string; title: string }) {
  const { w, h, label } = FRAMES[k];
  const cell = useRef<HTMLElement>(null);
  /* Starts at 1 rather than 0: on the first paint, before the observer has
     measured anything, a 0 would collapse the frame to nothing and the reader
     would see the layout jump open. At 1 the worst case is one frame of a
     desktop viewport overflowing its column, which `overflow:hidden` on
     `.viewport` already clips. */
  const [z, setZ] = useState(1);

  const measure = useCallback(() => {
    const el = cell.current;
    if (!el) return;
    /* Never scale UP. A 360px frame in a 500px column blown to 1.39 would show
       the floor device at a size no floor device has, which is the same lie as
       the narrow div in a different direction. */
    setZ(Math.min(1, (el.clientWidth || w) / w));
  }, [w]);

  useEffect(() => {
    measure();
    const el = cell.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const phone = k !== 'desktop';
  const cls = [
    'viewport',
    phone ? (k === 'floor' ? 'viewport--floor' : 'viewport--phone') : null,
    /* A phone has no browser chrome, so it reserves no room for one. */
    phone ? 'viewport--bare' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    /* A PHONE IS NEVER SCALED AND A DESKTOP ALWAYS IS, and the flex values say
       so. `0 0 390px` holds the phone at life size in every column — it is the
       half a reader checks a 44px target against, and a phone at 82% is a phone
       whose targets measure 36. The desktop gets `1 1`, so it takes whatever is
       left over beside it rather than a fixed guess; 1440 never fits anyway, so
       the only question is how much of the remainder it gets. */
    <figure
      className="vp__i"
      ref={cell}
      style={phone ? { flex: `0 0 ${w}px` } : { flex: `1 1 ${DESK_MIN}px` }}
    >
      <figcaption className="vp__h">
        <b>{label}</b>
        <span>
          {w}&times;{h}
        </span>
        <i>{z === 1 ? '1:1' : `${Math.round(z * 100)}%`}</i>
      </figcaption>
      <div className={cls} style={{ ['--z' as string]: z }}>
        <div className="viewport__in">
          {!phone && (
            <div className="browser__bar">
              <div className="browser__dots">
                <i />
                <i />
                <i />
              </div>
              <div className="browser__url">
                <b>localhost:3100</b>
                {src}
              </div>
            </div>
          )}
          {/* `loading="lazy"` is not a micro-optimisation here. The component
              page mounts one of these per specimen and the screens page mounts
              two per route; eager, that is a dozen full application boots on
              one scroll. Lazy, a frame boots when the reader reaches it. */}
          <iframe
            className="viewport__f"
            src={src}
            width={w}
            height={h}
            loading="lazy"
            title={`${title} — ${label}, ${w}×${h}`}
          />
        </div>
      </div>
    </figure>
  );
}

/**
 * A screen or a specimen, shown at two viewports at once.
 *
 * `src` is a real URL on this origin, so the frame is signed in the way the
 * reader is: the session is an httpOnly cookie, and a same-origin iframe sends
 * it. A screen framed here is the screen, with the reader's own data in it, not
 * a fixture that can disagree with the product.
 */
export function Viewport({
  src,
  title,
  frames = ['phone', 'desktop'],
  switchable = true,
}: {
  src: string;
  /** What is being framed, for the iframe's accessible name. */
  title: string;
  frames?: FrameKey[];
  /** Offer the floor width as a third choice. Off for a specimen that has no
      phone-specific behaviour to check at 360. */
  switchable?: boolean;
}) {
  const [shown, setShown] = useState<FrameKey[]>(frames);

  const toggle = (k: FrameKey) =>
    setShown((s) => {
      const next = s.includes(k) ? s.filter((x) => x !== k) : [...s, k];
      /* Never leave the reader with an empty comparison — the last frame
         standing cannot be switched off. */
      return next.length ? (Object.keys(FRAMES) as FrameKey[]).filter((x) => next.includes(x)) : s;
    });

  return (
    <div>
      {switchable && (
        <div className="vp__t">
          <div className="btngroup" role="group" aria-label="Viewport widths">
            {(Object.keys(FRAMES) as FrameKey[]).map((k) => (
              <button
                key={k}
                type="button"
                className="btn btn--ghost"
                aria-pressed={shown.includes(k)}
                title={FRAMES[k].note}
                onClick={() => toggle(k)}
              >
                {FRAMES[k].w}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="vp">
        {shown.map((k) => (
          <Frame key={k} k={k} src={src} title={title} />
        ))}
      </div>
    </div>
  );
}
