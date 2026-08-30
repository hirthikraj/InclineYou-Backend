import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import type { ReportWeeks } from './build';
import { getClientReport, ClientReportApiError } from './client-api';
import type { ClientReport } from './build';

/**
 * Four outcomes rather than three, and the fourth is the one that matters here:
 * a `404` on `/v1/clients/{id}` means this is somebody else's client, and the
 * page answers `notFound()` rather than "the server refused". Asking about a
 * client who is not yours should not confirm they exist — the rule V29's notes
 * routes already follow.
 */
export type ClientReportResult =
  | { ok: true; report: ClientReport }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

export async function requireClientReport(
  clientId: string,
  weeks: ReportWeeks,
): Promise<ClientReportResult> {
  if (!(await getToken())) redirect('/sign-in');

  try {
    const report = await getClientReport(clientId, weeks);
    return report ? { ok: true, report } : { ok: false, kind: 'not_found' };
  } catch (error) {
    if (error instanceof ClientReportApiError) {
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      if (error.status === 404) return { ok: false, kind: 'not_found' };
      return error.status === null
        ? { ok: false, kind: 'unreachable' }
        : { ok: false, kind: 'refused', status: error.status };
    }
    throw error;
  }
}
