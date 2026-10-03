/**
 * The wire types for sign-in, from api-contract v1.1 *Sign in* and the
 * `ProblemDetail`s in `exception/GlobalExceptionHandler.java`.
 *
 * Optionality here mirrors `app/src/api/auth.ts`, and it is not defensive
 * padding: the backend evolves additively and never removes a response field,
 * so a field that is absent means an older server rather than a broken one,
 * and each one below says what its absence used to mean.
 */

/** Which screen this sign-in is owed. */
export type Role =
  | 'trainer'
  | 'client'
  /** Verified and on nobody's roster. The token is good for one thing: claiming a trainer account. */
  | 'pending'
  /** V18 · named by a trainer, has agreed to nothing. Token opens accept and decline, and no sync scope. */
  | 'invited'
  /** V18 · a trainer ended it and this person has not been told yet. Shown once. */
  | 'removed'
  /** V18 · every membership answered and gone. Deliberately not `pending`. */
  | 'unattached'
  /** V18 · reserved. Nothing mints one yet. */
  | 'gym_admin'
  /** LEGACY · a backend before the pause fix, which sent this with no token. */
  | 'paused';

/**
 * The three sign-ins that end at a wall rather than at an app.
 *
 * ── WHY THIS EXISTS: THE TOKEN CANNOT SAY WHICH ──────────────────────────────
 *
 * `AuthService.clientView` mints `generateInvited(phone)` for **all three** of a
 * real invite, an unacknowledged removal and a fully unattached number — so the
 * JWT's `role` claim reads `invited` for every one of them, while the response's
 * own `role` field distinguishes them. `readClaims` therefore cannot tell a
 * client who has an invite to accept from one who has nothing at all, and those
 * two owe opposite screens: one is a door, the other is a wall.
 *
 * The distinction exists in exactly one place — the verify response — so it is
 * recorded there, in a cookie, and read by the wall pages. Same argument as
 * `lib/setup/skipped.ts`: this is a fact about a SITTING, not about the account.
 * It is deliberately short-lived, because a bookmark to a wall a week later
 * deserves a fresh sign-in rather than a stale sentence.
 */
export type WallKind = 'unattached' | 'removed' | 'paused';

/** One roster this number is on. A person can legitimately be on two. */
export interface Membership {
  clientId: string;
  trainerId: string;
  clientName: string;
  trainerName: string;
  gymName: string | null;
  trainerPhone: string | null;
  /** The TRAINER's view: `active` | `paused`. Absent on a backend before the pause fix. */
  status?: string;
  /** V18 · the CLIENT's own answer: `invited` | `accepted` | `declined` | `paused` | `removed`. */
  membershipStatus?: string;
  pausedOn?: string | null;
}

/**
 * What `POST /v1/auth/otp/verify` and `POST /v1/trainers` answer — api-contract
 * *Sign in*. Instants are epoch milliseconds.
 *
 * Only two roles are ever minted in v1: a trainer, or `pending` (a number with
 * no account yet). A number that is only somebody's client is refused with
 * `403 CLIENT_SIGN_IN_UNAVAILABLE` and gets no credential at all.
 */
export interface AuthResponse {
  /** On the web an opaque `xs_…` session; a `pending` sign-in gets a 15-minute JWT instead. */
  token: string;
  /** `web_session.id` — "this device" in Settings. Null for the pending JWT, which has no row. */
  sessionId: string | null;
  expiresAt: number;
  role: 'trainer' | 'pending';
  isNewUser: boolean;
  trainerId: string | null;
  trainerName: string | null;
  /** Null until onboarding is finished — the only answer to "does this trainer owe setup". */
  setupCompletedAt: number | null;
  /** What this number accepted. Null for a number with no account. */
  privacyPolicyVersion: string | null;
  /** What is in force. A mismatch with the above sends them to `/sign-in/consent`. */
  currentPolicyVersion: string;
}

/** `POST /v1/auth/otp/request` → 200. The id carries no phone number. */
export interface OtpRequested {
  requestId: string;
  expiresAt: number;
  /** The next rung of the resend ladder, as the server computes it. */
  resendAfterSeconds: number;
}

/**
 * Where the WhatsApp message is, for the "Didn't get it?" line.
 * `delivered` and `read` are for a provider webhook that is not wired yet, so
 * today a request goes `queued → sent` or `failed`.
 */
export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

/**
 * What the browser is told after a verify. Deliberately NOT `AuthResponse`:
 * `token` is stripped on the server and set as an httpOnly cookie, so the JWT
 * never exists in browser JavaScript. See `lib/auth/session.ts`.
 */
export type VerifyResult =
  | { ok: true; next: string; role: Role; trainerName: string | null }
  | { ok: false; failure: OtpFailure };

export type RequestResult =
  | { ok: true; resendAfterSeconds: number }
  | { ok: false; failure: SendFailure };

/**
 * What frame 3a's "I'm a trainer" answers with.
 *
 * `next` rather than a token, for the same reason `VerifyResult` carries a
 * destination: the call mints a trainer JWT and it is set as an httpOnly cookie
 * on the server, so it never exists in browser JavaScript.
 *
 * One `message` and no failure taxonomy — unlike `OtpFailure`, whose five cases
 * each owe a different recovery. Everything that can go wrong here means *try
 * again*, and the sentence's real job is to say that no account was created,
 * because a button that creates one is a button somebody presses twice when they
 * cannot tell.
 *
 * Declared here rather than in `actions.ts` because that file is `'use server'`:
 * every export of such a module becomes a callable endpoint, and while a `type`
 * is erased before that matters, the file's own convention is that its shapes
 * live in this one.
 */
export type ClaimResult = { ok: true; next: string } | { ok: false; message: string };

/**
 * The four refusals a verify can answer with, and the two a request can.
 *
 * Both endpoints answer 429 for two unrelated things, which is why every reader
 * below branches on the `code` field first and falls back to the status only
 * for a proxy that stripped the body. Classifying on the status alone turns a
 * 30-second wait into a ten-minute lockout screen.
 */
export type OtpFailure =
  /** 401 · OTP_WRONG — a digit was mistyped. Spends an attempt. */
  | { kind: 'wrong'; attemptsLeft: number | null }
  /** 401 · OTP_EXPIRED, or 404 OTP_REQUEST_NOT_FOUND (superseded or used) — the clock's doing, not the trainer's. Spends nothing. */
  | { kind: 'expired' }
  /** 429 · OTP_LOCKED — three wrong codes. Owes a countdown. */
  | { kind: 'locked'; retryAfterSeconds: number }
  /** The request never reached the server. */
  | { kind: 'offline' }
  | { kind: 'unknown' };

export type SendFailure =
  /** 429 · OTP_THROTTLED — too many codes asked for, not too many wrong. Spends nothing. */
  | { kind: 'throttled'; retryAfterSeconds: number }
  /** 429 · OTP_LOCKED — asking for a code on a locked number. Sends no message. */
  | { kind: 'locked'; retryAfterSeconds: number }
  /** 400 · PHONE_INVALID — the number failed `^\+91[6-9]\d{9}$` at the server. */
  | { kind: 'invalid'; detail: string | null }
  | { kind: 'offline' }
  | { kind: 'unknown' };
