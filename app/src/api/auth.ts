import axios from 'axios';
import { api } from './client';

/**
 * FR-11 · which half of the product this number belongs to.
 *
 * - `trainer` — a trainer account exists. The default lens even for somebody who
 *   is also a client, because coaching is what they signed up to do.
 * - `client`  — on somebody's roster and nobody's trainer. Paused rosters count:
 *   pause changes what the lens contains, not whether it opens.
 * - `pending` — verified, and on nobody's roster (7a). The token is good for one
 *   thing: claiming a trainer account.
 * - `paused`  — LEGACY. A backend before the pause fix sent this with no token,
 *   and 7b was a wall. Kept only so a new app against an old server during a
 *   rolling deploy still has a screen. Nothing current sends it.
 */
export type Role =
  | 'trainer'
  | 'client'
  | 'pending'
  /**
   * V18 · named by a trainer, and has never agreed to anything. The token that
   * comes with this is good for exactly two calls — accept and decline — and
   * cannot open a sync scope, so an unanswered invite can read nothing.
   */
  | 'invited'
  /** V18 · a trainer ended it and this person has not been told yet. Shown once. */
  | 'removed'
  /**
   * V18 · every membership answered and gone — declined, or removed and
   * acknowledged. Deliberately NOT `pending`: this number's role is client, and
   * offering it a coaching workspace is the wrong turn 7a exists to avoid.
   */
  | 'unattached'
  /** V18 · reserved. Nothing mints one yet. */
  | 'gym_admin'
  /**
   * LEGACY. A backend before the pause fix sent this with no token, and 7b was
   * a wall. Kept only so a new app against an old server during a rolling
   * deploy still has a screen. Nothing current sends it.
   */
  | 'paused';

/** One roster this number is on. A person can legitimately be on two. */
export interface Membership {
  clientId: string;
  trainerId: string;
  clientName: string;
  trainerName: string;
  gymName: string | null;
  trainerPhone: string | null;
  /**
   * `active` | `paused`. Optional: a backend before the pause fix never sent
   * paused rosters at all, so absence reads as active — which is exactly what
   * every roster such a backend returned was.
   */
  status?: string;
  /**
   * V18 · the CLIENT's own answer: `invited` | `accepted` | `declined` |
   * `paused` | `removed`. Kept apart from `status`, which is the TRAINER's view
   * of the same arrangement — the two answer to different people and can
   * legitimately disagree. Optional: a backend before V18 doesn't send it, and
   * every roster such a backend returned was one the client had never been
   * asked about, which reads as accepted because that is how it behaved.
   */
  membershipStatus?: string;
  /** "2026-07-22", or absent/null when this roster isn't paused. */
  pausedOn?: string | null;
}

/** Has this person been asked and not yet answered? */
export function isInvited(m: Membership): boolean {
  return m.membershipStatus?.toLowerCase() === 'invited';
}

/** Is this roster on hold? Absence of `status` means an older backend, so: no. */
export function isPaused(m: Membership): boolean {
  return m.status?.toLowerCase() === 'paused';
}

export interface AuthResponse {
  /** Null only on the legacy `paused` role. Every live path returns a token. */
  token: string | null;
  /** Null unless a trainer account exists. */
  trainerId: string | null;
  isNewUser: boolean;
  /**
   * Whether a profile already exists on the server. Optional because a backend
   * older than V8 doesn't send it — see `needsSetup` for the fallback.
   */
  setupComplete?: boolean;
  /** Optional: a backend older than V14 doesn't send it, and every such sign-in was a trainer. */
  role?: Role;
  /** The signed-in trainer's own name, for "Welcome back, Ravi". Null before setup. */
  trainerName?: string | null;
  /** Every roster this number is on, paused included — each says so via `status`. */
  clientOf?: Membership[];
  /** Set only when EVERY roster is paused. Drives the banner, no longer a wall. */
  paused?: { trainerName: string; trainerPhone: string | null; pausedOn: string | null } | null;
  /** V18 · set only on the `removed` role — who ended it and when. */
  removed?: {
    clientId: string;
    trainerName: string | null;
    trainerPhone: string | null;
    removedOn: string | null;
  } | null;
}

/**
 * The lens to open, from a response an older backend may have written.
 *
 * Absent `role` means a backend before V14, and every sign-in it ever answered
 * was a trainer's — so absence reads as trainer rather than as an error.
 */
export function roleOf(res: AuthResponse): Role {
  return res.role ?? 'trainer';
}

/**
 * Does this sign-in owe us trainer setup?
 *
 * `setupComplete` is the real answer and survives a reinstall, a second device
 * and a flow abandoned halfway. `isNewUser` only ever meant "first verify for
 * this number", which quietly stranded anyone who cleared app data mid-setup:
 * they came back as an existing user with a placeholder name and never saw the
 * flow again. It stays as the fallback for an older backend.
 */
export function needsSetup(res: AuthResponse): boolean {
  return res.setupComplete === undefined ? res.isNewUser : !res.setupComplete;
}

/* ------------------------------------------------------------------ policy
 * The numbers the sign-in screens quote to the user. They mirror
 * `agent/design system/screens/xreploginotp.html` § 06 · Behaviour spec.
 * All of them are ENFORCED on the server — these copies exist only so the UI
 * can say the same thing the backend does.
 * -------------------------------------------------------------------------- */

/** Codes are good for 10 minutes. */
export const CODE_TTL_MINUTES = 10;
/** 3 wrong codes, then a 10-minute lock, per number. */
export const ATTEMPT_LIMIT = 3;
/** Fallback only — the real duration comes from `retryAfterSeconds` / `Retry-After`. */
export const LOCK_SECONDS = 600;
/** Resend cooldown ladder, in seconds — escalating, always with a visible countdown. */
export const RESEND_LADDER = [30, 60, 120] as const;
/** Attempts remaining is only shown from 3 left onward: warn before the wall, not at it. */
export const ATTEMPTS_WARN_FROM = 3;

export type OtpChannel = 'sms' | 'whatsapp';

/**
 * WhatsApp delivery needs a BSP on the backend, which isn't wired yet.
 * Flip this the day `/v1/auth/otp/request` honours `channel: 'whatsapp'`.
 */
export const WHATSAPP_OTP_ENABLED = false;

/** Support number for the locked-out state, e.g. EXPO_PUBLIC_SUPPORT_WHATSAPP=919876543210. */
export const SUPPORT_WHATSAPP_NUMBER = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? '';

export class WhatsAppUnavailableError extends Error {
  constructor() {
    super('WhatsApp delivery is not switched on yet.');
    this.name = 'WhatsAppUnavailableError';
  }
}

/* --------------------------------------------------------------- requests */

export function requestOtp(phone: string) {
  return api.post<void>('/v1/auth/otp/request', { phone });
}

/**
 * The second delivery path, offered once SMS has let the trainer down.
 * Throws loudly rather than silently falling back to SMS, so a trainer is never
 * told to check WhatsApp for a code that went out as a text.
 */
export function requestOtpOnWhatsApp(phone: string) {
  if (!WHATSAPP_OTP_ENABLED) throw new WhatsAppUnavailableError();
  return api.post<void>('/v1/auth/otp/request', { phone, channel: 'whatsapp' satisfies OtpChannel });
}

export function verifyOtp(phone: string, otp: string) {
  return api.post<AuthResponse>('/v1/auth/otp/verify', { phone, otp });
}

/**
 * Screen 7a · "I'm a trainer" — open a coaching account for the number that was
 * just verified.
 *
 * No body: the number comes from the pending token, because a phone in a request
 * body is a phone anybody can type. Signing in no longer creates this account by
 * itself — the likeliest first launch in this product is a CLIENT typing their
 * number before their trainer has added them, and handing them a coaching
 * workspace is a wrong turn they cannot undo.
 */
export function claimTrainerAccount(pendingToken: string) {
  // Passed explicitly rather than left to the interceptor: at this point the
  // pending token is deliberately NOT in the keychain, because a stored token is
  // what the app reads as "signed in" — and nobody is signed in until they have
  // chosen which of the two things on 7a they are.
  return api.post<AuthResponse>('/v1/auth/trainer', null, {
    headers: { Authorization: `Bearer ${pendingToken}` },
  });
}

/* ------------------------------------------------- answering a membership
 * All three carry the invited token explicitly rather than leaning on the
 * interceptor, for the same reason `claimTrainerAccount` does: the token is
 * deliberately NOT in the keychain yet, because a stored token is what the app
 * reads as "signed in" — and nobody is signed in until they have answered.
 * -------------------------------------------------------------------------- */

/** Accept the invite. The privacy policy was on the screen that calls this. */
export function acceptInvite(invitedToken: string, clientId: string) {
  return api.post<AuthResponse>(`/v1/auth/membership/${clientId}/accept`, null, {
    headers: { Authorization: `Bearer ${invitedToken}` },
  });
}

/** Decline. The trainer keeps a roster row that says what happened. */
export function declineInvite(invitedToken: string, clientId: string) {
  return api.post<AuthResponse>(`/v1/auth/membership/${clientId}/decline`, null, {
    headers: { Authorization: `Bearer ${invitedToken}` },
  });
}

/**
 * "OK" on the removal notice.
 *
 * The membership row outlives the membership — the trainer's payments and
 * session history point at it — so `removed` is permanently true, and this
 * acknowledgement is the only thing that stops the notice being redrawn at
 * every future sign-in. The local wipe happens on the phone, separately.
 */
export function acknowledgeRemoval(invitedToken: string, clientId: string) {
  return api.post<AuthResponse>(`/v1/auth/membership/${clientId}/ack-removal`, null, {
    headers: { Authorization: `Bearer ${invitedToken}` },
  });
}

/* ---------------------------------------------------------------- failures
 * "Wrong", "expired" and "locked" need three different recoveries, so the UI
 * has to tell them apart. `/v1/auth/otp/verify` says which:
 *
 *   422  { code: 'OTP_WRONG',   attemptsLeft }       → 3a, counting down 2 → 1
 *   410  { code: 'OTP_EXPIRED' }                     → 3b, amber, no attempt spent
 *   429  { code: 'OTP_LOCKED',  retryAfterSeconds }  → 3c, + a Retry-After header
 *
 * `code` is what we classify on; the status is only a fallback for a proxy or
 * an older build that strips the body. Everything else degrades to a plain
 * wrong-code message rather than inventing a recovery the server didn't offer.
 * -------------------------------------------------------------------------- */

/** The request never left the phone. Distinct from any answer the server gave. */
export function isOfflineError(err: unknown): boolean {
  return axios.isAxiosError(err) && !err.response;
}

/** The server is refusing more codes for now, per its own rate limit. */
export function isRateLimited(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 429;
}

/**
 * The server's own sentence for a field it refused, or null if that isn't what
 * this error is.
 *
 * `GlobalExceptionHandler` answers a failed `@Valid` with 400 and a
 * ProblemDetail whose `detail` reads `phone: must be a valid 10-digit Indian
 * mobile number` — the one line that says what is actually wrong. Letting that
 * fall through to "couldn't send the code" blames the connection for a typo and
 * invites the same number again, so the screens read it and quote it.
 *
 * The field name is ours, not the trainer's, so it is stripped. A detail long
 * enough to wrap a field message is treated as not-for-humans and dropped —
 * better the generic line than a paragraph under the input.
 */
export function readValidationDetail(err: unknown): string | null {
  if (!axios.isAxiosError(err) || err.response?.status !== 400) return null;
  const data = err.response.data as { detail?: unknown } | undefined;
  const raw = typeof data?.detail === 'string' ? data.detail.trim() : '';
  const detail = raw.replace(/^[A-Za-z_][\w.]*:\s*/, '');
  if (!detail || detail.length > 120) return null;
  return detail.charAt(0).toUpperCase() + detail.slice(1);
}

export type OtpFailure =
  | { kind: 'wrong'; attemptsLeft: number | null }
  | { kind: 'expired' }
  | { kind: 'locked'; retryAfterSeconds: number }
  | { kind: 'offline' }
  | { kind: 'unknown' };

interface OtpErrorBody {
  code?: string;
  attemptsLeft?: number;
  retryAfterSeconds?: number;
}

/**
 * Body first, then the header, then our own copy of the policy. The header is
 * seconds-only here — the backend sends `Retry-After: 600`, never an HTTP-date,
 * so a NaN means it wasn't usable and we fall through.
 */
function lockSeconds(body: OtpErrorBody, headers: unknown, fallback = LOCK_SECONDS): number {
  const header = Number((headers as Record<string, unknown> | undefined)?.['retry-after']);
  const seconds =
    body.retryAfterSeconds ?? (Number.isFinite(header) && header > 0 ? header : fallback);
  return Math.round(seconds);
}

/**
 * Seconds left on a sign-in lock, or null if this error is not one.
 *
 * For `/v1/auth/otp/request` specifically: it answers 429 for two unrelated
 * things — the send-rate throttle ("that's a lot of codes") and a number locked
 * out by wrong codes — and they need opposite recoveries. Only an explicit
 * `code: 'OTP_LOCKED'` is a lock here, so a bare 429 stays a throttle. Asking
 * for a code on a locked number must not consume anything or send an SMS; it
 * just tells us the number is still serving its wait.
 */
export function readOtpLock(err: unknown): number | null {
  if (!axios.isAxiosError(err) || !err.response) return null;
  const { data, headers } = err.response;
  const body: OtpErrorBody = typeof data === 'object' && data !== null ? data : {};
  if (body.code?.toUpperCase() !== 'OTP_LOCKED') return null;
  return lockSeconds(body, headers);
}

/**
 * Seconds until this number may ask for another code, or null if that isn't what
 * this error is.
 *
 * The sibling of {@link readOtpLock}, and the reason that one insists on an
 * explicit `OTP_LOCKED`: `/v1/auth/otp/request` answers 429 for two unrelated
 * things. A lock is three wrong codes and owes the trainer a countdown screen; a
 * throttle is the send rate — 30 seconds between the first codes of a minute, or
 * the day's ceiling — and belongs inline on the screen they are already on.
 * Neither spends anything, and neither is a connection problem.
 */
export function readSendThrottle(err: unknown): number | null {
  if (!axios.isAxiosError(err) || !err.response) return null;
  const { data, headers } = err.response;
  const body: OtpErrorBody = typeof data === 'object' && data !== null ? data : {};
  if (body.code?.toUpperCase() !== 'OTP_THROTTLED') return null;
  return lockSeconds(body, headers, RESEND_LADDER[0]);
}

/**
 * The wait, in the unit a person actually reads.
 *
 * The number matters: the ladder refuses for half a minute and the day's ceiling
 * refuses for hours, and "give it a minute" is a lie in the second case that the
 * next attempt exposes. Both sign-in screens quote this so they cannot drift.
 */
export function throttleMessage(seconds: number): string {
  const wait = Math.max(1, Math.round(seconds));
  if (wait <= 90) return `That's a lot of codes. Try again in ${plural(wait, 'second')}.`;
  const minutes = Math.ceil(wait / 60);
  if (minutes < 90) return `That's a lot of codes. Try again in ${plural(minutes, 'minute')}.`;
  const hours = Math.max(1, Math.round(wait / 3600));
  return `That's too many codes for this number today. Try again in about ${plural(hours, 'hour')}.`;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

export function readOtpFailure(err: unknown): OtpFailure {
  if (!axios.isAxiosError(err)) return { kind: 'unknown' };
  // No response at all — the request never left the phone.
  if (!err.response) return { kind: 'offline' };

  const { status, data, headers } = err.response;
  const body: OtpErrorBody = typeof data === 'object' && data !== null ? data : {};
  const code = body.code?.toUpperCase();

  // Unlike the request endpoint, verify has only one 429 — the lock — so a bare
  // status is enough here even without the code.
  if (code === 'OTP_LOCKED' || status === 429) {
    return { kind: 'locked', retryAfterSeconds: lockSeconds(body, headers) };
  }
  if (code === 'OTP_EXPIRED' || status === 410) return { kind: 'expired' };
  // 422 is the live wrong-code status — InvalidOtpException maps to
  // UNPROCESSABLE_ENTITY. Without it a wrong code took the `unknown` path
  // ("Couldn't check that code"), which blames the network for a mistyped
  // digit, and none of 3a fired: no red slots, no shake, resend still on
  // cooldown. 400/401/403 stay as fallbacks for older builds.
  if (code === 'OTP_WRONG' || status === 422 || status === 400 || status === 401 || status === 403) {
    // Only a real count survives. `attemptsLeft: 0` means the next code is the
    // wall, not that 0 tries remain to spend, so it is not worth announcing.
    const left = typeof body.attemptsLeft === 'number' ? body.attemptsLeft : null;
    return { kind: 'wrong', attemptsLeft: left };
  }
  return { kind: 'unknown' };
}
