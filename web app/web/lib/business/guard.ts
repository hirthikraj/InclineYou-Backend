import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import { BusinessApiError, getGymStart, getLedgerStart, getOverview, getReportsStart } from './api';

/**
 * The Business pages' guard — the same three outcomes as `requireToday` and
 * `requireMoney`: a signed-out browser goes to sign-in, an unreachable or refusing
 * server becomes a state the page can draw, and a trainer who has not finished
 * setup is sent there rather than shown a book with nothing in it.
 */
type Failed = { ok: false; kind: 'unreachable' } | { ok: false; kind: 'refused'; status: number };

async function guarded<T>(read: () => Promise<{ setupComplete: boolean } & T>): Promise<({ ok: true } & T) | Failed> {
  if (!(await getToken())) redirect('/sign-in');

  let data: { setupComplete: boolean } & T;
  try {
    data = await read();
  } catch (error) {
    if (error instanceof BusinessApiError) {
      // `redirect()` throws, so it is kept out of any broader catch.
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      return error.status === null
        ? { ok: false, kind: 'unreachable' }
        : { ok: false, kind: 'refused', status: error.status };
    }
    throw error;
  }

  if (!data.setupComplete) redirect('/setup');
  return { ok: true, ...data };
}

export async function requireOverview() {
  return guarded(getOverview);
}

export async function requireLedger() {
  return guarded(getLedgerStart);
}

export async function requireGym() {
  return guarded(getGymStart);
}

export async function requireReports() {
  return guarded(getReportsStart);
}
