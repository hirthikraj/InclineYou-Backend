'use server';

import { revalidatePath } from 'next/cache';

import {
  cancelPackage,
  ClientDetailApiError,
  deletePayment,
  extendPackage,
  patchPayment,
  pausePackage,
  refundPackage,
  renewPackage,
  resumePackage,
  sellPackage,
  writeOffPackage,
  type SaleInput,
} from './client-api';

/**
 * THE PACKAGE WRITE PATH — a pack's life and the corrections to its money book.
 *
 * Sell · Renew · Pause · Resume · Extend · End, and Write off · Refund · Edit ·
 * Delete a payment (api-contract 1.1 Client file, R73). Every one of them straight to the
 * server, because this half is online-only and there is no queue to hold a
 * commercial fact in.
 *
 * ── WHY THE SERVER'S SENTENCE IS PREFERRED OVER OURS ────────────────────────
 *
 * `PackageRuleException` writes refusals for a trainer to read — "That pack is
 * already paused", "That pack has no expiry date, so there is nothing to extend.
 * It runs until the sessions are used." Inventing a second opinion here about a
 * rule the server owns is how the two drift, so `fail` prints the server's
 * `detail` whenever there is one and only falls back to a shape of its own when
 * there is not. Same rule `lib/packs/actions.ts` applies to the price list.
 *
 * ── AND WHY 409 GETS ITS OWN BRANCH ─────────────────────────────────────────
 *
 * A 409 on this path means the world moved between the render and the click —
 * somebody paused it on the phone, or the lifecycle sweep closed it. That is not
 * the trainer's mistake and the recovery is not to fix the form, so it says so
 * and the page revalidates underneath them.
 *
 * ── AND EVERY CREATE CARRIES AN ID THE BROWSER MINTED ───────────────────────
 *
 * A sale, a renewal, a write-off and a refund each make a row, and each takes
 * the id its sheet minted when it opened (`crypto.randomUUID()`), kept across
 * retries. A double tap or a timeout-then-retry answers the row the first
 * attempt made (200) rather than selling or refunding twice (Conventions).
 */

export interface PackageResult {
  ok: boolean;
  message?: string;
}

function fail(error: unknown, subject: string): PackageResult {
  if (error instanceof ClientDetailApiError) {
    if (error.status === null) {
      return { ok: false, message: `${subject} could not reach the server. Nothing changed.` };
    }
    if (error.status === 401 || error.status === 403) {
      return { ok: false, message: 'Your session expired. Sign in again.' };
    }
    // The server wrote this for the trainer. See the note above.
    if (error.detail) return { ok: false, message: error.detail };
    if (error.status === 404) {
      return { ok: false, message: `${subject}: that pack is no longer on your books.` };
    }
    if (error.status === 409) {
      return { ok: false, message: `${subject}: that pack has moved on. Reload and look again.` };
    }
    return { ok: false, message: `${subject} did not go through. Nothing changed.` };
  }
  return { ok: false, message: `${subject} did not go through. Nothing changed.` };
}

/**
 * A pack reaches four surfaces, so four things are revalidated.
 *
 * The file itself is `'layout'` because every tab is a route and the header's
 * pack chip is drawn on all six. Beyond it: `/today`, whose queue is built from
 * packs running low and whose *Renew* row this write is what closes; `/business`
 * as a layout, because Payments, the Pending tab and the price list's *Ending
 * soon* and `activeClients` count all move; and `/clients`, whose roster draws
 * the *pack running low* attention band.
 *
 * Wider than the notes path on purpose — a note changes no total, and a pack
 * changes nearly all of them.
 */
function refresh(clientId: string): void {
  revalidatePath(`/clients/${clientId}`, 'layout');
  revalidatePath('/business', 'layout');
  revalidatePath('/today');
  revalidatePath('/clients');
  /* Ending a pack or pausing it changes which sessions will be charged, and the
     schedule's panel says so. */
  revalidatePath('/schedule');
}

/**
 * SELL A PACK — `POST /v1/clients/{id}/packages` (Clients A7).
 *
 * Off the price list the pack's terms win — name, service, basis, count, price,
 * validity — and only a start date and a discount are sent. A custom sale sends
 * the terms. It does not book sessions any more: the client's week is its own
 * resource (`PUT /v1/clients/{id}/schedule`, set in the add flow), and a second
 * pack sold to somebody who comes on Tuesdays is charged on those Tuesdays.
 */
export async function assignPackage(clientId: string, input: SaleInput): Promise<PackageResult> {
  // Only checked when the price list is not filling it in.
  if (!input.packId && !(Number(input.amount) > 0)) {
    return { ok: false, message: 'A pack needs a price.' };
  }
  try {
    await sellPackage(clientId, input);
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'That pack');
  }
}

/**
 * RENEW — one tap, standing on a gym floor. The server copies the terms (the
 * pack's current ones if it came off a live price-list entry, else the old
 * package's own) and starts it today unless told otherwise.
 */
export async function renewPack(
  clientId: string,
  packageId: string,
  input: { id: string; startDate?: string | null },
): Promise<PackageResult> {
  try {
    await renewPackage(packageId, input);
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'The renewal');
  }
}

/**
 * STOP THE CLOCK — the client is travelling.
 *
 * `effectiveDate` is a plain `YYYY-MM-DD` from a date input, sent as epoch ms
 * at the start of that day — or not at all when it is today, so the server
 * stamps now. Trainers catch up on Sundays, and a pause backdated to the
 * Thursday the client actually left gives back the right number of days when
 * it resumes. The server refuses a future one.
 */
export async function pausePack(
  clientId: string,
  packageId: string,
  input: { reason?: string; effectiveDate?: string } = {},
): Promise<PackageResult> {
  try {
    await pausePackage(packageId, {
      reason: input.reason?.trim() || null,
      effectiveAt: dayStart(input.effectiveDate),
    });
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'Pausing that pack');
  }
}

export async function resumePack(
  clientId: string,
  packageId: string,
  input: { effectiveDate?: string } = {},
): Promise<PackageResult> {
  try {
    // Resume takes no reason on the wire — the pause carried it.
    await resumePackage(packageId, { effectiveAt: dayStart(input.effectiveDate) });
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'Restarting that pack');
  }
}

/** Goodwill, in days. The reason is what makes it a fact next time. */
export async function extendPack(
  clientId: string,
  packageId: string,
  days: number,
  reason?: string,
): Promise<PackageResult> {
  if (!Number.isFinite(days) || days <= 0 || days > 3650) {
    return { ok: false, message: 'Extend by a number of days between 1 and 3,650.' };
  }
  try {
    await extendPackage(packageId, Math.round(days), reason?.trim() || null);
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'That extension');
  }
}

/**
 * END THIS PACK — `POST /v1/packages/{id}/cancel` (R74).
 *
 * Only once nothing is owed and nothing is pending; otherwise the server says
 * 409 PACKAGE_HAS_DUES and this says what to do about it. Sessions left on it
 * are simply no longer charged.
 */
export async function endPack(clientId: string, packageId: string): Promise<PackageResult> {
  try {
    await cancelPackage(packageId);
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    if (error instanceof ClientDetailApiError && error.code === 'PACKAGE_HAS_DUES') {
      return { ok: false, message: 'Money is still owed on this pack. Collect it or write it off first.' };
    }
    return fail(error, 'Ending that pack');
  }
}

/** WRITE OFF WHAT'S OWED — `amount: null` forgives all of it, pending rows included. */
export async function writeOffOwed(
  clientId: string,
  packageId: string,
  input: { id: string; amount: string | null; note?: string },
): Promise<PackageResult> {
  try {
    await writeOffPackage(packageId, { id: input.id, amount: input.amount, note: input.note?.trim() || null });
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'The write-off');
  }
}

/** REFUND — a fully paid pack, once, and it closes for good. */
export async function refundPack(
  clientId: string,
  packageId: string,
  input: { id: string; amount: string; method: string | null; reference?: string; note?: string },
): Promise<PackageResult> {
  try {
    await refundPackage(packageId, {
      id: input.id,
      amount: input.amount,
      method: input.method,
      reference: input.method && input.method !== 'cash' ? input.reference?.trim() || null : null,
      note: input.note?.trim() || null,
    });
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'The refund');
  }
}

/** EDIT A PAYMENT TYPED WRONG — only the fields its status allows; If-Match on its version. */
export async function editPayment(
  clientId: string,
  paymentId: string,
  patch: { amount?: string; method?: string | null; reference?: string | null; paidAt?: number; note?: string | null },
  version: string,
): Promise<PackageResult> {
  try {
    await patchPayment(paymentId, patch, version);
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    if (error instanceof ClientDetailApiError && error.status === 412) {
      return { ok: false, message: 'That payment changed since you opened it. Reload and look again.' };
    }
    return fail(error, 'That correction');
  }
}

/** DELETE — a payment recorded by mistake. Soft; the pack's balance goes back up. */
export async function removePayment(clientId: string, paymentId: string): Promise<PackageResult> {
  try {
    await deletePayment(paymentId);
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'Deleting that payment');
  }
}

/**
 * `2026-08-14` → epoch ms of that local midnight; null for today or nothing, so
 * the server stamps the instant itself.
 *
 * Local rather than UTC, and the difference is a whole day at this longitude:
 * `new Date('2026-08-14')` parses as UTC midnight. The three-argument
 * constructor is local by definition.
 */
function dayStart(date?: string): number | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const t = new Date();
  if (d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()) return null;
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}
