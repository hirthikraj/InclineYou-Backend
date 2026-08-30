import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import { getNewClientData, NewClientApiError, type NewClientData } from './new-api';

export type NewClientResult =
  | { ok: true; data: NewClientData; now: number }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

export async function requireNewClient(): Promise<NewClientResult> {
  if (!(await getToken())) redirect('/sign-in');

  let data: NewClientData;
  try {
    data = await getNewClientData();
  } catch (error) {
    if (error instanceof NewClientApiError) {
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
