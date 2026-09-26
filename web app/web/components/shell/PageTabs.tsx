import Link from 'next/link';

/**
 * THE TAB STRIP, WRITTEN DOWN ONCE.
 *
 * The five-destination pass folded six rail rows into tabs, and the strip they
 * fold into already existed in four places — the client file, the money book, the
 * roster's segments and the team screen — drawn four slightly different ways. Two
 * of them got the active state right (`aria-selected` plus a border) and two
 * carried it inline; one used `<Link>`, one used `<button>`, and only one set
 * `role="tablist"`.
 *
 * That was survivable while a tab strip was a detail of one screen. It stops being
 * survivable when the strip is where six destinations went: *Exercises* inside
 * Programs and *Packages* and *Reports* inside Business are now the only way to
 * reach those screens, so the strip is navigation, and navigation that is drawn
 * four ways is navigation a trainer has to learn four times.
 *
 * ── LINKS, NOT BUTTONS, AND NOT A `tablist` ──────────────────────────────────
 *
 * `role="tablist"` promises arrow-key movement between panels that are already in
 * the document. These tabs are page loads: the panel is not there until the server
 * sends it, so the promise is one this markup cannot keep. `ClientFile.tsx` made
 * the same call for the same reason and it is the right one — a `<nav>` of links
 * is what these are, and a screen reader that announces them as links is telling
 * the truth about what pressing one does.
 *
 * `aria-current="page"` is therefore the selected state rather than
 * `aria-selected`, which belongs to a `tab` role this strip does not claim.
 *
 * ── AND THE ACTIVE BORDER IS A CLASS, NOT AN INLINE STYLE ────────────────────
 *
 * `.tab[aria-selected="true"]` in webapp.css is the design set's selector and it
 * does not match a link that never claims to be a tab. Rather than edit the copied
 * stylesheet — which is forbidden; see `AGENTS.md` on the two stylesheets — the
 * delta in `app.css` adds `.tab[aria-current="page"]` beside it, so both spellings
 * land on one rule and the four existing strips keep working untouched.
 */

export interface PageTab {
  key: string;
  label: string;
  href: string;
  /** A figure beside the label. Omitted, never drawn as a zero — a strip that
   *  says *Pending 0* has spent a badge to say nothing happened. */
  count?: number | null;
}

export function PageTabs({
  tabs,
  current,
  label,
  /** `replace` for a strip that selects a view of data the browser already has —
   *  the money book's six, where six history entries per visit is a back button
   *  that takes six presses to leave. `push` where the tab is a different fetch. */
  replace = false,
}: {
  tabs: PageTab[];
  current: string;
  /** What the strip is a set of tabs FOR. Read aloud before the first tab. */
  label: string;
  replace?: boolean;
}) {
  return (
    <nav className="ph__tabs" aria-label={label}>
      {tabs.map((t) => (
        <Link
          key={t.key}
          className="tab"
          href={t.href}
          replace={replace}
          scroll={false}
          {...(t.key === current ? { 'aria-current': 'page' as const } : {})}
        >
          {t.label}
          {t.count != null && t.count > 0 && <span className="rail__n">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
