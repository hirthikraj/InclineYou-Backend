import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import { getSessions, getSessionDetail, SessionsApiError } from './api';
import type { SessionsData, SessionDetailData } from './api';

export type SessionsResult =
  | { ok: true; data: SessionsData }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

export type SessionDetailResult =
  | { ok: true; data: SessionDetailData }
  | { ok: false; kind: 'not_found' }
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

export async function requireSessionDetail(id: string): Promise<SessionDetailResult> {
  if (!(await getToken())) redirect('/sign-in');

  let data: SessionDetailData | null;
  try {
    data = await getSessionDetail(id);
  } catch (error) {
    if (error instanceof SessionsApiError) {
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      if (error.status === 404) return { ok: false, kind: 'not_found' };
      return error.status === null
        ? { ok: false, kind: 'unreachable' }
        : { ok: false, kind: 'refused', status: error.status };
    }
    throw error;
  }

  /* Null is the resolver's own fourth answer: the id is neither a booking nor a
     log. Same screen as a 404, and it costs the caller nothing to tell apart. */
  if (data === null) return { ok: false, kind: 'not_found' };

  return { ok: true, data };
}
