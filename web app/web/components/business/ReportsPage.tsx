'use client';

import { useMemo } from 'react';

import { buildReport } from '@/lib/business/report';
import { csvFilename, downloadCsv } from '@/lib/money/csv';
import type { Practice } from '@/lib/business/types';
import { TopBar } from '@/components/shell/TopBar';
import { ReportsTab } from './ReportsTab';
import { BizHeader } from './BizHeader';

/**
 * `/business/reports` — the practice's year, drawn from one response.
 *
 * It used to be the expensive page in the section: a year of the diary, every
 * workout log and the whole payments book pulled in to be folded in the browser.
 * It is `GET /v1/reports/practice` now — twelve month rows, a headline and the top
 * ten clients — so the page is cheap to open and the arithmetic left here is
 * ratios of figures the server already added up. `lib/business/report.ts` says
 * what that cost the page, figure by figure.
 */
export function ReportsPage({ practice }: { practice: Practice }) {
  const report = useMemo(() => buildReport(practice), [practice]);

  /* THE EXPORT IS THE PAGE'S, NOT A CARD'S. It was a small *CSV* on the revenue
     card and wrote all twelve months of every series, so the label and the place
     both promised less than the file held. It is in the header now, named for
     what it writes. */
  const exportMonths = () => {
    const { months } = report;
    const head = ['Month', 'Billed', 'Collected', 'Your take-home', 'Sessions delivered', 'Active clients', 'New clients', 'Clients archived'];
    const rows = months.map((m, i) => [
      `${m.label} ${m.year}`,
      String(report.billed[i]),
      String(report.collected[i]),
      String(report.takeHome[i]),
      String(report.delivered[i]),
      String(report.active[i]),
      String(report.joined[i]),
      String(report.archived[i]),
    ]);
    downloadCsv(
      csvFilename('practice', `${months[0].label}-${months[months.length - 1].label}-${months[months.length - 1].year}`),
      [head, ...rows].map((r) => r.join(',')).join('\n'),
    );
  };

  return (
    <>
      <TopBar crumb="Business / Reports" title="Business" />
      <main className="main" id="main-content">
        <BizHeader
          title="Reports"
          subtitle="How the practice is doing, over the last twelve months"
          showPeriod={false}
          onExport={report.isEmpty ? undefined : exportMonths}
          exportLabel="Export CSV"
        />

        <div className="body">
          <ReportsTab report={report} />
        </div>
      </main>
    </>
  );
}
