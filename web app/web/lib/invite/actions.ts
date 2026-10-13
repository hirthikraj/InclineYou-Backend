'use server';

import { ApiError, api } from '@/lib/http/client';

import { setToken } from '@/lib/auth/session';

import { clearSitting, getSitting, setSitting } from './cookie';

/**
 * *Send me a code* — api-contract 1.2, inv-a2 (`POST /v1/invites/{token}/code`).
 *
 * The browser sends a date and the notice it was shown; this server sends them on and keeps what comes back in the sealed
 * invite cookie, so neither the date of birth nor the code's id ever sits in a URL or in script the page can read. The number is
 * not here: it is the one the trainer entered, and the server will not take another.
 */
export type SendResult =
  | { ok: true; resendAfterSeconds: number }
  | { ok: false; kind: 'age' | 'unavailable' | 'consent' | 'throttled' | 'invalid' | 'unreachable'; message: string; retryAfterSeconds?: number };

interface Requested {
  requestId: string;
  expiresAt: number;
  resendAfterSeconds: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function sendInviteCode(token: string, dateOfBirth: string, policyVersion: string): Promise<SendResult> {
  if (!DATE.test(dateOfBirth)) return { ok: false, kind: 'invalid', message: 'Enter your date of birth as day, month and year.' };

  let issued: Requested;
  try {
    issued = await api<Requested>(`/v1/invites/${encodeURIComponent(token)}/code`, {
      method: 'POST',
      auth: false,
      body: { dateOfBirth, policyVersion },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return readFailure(error);
  }

  await setSitting({
    token,
    requestId: issued.requestId,
    dateOfBirth,
    policyVersion,
    resendAt: Date.now() + issued.resendAfterSeconds * 1000,
  });
  return { ok: true, resendAfterSeconds: issued.resendAfterSeconds };
}

function readFailure(e: ApiError): Extract<SendResult, { ok: false }> {
  const code = e.problem.code;
  if (e.status === null) {
    return { ok: false, kind: 'unreachable', message: 'We couldn’t reach the server. Check your connection and try again.' };
  }
  // The server's own sentence for the age requirement is the neutral one the contract specifies; it is shown as sent.
  if (code === 'AGE_REQUIREMENT') return { ok: false, kind: 'age', message: e.problem.detail ?? 'This isn’t available for you. Please talk to your trainer.' };
  if (code === 'INVITE_UNAVAILABLE') {
    return { ok: false, kind: 'unavailable', message: 'This invite isn’t available any more. Ask your trainer to send it again.' };
  }
  if (code === 'CONSENT_REQUIRED') {
    return { ok: false, kind: 'consent', message: 'The privacy notice was updated while this page was open. Reload it and try again.' };
  }
  if (e.status === 429) {
    return { ok: false, kind: 'throttled', message: 'A code was sent a moment ago. Wait a little before asking for another.' };
  }
  if (e.status === 400) return { ok: false, kind: 'invalid', message: e.problem.detail ?? 'That date doesn’t look right.' };
  return { ok: false, kind: 'unreachable', message: 'Something went wrong on our side. Try again in a moment.' };
}

/**
 * *Send it again* — the same call, from the sitting. The date and notice are in the sealed cookie, so the page that asks for a
 * resend never has to hold them: it names the link and nothing else.
 */
export async function resendInviteCode(token: string): Promise<SendResult> {
  const sitting = await getSitting(token);
  if (!sitting) return { ok: false, kind: 'unavailable', message: 'That took too long. Start again from your invite.' };
  return sendInviteCode(token, sitting.dateOfBirth, sitting.policyVersion);
}

/**
 * *This isn't for me* — api-contract 1.2, inv-a4 (`POST /v1/invites/{token}/decline`). No code, no sitting: declining proves
 * nothing and grants nothing. The server answers 204 for every link, live or not, so the only failure worth saying is that it
 * could not be reached.
 */
export async function declineInvite(token: string): Promise<{ ok: boolean; message?: string }> {
  try {
    await api(`/v1/invites/${encodeURIComponent(token)}/decline`, { method: 'POST', auth: false, body: {} });
    // The sealed sitting is deliberately NOT cleared here. Changing a cookie inside a server action re-renders the route, and the
    // route would now read the link as dead and replace the page before the person had seen that their answer went through. It
    // is token-bound, sealed, httpOnly, gone in thirty minutes, and useless once the link is dead (the verify page checks the
    // link before it reads it), so leaving it costs nothing the next page load does not already refuse.
    return { ok: true };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { ok: false, message: 'We couldn’t reach the server, so nothing was changed. Try again in a moment.' };
  }
}

/**
 * *Let me in* — api-contract 1.2, inv-a3 (`POST /v1/invites/{token}/accept`).
 *
 * The code is the only thing the browser sends: the request it answers, the date of birth and the notice come from the sealed
 * sitting. A success arrives with a client session, which goes straight into the httpOnly cookie and is not in what this
 * returns — the browser is told where to go, not what it was given.
 */
export type AcceptResult =
  | { ok: true; next: string }
  | {
      ok: false;
      kind: 'wrong' | 'expired' | 'locked' | 'restart' | 'age' | 'unavailable' | 'another-trainer' | 'consent' | 'unreachable';
      message: string;
      attemptsLeft?: number;
      retryAfterSeconds?: number;
    };

interface Accepted {
  token: string;
  expiresAt: number;
}

export async function acceptInvite(token: string, otp: string): Promise<AcceptResult> {
  if (!/^\d{6}$/.test(otp)) return { ok: false, kind: 'wrong', message: 'Enter the six digits we sent.' };
  const sitting = await getSitting(token);
  if (!sitting) {
    return { ok: false, kind: 'restart', message: 'That took too long, so we cleared it. Start again from your invite.' };
  }

  let accepted: Accepted;
  try {
    accepted = await api<Accepted>(`/v1/invites/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      auth: false,
      body: {
        requestId: sitting.requestId,
        otp,
        dateOfBirth: sitting.dateOfBirth,
        policyVersion: sitting.policyVersion,
      },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return readAcceptFailure(error);
  }

  await setToken(accepted.token, accepted.expiresAt);
  await clearSitting();
  return { ok: true, next: '/me/today' };
}

function readAcceptFailure(e: ApiError): Extract<AcceptResult, { ok: false }> {
  const code = e.problem.code;
  if (e.status === null) {
    return { ok: false, kind: 'unreachable', message: 'We couldn’t reach the server. Nothing was changed — try again.' };
  }
  if (code === 'OTP_WRONG') {
    const left = e.problem.attemptsLeft;
    return {
      ok: false,
      kind: 'wrong',
      attemptsLeft: left,
      message: left === undefined ? 'That code isn’t right.' : `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
    };
  }
  if (code === 'OTP_EXPIRED') return { ok: false, kind: 'expired', message: 'That code has run out. Ask for a new one.' };
  if (code === 'OTP_LOCKED') {
    return {
      ok: false,
      kind: 'locked',
      retryAfterSeconds: e.problem.retryAfterSeconds,
      message: 'Too many wrong tries. Wait a little, then ask for a new code.',
    };
  }
  if (code === 'OTP_REQUEST_NOT_FOUND') {
    return { ok: false, kind: 'restart', message: 'That code is no longer valid. Go back and ask for a new one.' };
  }
  if (code === 'AGE_REQUIREMENT') return { ok: false, kind: 'age', message: e.problem.detail ?? 'This isn’t available for you. Please talk to your trainer.' };
  if (code === 'ALREADY_WITH_A_TRAINER') {
    return { ok: false, kind: 'another-trainer', message: 'You’re already with a trainer. Leave them in your settings first, then use this link again.' };
  }
  if (code === 'CONSENT_REQUIRED') {
    return { ok: false, kind: 'consent', message: 'The privacy notice was updated while this page was open. Start again from your invite.' };
  }
  if (code === 'INVITE_UNAVAILABLE') {
    return { ok: false, kind: 'unavailable', message: 'This invite isn’t available any more. Ask your trainer to send it again.' };
  }
  return { ok: false, kind: 'unreachable', message: 'Something went wrong on our side. Try again in a moment.' };
}

/**
 * *Let me in* from a number that has ALREADY signed in — api-contract 1.2, inv-a7 (`POST /v1/me/invites/{inviteId}/accept`).
 *
 * No code and no sitting: the session cookie (a pending token, or a removed client's) is the proof, and the call goes out with it.
 * What comes back is a client session, which replaces that cookie — the credential this call came in on is retired by the server.
 * The date of birth is the only thing typed, and the notice is the version the card showed.
 */
export async function acceptMyInvite(inviteId: string, dateOfBirth: string, policyVersion: string): Promise<AcceptResult> {
  if (!DATE.test(dateOfBirth)) return { ok: false, kind: 'wrong', message: 'Enter your date of birth as day, month and year.' };
  let accepted: Accepted;
  try {
    accepted = await api<Accepted>(`/v1/me/invites/${encodeURIComponent(inviteId)}/accept`, {
      method: 'POST',
      body: { dateOfBirth, policyVersion },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 401) return { ok: false, kind: 'restart', message: 'Your sign-in ran out. Sign in again to continue.' };
    return readAcceptFailure(error);
  }
  await setToken(accepted.token, accepted.expiresAt);
  return { ok: true, next: '/me/today' };
}

/** *This isn't for me* from a signed-in number: 204 for every id, so the only failure worth saying is that it could not be reached. */
export async function declineMyInvite(inviteId: string): Promise<{ ok: boolean; message?: string }> {
  try {
    await api(`/v1/me/invites/${encodeURIComponent(inviteId)}/decline`, { method: 'POST', body: {} });
    return { ok: true };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 401) return { ok: false, message: 'Your sign-in ran out. Sign in again to continue.' };
    return { ok: false, message: 'We couldn’t reach the server, so nothing was changed. Try again in a moment.' };
  }
}
