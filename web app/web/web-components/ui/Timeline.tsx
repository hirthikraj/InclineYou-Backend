import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Timeline — a spine, a dot per entry, and three lines against it. Catalogue
 * entry `c-timeline`, class `.tl`.
 *
 * ── THIS FILE EXISTED AND WAS DELETED, AND BOTH WERE RIGHT ──────────────────
 *
 * The 16 Sep 2026 purge removed the thirteen components no screen imported, and
 * this was one of them: the catalogue said `c-timeline` was a shared module
 * while three call-sites hand-wrote `.tl` — the client file's plan history and
 * the workout console's record list, twice, the second an exact duplicate of
 * the first forty lines up in the same file. Deleting a component nothing uses
 * is honest. What it left behind is the hole the seven CSS-only families sit
 * in: a live pattern with no entry, no page, and nothing checking it — which is
 * how `RecordCard.tsx` came to hold two copies of one timeline, both carrying
 * the same inline `style` attribute to put the title in the mono face.
 *
 * So it is back, and it is back the way the rule says: component first, then
 * the registry row, then the entry page, then the call-sites.
 *
 * ── WHAT THE DELETED VERSION HAD RIGHT, AND IS KEPT HERE ────────────────────
 *
 * **The element.** An `<ol>` of `<li>`, "because the order is the meaning. A
 * stack of divs tells a screen reader nothing about sequence or length; a list
 * says *list, 6 items* and numbers them." Its words, and they still stand.
 * `label` names the list for the same reason a `Meter` takes one.
 *
 * **`at`.** `TODAY · 06:52` is the right thing to show and is not a date a
 * machine can read — and it stops being true at midnight. The ISO instant goes
 * in `<time datetime>` under the display string.
 *
 * One thing it had wrong, and it is why nothing could have adopted it as
 * written: it zeroed `padding` from a `style` attribute, and `.tl`'s whole
 * geometry is `padding-left:26px` — the spine sits at 7px and every dot at
 * −23px from the row. An inline declaration outranks the class, so the dots
 * would have drawn outside the list. Nothing sets layout from the style
 * attribute now; §02's reset already zeroes an `ol`'s margin, padding and
 * markers at (0,0,1), which `.tl` beats where it needs to.
 *
 * ── ONE COMPONENT, WITH PARTS, AND THAT IS THE OTHER CHANGE ─────────────────
 *
 * The deleted version took an `items` array of `{date, title, body, tone}`.
 * That shape cannot say *this row is a link*, *this title is a set of figures
 * rather than a name*, or *put a tag beside the name* without growing a field
 * per call-site — which is the form the three hand-written copies each needed.
 * `Timeline.Item` is the same split `Card` makes, and NOT one component per
 * `__element`: `.tl__d`, `.tl__t` and `.tl__b` are the three lines of ONE row
 * and have no meaning apart from it.
 */
export function Timeline({
  /** What the history is of: "Priya Pillai's plans". Names the list. */
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <ol className={['tl', className].filter(Boolean).join(' ')} aria-label={label}>
      {children}
    </ol>
  );
}

function Item({
  /** The mono line above the title: an ordinal, a date, a short label. */
  mark,
  /**
   * The ISO instant behind `mark`, where `mark` is a date. See the note above:
   * `TODAY` is not a date a machine can read.
   */
  at,
  title,
  /**
   * The title in the mono face — for a row whose title is a READING rather
   * than a name. See `.tl__t--mono`.
   */
  mono,
  /** Quiet ink and a lighter weight, for a row that records an absence. */
  dim,
  /** Beside the title, inside the same line: a `Tag`, a count. */
  aside,
  /** The third line — dates, figures, an outcome. */
  meta,
  /** Lime dot. The entry this list is ABOUT, and at most one row has it. */
  live,
  /** Makes the whole row the anchor. See `.tl__a`. */
  href,
  className,
}: {
  mark?: ReactNode;
  at?: string;
  title: ReactNode;
  mono?: boolean;
  dim?: boolean;
  aside?: ReactNode;
  meta?: ReactNode;
  live?: boolean;
  href?: string;
  className?: string;
}) {
  const row = ['tl__i', live ? 'tl__i--acc' : null, className].filter(Boolean).join(' ');

  const body = (
    <>
      {mark !== undefined && mark !== null ? (
        <p className="tl__d">{at ? <time dateTime={at}>{mark}</time> : mark}</p>
      ) : null}
      <p
        className={['tl__t', mono ? 'tl__t--mono' : null, dim ? 'tl__t--dim' : null]
          .filter(Boolean)
          .join(' ')}
      >
        {title}
        {aside}
      </p>
      {meta !== undefined && meta !== null ? <p className="tl__b">{meta}</p> : null}
    </>
  );

  /* ── `.tl__i` STAYS ON THE `<li>` AND THE ANCHOR IS A CHILD ────────────────

     The obvious arrangement is the other one — put `.tl__i` on the `<a>` and
     let the anchor be the row. It breaks a rule that is three lines away:
     `.tl__i:last-child` drops the 18px gap under the final entry, and an
     anchor that is its `<li>`'s only child is `:last-child` on EVERY row. Every
     gap in a list of links would have closed, and the rule would have looked
     correct in the sheet.

     Keeping them apart also puts the 18px OUTSIDE the hit area, so a click in
     the gap between two entries is a click on neither, and leaves the dot —
     an `::before` on the row — out of the anchor's focus ring, which then hugs
     the three lines it is about.

     A `<p>` inside an `<a>` is valid; the anchor's content model is
     transparent. That is what keeps the three lines identical whether the row
     is a link or not. */
  return (
    <li className={row}>
      {href ? (
        <Link className="tl__a" href={href}>
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

Timeline.Item = Item;
