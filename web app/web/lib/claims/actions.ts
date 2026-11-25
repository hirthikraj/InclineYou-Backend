'use server';

import { revalidatePath } from 'next/cache';

import { ApiError, api } from '@/lib/http/client';
import type { ConfirmInput, PaymentClaimWire } from './types';

/**
 * "I'VE PAID", BOTH SIDES OF IT (V50; api-contract 1.2, pc-l1…pc-l4 and pm-a1/pm-a2). Server actions, because the browser
 * never reaches Spring (AGENTS *Talking to the backend*).
 *
 * The server writes its refusals for a person to read — "₹2,000 is all that's left on this pack", "This was paid before a
 * pack was sold. Sell the pack it pays for, then confirm." — so `fail` passes its `detail` through rather than inventing a
 * second sentence about a rule the server owns (the same call `lib/clients/package-actions.ts` makes). `code` rides along
 * for the one branch a screen takes on it: `CLAIM_NEEDS_PACKAGE` opens the sale instead of showing an error.
 */

export type ClaimResult<T = PaymentClaimWire> =
  | { ok: true; data: T }
  | { ok: false; message: string; code?: string };

function fail(error: unknown, subject: string): { ok: false; message: string; code?: string } {
  if (!(error instanceof ApiError)) throw error;
  if (error.status === null) return { ok: false, message: `${subject} — we couldn’t reach the server. Nothing changed.` };
  if (error.status === 401) return { ok: false, message: 'Your session expired. Sign in again.' };
  const code = error.problem.code;
  if (error.problem.detail) return { ok: false, message: error.problem.detail, code };
  if (error.status === 404) return { ok: false, message: `${subject} — that report is no longer there.`, code };
  return { ok: false, message: `${subject} didn’t go through. Nothing changed.`, code };
}

/* ── the trainer ──────────────────────────────────────────────────────── */

/** pc-l1 — the To confirm queue (or one client's). `null` when it could not be read: the card then says nothing rather than "none". */
export async function loadClaims(status: 'open' | 'confirmed' | 'declined' = 'open', clientId?: string): Promise<PaymentClaimWire[] | null> {
  const q = new URLSearchParams({ status });
  if (clientId) q.set('clientId', clientId);
  try {
    return (await api<{ items: PaymentClaimWire[] }>(`/v1/payment-claims?${q}`)).items;
  } catch (e) {
    if (e instanceof ApiError) return null;
    throw e;
  }
}

/** pc-l2 — it arrived. Records the payment; answers the confirmed claim and the payment's id (what Undo deletes). */
export async function confirmClaim(id: string, input: ConfirmInput): Promise<ClaimResult<{ claim: PaymentClaimWire; paymentId: string }>> {
  try {
    const r = await api<{ claim: PaymentClaimWire; payment: { id: string } }>(`/v1/payment-claims/${id}/confirm`, { method: 'POST', body: input });
    revalidatePath('/business', 'layout');
    revalidatePath('/clients', 'layout');
    return { ok: true, data: { claim: r.claim, paymentId: r.payment.id } };
  } catch (e) {
    return fail(e, 'Confirming that payment');
  }
}

/** pc-l3 — not received. The reason, if any, is what the client reads. */
export async function declineClaim(id: string, reason: string | null): Promise<ClaimResult> {
  try {
    const r = await api<PaymentClaimWire>(`/v1/payment-claims/${id}/decline`, { method: 'POST', body: reason ? { reason } : {} });
    revalidatePath('/business', 'layout');
    return { ok: true, data: r };
  } catch (e) {
    return fail(e, 'Marking it not received');
  }
}

/** pc-l4 — Undo of "not received". */
export async function reopenClaim(id: string): Promise<ClaimResult> {
  try {
    const r = await api<PaymentClaimWire>(`/v1/payment-claims/${id}/reopen`, { method: 'POST', body: {} });
    revalidatePath('/business', 'layout');
    return { ok: true, data: r };
  } catch (e) {
    return fail(e, 'Undo');
  }
}

/** Undo of a confirm is the money book's own: deleting the payment it recorded puts the report back to waiting (A8). */
export async function undoConfirm(paymentId: string): Promise<{ ok: boolean; message?: string }> {
  try {
    await api(`/v1/payments/${paymentId}`, { method: 'DELETE' });
    revalidatePath('/business', 'layout');
    revalidatePath('/clients', 'layout');
    return { ok: true };
  } catch (e) {
    return fail(e, 'Undo');
  }
}

/* ── the client (portal) ──────────────────────────────────────────────── */

export interface ReportInput {
  /** Minted when the sheet opened and kept across retries, so a double tap is one report. */
  id: string;
  packageId: string | null;
  amount: string;
  paidOn: string;
  reference: string | null;
  note: string | null;
}

/** pm-a1 — "I've paid". */
export async function reportPayment(input: ReportInput): Promise<ClaimResult> {
  const body: Record<string, unknown> = { id: input.id, amount: input.amount, paidOn: input.paidOn };
  if (input.packageId) body.packageId = input.packageId;
  if (input.reference) body.reference = input.reference;
  if (input.note) body.note = input.note;
  try {
    const r = await api<PaymentClaimWire>('/v1/portal/payment-claims', { method: 'POST', body });
    revalidatePath('/me', 'layout');
    return { ok: true, data: r };
  } catch (e) {
    return fail(e, 'Sending that');
  }
}

/** pm-a2 — "I tapped it by mistake". Only while it is still waiting. */
export async function withdrawReport(id: string): Promise<{ ok: boolean; message?: string }> {
  try {
    await api(`/v1/portal/payment-claims/${id}`, { method: 'DELETE' });
    revalidatePath('/me', 'layout');
    return { ok: true };
  } catch (e) {
    return fail(e, 'Taking it back');
  }
}
