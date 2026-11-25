import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import { getJoinLinkData, getJoinRequestsData, JoinApiError, type JoinLinkData, type JoinRequestsData } from './api';
import type { JoinRequestStatus } from './types';

export type Guarded<T> =
  | { ok: true; data: T; now: number }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

async function guarded<T>(read: () => Promise<T>): Promise<Guarded<T>> {
  if (!(await getToken())) redirect('/sign-in');
  try {
    return { ok: true, data: await read(), now: Date.now() };
  } catch (error) {
    if (error instanceof JoinApiError) {
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      return error.status === null ? { ok: false, kind: 'unreachable' } : { ok: false, kind: 'refused', status: error.status };
    }
    throw error;
  }
}

export async function requireJoinLink(): Promise<Guarded<JoinLinkData>> {
  const r = await guarded(getJoinLinkData);
  if (r.ok && !r.data.setupComplete) redirect('/setup');
  return r;
}

export function requireJoinRequests(states: JoinRequestStatus[]): Promise<Guarded<JoinRequestsData>> {
  return guarded(() => getJoinRequestsData(states));
}
