'use server';

import { revalidatePath } from 'next/cache';

import { MoneyApiError, post } from './api';

export interface MoneyWriteResult {
  ok: boolean;
  message?: string;
}

function fail(error: unknown, subject: string): MoneyWriteResult {
  if (error instanceof MoneyApiError) {
    if (error.status === null) {
      return { ok: false, message: `${subject} could not reach the server. Nothing changed.` };
    }
    if (error.status === 401 || error.status === 403) {
      return { ok: false, message: 'Your session expired. Sign in again.' };
    }
    if (error.status === 404) {
      return { ok: false, message: `${subject}: the package was not found.` };
    }
    return { ok: false, message: `${subject} did not go through. Nothing changed.` };
  }
  return { ok: false, message: `${subject} did not go through. Nothing changed.` };
}

function refresh(): void {
  revalidatePath('/business', 'layout');
  revalidatePath('/today');
}

/**
 * Record a payment against a package.
 *
 * `paidAt` is the one that changed the meaning of this call. It used to send
 * three fields and the server wrote every row `pending`, so a trainer who had
 * just been handed cash recorded a debt — the ledger's *Collected* never moved,
 * and the money only counted if someone remembered to confirm it from a screen
 * that has no confirm button. Sending the date the money changed hands writes it
 * `paid` and stamps the gym's cut in the same statement.
 *
 * It is optional here for the one case that is genuinely still pending: a UPI
 * intent fired at a client who has not paid yet.
 */
export async function recordPayment(input: {
  packageId: string;
  amount: number;
  method: string;
  collectedBy: 'trainer' | 'gym';
  /** Epoch ms — when the money arrived. Omit for a payment still awaited. */
  paidAt?: number;
  upiReference?: string;
  note?: string;
}): Promise<MoneyWriteResult> {
  try {
    await post(`/v1/packages/${input.packageId}/payments`, {
      amount: input.amount,
      method: input.method,
      collectedBy: input.collectedBy,
      ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
      ...(input.upiReference ? { upiReference: input.upiReference } : {}),
      ...(input.note ? { note: input.note } : {}),
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error, 'The payment');
  }
}

/** Send a payment reminder nudge via WhatsApp. */
export async function sendReminder(clientId: string): Promise<MoneyWriteResult & { whatsappUrl?: string }> {
  try {
    const res = await post<{ nudgeId: string; whatsappUrl: string; message: string }>(
      `/v1/clients/${clientId}/nudge`,
      { templateName: 'payment_reminder' },
    );
    refresh();
    return { ok: true, whatsappUrl: res?.whatsappUrl };
  } catch (error) {
    return fail(error, 'The reminder');
  }
}
