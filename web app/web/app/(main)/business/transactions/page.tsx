import { Transactions } from '@/components/business/Transactions';
import { Unavailable } from '@/components/today/Unavailable';
import { requireLedger } from '@/lib/business/guard';

/**
 * `/business/transactions` — the ledger, with *Pending* and *Write-offs* folded
 * into its chips. See `components/business/Transactions.tsx`.
 *
 * `force-dynamic` because this is a snapshot of a moment and the guard reads a
 * cookie; without it Next would try to prerender a page whose subject is this
 * month's billing.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Transactions · Business · InclineYou' };

export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await props.searchParams;
  const money = await requireLedger();

  if (!money.ok) {
    return (
      <Unavailable
        kind={money.kind}
        status={money.kind === 'refused' ? money.status : undefined}
      />
    );
  }

  /* `?filter=` is set by the two redirects in `app/(main)/business/page.tsx` —
     the old *Pending* and *Write-offs* tabs. Validated against the chip names
     rather than cast, so a hand-typed value seeds nothing instead of pressing a
     chip that does not exist. */
  const raw = typeof q.filter === 'string' ? q.filter : null;
  const filter = (['collected', 'owed', 'gymshare', 'writeoff'] as const)
    .find((f) => f === raw) ?? null;

  return (
    <Transactions
      start={{ now: money.now, hasGym: money.hasGym, hasAnyPayments: money.hasAnyPayments, summary: money.summary, page: money.page }}
      recordFor={typeof q.record === 'string' ? q.record : null}
      initialFilter={filter}
    />
  );
}
