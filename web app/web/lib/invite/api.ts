import 'server-only';

import { api, ApiError } from '@/lib/http/client';

/**
 * THE INVITE LINK'S READ — api-contract 1.2, inv-a1 (`GET /v1/invites/{token}`).
 *
 * Public: the link is the credential, so there is no token cookie on this call and `auth: false` says so. It reads only — a
 * link is opened by things that merely look at it — and every dead link (unknown, expired, revoked, replaced, declined) is the
 * same `{state: 'expired'}` with a 200, so the page never has a reason to tell them apart and neither does anyone guessing.
 */
export interface InviteTrainer {
  name: string;
  headline: string | null;
  bio: string | null;
  /** The canonical 11-character id, not a URL: the page builds the link, so nothing here is an embed. */
  introVideoId: string | null;
  certifications: string[];
  specialities: string[];
  languages: string[];
  /** `@arun.fit`, or null. */
  instagramHandle: string | null;
  youtubeHandle: string | null;
}

export type InviteCard =
  | { state: 'expired' }
  | { state: 'used' }
  | {
      state: 'valid';
      inviteId: string;
      /** `•••••2119` — the last four, and the only part of the number the page ever holds. */
      phoneMasked: string;
      expiresAt: number;
      trainer: InviteTrainer;
      /** The notice in force, sent back when the client accepts. */
      policyVersion: string;
      /** Plain lines of what the trainer can see. Data, so the wording can follow the lawyer without a deploy. */
      privacySummary: string[];
    };

/**
 * `null` where the server could not be reached: the page says *try again*, which is a different sentence from *this link no
 * longer works*, and a client who is told their link is dead when the API was down asks their trainer for a new one for nothing.
 */
export async function getInviteCard(token: string): Promise<InviteCard | null> {
  try {
    return await api<InviteCard>(`/v1/invites/${encodeURIComponent(token)}`, { auth: false });
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }
}

/** One invite waiting for the number that signed in — enough to choose between several. Never a token. */
export interface WaitingInvite {
  inviteId: string;
  trainerName: string;
  headline: string | null;
  expiresAt: number;
}

/**
 * THE SIGNED-IN NUMBER'S OWN INVITES — api-contract 1.2, inv-a6 (`GET /v1/me/invites`, `…/{inviteId}`).
 *
 * The login page found invites waiting for a number that has just proved itself (D-16), so there is no link and no second code:
 * the credential is the session cookie, a `pending` token or a removed client's. `null` where the call failed for any reason
 * (including a session that has lapsed), so the page can say *sign in again* rather than draw an empty list as a fact.
 */
export async function getMyInvites(): Promise<WaitingInvite[] | null> {
  try {
    return (await api<{ items: WaitingInvite[] }>('/v1/me/invites')).items;
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }
}

export async function getMyInvite(inviteId: string): Promise<InviteCard | null> {
  try {
    return await api<InviteCard>(`/v1/me/invites/${encodeURIComponent(inviteId)}`);
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }
}
