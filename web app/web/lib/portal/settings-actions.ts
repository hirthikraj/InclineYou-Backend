'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { clearToken } from '@/lib/auth/session';
import { ApiError, api } from '@/lib/http/client';

import type { PrefsWire } from './settings-api';

/**
 * The writes of the client's settings and the way out (api-contract 1.2, ps-a1 … ps-a4). One result shape; the server owns every sentence a refusal
 * needs, and a write that did not reach it says nothing was changed.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; message: string; code?: string };

const UNREACHABLE = 'We couldn’t reach the server. Nothing was changed — try again when you’re back online.';

async function run<T>(call: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await call() };
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (e.status === null) return { ok: false, message: UNREACHABLE };
    if (e.status === 412) return { ok: false, message: 'This changed on another device. Reload to see it, then try again.', code: 'PRECONDITION_FAILED' };
    return { ok: false, message: e.problem.detail ?? 'That didn’t save. Nothing changed — try again.', code: e.problem.code };
  }
}

export interface PrefsChange {
  hideWeight?: boolean;
  autoRestTimer?: boolean;
  notify?: Partial<PrefsWire['notify']>;
  channels?: Partial<PrefsWire['channels']>;
  nominee?: { name: string; phone: string } | null;
}

/** Names only what changed, so a tap on one switch cannot clobber another. */
export async function savePrefs(change: PrefsChange, version: string) {
  const res = await run(() => api<PrefsWire>('/v1/portal/prefs', { method: 'PATCH', body: change, headers: { 'if-match': `"${version}"` } }));
  if (res.ok) revalidatePath('/me/account/settings');
  return res;
}

/** Leaving ends one arrangement; the client keeps their account and can still take their data. */
export async function leaveTrainer() {
  const res = await run(() => api<{ access: string }>('/v1/portal/leave', { method: 'POST', body: { confirm: true } }));
  if (res.ok) redirect('/sign-in/removed');
  return res;
}

/** Step one of closing the account: a code to the number they are signed in with. */
export async function sendDeletionCode() {
  return run(() => api('/v1/auth/step-up', { method: 'POST', body: { purpose: 'account_deletion' } }));
}

export async function verifyDeletionCode(otp: string) {
  return run(() => api<{ ticket: string; expiresAt: number }>('/v1/auth/step-up/verify', { method: 'POST', body: { purpose: 'account_deletion', otp } }));
}

/** Step two: the ticket closes the account. Every session ends with it, so this one's cookie goes too and they land on sign-in. */
export async function deleteAccount(ticket: string) {
  const res = await run(() => api('/v1/portal/me', { method: 'DELETE', headers: { 'x-step-up-ticket': ticket } }));
  if (!res.ok) return res;
  await clearToken();
  redirect('/sign-in');
}

export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent: string }) {
  return run(() => api<{ id: string }>('/v1/portal/push-subscriptions', { method: 'POST', body: { id: crypto.randomUUID(), ...sub } }));
}

export async function removePushSubscription(id: string) {
  return run(() => api(`/v1/portal/push-subscriptions/${id}`, { method: 'DELETE' }));
}
