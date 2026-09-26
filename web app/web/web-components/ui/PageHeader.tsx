import type { ReactNode } from 'react';

/**
 * Page header — the title of the screen, its one-line state, and its actions.
 *
 * The title is an `<h1>`, and there is exactly one per screen. The reference
 * draws `<p class="ph__t">`, which puts a page on the web with no h1 at all —
 * the single most reported failure in any accessibility audit, and the thing a
 * reader jumps to first.
 *
 * `sub` is the screen's state in one line — "22 active · 3 owe you ₹31,000". It
 * is not a description of the screen. A trainer already knows what Clients is;
 * what they do not know is what it says today.
 */
export function PageHeader({
  title,
  sub,
  crumbs,
  actions,
  tabs,
  className,
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  /**
   * The path above the title — `Sessions / Meera K / Top sets`.
   *
   * Seven screens draw one and it goes INSIDE the title block, above the h1,
   * because it belongs to the title rather than to the header's row: the
   * actions on the right must stay level with the heading, not with the
   * breadcrumb. There was no slot for it, which is why those seven were the
   * largest group of headers this component could not describe.
   */
  crumbs?: ReactNode;
  actions?: ReactNode;
  /**
   * The row under the header, as MARKUP — the component wraps it in
   * `.ph__tabs`.
   *
   * Not the way the product's own tab bars arrive: `PageTabs` renders its own
   * `<nav className="ph__tabs">`, so passing one here would nest a `.ph__tabs`
   * inside a `.ph__tabs`. Those go in `children` instead, which wraps nothing.
   */
  tabs?: ReactNode;
  className?: string;
  /**
   * Anything else under the row, rendered as given. This is where a
   * `<SettingsTabs/>` or a `<ClientTabs/>` goes — components that already
   * bring the `.ph__tabs` element with them.
   */
  children?: ReactNode;
}) {
  return (
    <div className={['ph', className].filter(Boolean).join(' ')}>
      <div className="ph__row">
        {/* `.ph__id`, and it was a bare `<div>` until 20 Sep 2026 — app.css's own
            note on the class says so in as many words: *"`.ph__id` gives the left
            half something to be — it WAS a bare `<div>` — so it can take
            `min-width:0` and let a long date wrap instead of forcing the row
            wider than the header."* The class was written for this element and
            this element was not emitting it, so every header drawn through this
            component had the defect the class exists to fix, and the two screens
            that needed it (`.ph--clients`, `.ph--biz`) were hand-writing the
            whole block to get it.

            It is `min-width:0; flex:1 1 auto` and nothing else. The growth is
            invisible — `.ph__acts` is `margin-left:auto`, so the right half is
            ranged right whether the left half fills the row or shrink-wraps —
            and the shrink is the whole point: without `min-width:0` a flex item's
            automatic minimum is its content, so a long title pushes the row wider
            than the header rather than wrapping inside it. */}
        <div className="ph__id">
          {crumbs}
          {/* No `margin: 0` here. `webapp.css`'s reset already zeroes every
              heading margin, and the inline copy was the only thing stopping a
              converted `<h1 className="ph__t">` being byte-identical to the
              markup it replaced — the same dead weight `ui/Card.tsx` carried. */}
          <h1 className="ph__t">{title}</h1>
          {sub ? <p className="ph__sub">{sub}</p> : null}
        </div>
        {actions ? <div className="ph__acts">{actions}</div> : null}
      </div>
      {tabs ? <div className="ph__tabs">{tabs}</div> : null}
      {children}
    </div>
  );
}
