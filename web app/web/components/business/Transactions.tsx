'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { MoneyData } from '@/lib/money/api';
import { computeLedger } from '@/lib/money/compute';
import { csvFilename, downloadCsv, ledgerCsv } from '@/lib/money/csv';
import { periodChip, periodProse, periodRange } from '@/lib/money/period';
import { rupees } from '@/lib/today/time';
import { TopBar } from '@/components/shell/TopBar';
import { LedgerTab, type LedgerFilter } from '@/components/money/LedgerTab';
import { RecordPanel } from '@/components/money/RecordPanel';
import { BizHeader } from './BizHeader';
import { usePeriodScope } from './PeriodScope';

/**
 * TRANSACTIONS — the book itself, and the only page in Business that draws rows.
 *
 * ── IT IS THREE OF THE OLD SEVEN TABS ────────────────────────────────────────
 *
 * *Payments*, *Pending* and *Write-offs* were three tabs of one screen, and all
 * three drew the same table over the same rows with a different `WHERE` on it.
 * `OwedTab` and `WriteOffsTab` are deleted; their filters are chips on the card
 * below, where `LedgerFilter` had already spelled two of the three before this
 * pass. `components/shell/nav.tsx` carries the argument for why a slice of a
 * page's rows is a view of that page and not a place of its own.
 *
 * Nothing was lost in the fold. The chase list's nudge button is on the
 * Overview's *Needs you*, where a list of people to contact belongs; the
 * write-off card's *% of billed* is in the summary card beside the table, where
 * every other ratio about the period already was.
 *
 * ── AND THE EXPORT FINALLY MEANS ONE THING ───────────────────────────────────
 *
 * `Business.tsx`'s `handleExport` was a five-branch switch on which tab was open
 * — pending gave the chase list, GST silently widened the window to twelve
 * months, gym share re-filtered the rows — so the button in the header produced a
 * different file depending on a control 200px to its left. Here it exports the
 * rows the chips have left on screen, which is the only export that can be
 * checked against the page. The GST page keeps its own twelve-month export,
 * because that one is a genuinely different document and it now has a genuinely
 * different button.
 */
export function Transactions({
  data,
  recordFor = null,
  initialFilter = null,
}: {
  data: MoneyData;
  /**
   * Which chip is pressed on arrival.
   *
   * One caller: `/business?tab=owed` and `?tab=writeoffs`, the two tabs this
   * page absorbed, which redirect here with `?filter=` set. It seeds state and
   * is not read again — the chips are a client-side filter over rows the browser
   * already holds, and writing every press back into the URL would spend a
   * navigation on a control whose whole job is to be pressed four times in a row.
   */
  initialFilter?: LedgerFilter;
  /**
   * `?record=<clientId>` opens the panel with that client already chosen. Two
   * callers: *Sell a pack* / *Renew the pack* on a client's file, and the tab
   * bar's +. Both pointed at `/business?record=` and point here now — the panel
   * writes a payment row, and this is the page payment rows live on.
   */
  recordFor?: string | null;
}) {
  const { period } = usePeriodScope();
  const range = periodRange(period, data.now);

  const [filter, setFilter] = useState<LedgerFilter>(initialFilter);
  const [recordPanelOpen, setRecordPanelOpen] = useState(recordFor !== null);

  /*
   * ARRIVING HERE FROM HERE. The initialiser above runs once per mount, which is
   * enough for a trainer arriving from a client's file and NOT enough for the
   * tab bar's + — pressing it on this page is a soft navigation inside the same
   * segment, so this component stays mounted and the initialiser cannot fire.
   *
   * The parameter is then STRIPPED, which is the half that matters: without it
   * the second press is a navigation to an identical URL, which the router
   * correctly treats as nothing at all, and the + is a one-shot on the one page
   * where a trainer records several payments in a row.
   *
   * Render-time adjustment against the previous value rather than an effect, so
   * nothing paints the shut panel for a frame first — `Schedule.tsx`'s pattern.
   */
  const [recordSeen, setRecordSeen] = useState(recordFor);
  if (recordFor !== recordSeen) {
    setRecordSeen(recordFor);
    if (recordFor !== null) setRecordPanelOpen(true);
  }
  const router = useRouter();
  useEffect(() => {
    if (recordFor !== null) router.replace('/business/transactions', { scroll: false });
  }, [recordFor, router]);

  const { stats, rows } = computeLedger(data.payments, data.clients, range);

  const shown = filter === null ? rows
    : filter === 'collected' ? rows.filter((r) => r.status === 'paid' || r.status === 'confirmed')
    : filter === 'owed' ? rows.filter((r) => r.status === 'pending')
    : filter === 'writeoff' ? rows.filter((r) => r.isWriteOff)
    : rows.filter((r) => (r.gymShareAmount ?? 0) > 0);

  const slug = filter ?? 'payments';
  const handleExport = () =>
    downloadCsv(csvFilename(slug, periodChip(period)), ledgerCsv(shown));

  return (
    <>
      <TopBar crumb="Business / Transactions" title="Business" />
      <main className="main" id="main-content">
        <BizHeader
          title="Transactions"
          subtitle={
            rows.length === 0
              ? `Nothing billed in ${periodProse(period)}`
              : <>{rows.length} entr{rows.length === 1 ? 'y' : 'ies'} · {rupees(stats.billed)} billed · {rupees(stats.collected)} collected</>
          }
          onExport={handleExport}
        />

        <div className="body">
          <LedgerTab
            stats={stats}
            rows={rows}
            filter={filter}
            onFilterChange={setFilter}
            onRecord={() => setRecordPanelOpen(true)}
            onExport={handleExport}
            trainer={data.trainer}
            period={period}
          />
        </div>
      </main>

      {recordPanelOpen && (
        <RecordPanel
          clients={data.clients}
          packages={data.packages}
          trainer={data.trainer}
          initialClientId={recordFor}
          onClose={() => setRecordPanelOpen(false)}
        />
      )}
    </>
  );
}
