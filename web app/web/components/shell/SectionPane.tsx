import { useNavFlags, visiblePages } from './NavFlags';
import Link from 'next/link';

import { activePageKey, type Destination } from './nav';

/**
 * THE SECOND NAVIGATION COLUMN — a section's pages, beside the rail.
 *
 * ── WHAT IT IS FOR, IN ONE LINE ──────────────────────────────────────────────
 *
 * The rail answers *which section*, and this answers *which page of it*. Those
 * were one control until 13 Sep 2026 — `ProgramsTabs` drew *My workout plans ·
 * Templates · Exercises* in the same horizontal strip that Business draws its
 * seven views in and the client file draws its six — and `nav.tsx`'s
 * `SectionPage` header carries the argument for splitting them. The short
 * version: a strip above a page reads as *views of this page*, and a section's
 * pages are not views of one page.
 *
 * ── IT IS A GRID TRACK, WHICH IS WHY IT HAS NO WIDTH HERE ────────────────────
 *
 * §03's `.app` is a grid and the rail's own file says the same thing about
 * itself: "the rail is a grid track and a track cannot resize itself." `.pane`
 * is `grid-area:pane` and both widths — 212px and the collapsed 56 — live on
 * `.app--pane` / `.app--pane-min` in app.css, so the shell owns the geometry and
 * this file owns the markup. A width set here would be a second opinion about a
 * number the grid has already decided.
 *
 * ── AND IT IS THE COLUMN THAT CLOSES — ALL OF IT ─────────────────────────────
 *
 * The rail is fixed at 64px; this one is the one that goes, and `paneCollapse.ts`
 * has the argument for which of the two should. It used to narrow to a 56px strip
 * of icons on the reasoning that a column that vanishes takes its own way back
 * with it — true, and the answer was to move the way back rather than to keep a
 * strip nobody asked for. The switch is `.rail__pc`, under the mark, drawn
 * whether or not this column is: closed, the pane's track travels to 0
 * and the column slides out under it, so the page gets all 212px rather than 156
 * of it. The rows hold their own width while it goes — `--w-pane-open` in
 * app.css says why, and it is the difference between a column leaving and a
 * column being crushed.
 *
 * So this file has NO collapsed state left in it. WHICH section it draws is
 * derived from the route and nothing else; WHETHER it is drawn at all is a
 * choice `AppShell` holds, because the track is a class on `.app`.
 *
 * ── `aria-current="page"`, NOT `aria-selected` ───────────────────────────────
 *
 * `PageTabs.tsx` reached this conclusion first and the reason transfers exactly:
 * `role="tablist"` promises arrow-key movement between panels already in the
 * document, and these are page loads. A `<nav>` of links is what this is, and a
 * screen reader that announces them as links is telling the truth about what
 * pressing one does.
 */
export function SectionPane({
  section,
  pathname,
  float = false,
  open = false,
  hover,
}: {
  /** The destination whose `pages` this draws. `AppShell` resolves it with
   *  `sectionFor`, which is what guarantees `pages` is non-empty here. */
  section: Destination;
  /** The route, for the current row. Passed rather than read from
   *  `usePathname()` so this file needs no client boundary of its own. */
  pathname: string;
  /**
   * THE FLYOUT. Same column, taken out of the grid and floated over the page.
   *
   * It is one component and not two because it is one thing: the same heading,
   * the same rows, the same `aria-current`, the same route-derived contents. The
   * only difference is which of the two questions put it on screen — *this is
   * the section you are in* (the track, pinned) or *this is the section you are
   * pointing at* (the flyout, transient) — and that difference is entirely
   * geometry. A second component would have been a second place for a page link
   * to go stale.
   *
   * It floats rather than opening the track because a hover is not a decision.
   * Pushing 212px of page sideways every time a pointer crosses the rail — and
   * pulling it back 200ms later — makes the window twitch at the speed of the
   * mouse. Floating, nothing behind it moves at all.
   */
  float?: boolean;
  /** Floating only: whether it is open right now. It stays MOUNTED when it is
   *  not, because it fades and slides on the way out and an unmounted element
   *  cannot do either. `panePreview.ts`'s `shown` is what it renders meanwhile. */
  open?: boolean;
  /**
   * The preview's two reports, and the first is the one that matters: the path
   * from a rail row to this column crosses a corner where the pointer is over
   * neither, so the row's `mouseleave` has already scheduled a close by the time
   * the pointer arrives. `hold` is this column saying it is under the pointer
   * after all. Focus as well, for a keyboard walking into the pages.
   */
  hover?: { hold: () => void; leave: () => void };
}) {
  const pages = visiblePages(section.pages ?? [], useNavFlags());
  const active = activePageKey(pages, pathname);

  return (
    /* `aria-label` and not an `aria-labelledby` pointing at the heading below:
       the heading is the section's name — *Fitness* — and the landmark's name
       has to say what KIND of landmark it is, or a screen reader listing the
       page's regions reads "Fitness navigation, Sections navigation" and the two
       columns are told apart by neither. There is no `pane--tips` any more: the
       tips existed for the 56px state, where a row was a glyph with no words on
       it, and this column has no such state left. */
    <nav
      className={`pane${float ? ' pane--float' : ''}${float && open ? ' pane--open' : ''}`}
      aria-label={`${section.label} pages`}
      /* `aria-hidden` and `inert` are NOT here, and that is not an oversight —
         a closed flyout is `visibility:hidden` in app.css, which takes it out of
         the accessibility tree and out of the tab order in one declaration, and
         unlike the attributes it does so AFTER the exit animation rather than on
         its first frame. Trap 5's rule, one level up: the thing that hides it
         has to be the thing that hides it from everyone. */
      onMouseEnter={hover?.hold}
      onFocus={hover?.hold}
      onMouseLeave={hover?.leave}
      onBlur={hover?.leave}
    >
      <div className="pane__top">
        {/* An `<h2>` and not a `<p>`: it is the heading of a region, it is the
            only heading in this column, and the page's own `<h1>` is `.ph__t`
            over in `.main`. A landmark whose contents have no heading is a
            landmark a screen reader user has to read linearly to understand. */}
        <h2 className="pane__t">{section.label}</h2>
        {/* AND NOTHING BESIDE IT. The close control is `.rail__pc` in the rail —
            this column is hidden outright rather than narrowed, so a button
            living here would go with it. */}
      </div>

      <div className="pane__body">
        {pages.map((page) => (
          <Link
            key={page.key}
            className="pane__i"
            href={page.href}
            {...(page.key === active ? { 'aria-current': 'page' as const } : {})}
          >
            {page.icon}
            {/* The label is the link's only text — unlike `.rail__i` there is no
                `title=` to fall back on — and there is no longer a second copy
                of it beside this one. The tip span that used to sit here was the
                56px state's visible label, and MEASURED it cost this link its
                accessible name twice over: `textContent` came back
                *ProgramsPrograms* until it was marked `aria-hidden`. A state
                that no longer exists does not need either half. */}
            <span>{page.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
