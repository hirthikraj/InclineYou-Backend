import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import { getPacksData, PacksApiError, type PacksData } from './api';

/** Same three outcomes as `requireMoney`, so `Unavailable` reads them unchanged. */
export type PacksResult =
  | { ok: true; data: PacksData }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

export async function requirePacks(): Promise<PacksResult> {
  if (!(await getToken())) redirect('/sign-in');

  let data: PacksData;
  try {
    data = await getPacksData();
  } catch (error) {
    if (error instanceof PacksApiError) {
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      return error.status === null
        ? { ok: false, kind: 'unreachable' }
        : { ok: false, kind: 'refused', status: error.status };
    }
    throw error;
  }

  // Setup asks for the price list at step 7. A trainer who has not finished it
  // belongs in the flow, not on the screen the flow feeds.
  if (!data.trainer.setupComplete) redirect('/setup');

  return { ok: true, data };
}
