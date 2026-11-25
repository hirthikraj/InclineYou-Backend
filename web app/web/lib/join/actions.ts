'use server';

import { revalidatePath } from 'next/cache';

import { api, ApiError } from '@/lib/http/client';
import { clearJoinSitting, getJoinSitting, setJoinSitting } from './cookie';
import type { JoinAnswer, JoinLinkWire, JoinLinkWrite, JoinRequestWire } from './types';

/* ── the trainer ──────────────────────────────────────────────────────────── */

export type SaveResult = { ok: true; link: JoinLinkWire } | { ok: false; message: string; field?: 'slug' };

/** jl-a2 — the whole form. */
export async function saveJoinLink(write: JoinLinkWrite): Promise<SaveResult> {
  try {
    const link = await api<JoinLinkWire>('/v1/join-link', { method: 'PUT', body: write });
    revalidatePath('/clients/join-link');
    revalidatePath('/clients/joining');
    return { ok: true, link };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.problem.code === 'JOIN_SLUG_TAKEN') return { ok: false, field: 'slug', message: 'That link is taken. Try another.' };
    return { ok: false, ...failure(error, 'Your changes'), field: error.problem.detail?.startsWith('slug') ? 'slug' : undefined };
  }
}

export type ApproveResult =
  | { ok: true; clientId: string; packId: string | null; checkInSent: boolean }
  | { ok: false; message: string };

/** jl-a4 — the request becomes a client. */
export async function approveJoinRequest(id: string): Promise<ApproveResult> {
  try {
    const r = await api<{ clientId: string; packId: string | null; checkInSent: boolean }>(
      `/v1/join-requests/${encodeURIComponent(id)}/approve`, { method: 'POST', body: {} });
    revalidatePath('/clients/joining');
    revalidatePath('/clients');
    return { ok: true, ...r };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { ok: false, ...failure(error, 'Approving') };
  }
}

export type DeclineResult = { ok: true; request: JoinRequestWire } | { ok: false; message: string };

/** jl-a5. Nothing is sent to the person. */
export async function declineJoinRequest(id: string): Promise<DeclineResult> {
  try {
    const request = await api<JoinRequestWire>(`/v1/join-requests/${encodeURIComponent(id)}/decline`, { method: 'POST', body: {} });
    revalidatePath('/clients/joining');
    return { ok: true, request };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { ok: false, ...failure(error, 'Declining') };
  }
}

function failure(e: ApiError, subject: string): { message: string } {
  if (e.status === null) return { message: `${subject} could not reach the server. Nothing changed.` };
  if (e.status === 401 || e.status === 403) return { message: 'Your session expired. Sign in again.' };
  if (e.problem.detail) return { message: e.problem.detail };
  return { message: `${subject} did not go through. Nothing changed.` };
}

/* ── the public page ──────────────────────────────────────────────────────── */

export type CodeResult =
  | { ok: true; resendAfterSeconds: number }
  | { ok: false; kind: 'age' | 'closed' | 'phone' | 'consent' | 'throttled' | 'invalid' | 'unreachable'; message: string; retryAfterSeconds?: number };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** jn-a2 — the code to the number they typed. Only the code's id is kept, sealed; the number is the key it is kept under. */
export async function sendJoinCode(slug: string, phone: string, dateOfBirth: string, policyVersion: string): Promise<CodeResult> {
  if (!DATE.test(dateOfBirth)) return { ok: false, kind: 'invalid', message: 'Enter your date of birth as day, month and year.' };
  let issued: { requestId: string; resendAfterSeconds: number };
  try {
    issued = await api(`/v1/join/${encodeURIComponent(slug)}/code`, {
      method: 'POST', auth: false, body: { phone, dateOfBirth, policyVersion },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const code = error.problem.code;
    if (error.status === null) return { ok: false, kind: 'unreachable', message: 'We couldn’t reach the server. Check your connection and try again.' };
    if (code === 'AGE_REQUIREMENT') return { ok: false, kind: 'age', message: error.problem.detail ?? 'This isn’t available for you.' };
    if (code === 'JOIN_CLOSED') return { ok: false, kind: 'closed', message: 'This page isn’t taking new clients right now.' };
    if (code === 'PHONE_INVALID') return { ok: false, kind: 'phone', message: 'Enter a 10-digit Indian mobile number.' };
    if (code === 'CONSENT_REQUIRED') return { ok: false, kind: 'consent', message: 'The privacy notice was updated while this page was open. Reload it and try again.' };
    if (error.status === 429) {
      return { ok: false, kind: 'throttled', retryAfterSeconds: error.problem.retryAfterSeconds, message: 'A code was sent a moment ago. Wait a little before asking for another.' };
    }
    if (error.status === 400) return { ok: false, kind: 'invalid', message: error.problem.detail ?? 'Check what you entered.' };
    return { ok: false, kind: 'unreachable', message: 'Something went wrong on our side. Try again in a moment.' };
  }
  await setJoinSitting({ slug, requestId: issued.requestId, phone, resendAt: Date.now() + issued.resendAfterSeconds * 1000 });
  return { ok: true, resendAfterSeconds: issued.resendAfterSeconds };
}

export interface JoinSubmission {
  phone: string;
  name: string;
  email: string | null;
  dateOfBirth: string;
  gender: string | null;
  packId: string | null;
  answers: JoinAnswer[];
  policyVersion: string;
  whatsappReminders: boolean;
}

export type SubmitResult =
  | { ok: true; result: 'received' | 'updated'; trainerName: string | null }
  | {
      ok: false;
      kind: 'wrong' | 'expired' | 'locked' | 'restart' | 'closed' | 'plan' | 'already' | 'invited' | 'another-trainer' | 'unavailable' | 'age' | 'full' | 'invalid' | 'unreachable';
      message: string;
    };

/** jn-a3 — the code, and everything the form asked. */
export async function submitJoinRequest(slug: string, otp: string, s: JoinSubmission): Promise<SubmitResult> {
  if (!/^\d{6}$/.test(otp)) return { ok: false, kind: 'wrong', message: 'Enter the six digits we sent.' };
  const sitting = await getJoinSitting(slug, s.phone);
  if (!sitting) return { ok: false, kind: 'restart', message: 'That took too long. Ask for a new code.' };
  let done: { result: 'received' | 'updated'; trainerName: string | null };
  try {
    done = await api(`/v1/join/${encodeURIComponent(slug)}/requests`, {
      method: 'POST', auth: false,
      // The form will not send without the fit-to-train tick (V42), so reaching here means it was ticked.
      body: { requestId: sitting.requestId, otp, ...s, trainingTerms: true },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const code = error.problem.code;
    if (error.status === null) return { ok: false, kind: 'unreachable', message: 'We couldn’t reach the server. Nothing was sent — try again.' };
    if (code === 'OTP_WRONG') {
      const left = error.problem.attemptsLeft;
      return { ok: false, kind: 'wrong', message: left === undefined ? 'That code isn’t right.' : `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.` };
    }
    if (code === 'OTP_EXPIRED') return { ok: false, kind: 'expired', message: 'That code has run out. Ask for a new one.' };
    if (code === 'OTP_LOCKED') return { ok: false, kind: 'locked', message: 'Too many wrong tries. Wait a little, then ask for a new code.' };
    if (code === 'OTP_REQUEST_NOT_FOUND') return { ok: false, kind: 'restart', message: 'That code is no longer valid. Ask for a new one.' };
    if (code === 'JOIN_CLOSED') return { ok: false, kind: 'closed', message: 'This page stopped taking new clients while you were filling it in.' };
    if (code === 'JOIN_PLAN_UNAVAILABLE') return { ok: false, kind: 'plan', message: 'That plan isn’t offered any more. Pick another.' };
    if (code === 'JOIN_INVITE_WAITING') return { ok: false, kind: 'invited', message: 'Your trainer has already invited you. Open the invite link they sent you on WhatsApp — that’s how you join.' };
    if (code === 'JOIN_ASK_FOR_INVITE') return { ok: false, kind: 'invited', message: 'Your trainer has already added you. Ask them to send you an invite link on WhatsApp, then open it to join.' };
    if (code === 'JOIN_ALREADY_CLIENT') return { ok: false, kind: 'already', message: 'You’re already on this trainer’s list — sign in with your number instead.' };
    if (code === 'ALREADY_WITH_A_TRAINER') return { ok: false, kind: 'another-trainer', message: 'You’re already with a trainer on InclineYou. Leave them in your settings first, then use this page.' };
    if (code === 'JOIN_NUMBER_UNAVAILABLE') return { ok: false, kind: 'unavailable', message: 'This number is a trainer’s account, so it can’t join as a client.' };
    if (code === 'AGE_REQUIREMENT') return { ok: false, kind: 'age', message: error.problem.detail ?? 'This isn’t available for you.' };
    if (code === 'JOIN_FULL') return { ok: false, kind: 'full', message: 'This trainer has a lot of requests waiting. Try again in a few days.' };
    if (error.status === 400) return { ok: false, kind: 'invalid', message: error.problem.detail ?? 'Check what you entered.' };
    return { ok: false, kind: 'unreachable', message: 'Something went wrong on our side. Try again in a moment.' };
  }
  await clearJoinSitting();
  return { ok: true, ...done };
}
