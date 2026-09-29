'use server';

import { revalidatePath } from 'next/cache';

import {
  ClientDetailApiError,
  markPaymentPaid as markPaidV1,
  recordPayment as recordV1,
  writeOffPayment as writeOffV1,
} from '@/lib/clients/client-api';

import { MoneyApiError, post } from './api';

export interface MoneyWriteResult {
  ok: boolean;
  message?: string;
}

function fail(error: unknown, subject: string): MoneyWriteResult {
  /* The v1 writers answer with the server's own sentence — "₹4,000 is all
     that's owed on this pack" — which beats any line written here. */
  if (error instanceof ClientDetailApiError) {
    if (error.status === 401) return { ok: false, message: 'Your session expired. Sign in again.' };
    if (error.detail) return { ok: false, message: error.detail };
    if (error.status === null) return { ok: false, message: `${subject} could not reach the server. Nothing changed.` };
    return { ok: false, message: `${subject} did not go through. Nothing changed.` };
  }
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

/**
 * THE THREE PLACES THE SAME MONEY IS DRAWN.
 *
 * `/clients` was missing, and it was missing for as long as these actions have
 * existed — because until this pass no screen under it called one. The client
 * file's Payments tab now records, settles and bills from the same writers the
 * money book uses, and `force-dynamic` is not enough on its own: a server
 * action that does not revalidate leaves the tab showing the balance it had
 * before the trainer was handed the cash.
 *
 * `'layout'` on both, because the figures appear on the section's list as well
 * as inside one client's file.
 */
function refresh(): void {
  revalidatePath('/business', 'layout');
  revalidatePath('/clients', 'layout');
  revalidatePath('/today');
}

/**
 * The Business screens still speak their old method words — `bank`, and `gym`
 * for *the gym's desk took it*. v1 has `bank_transfer`, and a gym's desk is not
 * a method at all: the database stamps `collectedBy` from the client's type and
 * a gym-collected row carries no method (R75). So `gym` goes out as null.
 */
function v1Method(method: string | null | undefined): 'upi' | 'cash' | 'bank_transfer' | null {
  if (!method || method === 'gym') return null;
  if (method === 'bank') return 'bank_transfer';
  return method as 'upi' | 'cash' | 'bank_transfer';
}

/**
 * Record a payment against a package — `POST /v1/packages/{id}/payments`.
 *
 * `paidAt` decides the status: sent, the row is `paid` on that instant; left
 * out, it is `pending` — the one case that is genuinely still awaited. The
 * amount goes out as a decimal string (money is never a float on the wire), and
 * `collectedBy` is not sent: the server refuses it as an unknown key, because
 * it is the database's to stamp. `id` is minted by the caller when its sheet
 * opens, so a retried tap answers the payment the first one made.
 */
export async function recordPayment(input: {
  id?: string;
  packageId: string;
  amount: number;
  method: string | null;
  /** Kept for the Business panel's signature; the server stamps who collected. */
  collectedBy?: 'trainer' | 'gym';
  /** Epoch ms — when the money arrived. Omit for a payment still awaited. */
  paidAt?: number;
  upiReference?: string;
  note?: string;
}): Promise<MoneyWriteResult> {
  const method = v1Method(input.method);
  try {
    await recordV1(input.packageId, {
      id: input.id ?? crypto.randomUUID(),
      amount: input.amount.toFixed(2),
      method,
      reference: method && method !== 'cash' ? input.upiReference ?? null : null,
      status: input.paidAt !== undefined ? 'paid' : 'pending',
      paidAt: input.paidAt ?? null,
      note: input.note ?? null,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error, 'The payment');
  }
}

/**
 * SETTLE A PENDING ROW — `POST /v1/payments/{id}/paid`.
 *
 * The method is asked for rather than left off: a paid row with no method draws
 * an em-dash where *how did they pay me* should be. `paidAt` is the moment the
 * trainer said the money arrived. A retried tap on a row already paid the same
 * way answers 200; paid a different way is a 409 whose sentence says use Edit.
 */
export async function markPaid(
  paymentId: string,
  input: { method: string | null; paidAt?: number; upiReference?: string },
): Promise<MoneyWriteResult> {
  try {
    await markPaidV1(paymentId, {
      method: v1Method(input.method),
      reference: input.upiReference ?? null,
      paidAt: input.paidAt ?? Date.now(),
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error, 'Marking it paid');
  }
}

/**
 * LET IT GO — and the row stays. `POST /v1/payments/{id}/write-off`.
 *
 * Nothing is deleted: the row keeps its amount and date, drops out of what is
 * owed, stops counting as collected. The reason is free text on purpose and the
 * server appends it to the row's note — "He moved to Pune" is the sentence a CA
 * asks about in March.
 */
export async function writeOffPayment(
  paymentId: string,
  reason?: string,
): Promise<MoneyWriteResult> {
  try {
    await writeOffV1(paymentId, reason ?? null);
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error, 'The write-off');
  }
}

/** Send a payment reminder nudge via WhatsApp. */
export async function sendReminder(clientId: string): Promise<MoneyWriteResult & { whatsappUrl?: string }> {
  try {
    // 1.1: the MESSAGING-tier draft route; the id makes a retry answer the stored row.
    const res = await post<{ id: string; whatsappUrl: string; message: string }>(
      `/v1/clients/${encodeURIComponent(clientId)}/nudges`,
      { id: crypto.randomUUID(), template: 'payment_reminder' },
    );
    refresh();
    return { ok: true, whatsappUrl: res?.whatsappUrl };
  } catch (error) {
    return fail(error, 'The reminder');
  }
}

/**
 * RAISE A BILL FOR A PAYMENT THAT IS ALREADY RECORDED.
 *
 * Not "create an invoice": nothing is created. The payment exists, the money
 * moved, and this puts a filing number on it so the person who paid has a
 * document. That is why it is a POST to the payment rather than to a collection
 * of its own — see `PaymentRow.invoiceNo` in the mock for why an invoice here
 * is a column and not a table.
 *
 * ── THE REFUSAL IS THE INTERESTING RETURN VALUE ─────────────────────────────
 *
 * A gym-collected payment comes back **409** with a sentence written to be
 * shown as it stands. The screen already hides the verb for a gym client, so in
 * practice this fires for a stale tab or a client whose arrangement changed
 * between the render and the click — exactly the cases where a generic "that
 * did not go through" would leave a trainer clicking it again. So the server's
 * own `detail` is preferred over the local copy whenever it sends one.
 */
export async function issueInvoice(
  paymentId: string,
): Promise<MoneyWriteResult & { invoiceNo?: string }> {
  try {
    const res = await post<{ invoiceNo: string | null }>(`/v1/payments/${paymentId}/invoice`, {});
    refresh();
    return { ok: true, invoiceNo: res?.invoiceNo ?? undefined };
  } catch (error) {
    if (error instanceof MoneyApiError && (error.status === 409 || error.status === 422)) {
      return { ok: false, message: error.detail ?? 'That payment cannot be invoiced.' };
    }
    return fail(error, 'The invoice');
  }
}
