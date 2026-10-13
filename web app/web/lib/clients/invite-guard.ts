import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import { getInvitationsData, InviteApiError, type InvitationsData } from './invite-api';

export type InvitationsResult =
  | { ok: true; data: InvitationsData; now: number }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

export async function requireInvitations(states: string): Promise<InvitationsResult> {
  if (!(await getToken())) redirect('/sign-in');

  let data: InvitationsData;
  try {
    data = await getInvitationsData(states);
  } catch (error) {
    if (error instanceof InviteApiError) {
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
