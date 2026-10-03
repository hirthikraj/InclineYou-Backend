import { ReportsPage } from '@/components/business/ReportsPage';
import { Unavailable } from '@/components/today/Unavailable';
import { requireReports } from '@/lib/business/guard';

/**
 * `/business/reports` — the practice's year.
 *
 * One read, `GET /v1/reports/practice?months=12`, where there used to be two
 * guards over a year of sessions, workouts and the whole money book. Being a route
 * of its own is still what keeps the page off the other four: it is the only one
 * that wants a year. See `components/business/ReportsPage.tsx`.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Reports · Business · InclineYou' };

export default async function Page() {
  const result = await requireReports();

  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }

  return <ReportsPage practice={result.practice} />;
}
