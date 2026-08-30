import 'server-only';

import { cookies } from 'next/headers';

import type { AuthResponse, Membership, Role, WallKind } from './types';

/**
 * Where the JWT lives.
 *
 * httpOnly, so it does not exist in browser JavaScript at all — not "hard to
 * read", absent. This is the posture the mobile app gets from the keychain and
 * the one a client-side bundle cannot have, since a token in localStorage is a
 * token any injected script can post elsewhere. It is a 7-day bearer token
 * (`app.jwt.expiry-minutes: 10080`), so the exposure it would carry is a week.
 */
const TOKEN_COOKIE = 'xrep_token';

/** app.jwt.expiry-minutes: 10080. The cookie should not outlive the token in it. */
const TOKEN_MAX_AGE = 7 * 24 * 60 * 60;

/**
 * The number a code was sent to, held between /sign-in and /sign-in/verify.
 *
 * Not in the URL: a phone number in a path is a phone number in browser
 * history, in a screenshot and in any referrer that leaks. Not httpOnly, and
 * that is deliberate — it is the trainer's own number, they typed it one screen
 * ago, and the verify screen has to print it back to them.
 */
const PENDING_COOKIE = 'xrep_pending_phone';

/** Long enough to outlast a 10-minute code and the resend ladder after it. */
const PENDING_MAX_AGE = 30 * 60;

/**
 * WHICH ROSTER a client is reading, when their number is on more than one.
 *
 * ── WHY THIS IS A COOKIE AND NOT A CLAIM ─────────────────────────────────────
 *
 * A client token's subject is the PHONE, not a client id — deliberately, and
 * `JwtService` says why: "the same person can be on two trainers' rosters, which
 * is two client rows and one human being. Binding the token to the phone lets one
 * sign-in cover both memberships." So the token cannot answer *which one am I
 * looking at*, and `/v1/client/sync/pull` takes `clientId` as a request
 * parameter for exactly that reason.
 *
 * On the phone that choice lives in `AuthContext`. The web has no such object
 * that survives a navigation, so it is a cookie — the same role
 * `xrep_pending_phone` plays for the number between two screens.
 *
 * ── AND IT IS NOT A PERMISSION ───────────────────────────────────────────────
 *
 * Tampering with it buys nothing. `ClientSyncController` re-checks the parameter
 * against the token's phone on **every single request** — the value here is a
 * preference about which of your own rosters to open, not a key to somebody
 * else's. `httpOnly` anyway, because only the server ever reads it: a picker in
 * the client portal gets the active id as a prop from the page that rendered it.
 *
 * Seven days, matching the token: the picker's own copy promises "we'll open here
 * next time", and a choice that expired before the session did would break that
 * promise silently.
 */
const CLIENT_COOKIE = 'xrep_client';

/**
 * WHICH WALL a sign-in ended at — see `WallKind` for why the token cannot say.
 *
 * Thirty minutes, matching `xrep_pending_phone`: long enough to read the screen,
 * follow its one instruction and come back, and short enough that a bookmark
 * opened tomorrow gets a fresh sign-in instead of a sentence about a membership
 * that may have changed since.
 */
const WALL_COOKIE = 'xrep_wall';
const WALL_MAX_AGE = 30 * 60;

const SECURE = process.env.NODE_ENV === 'production';

export async function setToken(token: string): Promise<void> {
  (await cookies()).set(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: SECURE,
    // `lax` rather than `strict`: the invite links in this product arrive by
    // WhatsApp, and `strict` drops the cookie on that first cross-site
    // navigation, which signs the trainer out for arriving from a message.
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_MAX_AGE,
  });
}

export async function getToken(): Promise<string | null> {
  return (await cookies()).get(TOKEN_COOKIE)?.value ?? null;
}

export async function clearToken(): Promise<void> {
  (await cookies()).delete(TOKEN_COOKIE);
}

export async function setPendingPhone(phone: string): Promise<void> {
  (await cookies()).set(PENDING_COOKIE, phone, {
    httpOnly: false,
    secure: SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: PENDING_MAX_AGE,
  });
}

export async function getPendingPhone(): Promise<string | null> {
  return (await cookies()).get(PENDING_COOKIE)?.value ?? null;
}

export async function clearPendingPhone(): Promise<void> {
  (await cookies()).delete(PENDING_COOKIE);
}

export async function setActiveClient(clientId: string): Promise<void> {
  (await cookies()).set(CLIENT_COOKIE, clientId, {
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_MAX_AGE,
  });
}

export async function getActiveClient(): Promise<string | null> {
  return (await cookies()).get(CLIENT_COOKIE)?.value ?? null;
}

export async function clearActiveClient(): Promise<void> {
  (await cookies()).delete(CLIENT_COOKIE);
}

export async function setWall(kind: WallKind): Promise<void> {
  (await cookies()).set(WALL_COOKIE, kind, {
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: WALL_MAX_AGE,
  });
}

/** Null for absent, and for any value this build does not recognise. */
export async function getWall(): Promise<WallKind | null> {
  const value = (await cookies()).get(WALL_COOKIE)?.value;
  return value === 'unattached' || value === 'removed' || value === 'paused' ? value : null;
}

export async function clearWall(): Promise<void> {
  (await cookies()).delete(WALL_COOKIE);
}

/**
 * Absent `role` means a backend before V14, and every sign-in one of those ever
 * answered was a trainer's — so absence reads as trainer rather than as an error.
 */
export function roleOf(res: AuthResponse): Role {
  return res.role ?? 'trainer';
}

/**
 * Does this sign-in owe us trainer setup?
 *
 * `setupComplete` is the real answer and survives a reinstall, a second browser
 * and a flow abandoned halfway. `isNewUser` only ever meant "first verify for
 * this number", and stays as the fallback for a backend older than V8.
 */
export function needsSetup(res: AuthResponse): boolean {
  return res.setupComplete === undefined ? res.isNewUser : !res.setupComplete;
}

/** Is this roster on hold? Absence of `status` means an older backend, so: no. */
export function isPaused(m: Membership): boolean {
  return m.status?.toLowerCase() === 'paused';
}

/**
 * The rosters that are actually running.
 *
 * A paused one is still real — the history is in it, and the picker still lists
 * it — but it is never what sign-in should CHOOSE for somebody who also has a
 * live one. Exported because `destinationFor` and `verifyCode` have to agree
 * about what "one roster" means: if they disagreed, a client with one live and
 * one paused membership would be sent to the picker by one and resolved silently
 * by the other.
 *
 * Note `clientOf` on a client's response also carries outstanding INVITES — see
 * `clientView` in `AuthService`, which returns every non-removed, non-declined
 * row. `isLive` on the server means accepted or paused, and this mirrors it by
 * excluding only the paused ones from the live count, so an invite still shows in
 * the picker as a roster you can open. That is correct: being invited by a second
 * trainer is a real second book, and it is exactly the ambiguity this screen is
 * for.
 */
export function liveMemberships(res: AuthResponse): Membership[] {
  return (res.clientOf ?? []).filter((m) => !isPaused(m));
}

/**
 * Which screen this sign-in is owed — the web's copy of the branch in
 * `app/src/screens/auth/OtpScreen.tsx`, and deliberately the same order.
 *
 * `null` means there is nothing to open, which is a failure rather than a blank
 * app and the caller renders it as one.
 */
export function destinationFor(res: AuthResponse): string | null {
  const role = roleOf(res);
  const memberships = res.clientOf ?? [];
  // A paused roster still opens, but it is not what sign-in should choose for
  // somebody who also has a live one. Via the shared helper rather than inline,
  // so this and `verifyCode`'s "exactly one roster" test cannot drift apart.
  const live = liveMemberships(res);

  // LEGACY · a backend from before the pause fix answers with no token and
  // nothing else to open. Only reachable during a rolling deploy.
  if (role === 'paused' && res.paused) return '/sign-in/paused';

  // 3a · verified, and on nobody's roster. The token is good for one thing.
  if (role === 'pending' && res.token) return '/sign-in/new';

  // 3b · V18 · a trainer named this number and it has never answered. The token
  // opens no sync scope, so nothing is signed in until they do.
  if (role === 'invited' && res.token) {
    const invite = memberships.find((m) => m.membershipStatus === 'invited');
    if (invite) return `/invite/${invite.clientId}`;
  }

  // V18 · a trainer ended it. Shown once — the acknowledgement is what retires
  // it, because the server row is kept forever.
  if (role === 'removed' && res.token && res.removed) return '/sign-in/removed';

  // V18 · a client with nothing live. Deliberately not 3a: this number's role is
  // client, and offering it a coaching account is the wrong turn 3a exists to avoid.
  if (role === 'unattached') return '/sign-in/unattached';

  // Reserved and not built. Better an honest stop than a trainer's Today
  // rendered over somebody else's data.
  if (role === 'gym_admin') return null;

  if (!res.token) return null;

  // 2a · skip the picker whenever it can be skipped. It earns its place for
  // exactly one case — a client training with two people right now, which is
  // genuinely ambiguous about which book to open. A trainer who is ALSO a
  // client elsewhere (trainer/client duality, allowed again 23 Aug 2026) is
  // not ambiguous the same way: the home role — `trainer` here — is the
  // default, and `res.clientOf` is what a built `/today` would read to offer
  // a mode switch, the same way the app's drawer does. This function only
  // returns a path, not that data, so whatever eventually renders `/today`
  // reads `clientOf` from its own fetch of the session rather than from here.
  if (role === 'client' && live.length > 1) return '/sign-in/role';

  if (role === 'client') return '/me/today';
  return needsSetup(res) ? '/setup' : '/today';
}
