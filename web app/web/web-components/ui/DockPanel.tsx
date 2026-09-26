import type { CSSProperties, ReactNode } from 'react';

/**
 * DockPanel — the third column, docked rather than floating.
 *
 * ── WHY IT IS NOT `Panel` ───────────────────────────────────────────────────
 *
 * `.panel` is `position:absolute` with a shadow, a z-index and an entrance
 * animation: it FLOATS over the thing behind it. `.dock` is a grid track. It
 * opens a 380px column beside the list and the plane, takes that width out of
 * the plane, and PUSHES rather than covers.
 *
 * The difference is not stylistic. `RowPanel` edits the sets and reps of one
 * row of a program, and the trainer decides those numbers by looking at the
 * four rows around it — which a sheet sliding over the board would be covering.
 * `ExerciseInfo` says so in a comment at its own call-site, and this is the
 * component that comment was asking for.
 *
 * `.split:has(> .dock)` is what opens the track, so rendering this component
 * IS the layout change. There is no flag to keep in sync with it, and there is
 * no way to have the panel without the column it needs.
 *
 * ── PARTS, NOT PROPS ────────────────────────────────────────────────────────
 *
 * Six call-sites, and no two of their bodies are alike: a form, a list with its
 * own dividers, a search-and-results pane, and the week builder's library dock
 * which brings a whole second class family. A `title`/`body`/`foot` component
 * would have to grow a prop for each and still could not draw the dock. So the
 * parts are components, the way `Card`'s are:
 *
 *     <DockPanel label={`Edit ${name}`}>
 *       <DockPanel.Head title={name} sub={shape} actions={<Button …/>} />
 *       <DockPanel.Body>…</DockPanel.Body>
 *       <DockPanel.Foot><Button …/></DockPanel.Foot>
 *     </DockPanel>
 *
 * The head is the one shape that repeated — five of the six draw a title, a
 * `.small` line under it and a close button — so `sub` is a prop and the
 * wrapping `<div>` that `.dock__hd > div` styles appears only when there is a
 * subtitle to wrap. The sixth head has no subtitle and no wrapper, which is
 * what that condition reproduces.
 *
 * `actions` rather than an `onClose`: every close button in the product is a
 * ghost icon-only `Button` whose glyph each screen imports for itself, and a
 * component that renders one would have to pick an icon module on their behalf.
 *
 * ── THE PARTS ARE USABLE WITHOUT THE ROOT, ON PURPOSE ───────────────────────
 *
 * `Programs.tsx` draws the *new program* dialog out of `Head`, `Body` and
 * `Foot` inside a `.pg__dialog` — no dock at all. That is not misuse: a dialog
 * and a docked panel share a header, a scrolling body and a button row, and the
 * alternative is a second set of classes that drift apart. Same as `Card.Head`.
 *
 * ── WHAT IT DOES NOT OWN ────────────────────────────────────────────────────
 *
 * Not the styling. `.dock` and its parts live in
 * `design-system/webapp/webapp/assets/webapp.css`, under `── the docked panel`.
 * The phone behaviour — under 1180px it becomes a full-screen sheet — is a
 * delta in `app/styles/app.css`, which is the one thing about this component
 * still described in two files.
 */

/** The head. `sub` brings the wrapper `.dock__hd > div` with it. */
export function DockHead({
  title,
  sub,
  actions,
  className,
  style,
  children,
}: {
  title?: ReactNode;
  /** The `.small` line under the title — a count, a shape, a provenance. */
  sub?: ReactNode;
  /** The right of the head. In practice a ghost icon-only close `Button`. */
  actions?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const heading = title ? <p className="dock__t">{title}</p> : null;

  return (
    <header className={['dock__hd', className].filter(Boolean).join(' ')} style={style}>
      {sub ? (
        <div>
          {heading}
          <p className="small">{sub}</p>
        </div>
      ) : (
        heading
      )}
      {children}
      {actions}
    </header>
  );
}

/**
 * The scrolling middle. `list` gives up the body's own gutter so that rows
 * carrying their own dividers reach the panel's edges — a separator stopping
 * 14px short of the border is the tell that a list is wearing a form's padding.
 */
export function DockBody({
  list,
  className,
  style,
  children,
}: {
  list?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div
      className={['dock__body', list ? 'dock__body--list' : null, className]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      {children}
    </div>
  );
}

/**
 * A filter strip between the head and the body, OUTSIDE the body's scroller —
 * so the search filtering thirteen rows does not scroll away from them.
 */
export function DockFilters({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div className={['dock__filters', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  );
}

/** The button row. `stack` when the actions are a primary and a destructive
 *  rather than a save and a cancel — they stop being a pair and go full-width. */
export function DockFoot({
  stack,
  className,
  style,
  children,
}: {
  stack?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <footer
      className={['dock__foot', stack ? 'dock__foot--stack' : null, className]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      {children}
    </footer>
  );
}

/**
 * The panel's own footnote — how a figure above was arrived at. At the foot of
 * the list rather than on every row of it.
 */
export function DockFine({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <p className={['dock__fine', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </p>
  );
}

export function DockPanel({
  label,
  className,
  style,
  children,
}: {
  /**
   * The accessible name. Required rather than optional: this is an `<aside>`,
   * which is a landmark, and an unnamed landmark in a list of landmarks is the
   * thing a reader user is trying to tell apart from the others.
   */
  label: string;
  /**
   * For a dock that brings its own internals. `LibraryDock` is
   * `dock wslib wslib--drawer` — the first opens the track and gives the column
   * its flex shell, the rest is what its own rules are written against.
   */
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <aside className={['dock', className].filter(Boolean).join(' ')} style={style} aria-label={label}>
      {children}
    </aside>
  );
}

DockPanel.Head = DockHead;
DockPanel.Body = DockBody;
DockPanel.Filters = DockFilters;
DockPanel.Foot = DockFoot;
DockPanel.Fine = DockFine;
