'use client';

import type { MoneyData } from '@/lib/money/api';
import { computeGst, computeLedger } from '@/lib/money/compute';
import { csvFilename, downloadCsv, ledgerCsv } from '@/lib/money/csv';
import { rupees } from '@/lib/today/time';
import { TopBar } from '@/components/shell/TopBar';
import { GstTab } from '@/components/money/GstTab';
import { BizHeader } from './BizHeader';

/**
 * GST — am I near the threshold.
 *
 * ── THE PICKER IS NOT DRAWN, AND THE EXPORT IGNORES IT ───────────────────────
 *
 * This page is a rolling twelve months against a statutory figure and a
 * financial year beside it. Neither moves when the trainer picks August, so the
 * picker is hidden — `tabs.ts`'s `PERIODLESS_TABS` reached the same conclusion
 * about the same screen, and it is a `showPeriod={false}` now that the tabs are
 * pages.
 *
 * The export was the quieter half of the same bug. `Business.tsx`'s
 * `handleExport` branched on the open tab and silently widened the window to
 * twelve months here — so one button in one place produced a file covering a
 * range nothing on screen had asked for, and a trainer who had *August* selected
 * got a year. The window is stated on the button now: a CA filing GST wants the
 * year, and the button says so.
 *
 * It does not need the period scope at all, which is why this is the one page
 * component in the section that does not call `usePeriodScope`.
 */
export function GstPage({ data }: { data: MoneyData }) {
  const { stats, monthBars } = computeGst(data.payments, data.now);

  const handleExport = () => {
    const twelveMonthsAgo = data.now - 365 * 86_400_000;
    const { rows } = computeLedger(
      data.payments, data.clients, { from: twelveMonthsAgo, to: data.now + 1 },
    );
    downloadCsv(csvFilename('turnover', stats.fyLabel), ledgerCsv(rows));
  };

  return (
    <>
      <TopBar crumb="Business / GST" title="Business" />
      <main className="main" id="main-content">
        <BizHeader
          title="GST"
          subtitle={<>{stats.fyLabel} · {rupees(stats.rolling12mo)} of your own over twelve months</>}
          showPeriod={false}
          onExport={handleExport}
          exportLabel="Export the year"
        />

        <div className="body">
          <GstTab stats={stats} monthBars={monthBars} />
        </div>
      </main>
    </>
  );
}
