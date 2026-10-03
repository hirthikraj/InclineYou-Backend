'use client';

import { useMemo } from 'react';

import { buildReport } from '@/lib/business/report';
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

  return (
    <>
      <TopBar crumb="Business / Reports" title="Business" />
      <main className="main" id="main-content">
        <BizHeader
          title="Reports"
          subtitle="How the practice is doing, over the last twelve months"
          showPeriod={false}
        />

        <div className="body">
          <ReportsTab report={report} />
        </div>
      </main>
    </>
  );
}
