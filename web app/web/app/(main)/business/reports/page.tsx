import { ReportsPage } from '@/components/business/ReportsPage';
import { Unavailable } from '@/components/today/Unavailable';
import { requireMoney } from '@/lib/money/guard';
import { requireReports } from '@/lib/business/report-guard';

/**
 * `/business/reports` — the practice's year.
 *
 * Two guards, and both are load-bearing: the report is built from a year of the
 * diary AND from the payments book, so a refusal on either leaves a page that
 * would have to draw half a report. `Unavailable` names which call failed.
 *
 * This is the expensive page in the section, and being a route is what keeps the
 * cost off the other five. See `components/business/ReportsPage.tsx`.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Reports · Business · InclineYou' };

export default async function Page() {
  const [money, reports] = await Promise.all([requireMoney(), requireReports()]);

  if (!money.ok) {
    return (
      <Unavailable
        kind={money.kind}
        status={money.kind === 'refused' ? money.status : undefined}
      />
    );
  }
  if (!reports.ok) {
    return (
      <Unavailable
        kind={reports.kind}
        status={reports.kind === 'refused' ? reports.status : undefined}
      />
    );
  }

  return <ReportsPage data={money.data} reports={reports.data} />;
}
