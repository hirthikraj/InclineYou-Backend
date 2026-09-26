'use client';

import type { MoneyData } from '@/lib/money/api';
import { computeGymShare, computeLedger } from '@/lib/money/compute';
import { csvFilename, downloadCsv, ledgerCsv } from '@/lib/money/csv';
import { periodChip, periodRange } from '@/lib/money/period';
import { rupees } from '@/lib/today/time';
import { TopBar } from '@/components/shell/TopBar';
import { GymShareTab } from '@/components/money/GymShareTab';
import { BizHeader } from './BizHeader';
import { usePeriodScope } from './PeriodScope';

/**
 * GYM SHARE — what the floor costs, and the one filter-shaped tab that survived
 * becoming a page.
 *
 * *Pending* and *Write-offs* did not: both were `WHERE` clauses over the ledger's
 * rows, so they are chips on Transactions now. This looks like a third of the
 * same kind and is not. A gym share row is not a subset of the payments table —
 * it is the same money read through the split percentage, with the floor's
 * sessions counted against the online ones and the gym's cut stated as a rate
 * rather than as a column. A trainer opens it to answer *is the floor worth it*,
 * which is a question about an arrangement, not about a month's entries.
 *
 * The export follows the page rather than the whole book: the rows a gym is
 * argued with about are the rows with a cut on them.
 */
export function GymPage({ data }: { data: MoneyData }) {
  const { period } = usePeriodScope();
  const range = periodRange(period, data.now);

  const { stats, rows } = computeGymShare(
    data.payments, data.clients, data.trainer, range,
  );

  const handleExport = () => {
    const { rows: ledgerRows } = computeLedger(data.payments, data.clients, range);
    downloadCsv(
      csvFilename('gym-share', periodChip(period)),
      ledgerCsv(ledgerRows.filter((r) => (r.gymShareAmount ?? 0) > 0)),
    );
  };

  return (
    <>
      <TopBar crumb="Business / Gym share" title="Business" />
      <main className="main" id="main-content">
        <BizHeader
          title="Gym share"
          subtitle={
            data.trainer.gymName
              ? <>{data.trainer.gymName} · {data.trainer.gymSharePercent ?? 0}% of the floor · {rupees(stats.gymCut)} this period</>
              : 'No gym on file'
          }
          /* No export where there is no gym: the file would be empty and the
             button would be a promise the page cannot keep. */
          onExport={data.trainer.gymName ? handleExport : undefined}
        />

        <div className="body">
          <GymShareTab
            stats={stats}
            rows={rows}
            trainer={data.trainer}
            period={period}
          />
        </div>
      </main>
    </>
  );
}
