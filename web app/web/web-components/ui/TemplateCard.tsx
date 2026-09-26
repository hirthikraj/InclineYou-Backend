import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';

/**
 * Template card — one certified blueprint, as a card. Catalogue entry
 * `c-templatecard`, `.certc`.
 *
 * ── WHY THE CATALOGUE HAS IT AND WHY IT IS NOT `c-card` ─────────────────────
 *
 * `.certc` was one of the class families living in §04 with no component behind
 * it, so `/programs/certified` hand-wrote every part of it — the header, the
 * meta line, the footer split — and a change to the card meant editing a screen
 * rather than a component. That is the exact drift the catalogue exists to
 * stop, and it is why the whole BEM family becomes ONE entry with parts rather
 * than five: `.certc__ft` is not a component, it is this card's footer.
 *
 * It is not a `Card` variant. `.card` is a titled container a screen puts
 * anything inside; this is a fixed record with six named slots in a fixed
 * order, a footer pinned to the bottom of a stretched grid track, and a rule
 * about which of its two states may be lit. Nothing but the border radius is
 * shared.
 *
 * ── THE CARD IS NOT A LINK, BUT ITS NAME IS ─────────────────────────────────
 *
 * A clickable card wrapping two buttons is nested interactive content: it
 * breaks tab order, and it puts the act that writes twenty rows onto somebody's
 * shelf behind a click that missed. So the card is a plain `<article>`.
 *
 * The TITLE is a link and that costs none of the above — the `<a>` is inside
 * the `<h3>` and the buttons are in the footer, so they are siblings and
 * nothing is nested in anything. What it buys is that the program's NAME is the
 * way into the program, which is where a reader's pointer already is.
 *
 * ── IT FORMATS NOTHING ──────────────────────────────────────────────────────
 *
 * `spec` arrives as figure/noun pairs and `meta` as a rendered node. A
 * component with no clock cannot disagree with itself across hydration, and a
 * component that pluralises is a component that has opinions about the
 * caller's data — `TemplateRow` draws the same line and takes its stamps as
 * strings for the same reason.
 */

export type TemplateCardSpec = {
  /** The figure. Rendered in `--tx-ink` at the card's only bold weight. */
  value: ReactNode;
  /**
   * The noun the figure is OF — *days a week*, *weeks*, *exercises*.
   *
   * Required, and that is the whole rule. `3 · 8 · 15` is not three facts, it
   * is three numbers whose units the reader has to guess, and a card grid has
   * no column heading anywhere to guess them from. `.ptrow__k` made the same
   * call on the program row.
   */
  noun: ReactNode;
};

export function TemplateCard({
  name,
  href,
  /** The one thing in the header that varies. Nothing, usually. */
  tag,
  summary,
  spec,
  tags,
  /** A refusal from the server, printed in the card that asked for it. */
  error,
  meta,
  actions,
  /** Already on the caller's shelf. A lit edge, and never a fill. */
  mine,
  className,
}: {
  name: ReactNode;
  /** The name is the door. Omit it and the name is plain text. */
  href?: string;
  tag?: ReactNode;
  /** Who it is for and what it does. Three lines, then `.certc__s` clamps. */
  summary?: ReactNode;
  /** Three, by convention. The bar wraps rather than truncating below ~320px. */
  spec?: TemplateCardSpec[];
  /** Level, equipment, goal — read-only `Tag`s, never chips. */
  tags?: ReactNode;
  error?: ReactNode;
  /** The footer's left half: provenance. Wrap a figure in `<b>` to weight it. */
  meta?: ReactNode;
  actions?: ReactNode;
  mine?: boolean;
  className?: string;
}) {
  /* `Button`'s rule, which `ProgramRow` already follows for its own whole-row
     anchor: `next/link` for anything the router can serve, a plain `<a>` for
     anything off-site. A certified blueprint is always in-app; the test is here
     so the component cannot be the one place that prefetches an external host. */
  const offSite = /^[a-z]+:|^\/\//i.test(href ?? '');

  return (
    <article className={['certc', mine ? 'certc--mine' : null, className].filter(Boolean).join(' ')}>
      <header className="certc__hd">
        <h3 className="certc__t">
          {href === undefined ? (
            name
          ) : offSite ? (
            <a className="certc__tl" href={href}>
              {name}
            </a>
          ) : (
            <Link className="certc__tl" href={href}>
              {name}
            </Link>
          )}
        </h3>
        {tag}
      </header>

      {summary ? <p className="certc__s">{summary}</p> : null}

      {/* EVERY SPACE IN THE BLOCK BELOW IS LOAD-BEARING, including the ones
          between the items. This was a flex row with a `gap` inside each item
          and a border between them, which draws the separation and creates no
          characters: whitespace between flex children is stripped, and a
          whitespace-only anonymous item is never generated at all. The
          accessible name came back `3days a week8 weeks15 exercises` — one run,
          in the right order, unreadable — and nothing in a screenshot or an
          overflow probe can see that; `textContent` is what caught it. §04 is
          inline flow now and these are real spaces, written as `{' '}` rather
          than literals because JSX drops whitespace that touches a newline. */}
      {spec && spec.length > 0 ? (
        <p className="certc__spec">
          {spec.map((s, i) => (
            /* The index is the key and it is safe: this is a fixed-length
               positional list — days, then weeks, then exercises — that never
               reorders and never has a row inserted into it. */
            <Fragment key={i}>
              {i > 0 ? ' ' : null}
              <span>
                <b>{s.value}</b>
                {' '}
                {s.noun}
              </span>
            </Fragment>
          ))}
        </p>
      ) : null}

      {tags ? <p className="certc__tags">{tags}</p> : null}

      {error ? <p className="certc__fail">{error}</p> : null}

      {meta || actions ? (
        <footer className="certc__ft">
          {meta ? <span className="certc__used">{meta}</span> : null}
          {actions ? <span className="certc__acts">{actions}</span> : null}
        </footer>
      ) : null}
    </article>
  );
}
