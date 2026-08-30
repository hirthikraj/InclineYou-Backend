'use server';

import { revalidatePath } from 'next/cache';

import {
  ClientDetailApiError,
  extendPackage,
  pausePackage,
  renewPackage,
  resumePackage,
  sellPackage,
} from './client-api';

/**
 * THE PACKAGE WRITE PATH — the commercial engine's five verbs.
 *
 * Sell · Renew · Pause · Resume · Extend. Every one of them straight to the
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
 * as a layout, because the ledger, the owed tab and the price list's *Ending
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
}

/**
 * SELL A PACK — the write that did not exist.
 *
 * Until this pass, nothing on this half could create a package except *Renew* on
 * Today's queue, which needed a pack to already be there. Every *Sell a pack*
 * button led to a panel that could only record a payment against a package that
 * did not exist, and said "Sell one first" with nothing to click. This is the
 * "first".
 *
 * `packId` is what makes the price list a mechanism rather than a document: the
 * type, the count, the price and the validity window all come off the entry, and
 * `package.pack_id` finally gets written — which is what `pack.activeClients`
 * has been counting all along and finding zero.
 */
export async function assignPackage(
  clientId: string,
  input: {
    packId?: string | null;
    type?: string;
    sessionsTotal?: number | null;
    amount?: number;
    startDate?: string | null;
    discountAmount?: number | null;
    dueDate?: string | null;
  },
): Promise<PackageResult> {
  // Only checked when the price list is not filling it in. A pack chosen off the
  // list carries its own price, and demanding one here would make the picker
  // pointless.
  if (!input.packId && !(input.amount && input.amount > 0)) {
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
 * RENEW — one tap, standing on a gym floor.
 *
 * The empty-object default is the feature. Same terms, and the new pack starts
 * where the old one stopped: renewed early it begins the day after the current
 * one lapses, so the client is not charged twice for the same fortnight; renewed
 * late it begins today, because back-dating would hand back validity nobody had.
 * `PackageService.renewPackage` carries the three cases.
 */
export async function renewPack(
  clientId: string,
  packageId: string,
  overrides: {
    packId?: string | null;
    sessionsTotal?: number | null;
    amount?: number;
    discountAmount?: number | null;
    dueDate?: string | null;
  } = {},
): Promise<PackageResult> {
  try {
    await renewPackage(packageId, overrides);
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'The renewal');
  }
}

/**
 * STOP THE CLOCK — the client is travelling.
 *
 * `effectiveAt` is a plain `YYYY-MM-DD` from a date input, sent as an ISO
 * instant at the start of that day. Trainers catch up on Sundays, and a pause
 * backdated to the Thursday the client actually left gives back the right number
 * of days when it resumes.
 */
export async function pausePack(
  clientId: string,
  packageId: string,
  input: { reason?: string; effectiveDate?: string } = {},
): Promise<PackageResult> {
  try {
    await pausePackage(packageId, {
      reason: input.reason ?? null,
      effectiveAt: isoDayStart(input.effectiveDate),
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
  input: { reason?: string; effectiveDate?: string } = {},
): Promise<PackageResult> {
  try {
    await resumePackage(packageId, {
      reason: input.reason ?? null,
      effectiveAt: isoDayStart(input.effectiveDate),
    });
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
  if (!Number.isFinite(days) || days <= 0 || days > 365) {
    return { ok: false, message: 'Extend by a number of days between 1 and 365.' };
  }
  try {
    await extendPackage(packageId, Math.round(days), reason ?? null);
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'That extension');
  }
}

/**
 * `2026-08-14` → the ISO instant of that local midnight, or null.
 *
 * Local rather than UTC, and the difference is a whole day at this longitude: a
 * trainer in IST picking the 14th means the 14th where they are, and
 * `new Date('2026-08-14')` parses as UTC midnight — which is 05:30 on the 14th
 * in India, but reads back as the 13th anywhere west of Greenwich. The
 * three-argument constructor is local by definition and has no such ambiguity.
 */
function isoDayStart(date?: string): string | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
