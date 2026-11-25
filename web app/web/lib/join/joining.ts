import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import { getInvitationsData, InviteApiError, type InvitationsData } from '@/lib/clients/invite-api';
import { getJoinRequestsData, JoinApiError, type JoinRequestsData } from './api';

/**
 * Clients → Joining's read (22 Nov 2026): the invitations and the join requests for one view, fetched side by side.
 *
 *   active    requests waiting on the trainer · invitations waiting on the client (pending + expired)
 *   invite    who on the roster can still be invited (their own view since 22 Nov: they are not on their way in yet)
 *   joined    approved requests · accepted invitations
 *   declined  declined requests · declined and withdrawn invitations
 *
 * Both reads are the ones their old pages made, so nothing on the wire changed — only where it is drawn.
 */
export type JoiningView = 'active' | 'invite' | 'joined' | 'declined';

const INVITE_STATES: Record<JoiningView, string> = {
  active: 'pending,expired',
  invite: 'pending,expired',
  joined: 'accepted',
  declined: 'declined,revoked',
};
const REQUEST_STATES = { active: 'pending', invite: 'pending', joined: 'approved', declined: 'declined' } as const;

export interface JoiningData {
  invites: InvitationsData;
  requests: JoinRequestsData;
}

export type JoiningResult =
  | { ok: true; data: JoiningData; now: number }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

export async function requireJoining(view: JoiningView): Promise<JoiningResult> {
  if (!(await getToken())) redirect('/sign-in');
  let invites: InvitationsData;
  let requests: JoinRequestsData;
  try {
    [invites, requests] = await Promise.all([getInvitationsData(INVITE_STATES[view]), getJoinRequestsData([REQUEST_STATES[view]])]);
  } catch (error) {
    if (error instanceof InviteApiError || error instanceof JoinApiError) {
      if (error.status === 401 || error.status === 403) redirect('/sign-in');
      return error.status === null ? { ok: false, kind: 'unreachable' } : { ok: false, kind: 'refused', status: error.status };
    }
    throw error;
  }
  if (!invites.setupComplete) redirect('/setup');
  return { ok: true, data: { invites, requests }, now: Date.now() };
}
