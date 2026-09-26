import type { CSSProperties, ReactNode } from 'react';

/**
 * Sidecar — a form, beside the thing the form is about.
 *
 * ── IT IS NOT `Split`, AND THE DIFFERENCE IS WHERE IT LIVES ─────────────────
 *
 * `.split` is the list-detail frame: it replaces `.body`, takes the full height
 * of `.main`, draws a border down the middle and gives each column a scrollport
 * of its own. This is a BLOCK INSIDE `.body` — one scroller, one reading order,
 * no border. Reach for `Split` when the left column is a list you pick from;
 * reach for this when the right column is a standing reference the left column
 * keeps changing.
 *
 * ── WHAT IT IS FOR ──────────────────────────────────────────────────────────
 *
 * The screen that has an answer and a consequence on it at the same time: a
 * profile and the card a client will read, a price list and the invoice it
 * produces, a template and the week it lays out. The aside is sticky, so the
 * consequence is on screen for every field that changes it — which is the
 * whole reason to spend the width on it rather than stacking the two.
 *
 * ── THE ASIDE IS A REFERENCE, NEVER A STEP ──────────────────────────────────
 *
 * Nothing in it may be a required control. Under 928px of its own width the
 * grid collapses and the aside is drawn ABOVE the form with `order:-1` — read
 * first, like the card at the top of a phone screen — while the DOM order, and
 * therefore the tab order, still runs form-then-aside. That is only honest
 * while the aside holds nothing a keyboard has to reach in sequence. A link out
 * is fine. A field is not.
 *
 * ── IT RENDERS TWO ELEMENTS, AND THE OUTER ONE IS NOT DECORATION ───────────
 *
 * `.sdcw` is a query container and `.sdc` is the grid that queries it. They
 * cannot be one element — a container cannot query itself, and
 * `grid-template-columns` is the declaration the rung has to change. It is a
 * container query rather than a breakpoint because the rail expands and
 * collapses: at a 1181px window this block is 1117px wide with the rail shut
 * and 933px with it open, and no viewport number is right for both. §04 has
 * the measurement.
 *
 * §04 owns every other one too; see the `c-sidecar` block there for why the
 * tracks are capped at 600 and 380 and why the row is not.
 */
export function Sidecar({
  aside,
  pin,
  /** `--w-sdc-main` / `--w-sdc-side`, for the screen whose reference is the wider half. */
  wideSide,
  /**
   * THE MAIN COLUMN TAKES THE WHOLE ROW RATHER THAN A CAP — `.sdc--fill`.
   *
   * `--w-sdc-main` is a cap, which is exactly right for a FORM: a field set is
   * legible at 600px and no better at 1,100, so the track stops and leaves the
   * rest of the window alone. A READING column is the opposite case — the
   * stylesheet's entry carries the measurement, and the short version is that a
   * capped sidecar left 361px of dead surface down the right of the progress
   * report while crushing the tables inside its 600.
   *
   * Set it when the main column holds tables, charts or prose that genuinely
   * wants the room. Leave it alone for anything with fields in it.
   */
  fill,
  /** Goes on the form column, which is where a screen's own layout class belongs. */
  mainClassName,
  asideLabel,
  className,
  style,
  children,
}: {
  /** The standing reference. Read before the form under 1180px. */
  aside: ReactNode;
  /**
   * THE ONE PART OF THE ASIDE THAT MUST STAY IN VIEW — usually its actions.
   *
   * Rendered inside the aside, above it while the column is a sticky rail and
   * below it once the two columns have stacked. The stylesheet's `.sdc__pin`
   * entry carries the measurement; the argument in one line is that `sticky`
   * pins the TOP of a box, so the bottom of an aside taller than the viewport
   * is never on screen — which is fine for a reference and is a defect when it
   * is the screen's primary action.
   *
   * Stacked it swaps to last, because the reading order there runs top-down:
   * *send this* above the thing being sent asks somebody to act before they
   * have seen what they are acting on.
   *
   * Leave it alone for an aside that is purely a reference. A pin that is not
   * an action is just the aside in a different order.
   */
  pin?: ReactNode;
  wideSide?: boolean;
  fill?: boolean;
  mainClassName?: string;
  /**
   * Names the landmark. REQUIRED, because an `<aside>` with no accessible name
   * is announced as "complementary" and a screen reader user is told there is
   * a region without being told what is in it.
   */
  asideLabel: string;
  /** Goes on the OUTER element, the query container — a screen sizing the block itself. */
  className?: string;
  style?: CSSProperties;
  /** The form. */
  children: ReactNode;
}) {
  return (
    <div className={['sdcw', className].filter(Boolean).join(' ')} style={style}>
      <div
        className={['sdc', wideSide ? 'sdc--wide-side' : null, fill ? 'sdc--fill' : null]
          .filter(Boolean)
          .join(' ')}
      >
        <div className={['sdc__main', mainClassName].filter(Boolean).join(' ')}>{children}</div>
        <aside className="sdc__side" aria-label={asideLabel}>
          {/* The pin is FIRST in the DOM, not just first visually, and that is
              the accessible order rather than a side effect of the CSS: it is
              the actions, and a keyboard reaching this aside should reach them
              before a 1080×1350 preview it cannot read anyway. `order` moves
              the box on the stacked layout and leaves the tab order alone,
              which is the same trade `.sdc__side`'s own `order:-1` makes — its
              note says the tab order still runs form-then-aside. */}
          {pin === undefined ? null : <div className="sdc__pin">{pin}</div>}
          {aside}
        </aside>
      </div>
    </div>
  );
}
