'use client';

import type { MoneyData } from '@/lib/money/api';
import type { ReportsData } from '@/lib/business/report-api';
import { buildPracticeReport, reportCandidates } from '@/lib/business/report';
import { TopBar } from '@/components/shell/TopBar';
import { ReportsTab } from './ReportsTab';
import { BizHeader } from './BizHeader';

/**
 * REPORTS — the practice's own year, and the door to the client-facing card.
 *
 * `ReportsTab.tsx` is unchanged and carries the argument for why those two
 * things share a page and share no figure. What this file adds is the header and
 * the page's own fetch, which used to be a branch in `Business.tsx`'s
 * `Promise.all` guarded by `tab === 'reports'`.
 *
 * ── THE BRANCH BECOMING A ROUTE IS THE POINT ─────────────────────────────────
 *
 * That guard existed because this is the largest read on the trainer half after
 * the exercise library — a year of the diary plus every workout log — and the
 * old screen would otherwise have paid for it to draw a ledger. A conditional
 * fetch inside a `Promise.all`, with a `null` threaded through two components and
 * a `reports && !reports.ok` branch to catch a refusal for a call that may not
 * have happened, is a lot of machinery to express *only load this on one tab*.
 * A route expresses it for free: the fetch lives on the page that wants it, and
 * the five pages that do not never mention it.
 *
 * The picker is not drawn. This page spans its own fixed twelve months, and a
 * control above it offering August would change nothing on the screen.
 */
export function ReportsPage({
  data,
  reports,
}: {
  data: MoneyData;
  reports: ReportsData;
}) {
  /* Both halves read the same rows — the year of the diary this page fetched,
     plus the payments book — so the input is assembled once here rather than
     twice inside the JSX. */
  const input = {
    clients: reports.clients,
    sessions: reports.sessions,
    workouts: reports.workouts,
    payments: data.payments,
    now: reports.now,
  };
  const practice = buildPracticeReport(input);
  const candidates = reportCandidates(input);

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
          <ReportsTab report={practice} candidates={candidates} />
        </div>
      </main>
    </>
  );
}
