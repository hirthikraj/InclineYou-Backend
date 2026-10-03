import 'server-only';

import type { Role } from './types';

/**
 * What the session cookie says about itself.
 *
 * ── READ, NOT VERIFIED, AND THE DIFFERENCE IS THE WHOLE COMMENT ───────────────
 *
 * This decodes the JWT's payload without checking its signature, which sounds
 * like the beginning of a vulnerability and is not one — because nothing here is
 * ever the basis of an authorisation decision. It answers two questions:
 *
 *   · which screen this session is owed, so `/` and `/sign-in/new` can route
 *     without a round trip; and
 *   · which number to print back to the person who typed it one screen ago.
 *
 * Every actual permission is still the server's. A pending token cannot read
 * `/v1/trainers/me` however this file describes it, and `POST /v1/trainers`
 * refuses anything but a live pending token or a trainer's own session. So a forged claim buys the forger a
 * screen they cannot use — and the cookie is `httpOnly` and signed by us, so
 * forging it means attacking your own browser.
 *
 * The alternative was a request. There is no *who am I* endpoint a pending token
 * can call, so it would have to be `POST /v1/trainers` — the one call that
 * has a side effect, made to find out whether the screen should offer it. That is
 * worse than reading a claim we minted.
 *
 * ── WHY THE WEB NEEDS THIS AND THE PHONE DOES NOT ────────────────────────────
 *
 * The phone deliberately does NOT store the pending token: "a stored token is
 * what the app reads as signed in, and nobody is signed in until they have
 * chosen which of the two things on 7a they are." It keeps the token in
 * navigation params instead, so the screen is handed everything it needs.
 *
 * The web has no navigation params. `verifyCode` sets the cookie for every role
 * that has a destination, `pending` included, because a cookie is the only thing
 * that survives the redirect to `/sign-in/new` — and it has to survive a reload
 * of that URL too. So the token is stored, and this is how the screens tell what
 * kind it is.
 */

/** Only the claims this app mints. Anything else is ignored rather than typed. */
export interface SessionClaims {
  /** A trainer id for a trainer token; the PHONE for client, pending and invited. */
  sub: string | null;
  phone: string | null;
  /** Absent on a token minted before V14, which was always a trainer's. */
  role: Role;
  /** Seconds since the epoch, as JWT spec. Null when the claim is missing. */
  exp: number | null;
}

const ROLES = new Set<string>([
  'trainer', 'client', 'pending', 'invited', 'removed', 'unattached', 'gym_admin', 'paused',
]);

/**
 * Null for anything that is not a readable token — a malformed cookie, a
 * signature-only string, an expired one. Every caller treats null as *signed
 * out*, which is the safe reading in both directions: it never grants a screen,
 * and the server would have refused the token anyway.
 */
export function readClaims(token: string | null): SessionClaims | null {
  if (!token) return null;

  // An opaque session token (`xs_…`) says nothing about itself — that is its
  // point. Only a trainer is ever given one on the web (a client-only number is
  // refused at verify and a new number gets the pending JWT below), so the
  // prefix is the whole answer. Whether the SESSION is still alive is the
  // server's, asked on `/sign-in` and by every guarded read.
  if (token.startsWith('xs_')) return { sub: null, phone: null, role: 'trainer', exp: null };

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let payload: Record<string, unknown>;
  try {
    // base64url → base64. `Buffer` rather than `atob` because this is
    // server-only and `atob` does not handle the URL alphabet.
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    );
    const parsed: unknown = JSON.parse(json);
    if (parsed === null || typeof parsed !== 'object') return null;
    payload = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const exp = typeof payload.exp === 'number' ? payload.exp : null;
  // Expired is signed out. The cookie's own `maxAge` matches the token's seven
  // days, so this is the narrow case of a token minted before a secret rotation
  // or a clock that moved — but a screen drawn from an expired token is a screen
  // whose every request 401s, which reads as the product being broken.
  if (exp !== null && exp * 1000 <= Date.now()) return null;

  const rawRole = typeof payload.role === 'string' ? payload.role : null;

  return {
    sub: typeof payload.sub === 'string' ? payload.sub : null,
    phone: typeof payload.phone === 'string' ? payload.phone : null,
    // Absence reads as trainer for the same reason `roleOf` does: every sign-in a
    // pre-V14 backend ever answered was a trainer's.
    role: rawRole && ROLES.has(rawRole) ? (rawRole as Role) : 'trainer',
    exp,
  };
}

/**
 * `9841022119` → `+91 98410 22119`.
 *
 * The design prints it in this grouping and so does the phone's `format`, because
 * it is how the number appears on an Indian SIM and on every bill — a trainer
 * checking whether we have the right number is comparing shapes, not digits.
 */
export function formatPhone(digits: string | null): string | null {
  if (!digits) return null;
  const d = digits.replace(/\D/g, '');
  if (d.length !== 10) return d ? `+91 ${d}` : null;
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
}
