import { LastContactProvider } from '@/components/nudge/LastContact';
import { PeriodScope } from '@/components/business/PeriodScope';
import { lastContactContext } from '@/lib/nudges/context';

/**
 * WHAT THE SIX BUSINESS PAGES SHARE — and it is two pieces of state, not chrome.
 *
 * ── WHY THERE IS A LAYOUT HERE AT ALL ────────────────────────────────────────
 *
 * Business was one route with seven tabs and is six routes in the section pane.
 * The split is what `components/shell/nav.tsx` argues for — a section's PAGES
 * belong in the column beside the rail, a page's VIEWS belong in a strip above it
 * — and the cost of making it is that two things which used to be held by one
 * component now have nowhere to live: the period the trainer picked, and the
 * *last contacted* map the nudge buttons read.
 *
 * A layout is exactly the right place for both, because a layout does NOT
 * re-render when the segment under it changes. State inside one survives every
 * move between the six pages and dies when the trainer leaves Business, which is
 * the same lifetime the old `useState` had. `PeriodScope.tsx` carries that
 * argument in full.
 *
 * ── AND THE NUDGE MAP IS FETCHED ONCE, HERE, FOR THE SAME REASON ─────────────
 *
 * Two pages draw a nudge button — the Overview's *Needs you* and the price
 * list's *Ending soon* — and the old page fetched this on all seven tabs on the
 * reasoning that *"a cheap read whose answer the trainer switches between tabs
 * to see is a read that belongs with the page"*. That reasoning survives the
 * split intact; what changes is that "the page" is now this layout, so the read
 * happens once per visit to the section rather than once per page inside it.
 *
 * It cannot fail the screen: `listRecentNudges` answers `[]`.
 *
 * ── WHAT IS DELIBERATELY *NOT* HERE ──────────────────────────────────────────
 *
 * The money book itself. `getMoney()` is four requests and five of the six pages
 * want it, so hoisting it here is the obvious move and it is the wrong one: the
 * Packages page wants the `pack` table and nothing else, and a layout fetch would
 * make the price list pay for the whole payments book to draw a list of prices.
 * `getMoney` is wrapped in React's `cache()`, so the pages that do want it pay
 * for it once each regardless of where the call is written.
 *
 * The TopBar is not here either. Its crumb names the page — *Business /
 * Transactions* — so it is page-specific by definition, and a layout copy would
 * have to be told what to say by the thing under it.
 */
export default async function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* Both halves of one read, and the clock comes back with them: a component
     body may not call `Date.now()` (trap 20), so the instant is stamped in a
     plain async function and arrives here as a value. `lib/nudges/context.ts`
     carries the argument. */
  const { now, map } = await lastContactContext();

  return (
    <PeriodScope now={now}>
      <LastContactProvider map={map} now={now}>
        {children}
      </LastContactProvider>
    </PeriodScope>
  );
}
