'use server';

import { revalidatePath } from 'next/cache';

import { ApiError, api } from '@/lib/http/client';

import type { PortalMeWire } from './me';

/**
 * The three writes a client makes about themselves (api-contract 1.2, p-a4 and p-a5): their details, "I have seen that this ended",
 * and the privacy notice in force. The server owns every sentence a refusal needs, so a `detail` is shown as sent.
 */
export type MyDetailsWire = NonNullable<PortalMeWire['myDetails']>;

export interface DetailsChange {
  name?: string;
  goal?: string | null;
  heightCm?: number | null;
  timezone?: string;
  activityLevel?: string | null;
}

export type SaveDetailsResult =
  | { ok: true; details: MyDetailsWire }
  | { ok: false; message: string; stale?: boolean };

const UNREACHABLE = 'We couldn’t reach the server. Nothing was saved — check your connection and try again.';

function refusal(e: ApiError): { message: string; stale?: boolean } {
  if (e.status === null) return { message: UNREACHABLE };
  if (e.status === 412) return { message: 'Your details changed somewhere else since you opened this. Reload to see them, then edit again.', stale: true };
  if (e.problem.code === 'PORTAL_PAUSED' || e.problem.code === 'PORTAL_REMOVED') {
    return { message: 'Your access has changed, so this wasn’t saved. Reload the page.', stale: true };
  }
  return { message: e.problem.detail ?? 'We couldn’t save that. Nothing changed — try again.' };
}

/** Sends only what changed, and the version it was drawn from, so a second tab cannot be silently overwritten. */
export async function saveMyDetails(change: DetailsChange, version: string): Promise<SaveDetailsResult> {
  try {
    const details = await api<MyDetailsWire>('/v1/portal/me', { method: 'PATCH', body: change, headers: { 'if-match': `"${version}"` } });
    revalidatePath('/me', 'layout');
    return { ok: true, details };
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return { ok: false, ...refusal(e) };
  }
}

/** The removed wall was seen. Idempotent on the server, so a double press is harmless. */
export async function acknowledgeRemoval(): Promise<{ ok: boolean; message?: string }> {
  try {
    await api('/v1/portal/ack', { method: 'POST', body: {} });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return { ok: false, message: e.status === null ? UNREACHABLE : 'We couldn’t record that just now. Nothing changed — try again.' };
  }
  revalidatePath('/sign-in/removed');
  return { ok: true };
}

/** Accepts the notice in force. A stale version is refused by the server (`CONSENT_REQUIRED`), never accepted at the wrong one. */
export async function acceptPortalNotice(version: string): Promise<{ ok: boolean; message?: string }> {
  try {
    await api('/v1/portal/consent', { method: 'POST', body: { policyVersion: version } });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (e.problem.code === 'CONSENT_REQUIRED') return { ok: false, message: 'The notice was updated while you were reading. Reload to read the current one.' };
    return { ok: false, message: e.status === null ? UNREACHABLE : 'We couldn’t record that just now. Nothing changed — try again.' };
  }
  revalidatePath('/me', 'layout');
  return { ok: true };
}
