'use server';

import { revalidatePath } from 'next/cache';

import { MoneyApiError, patch, post } from './api';

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
 * Record a payment against a package.
 *
 * `paidAt` is the one that changed the meaning of this call. It used to send
 * three fields and the server wrote every row `pending`, so a trainer who had
 * just been handed cash recorded a debt — the payments list's *Collected* never moved,
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

/**
 * SETTLE A PENDING ROW — the call the whole book was missing.
 *
 * `recordPayment` above notes that a row left `pending` "only counted if someone
 * remembered to confirm it from a screen that has no confirm button". This is
 * that button's other half. Until it existed, the Pending tab was a list a trainer
 * could message forever and never clear: the only way to make ₹9,000 of debt go
 * away was to record a SECOND payment for the same package, which double-counts
 * *Billed* and leaves the original row pending anyway.
 *
 * ── THE METHOD IS REQUIRED, AND THAT IS THE DESIGN ───────────────────────────
 *
 * The endpoint would take a bare confirm. The UI does not offer one, because a
 * confirmed row with `method = null` is exactly what draws "— · floor" in the
 * payments table's *How* column — an em-dash where the answer to "how did they pay me"
 * should be. A trainer marking a row paid has just been handed cash or watched a
 * UPI notification; they know which, and asking costs one click on a menu they
 * already opened. See `PaymentRowMenu.tsx`.
 *
 * `paidAt` is stamped here rather than left to the server so the payments list's date
 * is the moment the trainer said the money arrived, which is the moment they can
 * check against their own memory.
 */
export async function markPaid(
  paymentId: string,
  input: { method: string; paidAt?: number; upiReference?: string },
): Promise<MoneyWriteResult> {
  try {
    await patch(`/v1/payments/${paymentId}/confirm`, {
      method: input.method,
      paidAt: input.paidAt ?? Date.now(),
      ...(input.upiReference ? { upiReference: input.upiReference } : {}),
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error, 'Marking it paid');
  }
}

/**
 * LET IT GO — and the row stays.
 *
 * A write-off is not a delete and the copy says so everywhere it is offered,
 * because the button otherwise reads like one. The row keeps its amount, its
 * client and its date; it changes status, drops out of *Pending*, stops counting as
 * collected, and turns up on the *Write-offs* tab and in the CA export. That tab
 * has existed since this screen was the money book and, until this call, nothing
 * anywhere in the product could put a single row on it.
 *
 * The reason is optional and it is free text on purpose. "He moved to Pune" is
 * the sentence a trainer will want in front of them in March when their CA asks
 * about a ₹9,000 gap, and a fixed list of reasons would not have contained it.
 */
export async function writeOffPayment(
  paymentId: string,
  reason?: string,
): Promise<MoneyWriteResult> {
  try {
    await patch(`/v1/payments/${paymentId}/write-off`, {
      ...(reason ? { reason } : {}),
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error, 'The write-off');
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
