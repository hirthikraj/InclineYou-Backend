import 'server-only';

import { redirect } from 'next/navigation';

import { readClaims } from '@/lib/auth/claims';
import { getToken } from '@/lib/auth/session';

import { PortalApiError, getMe, type MeWire } from './api';

/**
 * The gate every `/me/*` page passes through.
 *
 * ── IT READS THE CLAIM BEFORE IT SPENDS A REQUEST ────────────────────────────
 *
 * `lib/auth/claims.ts` says at length why reading the cookie's own role is safe
 * and grants nothing: it picks a screen. Here it earns its place twice —
 *
 *   · a TRAINER who typed `/me/today` is sent to `/today` rather than being
 *     shown a portal built on a 403. Their number may well also be on somebody's
 *     roster (duality is allowed again, 23 Aug 2026), so this is not an error
 *     state, it is the wrong door: their home role is trainer, and the mode
 *     switch lives in the rail's foot.
 *   · a `pending`, `invited` or `unattached` token has a screen of its own and
 *     none of them is this one.
 *
 * ── AND THE REFUSALS ARE MAPPED, NOT SWALLOWED ───────────────────────────────
 *
 * `NOT_A_CLIENT` is a 403 the server produces when a token's phone is on nobody's
 * roster, and it is NOT a server problem — it is `unattached` arriving one layer
 * later, so it goes to the screen written for it rather than to an error page
 * saying something went wrong. Everything else is returned as a result the page
 * renders, which is `requireClientFile`'s shape and for its reason: an
 * unreachable backend and a 500 read differently to the person on the screen.
 */
export type PortalResult =
  | { ok: true; me: MeWire; now: number }
  | { ok: false; kind: 'unreachable' }
  | { ok: false; kind: 'refused'; status: number };

export async function requirePortal(): Promise<PortalResult> {
  const claims = readClaims(await getToken());
  if (!claims) redirect('/sign-in');

  if (claims.role !== 'client') {
    redirect(claims.role === 'trainer' ? '/today' : '/');
  }

  try {
    const me = await getMe();
    /* A removed membership keeps a readable token for a while — `clientView`
       mints one for three different states. The portal is not the place to find
       out an arrangement has ended, and `/sign-in/removed` is. */
    if (me.client.membershipStatus === 'removed') redirect('/sign-in/removed');
    return { ok: true, me, now: Date.now() };
  } catch (e) {
    if (e instanceof PortalApiError) {
      if (e.status === 401) redirect('/sign-in');
      if (e.code === 'NOT_A_CLIENT' || e.code === 'NOT_YOURS') redirect('/sign-in/unattached');
      if (e.status === null) return { ok: false, kind: 'unreachable' };
      return { ok: false, kind: 'refused', status: e.status };
    }
    throw e;
  }
}
