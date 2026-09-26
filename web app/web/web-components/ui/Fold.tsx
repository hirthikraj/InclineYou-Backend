'use client';

import { useId } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Fold — a block that folds, and can be switched off. `.fold`, catalogue entry
 * `c-fold`.
 *
 * ── WHY IT IS NOT `Slab`, `Card` OR `.disc` ─────────────────────────────────
 *
 * `Slab` is a section grouped by a rule instead of a box, and its whole
 * argument is that a box says *these things are equal*. `Card` is the box, and
 * it does not fold. `.disc` folds and is a native `<details>` with a 12.5px
 * triangle summary — a QUIET aside inside a card, for *All 9 readings* under a
 * chart. This is a container that is the thing being read, that folds, and that
 * carries a second control in its head.
 *
 * That second control is why it cannot be `<details>`: a `<summary>` holding a
 * switch is interactive content inside interactive content, and the switch
 * would fold the block every time it was thrown.
 *
 * ── SWITCHED OFF IS NOT COLLAPSED, AND THE HEAD GOES ON SAYING THE COUNT ────
 *
 * Two states, both drawn. Off dims the head and hides the body; folded hides
 * the body and leaves the head at full weight. A block switched off REMEMBERS
 * its contents — that is a property of the data behind it, not of this
 * component — so the count stays, and a trainer who switches *Measurements*
 * back on can see their fifteen tapes are still there before they open it.
 *
 * ── THE PARTS ARE PROPS, WHICH IS THE OPPOSITE CALL TO `DockPanel` ──────────
 *
 * `DockPanel`'s six call-sites have six unlike bodies, so its parts are
 * components. Every head here is the same five things — an icon, a name, a
 * count, a sentence and a chevron — and the only slot that varies is the
 * trailing control. So the head is props and `control` is the one `ReactNode`.
 * A call-site that needs a different head is asking for a different component.
 *
 * ── AND IT DOES NOT RENDER THE SWITCH ITSELF ────────────────────────────────
 *
 * `control` takes one, and most call-sites pass one. It is not an `on`/`onOn`
 * pair, for `DockPanel`'s reason about `onClose`: the moment this component
 * renders the `Switch` it owns the label, the disabled state and the write, and
 * the first call-site that needs a `Button` there instead has to grow a prop
 * for it. `off` is separate from `control` and is only the STYLE — what the
 * block looks like when whatever is in that slot says no.
 */
export function Fold({
  icon,
  title,
  count,
  sub,
  open,
  onOpenChange,
  control,
  off = false,
  flush = false,
  className,
  style,
  children,
}: {
  /** A 15–16px glyph. Drawn in a 28px plate, so it never sets the head height. */
  icon?: ReactNode;
  title: ReactNode;
  /**
   * A figure beside the name. Omitted, and never drawn as a zero — `PageTabs`'
   * contract, for the same reason: a block reading *Questions 0* has spent a
   * badge to say nothing is in it, which the sentence under it already says.
   */
  count?: number | null;
  sub?: ReactNode;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** The trailing slot. A `Switch` at every call-site so far. */
  control?: ReactNode;
  /** Draw the off state. The CALLER decides what off means. */
  off?: boolean;
  /** Body with no padding, for a body whose own first child has a border. */
  flush?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const id = useId();
  const cls = ['fold', off ? 'fold--off' : null, className].filter(Boolean).join(' ');

  return (
    <section className={cls} style={style}>
      <div className="fold__hd">
        <button
          type="button"
          className="fold__t"
          aria-expanded={open}
          aria-controls={`${id}-b`}
          onClick={() => onOpenChange(!open)}
        >
          {icon && <span className="fold__ic" aria-hidden="true">{icon}</span>}
          <span className="fold__x">
            <span className="fold__n">
              {title}
              {count != null && count > 0 && <span className="rail__n">{count}</span>}
            </span>
            {sub && <span className="fold__s">{sub}</span>}
          </span>
          <Chevron />
        </button>
        {control && <div className="fold__ctl">{control}</div>}
      </div>
      {/* NOT `hidden` and not `display:none` with the body still mounted: the
          body of one of these holds a twenty-one-row picker and a question
          builder, and keeping three of them in the document to draw one is
          three sets of fields a tab press walks through invisibly. Unmounting
          is also what makes `aria-controls` honest — it points at a region that
          is there when it says it is. */}
      {open && (
        <div id={`${id}-b`} className={flush ? 'fold__b fold__b--flush' : 'fold__b'}>
          {children}
        </div>
      )}
    </section>
  );
}

/** The marker inside the button. `.fold__v` rotates it off `aria-expanded`. */
function Chevron() {
  return (
    <svg
      className="fold__v"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
