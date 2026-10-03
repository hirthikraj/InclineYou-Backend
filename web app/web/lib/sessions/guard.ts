import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import { getSessions, SessionsApiError } from './api';
import type { SessionsData } from './api';

export type SessionsResult =
  | { ok: true; data: SessionsData }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

export async function requireSessions(): Promise<SessionsResult> {
  if (!(await getToken())) redirect('/sign-in');

  let data: SessionsData;
  try {
    data = await getSessions();
  } catch (error) {
    if (error instanceof SessionsApiError) {
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      return error.status === null
        ? { ok: false, kind: 'unreachable' }
        : { ok: false, kind: 'refused', status: error.status };
    }
    throw error;
  }

  return { ok: true, data };
}
