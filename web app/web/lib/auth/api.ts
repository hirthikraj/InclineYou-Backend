import 'server-only';

import {
  LOCK_SECONDS,
  RESEND_LADDER,
} from './policy';
import { getToken } from './session';
import type { AuthResponse, OtpFailure, SendFailure } from './types';

/**
 * The Spring API, reached from the Next server and never from the browser.
 *
 * This is the whole reason the web app is a Next application rather than a
 * static bundle: the backend has no CORS configuration and needs none, and the
 * JWT it mints is a 7-day bearer token that consequently never has to exist in
 * browser JavaScript.
 */
const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';

/** RFC 9457. Spring's ProblemDetail plus the `code` the handlers attach. */
interface ProblemDetail {
  detail?: string;
  code?: string;
  attemptsLeft?: number;
  retryAfterSeconds?: number;
}

interface Refusal {
  status: number;
  body: ProblemDetail;
  retryAfterHeader: number | null;
}

/** Thrown for anything that is not a 2xx, so the readers below can classify it. */
class ApiRefusal extends Error {
  constructor(readonly refusal: Refusal) {
    super(`inclineyou api ${refusal.status}`);
    this.name = 'ApiRefusal';
  }
}

/** No response at all — the request never left this server. */
class ApiUnreachable extends Error {
  constructor(cause: unknown) {
    super('inclineyou api unreachable');
    this.name = 'ApiUnreachable';
    this.cause = cause;
  }
}

async function fetchJson<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        /*
         * Every sign-in says it is the web, so the backend mints the revocable
         * session (V41) rather than the phone's seven-day JWT — absence means
         * mobile. A brand-new number is the one exception, and the backend
         * handles it: until it claims, it gets a fifteen-minute token that can
         * only claim (api-contract *Sign in*).
         */
        'x-inclineyou-client': 'web',
        ...(init.headers as Record<string, string> | undefined),
      },
      // Auth is the one thing that must never be served from a cache.
      cache: 'no-store',
    });
  } catch (cause) {
    throw new ApiUnreachable(cause);
  }

  if (!res.ok) {
    let parsed: ProblemDetail = {};
    try {
      const json: unknown = await res.json();
      if (json !== null && typeof json === 'object') parsed = json as ProblemDetail;
    } catch {
      // A proxy that stripped the body. The status is all we get, and every
      // reader below has a fallback for exactly that.
    }
    const header = Number(res.headers.get('retry-after'));
    throw new ApiRefusal({
      status: res.status,
      body: parsed,
      retryAfterHeader: Number.isFinite(header) && header > 0 ? header : null,
    });
  }

  // `/otp/request` answers 200 with no body.
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * A POST that carries the signed-in cookie's token rather than a body — for
 * the two calls that act on "whoever this token is", not on a phone number.
 * 401 (no cookie at all) is folded into the same `ApiRefusal` shape as a
 * refusal from the server, so callers have one thing to catch either way.
 */
async function postAuthed<T>(path: string): Promise<T> {
  const token = await getToken();
  if (!token) {
    throw new ApiRefusal({ status: 401, body: {}, retryAfterHeader: null });
  }
  return fetchJson<T>(path, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
}

/**
 * Body first, then the header, then our own copy of the policy.
 *
 * The header is seconds-only: the backend sends `Retry-After: 600`, never an
 * HTTP-date, so anything unparseable means it was not usable and we fall
 * through rather than rendering a NaN into a countdown.
 */
function waitSeconds(r: Refusal, fallback: number): number {
  return Math.round(r.body.retryAfterSeconds ?? r.retryAfterHeader ?? fallback);
}

/* ─────────────────────────────────────────────────────────────── requests ── */

/**
 * `AuthController.PHONE_PATTERN` is `^\+91[6-9]\d{9}$` — the backend now stores
 * and compares every phone in this one shape, not the bare 10 digits an older
 * build sent. Callers here only ever hold the 10 digits a trainer typed, so the
 * `+91` is added at the wire boundary rather than carried through state that
 * also has to render and re-validate the number.
 */
function withCountryCode(phone: string): string {
  return `+91${phone}`;
}

export async function requestOtp(phone: string): Promise<void> {
  await post<void>('/v1/auth/otp/request', { phone: withCountryCode(phone) });
}

export async function verifyOtp(phone: string, otp: string): Promise<AuthResponse> {
  return post<AuthResponse>('/v1/auth/otp/verify', { phone: withCountryCode(phone), otp });
}

/* ------------------------------------------------------- claiming a trainer
 * Frame 3a. This is where a trainer account is CREATED — not at sign-in.
 *
 * Verifying a number used to mint one for anybody, which quietly handed a
 * coaching workspace to every client who tried the app before their trainer got
 * round to adding them. `POST /v1/auth/trainer` now takes the caller's token and
 * is called from exactly one screen: the one that asked which of the two things
 * they are.
 *
 * No body. The number comes from the token's subject, because a phone in a
 * request body is a phone anybody can type — and this call creates an account.
 * -------------------------------------------------------------------------- */

/**
 * Turn the signed-in number into a trainer account, and mint a trainer token for
 * it. The caller is responsible for `setToken` with the result — the same
 * division of labour as `verifyCode` in `actions.ts`.
 *
 * Idempotent on the server: an existing `trainer` row for this phone is reused
 * rather than duplicated, so a double-submit produces one account and two
 * identical tokens.
 */
export async function claimTrainerAccount(): Promise<AuthResponse> {
  return postAuthed<AuthResponse>('/v1/auth/trainer');
}

/**
 * True for the one refusal this call has: a 400 meaning *this sign-in already
 * has a trainer account*.
 *
 * `claimTrainer` reads the token's subject, and a trainer token's subject is a
 * UUID rather than a phone — so this is what the server says when the screen is
 * reached with a token that is already a trainer's. It is a recoverable state and
 * not an error: the right answer is to send them where that token already works.
 */
export function isAlreadyTrainer(err: unknown): boolean {
  return err instanceof ApiRefusal && err.refusal.status === 400;
}

/* ----------------------------------------------------------- mode switch
 * A phone can hold a trainer account AND a live membership on somebody
 * else's roster at the same time — trainer/client duality (23 Aug 2026).
 * These mint a fresh token of the OTHER kind for whichever token the
 * session cookie currently holds, and the caller is responsible for calling
 * `setToken` with the result — same division of labour as `verifyCode` in
 * `actions.ts`, kept here rather than folded into it because these two are
 * not part of the sign-in flow.
 * -------------------------------------------------------------------------- */

/** Switch into trainer mode. 404s (via `isModeUnavailable`) with no trainer account on this number. */
export async function switchToTrainerMode(): Promise<AuthResponse> {
  return postAuthed<AuthResponse>('/v1/auth/mode/trainer');
}

/** Switch into client mode. 404s (via `isModeUnavailable`) with no live membership anywhere. */
export async function switchToClientMode(): Promise<AuthResponse> {
  return postAuthed<AuthResponse>('/v1/auth/mode/client');
}

/**
 * True for anything this module raises: a refusal from the server, or no answer
 * at all.
 *
 * A caller that wants to treat "the API said no" as data has to be able to tell
 * it from a bug in its own code — otherwise a broad `catch` turns a
 * `cookies()`-during-render error, a typo or an unhandled null into "the server
 * is unavailable", and the screen reports the wrong thing about the wrong layer.
 * That is not hypothetical: it is exactly what happened to `loadRosters`.
 */
export function isApiFailure(err: unknown): boolean {
  return err instanceof ApiRefusal || err instanceof ApiUnreachable;
}

/** True for the 404 either mode-switch call gives when this number does not actually hold that identity. */
export function isModeUnavailable(err: unknown): boolean {
  return err instanceof ApiRefusal && err.refusal.status === 404;
}

/* ─────────────────────────────────────────────── reading the refusals ───── */

/**
 * `/v1/auth/otp/verify` has one 429 — the lock — so a bare status is enough
 * here even without the `code`. Its sibling below is the one that cannot.
 */
export function readVerifyFailure(err: unknown): OtpFailure {
  if (err instanceof ApiUnreachable) return { kind: 'offline' };
  if (!(err instanceof ApiRefusal)) return { kind: 'unknown' };

  const { status, body } = err.refusal;
  const code = body.code?.toUpperCase();

  if (code === 'OTP_LOCKED' || status === 429) {
    return { kind: 'locked', retryAfterSeconds: waitSeconds(err.refusal, LOCK_SECONDS) };
  }
  if (code === 'OTP_EXPIRED' || status === 410) return { kind: 'expired' };
  // 422 is the live wrong-code status. 400/401/403 stay as fallbacks for older
  // builds; without them a wrong code took the `unknown` path and blamed the
  // network for a mistyped digit.
  if (code === 'OTP_WRONG' || status === 422 || status === 400 || status === 401 || status === 403) {
    // Only a real count survives. `attemptsLeft: 0` means the next code is the
    // wall, not that 0 tries remain to spend, so it is not worth announcing.
    const left = typeof body.attemptsLeft === 'number' ? body.attemptsLeft : null;
    return { kind: 'wrong', attemptsLeft: left };
  }
  return { kind: 'unknown' };
}

/**
 * `/v1/auth/otp/request` answers 429 for two unrelated things that owe opposite
 * recoveries: a lock is three wrong codes and owes a countdown; a throttle is
 * the send rate and owes an inline line on the screen the trainer is already
 * on. So only an explicit `OTP_LOCKED` is a lock here, and a bare 429 stays a
 * throttle — the cheaper of the two to be wrong about.
 */
export function readSendFailure(err: unknown): SendFailure {
  if (err instanceof ApiUnreachable) return { kind: 'offline' };
  if (!(err instanceof ApiRefusal)) return { kind: 'unknown' };

  const { status, body } = err.refusal;
  const code = body.code?.toUpperCase();

  if (code === 'OTP_LOCKED') {
    return { kind: 'locked', retryAfterSeconds: waitSeconds(err.refusal, LOCK_SECONDS) };
  }
  if (code === 'OTP_THROTTLED' || status === 429) {
    return { kind: 'throttled', retryAfterSeconds: waitSeconds(err.refusal, RESEND_LADDER[0]) };
  }
  if (status === 400) return { kind: 'invalid', detail: readValidationDetail(body) };
  return { kind: 'unknown' };
}

/**
 * The server's own words for a rejected number, when they are short enough to
 * be a sentence on a screen. Spring prefixes the field name onto bean-validation
 * details ("phone: must be a valid..."), which is not something to show anyone.
 */
function readValidationDetail(body: ProblemDetail): string | null {
  const raw = typeof body.detail === 'string' ? body.detail.trim() : '';
  const detail = raw.replace(/^[A-Za-z_][\w.]*:\s*/, '');
  if (!detail || detail.length > 120) return null;
  return detail.charAt(0).toUpperCase() + detail.slice(1);
}
