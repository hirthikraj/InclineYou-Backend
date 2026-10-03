import 'server-only';

import { cookies } from 'next/headers';

import type { AuthResponse, WallKind } from './types';

/**
 * Where the credential lives.
 *
 * httpOnly, so it does not exist in browser JavaScript at all — not "hard to
 * read", absent. After sign-in it is an opaque `xs_…` session token: the server
 * stores only its SHA-256 and can revoke it at any moment, which is what makes
 * "sign out" and the devices list real. Before a new number has claimed an
 * account it is instead a 15-minute JWT that can call exactly one route
 * (`POST /v1/trainers`).
 */
const TOKEN_COOKIE = 'inclineyou_token';

/**
 * A session is 30 days after LAST USE, sliding (api-contract R61) — the server
 * moves `expires_at` out as it is used and this cookie cannot, so it is set to
 * the sliding window's length and the server's answer is the real one. A cookie
 * that outlives a session costs one bounce through `/sign-in/expired`; one that
 * expired first would sign out somebody the server still trusts.
 */
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * The number a code was sent to, held between /sign-in and /sign-in/verify.
 *
 * Not in the URL: a phone number in a path is a phone number in browser
 * history, in a screenshot and in any referrer that leaks. Not httpOnly, and
 * that is deliberate — it is the trainer's own number, they typed it one screen
 * ago, and the verify screen has to print it back to them.
 */
const PENDING_COOKIE = 'inclineyou_pending_phone';

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
 * `inclineyou_pending_phone` plays for the number between two screens.
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
const CLIENT_COOKIE = 'inclineyou_client';

/**
 * WHICH WALL a sign-in ended at — see `WallKind` for why the token cannot say.
 *
 * Thirty minutes, matching `inclineyou_pending_phone`: long enough to read the screen,
 * follow its one instruction and come back, and short enough that a bookmark
 * opened tomorrow gets a fresh sign-in instead of a sentence about a membership
 * that may have changed since.
 */
const WALL_COOKIE = 'inclineyou_wall';
const WALL_MAX_AGE = 30 * 60;

const SECURE = process.env.NODE_ENV === 'production';

/**
 * @param expiresAt epoch ms from the sign-in response. Honoured only for a token
 *                  that dies sooner than a session does — the pending one — so
 *                  the cookie never outlives the 15 minutes the token has.
 */
export async function setToken(token: string, expiresAt?: number | null): Promise<void> {
  const untilExpiry = expiresAt ? Math.floor((expiresAt - Date.now()) / 1000) : SESSION_MAX_AGE;
  const maxAge = Math.max(1, Math.min(SESSION_MAX_AGE, untilExpiry));
  (await cookies()).set(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: SECURE,
    // `lax` rather than `strict`: the invite links in this product arrive by
    // WhatsApp, and `strict` drops the cookie on that first cross-site
    // navigation, which signs the trainer out for arriving from a message.
    sameSite: 'lax',
    path: '/',
    maxAge,
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

/**
 * The sign-in request a code was asked for — `otp/request`'s `requestId`.
 *
 * Verify and the delivery read take this and not the phone number (api-contract
 * R93: no endpoint answers questions about an arbitrary number), so it is what
 * the verify screen holds between the two calls. httpOnly, unlike the pending
 * phone beside it: nothing in the browser needs to read it, and the id is one
 * half of "may I spend an attempt on this code".
 */
const REQUEST_COOKIE = 'inclineyou_otp_request';

export async function setRequestId(requestId: string): Promise<void> {
  (await cookies()).set(REQUEST_COOKIE, requestId, {
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: PENDING_MAX_AGE,
  });
}

export async function getRequestId(): Promise<string | null> {
  return (await cookies()).get(REQUEST_COOKIE)?.value ?? null;
}

export async function clearRequestId(): Promise<void> {
  (await cookies()).delete(REQUEST_COOKIE);
}

/**
 * The privacy-notice version in force, as the verify response named it —
 * `currentPolicyVersion`. Kept for the two screens that have to send it back:
 * `/sign-in/new` (`POST /v1/trainers`) and `/sign-in/consent`. It is the
 * server's answer and not a constant here, so a notice that changes between a
 * deploy and a sign-in cannot be accepted at the wrong version. Lives as long as
 * the pending token does.
 */
const POLICY_COOKIE = 'inclineyou_policy_version';

export async function setPolicyVersion(version: string): Promise<void> {
  (await cookies()).set(POLICY_COOKIE, version, {
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: PENDING_MAX_AGE,
  });
}

export async function getPolicyVersion(): Promise<string | null> {
  return (await cookies()).get(POLICY_COOKIE)?.value ?? null;
}

export async function clearPolicyVersion(): Promise<void> {
  (await cookies()).delete(POLICY_COOKIE);
}

export async function setActiveClient(clientId: string): Promise<void> {
  (await cookies()).set(CLIENT_COOKIE, clientId, {
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
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
 * Does this sign-in owe us trainer setup? `setupCompletedAt` is null until
 * onboarding is finished, and survives a reinstall, a second browser and a flow
 * abandoned halfway.
 */
export function needsSetup(res: AuthResponse): boolean {
  return res.setupCompletedAt === null;
}

/** The notice in force is not the one they accepted — they owe `/sign-in/consent` first. */
export function needsConsent(res: AuthResponse): boolean {
  return res.privacyPolicyVersion !== null && res.privacyPolicyVersion !== res.currentPolicyVersion;
}

/**
 * Which screen this sign-in is owed — api-contract *Sign in*: a new number
 * (`pending`) goes to `/sign-in/new`; otherwise a notice that has changed goes
 * to `/sign-in/consent`, then unfinished onboarding to `/setup`, otherwise
 * `/today`.
 */
export function destinationFor(res: AuthResponse): string {
  if (res.role === 'pending') return '/sign-in/new';
  if (needsConsent(res)) return '/sign-in/consent';
  return needsSetup(res) ? '/setup' : '/today';
}

/**
 * Forget everything this sitting knew — what `signOut` and the stale-session
 * route both end with. Every cookie has to go and not just the token: the next
 * person to open this browser may be a different trainer on a shared gym
 * desktop.
 */
export async function clearSitting(): Promise<void> {
  await clearToken();
  await clearRequestId();
  await clearPolicyVersion();
  await clearPendingPhone();
  await clearActiveClient();
  await clearWall();
}
