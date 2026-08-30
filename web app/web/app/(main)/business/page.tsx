import { Business } from '@/components/business/Business';
import { parseTab } from '@/components/business/tabs';
import { Unavailable } from '@/components/today/Unavailable';
import { requireMoney } from '@/lib/money/guard';
import { requirePacks } from '@/lib/packs/guard';
import { requireReports } from '@/lib/business/report-guard';
import { listRecentNudges } from '@/lib/nudges/api';
import { COOLDOWN_DAYS, lastContactMap } from '@/lib/nudges/cooldown';

/**
 * BUSINESS — the fifth destination, and the route three others fold into.
 *
 * This was `/money/[month]`, then `/business/[month]`, and it is `/business`
 * flat. The month came out of the URL because the URL was making a claim the
 * code did not honour: the old docstring here said the month "decides what is
 * FETCHED", and `getMoney()` has always pulled the whole book unwindowed —
 * `/v1/payments` with no `from`/`to`, on purpose, because a full book is a couple
 * of hundred rows — with `computeLedger` slicing it in the browser. The segment
 * named a filter, not a resource, and it cost a redirect on every visit to
 * `/business` plus a `YYYY-MM` slug to parse and validate on every render.
 *
 * Taking it out is also what let the screen offer a SPAN. A path segment can hold
 * one calendar month; "the last 3 months" is a moving window with no date of its
 * own, and it belongs in the same place the ledger's stat filter already lives.
 * `lib/money/period.ts` carries that argument in full.
 *
 * ── SO WHAT IS STILL IN THE URL, AND WHY ─────────────────────────────────────
 *
 * `?tab=` stays, and it is the exception that shows the rule. Five of the seven
 * tabs are views of `requireMoney()`. *Packages* is not: the price list is the
 * `pack` table, a different four calls, and it is loaded only when the param asks
 * for it. *Reports* is not either, and it is the more expensive of the two — a
 * year of the diary plus every workout log, which is the largest read on this
 * half after the exercise library. Both are loaded only when the param asks. A
 * tab that changes what the server fetches cannot be a `useState`; a month that
 * changes nothing the server fetches should not be a path segment.
 *
 * If either call is refused we draw `Unavailable` rather than the strip with an
 * empty tab, because the refusals mean different things and only the component
 * that knows which call failed can say so.
 *
 * `force-dynamic` because the ledger is a snapshot of a moment and both guards
 * read a cookie; without it Next would try to prerender a page whose subject is
 * this month's billing.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Business · X REP' };

export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await props.searchParams;
  const tab = parseTab(q.tab);

  const [money, packs, reports, nudges] = await Promise.all([
    requireMoney(),
    tab === 'packages' ? requirePacks() : Promise.resolve(null),
    tab === 'reports' ? requireReports() : Promise.resolve(null),
    /*
     * Fetched on every tab rather than only on Owed, because two of them draw a
     * nudge button — the dues list and the price list's *Ending soon* — and a
     * cheap read whose answer the trainer switches between tabs to see is a read
     * that belongs with the page, not with one of its views. It cannot fail the
     * screen: `listRecentNudges` answers `[]`.
     */
    listRecentNudges(COOLDOWN_DAYS),
  ]);

  if (!money.ok) {
    return (
      <Unavailable
        kind={money.kind}
        status={money.kind === 'refused' ? money.status : undefined}
      />
    );
  }
  if (packs && !packs.ok) {
    return (
      <Unavailable
        kind={packs.kind}
        status={packs.kind === 'refused' ? packs.status : undefined}
      />
    );
  }
  if (reports && !reports.ok) {
    return (
      <Unavailable
        kind={reports.kind}
        status={reports.kind === 'refused' ? reports.status : undefined}
      />
    );
  }

  return (
    <Business
      data={money.data}
      packs={packs?.ok ? packs.data : null}
      reports={reports?.ok ? reports.data : null}
      tab={tab}
      recordFor={typeof q.record === 'string' ? q.record : null}
      lastContact={Object.fromEntries(lastContactMap(nudges))}
    />
  );
}
