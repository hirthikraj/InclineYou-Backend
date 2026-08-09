import axios from 'axios';
import { api } from './client';

export interface AuthResponse {
  token: string;
  trainerId: string;
  isNewUser: boolean;
  /**
   * Whether a profile already exists on the server. Optional because a backend
   * older than V8 doesn't send it — see `needsSetup` for the fallback.
   */
  setupComplete?: boolean;
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
 * `agent/design system/screens/trainxloginotp.html` § 06 · Behaviour spec.
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
function lockSeconds(body: OtpErrorBody, headers: unknown): number {
  const header = Number((headers as Record<string, unknown> | undefined)?.['retry-after']);
  const seconds =
    body.retryAfterSeconds ?? (Number.isFinite(header) && header > 0 ? header : LOCK_SECONDS);
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
