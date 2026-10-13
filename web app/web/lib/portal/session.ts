import 'server-only';

import { redirect } from 'next/navigation';

import { PortalMeError, getPortalMe, type PortalMeWire } from './me';

/**
 * THE PORTAL'S GUARD — who may see `/me/*`, and where everybody else goes (api-contract 1.2, p-a1).
 *
 * The server decides, not the page: `GET /v1/portal/me` answers for any access, so this is the one place that turns the answer into a
 * destination. A paused client goes to the paused wall and a removed one to the removed wall — or straight to an invite waiting for
 * their number, which is better news than a wall (D-16). A session that is not a client's at all (a trainer, a pending number, no
 * session) is sent where it belongs rather than shown an error it cannot act on.
 *
 * A failure that is the network's, not the person's, is RETURNED so the layout can draw it inside the page: an error boundary is for
 * bugs, and a client whose connection dropped should not lose the shell with it.
 */
export type PortalSession =
  | { ok: true; me: PortalMeWire; now: number }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

export async function requirePortalSession(): Promise<PortalSession> {
  let me: PortalMeWire;
  try {
    me = await getPortalMe();
  } catch (e) {
    if (!(e instanceof PortalMeError)) throw e;
    if (e.status === 401) redirect('/sign-in');
    // 403: a signed-in session that is not a client's. Only a trainer can be that here, and they have their own half.
    if (e.status === 403) redirect('/today');
    if (e.status === null) return { ok: false, kind: 'unreachable' };
    return { ok: false, kind: 'refused', status: e.status };
  }
  if (me.access === 'paused') redirect('/sign-in/paused');
  if (me.access === 'removed') {
    if (me.pendingInvites.length === 1) redirect(`/invite/${me.pendingInvites[0].inviteId}`);
    if (me.pendingInvites.length > 1) redirect('/sign-in/invites');
    redirect('/sign-in/removed');
  }
  return { ok: true, me, now: Date.now() };
}
