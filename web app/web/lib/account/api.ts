import 'server-only';

import { getToken } from '@/lib/auth/session';

/**
 * THE ACCOUNT DATA LAYER — `/settings`, and nothing else.
 *
 * `server-only`, like every other `api.ts` here: the JWT is in an httpOnly
 * cookie and never reaches browser JS, so a client component fetching this
 * directly would break the moment it left localhost and the fix would be a
 * backend CORS change.
 *
 * ── WHY THIS IS NOT `lib/profile/api.ts` ────────────────────────────────────
 *
 * The name and the email are read from `/v1/trainers/me` and written back with a
 * PATCH, which is exactly what that file does — so folding them together was the
 * obvious move, and it is wrong for the same shape of reason that file gives for
 * not being `lib/setup/api.ts`.
 *
 * **Three of the five calls here are not profile calls at all.** They send an
 * SMS, they spend a one-time code, and one of them retires the account. A module
 * whose contract is *null means leave it alone* is the wrong place for a verb
 * that cannot be undone, and a screen importing `patchIdentity` to change a name
 * would end up one import away from `deleteAccount`.
 *
 * They also fail differently. A profile save has one refusal worth naming and
 * this has six — a taken number, an expired proof, three wrong codes, a daily
 * ceiling — and every one of them owes the trainer a different recovery. The
 * two modules share a wire shape rather than a function; `AccountFailure` below
 * is what the difference costs.
 *
 * ── AND THE OTP REFUSALS ARE THE SIGN-IN ONES ───────────────────────────────
 *
 * `POST /v1/trainers/me/phone/challenge` and `/confirm` go through
 * `OtpService`, the same one `/v1/auth/otp/*` uses, so they raise the same three
 * exceptions with the same `code` values and the same `retryAfterSeconds`. The
 * classifier below is deliberately the shape of `lib/auth/api.ts`'s two: a
 * trainer who has met "that code has expired" at sign-in should meet the same
 * sentence here, because it is the same fact about the same machinery.
 */

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

/** RFC 9457. Spring's ProblemDetail plus the `code` the handlers attach. */
interface ProblemDetail {
  detail?: string;
  code?: string;
  attemptsLeft?: number;
  retryAfterSeconds?: number;
}

/**
 * Every way one of these calls can end badly, as data.
 *
 * A union rather than a message string, because three of these need a NUMBER on
 * the screen — seconds to wait, attempts left — and one of them (`taken`) is the
 * only refusal on this screen the trainer can act on without waiting for
 * anything. Flattening them to a sentence here would mean the panel could not
 * tell a countdown from a dead end.
 */
export type AccountFailure =
  | { kind: 'offline' }
  /** Three wrong codes. Carries the wait. */
  | { kind: 'locked'; retryAfterSeconds: number }
  /** The send rate, or the ten-a-day ceiling. */
  | { kind: 'throttled'; retryAfterSeconds: number }
  /** Aged out, or there is no live code for this number. */
  | { kind: 'expired' }
  /** Wrong. `attemptsLeft` is null when the server did not say. */
  | { kind: 'wrong'; attemptsLeft: number | null }
  /** The proof that they hold the old number timed out — step 2 again. */
  | { kind: 'unproven' }
  /** Somebody already holds the new number. */
  | { kind: 'taken' }
  /** Any refusal that wrote a sentence this half should print verbatim. */
  | { kind: 'refused'; detail: string }
  | { kind: 'unknown' };

export class AccountApiError extends Error {
  constructor(readonly failure: AccountFailure) {
    super(`inclineyou account ${failure.kind}`);
    this.name = 'AccountApiError';
  }
}

/** Body first, then the header. Never a NaN into a countdown. */
function waitSeconds(body: ProblemDetail, header: number | null, fallback: number): number {
  return Math.round(body.retryAfterSeconds ?? header ?? fallback);
}

function classify(status: number, body: ProblemDetail, header: number | null): AccountFailure {
  const code = body.code?.toUpperCase();

  // The OTP three, in the order `lib/auth/api.ts` reads them. A lock is checked
  // before a bare 429, because this endpoint's 429 means two unrelated things —
  // exactly the ambiguity `readSendFailure` was written for — and a throttle is
  // the cheaper of the two to be wrong about.
  if (code === 'OTP_LOCKED') return { kind: 'locked', retryAfterSeconds: waitSeconds(body, header, 600) };
  if (code === 'OTP_THROTTLED' || status === 429) {
    return { kind: 'throttled', retryAfterSeconds: waitSeconds(body, header, 30) };
  }
  if (code === 'OTP_EXPIRED' || status === 410) return { kind: 'expired' };
  if (code === 'OTP_WRONG' || status === 422) {
    const left = typeof body.attemptsLeft === 'number' ? body.attemptsLeft : null;
    return { kind: 'wrong', attemptsLeft: left };
  }

  // The account three.
  if (code === 'PHONE_CHANGE_UNPROVEN') return { kind: 'unproven' };
  if (code === 'PHONE_TAKEN') return { kind: 'taken' };

  // Anything else that wrote a sentence. Spring prefixes the field name onto
  // bean-validation details ("phone: must be a valid…"), which is not something
  // to show anyone — the same strip `lib/profile/api.ts` applies.
  const raw = typeof body.detail === 'string' ? body.detail.trim() : '';
  const detail = raw.replace(/^[A-Za-z_][\w.]*:\s*/, '').trim();
  if (detail && detail.length <= 160) {
    return { kind: 'refused', detail: detail.charAt(0).toUpperCase() + detail.slice(1) };
  }

  // A session that expired mid-flow reads as a bug otherwise: the screen is
  // demonstrably signed in, and "that didn't work" names nothing.
  if (status === 401 || status === 403) {
    return { kind: 'refused', detail: 'Your session expired. Sign in again.' };
  }
  return { kind: 'unknown' };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  if (!token) throw new AccountApiError({ kind: 'refused', detail: 'Your session expired. Sign in again.' });

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AccountApiError({ kind: 'offline' });
  }

  if (!res.ok) {
    let body: ProblemDetail = {};
    try {
      const json: unknown = await res.json();
      if (json !== null && typeof json === 'object') body = json as ProblemDetail;
    } catch {
      // A proxy that stripped the body. The status is all we get.
    }
    const raw = Number(res.headers.get('retry-after'));
    const header = Number.isFinite(raw) && raw > 0 ? raw : null;
    throw new AccountApiError(classify(res.status, body, header));
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/* ─────────────────────────────────────────────────────────────── the read ── */

/**
 * The three facts the Account screen is about.
 *
 * Not `Identity` from `lib/profile/api.ts`, though it comes off the same
 * response: that interface is nineteen fields wide because the profile draws
 * nineteen, and a screen that renders three of them should say three. It is also
 * the difference that keeps the two save paths honest — a component holding an
 * `Account` cannot accidentally PATCH a bio back.
 */
export interface Account {
  name: string;
  /** The login. Ten digits, as stored — the screen formats it. */
  phone: string;
  /** A contact address, and NOT a login. `''` for never answered. V36. */
  email: string;
}

interface TrainerWire {
  name: string;
  phone: string | null;
  email?: string | null;
}

export async function getAccount(): Promise<Account> {
  const t = await request<TrainerWire>('/v1/trainers/me');
  return {
    // At first verify the backend writes the PHONE NUMBER into `trainer.name`
    // as a placeholder, so a name equal to its phone is an absence rather than
    // an answer. The same guard `lib/profile/api.ts` and the phone's
    // `profileSync.ts` both apply — and it matters more here than there,
    // because this screen draws the name and the number one above the other.
    name: t.name === t.phone ? '' : t.name,
    phone: t.phone ?? '',
    email: t.email ?? '',
  };
}

/**
 * The name and the email, and nothing else on the profile.
 *
 * Two keys, because every field on the backend's `UpdateRequest` is nullable and
 * means *leave it alone* — so this cannot disturb a bio, a certification list or
 * a working week it never drew. The profile's own tabs make the same argument at
 * length in `lib/profile/actions.ts`; this is that rule reaching one level up.
 */
export async function patchAccount(patch: { name?: string; email?: string }): Promise<Account> {
  const t = await request<TrainerWire>('/v1/trainers/me', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return { name: t.name === t.phone ? '' : t.name, phone: t.phone ?? '', email: t.email ?? '' };
}

/* ──────────────────────────────────────────────────── changing the number ── */

/** 1 · a code to the number they are signed in with. */
export async function challengeCurrentPhone(): Promise<void> {
  await request<void>('/v1/trainers/me/phone/challenge', { method: 'POST' });
}

/** 2 · that code back. The ticket is the proof step 1 happened. */
export async function verifyCurrentPhone(otp: string): Promise<string> {
  const res = await request<{ ticket: string }>('/v1/trainers/me/phone/verify', {
    method: 'POST',
    body: JSON.stringify({ otp }),
  });
  return res.ticket;
}

/** 3 · the new number. Refused here if it is taken, before an SMS is spent. */
export async function requestNewPhone(ticket: string, phone: string): Promise<void> {
  await request<void>('/v1/trainers/me/phone/request', {
    method: 'POST',
    body: JSON.stringify({ ticket, phone }),
  });
}

/**
 * 4 · the code from the new number, and the swap.
 *
 * Answers a fresh token, which the caller must write to the cookie: the old one
 * carries the old number in its `phone` claim, and a seven-day token that
 * disagrees with the row about who it belongs to is a thing to replace rather
 * than to reason about later.
 */
export async function confirmNewPhone(
  ticket: string,
  phone: string,
  otp: string,
): Promise<{ phone: string; token: string }> {
  return request<{ phone: string; token: string }>('/v1/trainers/me/phone/confirm', {
    method: 'POST',
    body: JSON.stringify({ ticket, phone, otp }),
  });
}

/* ────────────────────────────────────────────────────────── closing it down ── */

/**
 * Soft delete, with the number typed back as the proof.
 *
 * A body on a DELETE, which is unusual and is the correct shape: the
 * confirmation is a proof rather than an identifier, and a query string would
 * write the trainer's own number into every access log between here and the
 * server.
 */
export async function deleteAccount(confirmPhone: string): Promise<void> {
  await request<void>('/v1/trainers/me', {
    method: 'DELETE',
    body: JSON.stringify({ confirmPhone }),
  });
}
