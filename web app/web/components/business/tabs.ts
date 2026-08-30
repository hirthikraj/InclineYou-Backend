/**
 * BUSINESS' SEVEN TABS — *money, packages, reports*, and why they are one strip
 * rather than three with sub-strips.
 *
 * The obvious reading of the brief is three tabs — Money, Packages, Reports —
 * with the money book's own six living underneath the first of them. That was
 * rejected: two tab strips stacked on one screen is a taxonomy again, the exact
 * shape the rail's `BUILD` / `GROW` headings had, and the trainer has to learn
 * which of two rows their answer is on before they can look for it.
 *
 * So the strip is flat and it is seven. Each one is a question with a different
 * answer, which is the only test a tab has to pass:
 *
 * | Tab | The question |
 * | --- | --- |
 * | Ledger | what came in this month |
 * | Owed | who has not paid |
 * | Packages | what do I sell |
 * | Gym share | what the floor costs me |
 * | GST | am I near the threshold |
 * | Write-offs | what did I let go |
 * | Reports | how is the practice doing |
 *
 * Seven fits a desk with room, and under 900px `.ph__tabs` scrolls horizontally
 * and bleeds to the screen edge — which app.css already does for the roster's
 * segments, so the behaviour is one a trainer has met before.
 *
 * ── THE FIRST TWO ARE THE DAILY ONES AND THEY ARE FIRST ──────────────────────
 *
 * *Ledger* is the default and *Owed* is beside it because those two are read at
 * the end of a shift. *Packages* is third rather than last because adding a
 * client asks which pack applies, so the price list is read far more often than
 * a price list is edited.
 *
 * ── EVERY TAB IS A URL ───────────────────────────────────────────────────────
 *
 * `?tab=` and not component state, which is a change from the money book: it held
 * the active tab in `useState` seeded from a prop, so a trainer could not send
 * anyone a link to *Owed*.
 *
 * It is the ONLY thing in this screen's URL. The month used to be a path segment
 * beside it, on the argument that "the month decides what is FETCHED and the tab
 * decides what is DRAWN" — and the first half of that was never true here.
 * `getMoney()` pulls the book unwindowed and `Business.tsx` slices it in the
 * browser, so the month was a filter wearing a resource's clothes. It is state
 * now, and being state is what let it grow a *last 3 months* and a *last 6
 * months* that no path segment could have spelled. See `lib/money/period.ts`.
 *
 * The tab passes the test the month failed. `Packages` is the exception that
 * proves it is fetched: its data is a different call, so the page loads it only
 * when this param says so.
 */
export const BUSINESS_TABS = [
  'ledger', 'owed', 'packages', 'gymshare', 'gst', 'writeoffs', 'reports',
] as const;

export type BusinessTab = (typeof BUSINESS_TABS)[number];

export const DEFAULT_TAB: BusinessTab = 'ledger';

export function parseTab(raw: string | string[] | undefined): BusinessTab {
  const v = typeof raw === 'string' ? raw : undefined;
  return (BUSINESS_TABS as readonly string[]).includes(v ?? '')
    ? (v as BusinessTab)
    : DEFAULT_TAB;
}

/**
 * Which tabs are NOT about a period — the ones the picker is hidden on.
 *
 * It was hidden on `gst` already: that tab is a rolling twelve months and a
 * financial year, and a picker above it offered a choice that changed nothing on
 * the screen. *Packages* is a price list with no period at all and *Reports*
 * spans its own range, so both join it.
 *
 * *Owed* is deliberately not on this list even though `computeOwed` ignores the
 * period. A debt is owed as of now whichever month you are looking at, but the
 * picker stays drawn there because it is the same control in the same place
 * across the four tabs a trainer moves between, and a control that vanishes on
 * one of them reads as a bug rather than as a statement about debt.
 */
export const PERIODLESS_TABS: readonly BusinessTab[] = ['packages', 'gst', 'reports'];
