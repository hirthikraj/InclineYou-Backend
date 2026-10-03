'use server';

import { revalidatePath } from 'next/cache';

import { getToken } from '@/lib/auth/session';
import type { Period } from '@/lib/money/period';

import {
  BusinessApiError,
  getGymMoney,
  getLedgerPage,
  getSummary,
  send,
  parseArrangement,
  type ArrangementWire,
  type PayoutWire,
  listPickableClients,
  listPickablePackages,
} from './api';
import type {
  Arrangement,
  GymMoney,
  Payout,
  LedgerFilter,
  LedgerPage,
  MoneySummary,
  PickableClient,
  PickablePackage,
} from './types';

/**
 * THE READS A BUSINESS PAGE MAKES AFTER IT HAS LOADED.
 *
 * The period is state in `PeriodScope` — a layout, so it survives moving between
 * the section's pages — which means the server cannot know it when it renders. The
 * page opens on the current month and every later change of period, chip or page
 * of the ledger comes through one of these. They are server actions and not route
 * handlers because that is how the rest of this half talks to Spring: the browser
 * asks Next, Next holds the token.
 *
 * Every one answers a value and never throws across the boundary, so a failed read
 * is a sentence on the screen rather than an error overlay.
 */
export type Loaded<T> = { ok: true; data: T } | { ok: false; message: string };

async function load<T>(work: () => Promise<T>): Promise<Loaded<T>> {
  // A signed-out browser cannot be told from a server that said no unless it is
  // checked first, and the sentence for the two is different.
  if (!(await getToken())) return { ok: false, message: 'Your session expired. Sign in again.' };
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    if (error instanceof BusinessApiError) {
      if (error.status === 401 || error.status === 403) {
        return { ok: false, message: 'Your session expired. Sign in again.' };
      }
      if (error.status === null) return { ok: false, message: 'Could not reach the server. Nothing changed.' };
    }
    return { ok: false, message: 'That did not load. Try again.' };
  }
}

export async function loadSummary(period: Period): Promise<Loaded<MoneySummary>> {
  return load(() => getSummary(period));
}

/** A new view of the ledger — a period or a chip changed — so it is the first page, with the count. */
export async function loadLedgerView(input: {
  period: Period;
  now: number;
  filter: LedgerFilter;
}): Promise<Loaded<{ summary: MoneySummary; page: LedgerPage }>> {
  return load(async () => {
    const [summary, page] = await Promise.all([
      getSummary(input.period),
      getLedgerPage({ ...input, includeTotal: true }),
    ]);
    return { summary, page };
  });
}

/**
 * Next and Previous: a page by cursor, never re-counted — and the one caller that
 * DOES re-count is a reload after a write, because a write is what changes the count
 * (`includeTotal` is one indexed COUNT, so it is asked for only then).
 */
export async function loadLedgerPage(input: {
  period: Period;
  now: number;
  filter: LedgerFilter;
  cursor: string | null;
  includeTotal?: boolean;
}): Promise<Loaded<LedgerPage>> {
  return load(() => getLedgerPage(input));
}

/** The record panel's two lazy reads: who a payment can be for, then which package of theirs. */
export async function loadClientsForPanel(): Promise<Loaded<PickableClient[]>> {
  return load(listPickableClients);
}

export async function loadPackagesForPanel(clientId: string): Promise<Loaded<PickablePackage[]>> {
  return load(() => listPickablePackages(clientId));
}


/* ------------------------------------------------------------------- gym share ── */

/** The gym page's one read after load: a new period. */
export async function loadGym(input: { period: Period; now: number }): Promise<Loaded<GymMoney>> {
  return load(() => getGymMoney(input.period, input.now));
}

/**
 * THE GYM PAGE'S WRITES — pay terms and payouts.
 *
 * Each answers the sentence for the server's code rather than the code, because
 * every refusal here has a cause a trainer can act on: terms already started,
 * terms that overlap, a payout with nothing to be kept against. Anything else is
 * the server's own `detail` (a 400 is written for this screen) or a plain
 * "nothing changed".
 */
export type Written<T = null> = { ok: true; data: T } | { ok: false; message: string; code?: string };

const BY_CODE: Record<string, string> = {
  ARRANGEMENT_NEEDS_GYM: 'Add your gym first, then set the pay terms with it.',
  ARRANGEMENT_OVERLAP: 'Those terms overlap a period that already has terms. Start them after the running terms began.',
  ARRANGEMENT_STARTED: 'Those terms have already started, so the fee is history. Set new terms from a later month instead.',
  ARRANGEMENT_REQUIRED: 'Record the gym’s pay terms first — a payout is kept against them.',
  ID_CONFLICT: 'That could not be saved. Reload the page and try again.',
};

async function write<T>(work: () => Promise<T>): Promise<Written<T>> {
  if (!(await getToken())) return { ok: false, message: 'Your session expired. Sign in again.' };
  try {
    const data = await work();
    revalidatePath('/business', 'layout');
    return { ok: true, data };
  } catch (error) {
    if (error instanceof BusinessApiError) {
      if (error.status === 401 || error.status === 403) {
        return { ok: false, message: 'Your session expired. Sign in again.' };
      }
      if (error.status === null) return { ok: false, message: 'Could not reach the server. Nothing changed.' };
      if (error.code && BY_CODE[error.code]) return { ok: false, message: BY_CODE[error.code], code: error.code };
      if (error.status === 404) return { ok: false, message: 'That is no longer there. Reload the page.', code: 'NOT_FOUND' };
      if (error.status === 412) return { ok: false, message: 'That changed somewhere else. Reload and try again.', code: 'PRECONDITION_FAILED' };
      if (error.detail) return { ok: false, message: error.detail, code: error.code ?? undefined };
    }
    return { ok: false, message: 'That did not go through. Nothing changed.' };
  }
}

const dec = (v: number) => v.toFixed(2);

/** New pay terms. The id is minted by the form, so a retry replays the same create. */
export async function setArrangement(input: {
  id: string;
  baseKind: 'minimum' | 'basic' | null;
  baseAmount: number;
  startsMonth: string;
  note: string | null;
}): Promise<Written<Arrangement>> {
  return write(async () => parseArrangement(await send<ArrangementWire>('/v1/gym-arrangements', {
    method: 'POST',
    body: {
      id: input.id,
      baseKind: input.baseKind,
      baseAmount: dec(input.baseKind === null ? 0 : input.baseAmount),
      startsMonth: input.startsMonth,
      note: input.note,
    },
  })));
}

/** Fix terms whose first month has not ended. Only the keys sent change. */
export async function fixArrangement(
  id: string,
  patch: { baseKind?: 'minimum' | 'basic' | null; baseAmount?: number; note?: string | null },
): Promise<Written<Arrangement>> {
  return write(async () => parseArrangement(await send<ArrangementWire>(`/v1/gym-arrangements/${id}`, {
    method: 'PATCH',
    body: {
      ...(patch.baseKind !== undefined ? { baseKind: patch.baseKind } : {}),
      ...(patch.baseAmount !== undefined ? { baseAmount: dec(patch.baseAmount) } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
    },
  })));
}

export async function removeArrangement(id: string): Promise<Written> {
  return write(async () => { await send<null>(`/v1/gym-arrangements/${id}`, { method: 'DELETE' }); return null; });
}

export interface PayoutInput {
  amount: number;
  method: Payout['method'];
  reference: string | null;
  receivedAt: number;
  note: string | null;
}

export async function recordPayout(input: PayoutInput & { id: string }): Promise<Written> {
  return write(async () => {
    await send<PayoutWire>('/v1/trainer-payouts', {
      method: 'POST',
      body: { id: input.id, amount: dec(input.amount), method: input.method, reference: input.reference, receivedAt: input.receivedAt, note: input.note },
    });
    return null;
  });
}

export async function fixPayout(id: string, input: PayoutInput): Promise<Written> {
  return write(async () => {
    await send<PayoutWire>(`/v1/trainer-payouts/${id}`, {
      method: 'PATCH',
      body: { amount: dec(input.amount), method: input.method, reference: input.reference, receivedAt: input.receivedAt, note: input.note },
    });
    return null;
  });
}

export async function removePayout(id: string): Promise<Written> {
  return write(async () => { await send<null>(`/v1/trainer-payouts/${id}`, { method: 'DELETE' }); return null; });
}
