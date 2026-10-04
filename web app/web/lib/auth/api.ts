import 'server-only';

import {
  LOCK_SECONDS,
  RESEND_LADDER,
} from './policy';
import { getToken } from './session';
import type { AuthResponse, DeliveryStatus, OtpFailure, OtpRequested, SendFailure } from './types';

/**
 * The Spring API, reached from the Next server and never from the browser.
 *
 * This is the whole reason the web app is a Next application rather than a
 * static bundle: the backend has no CORS configuration and needs none, and the
 * session token it mints consequently never has to exist in browser JavaScript.
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

/**
 * A 2xx whose body is not the shape this client was written against — most
 * often a backend that predates the v1.1 sign-in (its `otp/request` answers 200
 * with no body at all). Not a refusal and not "unreachable": the server
 * answered, and what it said cannot be used. Readers classify it as `unknown`,
 * so the screen says it could not send the code instead of the action throwing.
 */
class ApiBadResponse extends Error {
  constructor(what: string) {
    super(`inclineyou api sent an unusable ${what}`);
    this.name = 'ApiBadResponse';
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
         * session (V41) rather than the phone's JWT — absence means mobile. A
         * brand-new number is the one exception, and the backend handles it:
         * until it claims, it gets a fifteen-minute token that can only claim
         * (api-contract *Sign in*).
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

  // A 204 (sign-out) has no body.
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
 * A call that carries the signed-in cookie's token — for the calls that act on
 * "whoever this token is", not on a phone number. No cookie at all is folded
 * into the same `ApiRefusal` shape as a 401 from the server, so callers have one
 * thing to catch either way.
 */
async function authed<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  if (!token) {
    throw new ApiRefusal({ status: 401, body: {}, retryAfterHeader: null });
  }
  return fetchJson<T>(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
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
 * The server stores and compares every phone as `+91` and ten digits. Callers
 * here only ever hold the 10 digits a trainer typed, so the `+91` is added at
 * the wire boundary rather than carried through state that also has to render
 * and re-validate the number.
 */
function withCountryCode(phone: string): string {
  return `+91${phone}`;
}

/**
 * Ask for a code. The answer is the REQUEST — its id is what verify and the
 * delivery read take instead of the number, and a newer request retires the
 * older one, so only the latest id can be verified.
 */
export async function requestOtp(phone: string): Promise<OtpRequested> {
  const res = await post<OtpRequested | null>('/v1/auth/otp/request', { phone: withCountryCode(phone) });
  if (!res || typeof res.requestId !== 'string' || !res.requestId) {
    throw new ApiBadResponse('otp/request answer');
  }
  return res;
}

/** Check a code against the request it was sent for. No phone number rides here. */
export async function verifyOtp(requestId: string, otp: string): Promise<AuthResponse> {
  const res = await post<AuthResponse | null>('/v1/auth/otp/verify', { requestId, otp });
  if (!res || typeof res.token !== 'string') throw new ApiBadResponse('otp/verify answer');
  return res;
}

/**
 * Where the WhatsApp message is. 404 means the request is unknown, used,
 * expired or superseded — the caller treats that as "nothing to report".
 */
export async function getDelivery(requestId: string): Promise<{ deliveryStatus: DeliveryStatus | null }> {
  return fetchJson<{ deliveryStatus: DeliveryStatus | null }>(
    `/v1/auth/otp/requests/${encodeURIComponent(requestId)}`,
    { method: 'GET' },
  );
}

/* ------------------------------------------------------- claiming a trainer
 * Frame 3a. This is where a trainer account is CREATED — not at sign-in.
 *
 * Verifying a number never makes one, which would quietly hand a coaching
 * workspace to every client who tried the app before their trainer got round to
 * adding them. `POST /v1/trainers` takes the pending token and is called from
 * exactly one screen: the one that asked which of the two things they are.
 *
 * The number comes from the token's subject, because a phone in a request body
 * is a phone anybody can type — and this call creates an account.
 * -------------------------------------------------------------------------- */

/**
 * Turn the verified number into a trainer account, and answer the revocable
 * session that replaces the pending token. The caller is responsible for
 * `setToken` with the result.
 *
 * Idempotent on the server — a repeat from the pending token, or from the
 * trainer's own session, answers 200 with the account that exists — so a
 * double-submit produces one account and needs no special case here.
 *
 * @param policyVersion the notice in force, as the verify response named it;
 *                      accepting is what pressing the button means
 */
export async function claimTrainerAccount(policyVersion: string): Promise<AuthResponse> {
  const res = await authed<AuthResponse | null>('POST', '/v1/trainers', { privacyPolicyVersion: policyVersion });
  if (!res || typeof res.token !== 'string') throw new ApiBadResponse('POST /v1/trainers answer');
  return res;
}

/** `POST /v1/trainers/me/consent` — accept the notice now in force. Idempotent. */
export async function acceptPolicy(policyVersion: string): Promise<void> {
  await authed<unknown>('POST', '/v1/trainers/me/consent', { policyVersion });
}

/**
 * End this session on the server. `DELETE /v1/auth/sessions/current` is
 * idempotent and answers 204; the caller forgets the cookie either way, so a
 * failure here is reported and never blocks the sign-out.
 */
export async function endSession(): Promise<void> {
  await authed<void>('DELETE', '/v1/auth/sessions/current');
}

/**
 * Is the session in the cookie still good? The one read `/sign-in` makes before
 * it decides whether to bounce somebody into the app.
 *
 * Only a 401 means *no*: it is the server saying this credential stopped
 * working, and its `code` says which way — `SESSION_EXPIRED` (past its window)
 * or `SESSION_REVOKED` (signed out elsewhere or by an account change). Anything
 * else, an unreachable server included, is not evidence against the session, and
 * the app's own guards will say what they find.
 */
export type SessionCheck = { live: true } | { live: false; why: 'expired' | 'revoked' };

export async function checkSession(): Promise<SessionCheck> {
  try {
    await authed<unknown>('GET', '/v1/me');
    return { live: true };
  } catch (err) {
    if (err instanceof ApiRefusal && err.refusal.status === 401) {
      return { live: false, why: err.refusal.body.code === 'SESSION_REVOKED' ? 'revoked' : 'expired' };
    }
    return { live: true };
  }
}

/** The `code` of a refusal, upper-cased, or null for anything that was not one. */
export function refusalCode(err: unknown): string | null {
  return err instanceof ApiRefusal ? (err.refusal.body.code?.toUpperCase() ?? null) : null;
}

/**
 * True for the 403 a verify answers for a number that is only somebody's client.
 * Client sign-in is not open in v1, and nothing was minted — the screen for it
 * is `/sign-in/client`.
 */
export function isClientSignInUnavailable(err: unknown): boolean {
  return refusalCode(err) === 'CLIENT_SIGN_IN_UNAVAILABLE';
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

/* ─────────────────────────────────────────────── reading the refusals ───── */

/**
 * `/v1/auth/otp/verify` has one 429 — the lock — so a bare status is enough
 * here even without the `code`. Its sibling below is the one that cannot.
 *
 * A wrong code and an expired one are BOTH 401 (api-contract), so `code` is read
 * first and the status is only the fallback for a body a proxy stripped.
 */
export function readVerifyFailure(err: unknown): OtpFailure {
  if (err instanceof ApiUnreachable) return { kind: 'offline' };
  if (!(err instanceof ApiRefusal)) return { kind: 'unknown' };

  const { status, body } = err.refusal;
  const code = body.code?.toUpperCase();

  if (code === 'OTP_LOCKED' || status === 429) {
    return { kind: 'locked', retryAfterSeconds: waitSeconds(err.refusal, LOCK_SECONDS) };
  }
  // A request that is unknown, used, expired or superseded reads the same as a
  // lapsed code to the person holding it: nothing was spent, send another.
  if (code === 'OTP_EXPIRED' || code === 'OTP_REQUEST_NOT_FOUND' || status === 404) {
    return { kind: 'expired' };
  }
  // 401 is the live wrong-code status. Without the fallback a proxy that
  // stripped the body would take the `unknown` path and blame the network for a
  // mistyped digit.
  if (code === 'OTP_WRONG' || status === 401) {
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
  if (code === 'PHONE_INVALID' || status === 400) return { kind: 'invalid', detail: readValidationDetail(body) };
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
