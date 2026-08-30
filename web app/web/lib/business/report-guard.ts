import 'server-only';

import { redirect } from 'next/navigation';

import { getReportsData, ReportApiError, type ReportsData } from './report-api';
import { getToken } from '@/lib/auth/session';

/** Same three outcomes as `requireMoney` and `requirePacks`, so `Unavailable`
 *  reads this result unchanged. */
export type ReportsResult =
  | { ok: true; data: ReportsData }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

export async function requireReports(): Promise<ReportsResult> {
  if (!(await getToken())) redirect('/sign-in');

  try {
    return { ok: true, data: await getReportsData() };
  } catch (error) {
    if (error instanceof ReportApiError) {
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      return error.status === null
        ? { ok: false, kind: 'unreachable' }
        : { ok: false, kind: 'refused', status: error.status };
    }
    throw error;
  }
}
