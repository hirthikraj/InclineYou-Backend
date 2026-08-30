import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import { getRosterData, ClientsApiError, type RosterData } from './api';

export type ClientsResult =
  | { ok: true; data: RosterData; now: number }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

export async function requireClients(): Promise<ClientsResult> {
  if (!(await getToken())) redirect('/sign-in');

  let data: RosterData;
  try {
    data = await getRosterData();
  } catch (error) {
    if (error instanceof ClientsApiError) {
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      return error.status === null
        ? { ok: false, kind: 'unreachable' }
        : { ok: false, kind: 'refused', status: error.status };
    }
    throw error;
  }

  if (!data.setupComplete) redirect('/setup');

  return { ok: true, data, now: Date.now() };
}
