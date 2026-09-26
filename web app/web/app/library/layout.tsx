import Link from 'next/link';

import { LibNav } from '@/web-components/library/chrome/Lib';
import { ThemeToggle } from '@/web-components/library/chrome/ThemeToggle';
import { Logo } from '@/web-components/ui/Logo';

import './../styles/library-chrome.css';

/**
 * The design system's frame.
 *
 * ── WHY THE STYLESHEET IS IMPORTED HERE AND NOT IN THE ROOT LAYOUT ───────────
 *
 * `library-chrome.css` carries `.page`, `.cell` and `.st` — names generic enough
 * that a product component could match one by accident. `sync-design.mjs` strips
 * them out of the application stylesheet for exactly that reason, and importing
 * them at the root would hand back the collision the strip exists to prevent.
 *
 * A stylesheet imported in a nested layout is only sent on that layout's routes,
 * so the chrome reaches `/library` and nothing else.
 *
 * `app/frame/layout.tsx` imports it too, and for the same argument rather than
 * against it: that route is the inside of a `<Viewport>` frame, it renders the
 * library's own specimens, and it is not a product route either. Two
 * non-product segments carry these class names; no screen a trainer can reach
 * does.
 *
 * ── AND WHY THE SIDEBAR IS HERE RATHER THAN IN THE PAGES ────────────────────
 *
 * `.lib__nav` is its own scroll container — sticky, `overflow-y:auto`, and forty-
 * seven rows long. Rendered inside the page it was unmounted and remounted on
 * every navigation, so its `scrollTop` went back to zero and the list jumped to
 * the top on every click: switching between two components thirty rows apart
 * meant scrolling the sidebar down again each time.
 *
 * A layout is not remounted when only its child segment changes, so here the
 * element survives and keeps its scroll position.
 *
 * ── AND WHY THERE IS NO APP SHELL ───────────────────────────────────────────
 *
 * This route sits outside `(main)`, so it gets no rail and no tab bar. The
 * library renders the rail as a SPECIMEN; a real one docked to the left of it
 * would leave two on the page, one of them lying about where you are.
 */
export const metadata = {
  title: 'Design system · InclineYou',
  description:
    'The ten parts of the InclineYou design system — principles, style guide, components, patterns, accessibility, iconography, motion, grid, documentation and tokens.',
};

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page doc">
      <div className="doc__top">
        {/* The lockup itself, not the brand's name set in a lime pill. The
            library is the one screen whose job is to show the product's own
            components, so its chrome uses them. `.lk--ink` because the pill is
            an accent plate and the two-colour lockup would put accent on
            accent — the identity's lime lockup makes the same call. */}
        <span className="doc__id"><Logo cap={12} className="lk--ink" /></span>
        <span className="doc__t">Design system</span>
        <nav className="doc__nav" aria-label="Application">
          <Link href="/today">TODAY</Link>
          <Link href="/clients">CLIENTS</Link>
          <Link href="/schedule">SCHEDULE</Link>
          <Link href="/business">BUSINESS</Link>
        </nav>
        <ThemeToggle />
      </div>
      <div className="lib">
        <LibNav />
        <div className="lib__body">{children}</div>
      </div>
    </div>
  );
}
