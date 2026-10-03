import { permanentRedirect, redirect } from 'next/navigation';

import { Overview } from '@/components/business/Overview';
import { Unavailable } from '@/components/today/Unavailable';
import { requireOverview } from '@/lib/business/guard';

/**
 * BUSINESS — the section's front page, and it is no longer a seven-tab screen.
 *
 * ── WHAT THIS ROUTE USED TO BE ───────────────────────────────────────────────
 *
 * It was the whole of Business: one component drawing seven tabs off a `?tab=`
 * param, fetching the money book on every one of them and conditionally fetching
 * two more payloads depending on which tab the param named. `tabs.ts` argued
 * that the seven were "views of one screen" and that a `?tab=` which changes what
 * is FETCHED — *Packages* and *Reports* both did — cannot be component state.
 *
 * Both halves of that were right, and they were the argument for splitting the
 * strip rather than for keeping it. A tab that changes what the server fetches
 * is a PAGE. Five of the seven became one, the other two became chips on the
 * ledger, and the section's pages moved into the column beside the rail where
 * `components/shell/nav.tsx` says a list of places belongs.
 *
 * What is left here is the page that did not exist: the Overview.
 *
 * ── THE OLD `?tab=` LINKS STILL WORK, AND THEY REDIRECT ──────────────────────
 *
 * This param was live for the whole of this half's life and is in bookmarks, in
 * `/money`'s permanent redirect, in `/packages`' and `/reports`', and in the
 * `/business/[month]` one. Rather than teach five callers a new URL, they all
 * keep pointing here and the table below forwards them. `?record=` goes with
 * them: it opens the record panel, which lives on Transactions now.
 *
 * `permanentRedirect` for the four that name a page, because those URLs will
 * never mean anything else again. The three folded tabs get a temporary `redirect`
 * with the filter pre-selected — `owed` and `writeoffs` are not gone, they are
 * chips, and a 308 would teach a browser to cache a mapping that a later pass
 * could reasonably change.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Business · InclineYou' };

/** The four old tabs that became pages. */
const MOVED: Record<string, string> = {
  ledger: '/business/transactions',
  packages: '/business/packages',
  gst: '/business',
  reports: '/business/reports',
};

/** The three that became chips on the ledger. `LedgerFilter`'s own spellings. */
const FOLDED: Record<string, string> = {
  owed: '/business/transactions?filter=owed',
  writeoffs: '/business/transactions?filter=writeoff',
  gymshare: '/business/transactions?filter=gymshare',
};

export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await props.searchParams;
  const tab = typeof q.tab === 'string' ? q.tab : null;

  if (tab !== null && MOVED[tab]) {
    /* `?from=new-client` is the price list's detour flag and is the one param
       worth carrying across — it is what draws the way back to `/clients/new`.
       Nothing else in this URL survives a move to a page that does not read it. */
    const from = q.from === 'new-client' ? '?from=new-client' : '';
    permanentRedirect(`${MOVED[tab]}${from}`);
  }
  if (tab !== null && FOLDED[tab]) redirect(FOLDED[tab]);

  /* The tab bar's + and the client file's *Sell a pack* both point at
     `/business?record=<id>`. The panel is on Transactions now. */
  if (typeof q.record === 'string') {
    redirect(`/business/transactions?record=${encodeURIComponent(q.record)}`);
  }

  const money = await requireOverview();

  if (!money.ok) {
    return (
      <Unavailable
        kind={money.kind}
        status={money.kind === 'refused' ? money.status : undefined}
      />
    );
  }

  return <Overview data={money.data} />;
}
