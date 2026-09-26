import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Pager — numbered pages under a list.
 *
 * ── WHY THIS EXISTS RATHER THAN A *LOAD MORE* BUTTON ────────────────────────
 *
 * *Load more* is the cheaper control and it answers a different question. It
 * suits a feed, where the trainer is reading forward and the only thing they
 * ever want is *more*. It does not suit a catalogue, where they are LOOKING for
 * something: an appended list has no position, so there is no way to say where
 * you are, no way to get back to the row you scrolled past, and no way to tell
 * a colleague where you found it. The exercise library is a catalogue.
 *
 * ── AND WHY THE PAGES ARE LINKS ─────────────────────────────────────────────
 *
 * `href` per page, not an `onChange`. A page of a list is a PLACE — it survives
 * a reload, it belongs in history so the back button leaves it, and it can be
 * pasted into a message. A button that mutates state has none of those and
 * cannot be opened in a new tab, which is the first thing anyone does with a
 * long list. `PageTabs` made the same call one rung up and for the same reason.
 *
 * The caller supplies `href(page)` rather than a base URL with a parameter name,
 * because the pager has no business knowing which of a screen's parameters are
 * filters — `lib/exercises/tabs.ts` builds the whole address from one place, and
 * this asks it to.
 *
 * ── THE WINDOW ──────────────────────────────────────────────────────────────
 *
 * Fifty-three pages is fifty-three targets, so the run is windowed: the first
 * page, the last page, the current one and its neighbours, with a gap between.
 * The first and last are always drawn because *go back to the beginning* and
 * *how deep does this go* are the two questions a windowed pager otherwise makes
 * unanswerable.
 */

/** Which page numbers to draw, and where the gaps fall. `null` is a gap. */
function windowOf(page: number, pages: number, span: number): (number | null)[] {
  if (pages <= span) return Array.from({ length: pages }, (_, i) => i);

  const out = new Set<number>([0, pages - 1, page]);
  for (let d = 1; d <= 1; d++) {
    if (page - d >= 0) out.add(page - d);
    if (page + d < pages) out.add(page + d);
  }
  /* Fill toward the middle until the run is `span` wide, so the control does not
     change width as the trainer walks from page 1 to page 5. */
  let lo = page - 2;
  let hi = page + 2;
  while (out.size < span && (lo >= 0 || hi < pages)) {
    if (lo >= 0) out.add(lo--);
    if (out.size < span && hi < pages) out.add(hi++);
  }

  const sorted = [...out].sort((a, b) => a - b);
  const withGaps: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) withGaps.push(null);
    withGaps.push(n);
  });
  return withGaps;
}

export function Pager({
  page,
  size,
  total,
  href,
  label,
  noun,
  className,
  span = 7,
}: {
  /** Zero-based, as every API in this codebase counts. */
  page: number;
  size: number;
  total: number;
  /** The address of a page. Zero-based in, absolute path out. */
  href: (page: number) => string;
  /**
   * What the pager is FOR, read before the first control: "exercise library
   * pages". Required — a bare `<nav>` of numbers is announced as "navigation"
   * and a screen with two of them is two identical landmarks.
   */
  label: string;
  /**
   * The thing being counted, plural: "exercises". Draws the count line —
   * *26&ndash;50 of 77 exercises*. A pager that says only "26–50 of 77" is a
   * range of nothing in particular.
   */
  noun: ReactNode;
  className?: string;
  /** How many number slots the run is allowed. Below this, every page is drawn. */
  span?: number;
}) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, size)));

  /* ONE PAGE DRAWS NOTHING AT ALL, and that is the component's decision rather
     than each caller's. A pager under a list that fits on one page is chrome
     saying "page 1 of 1" — it offers no action and it teaches the eye to skip
     the place where the real one will appear. `CountBadge` refuses a zero for
     the same reason. */
  if (pages <= 1) return null;

  /* Clamped rather than trusted: `?page=99` on a two-page list is reachable by
     hand and by a stale link, and the API answers it with an empty slice. The
     numbers still point somewhere real so the trainer can get out. */
  const current = Math.min(Math.max(0, page), pages - 1);
  const first = current * size + 1;
  const last = Math.min(total, (current + 1) * size);

  return (
    <nav className={['pager', className].filter(Boolean).join(' ')} aria-label={label}>
      <p className="pager__n">
        {first.toLocaleString()}&ndash;{last.toLocaleString()} of {total.toLocaleString()} {noun}
      </p>

      {/* Prev and Next are rendered as a DISABLED SPAN at the ends, not as a
          link to nowhere and not removed. Removing them shifts every other
          control sideways on the first and last page; a link that goes nowhere
          is a promise the control cannot keep. */}
      {current > 0 ? (
        <Link className="btn" href={href(current - 1)} scroll={false} rel="prev">
          Previous
        </Link>
      ) : (
        <span className="btn" aria-disabled="true">Previous</span>
      )}

      {/* `display:contents` is §11's, not an inline style — see the rule's own
          note on why an inline one would survive the 620px fold. */}
      <span className="pager__run">
        {windowOf(current, pages, span).map((n, i) =>
          n === null ? (
            <span key={`gap-${i}`} className="pager__gap" aria-hidden="true">
              &hellip;
            </span>
          ) : n === current ? (
            /* The current page is not a link. Pressing it does nothing, and a
               link that does nothing is the one control a keyboard user cannot
               tell from the ones that do. */
            <span key={n} className="btn" aria-current="page">
              {n + 1}
            </span>
          ) : (
            <Link key={n} className="btn" href={href(n)} scroll={false} aria-label={`Page ${n + 1}`}>
              {n + 1}
            </Link>
          ),
        )}
      </span>

      {current < pages - 1 ? (
        <Link className="btn" href={href(current + 1)} scroll={false} rel="next">
          Next
        </Link>
      ) : (
        <span className="btn" aria-disabled="true">Next</span>
      )}
    </nav>
  );
}
