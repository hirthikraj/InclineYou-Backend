import 'server-only';

import { redirect } from 'next/navigation';

import { PortalMeError, getPortalMe, type PortalMeWire } from './me';

/**
 * The guard for the two wall pages (`/sign-in/paused`, `/sign-in/removed`). Both read `GET /v1/portal/me`, which is the one portal route
 * that answers for them, and send anybody whose access is not the one this page draws to the page that is: an active client to their
 * day, the other wall to its own, an invite waiting to the invite (better news than a wall, D-16).
 */
export async function readWall(expect: 'paused' | 'removed'): Promise<PortalMeWire> {
  let me: PortalMeWire;
  try {
    me = await getPortalMe();
  } catch (e) {
    if (!(e instanceof PortalMeError)) throw e;
    if (e.status === 401) redirect('/sign-in');
    if (e.status === 403) redirect('/today');
    throw e;
  }
  if (me.access === 'active') redirect('/me/today');
  if (me.access === 'paused' && expect !== 'paused') redirect('/sign-in/paused');
  if (me.access === 'removed') {
    if (me.pendingInvites.length === 1) redirect(`/invite/${me.pendingInvites[0].inviteId}`);
    if (me.pendingInvites.length > 1) redirect('/sign-in/invites');
    if (expect !== 'removed') redirect('/sign-in/removed');
  }
  return me;
}

/** `12 Nov 2026` from a `yyyy-MM-dd` date or an epoch. */
export function wallDate(value: string | number): string {
  const d = typeof value === 'number' ? new Date(value) : new Date(`${value}T00:00:00`);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: typeof value === 'number' ? 'Asia/Kolkata' : undefined });
}
