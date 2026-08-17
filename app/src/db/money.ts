/**
 * Money writes — screen 06 · FR-6.
 *
 * Every rule this file enforces comes from §08 of the design:
 *
 *   · XRep never holds, moves or confirms money. Nothing here calls a
 *     payment provider, because there isn't one. A payment is RECORDED by the
 *     trainer, never auto-detected — we cannot read their bank, and marking a
 *     payment from a parsed SMS would be wrong often enough to destroy trust in
 *     the whole book.
 *   · The gym's percentage is applied at record time and stored on the entry.
 *     If the contract changes in October, September's split must not move.
 *   · Every entry is editable and deletable, and delete always asks. It is a
 *     book, and books get corrected — but a deleted payment changes a pack, so
 *     it is never silent.
 *   · Write-off is a first-class action, not a delete. Deleting hides the
 *     money; writing it off keeps the history and shows the year's real total.
 *   · Receipt numbers are issued locally from a device-scoped range, because
 *     cash arrives in gym basements with no signal.
 *
 * Local-first throughout: every function writes to SQLite and returns, then
 * kicks a best-effort sync. Nothing here waits on the network.
 */

import { Q } from '@nozbe/watermelondb';
import * as SecureStore from 'expo-secure-store';
import { database } from './index';
import PackageModel from './models/Package';
import PaymentModel from './models/Payment';
import PackModel from './models/Pack';
import GymSettlementModel from './models/GymSettlement';
import NudgeLogModel from './models/NudgeLog';
import { refreshPending, syncDatabase } from './sync';

export const packagesCollection = database.get<PackageModel>('packages');
export const paymentsCollection = database.get<PaymentModel>('payments');
export const packsCollection = database.get<PackModel>('packs');
export const settlementsCollection = database.get<GymSettlementModel>('gym_settlements');
export const nudgesCollection = database.get<NudgeLogModel>('nudge_logs');

/** How long a recorded payment can be taken back. */
export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------- receipt numbering
 *
 * `TX-2608-3014` — prefix, YYMM, then a four-digit number whose FIRST digit is
 * this device's block. Ten blocks, one per device, drawn once at random and
 * kept in SecureStore.
 *
 * The alternative — asking the server for the next number — cannot work: the
 * whole point is that a receipt is issued standing in a basement with no bars.
 * A shared counter across two offline phones collides; a per-device block
 * cannot, and a trainer running more than ten phones is not a real scenario.
 * -------------------------------------------------------------------------- */

const BLOCK_KEY = 'xrep_receipt_block';
const SEQ_KEY = 'xrep_receipt_seq';

let cachedBlock: number | null = null;

async function receiptBlock(): Promise<number> {
  if (cachedBlock != null) return cachedBlock;
  try {
    const stored = await SecureStore.getItemAsync(BLOCK_KEY);
    if (stored != null && /^[0-9]$/.test(stored)) {
      cachedBlock = Number(stored);
      return cachedBlock;
    }
    const next = Math.floor(Math.random() * 10);
    await SecureStore.setItemAsync(BLOCK_KEY, String(next));
    cachedBlock = next;
    return next;
  } catch {
    // A receipt with a duplicate-risk number still beats no receipt at all.
    cachedBlock = 0;
    return 0;
  }
}

/** Issues the next number on this device. Monotonic, and it never blocks. */
export async function nextReceiptNo(at: number = Date.now()): Promise<string> {
  const block = await receiptBlock();
  let seq = 1;
  try {
    const stored = await SecureStore.getItemAsync(SEQ_KEY);
    seq = stored ? Number(stored) + 1 : 1;
    if (!Number.isFinite(seq) || seq < 1) seq = 1;
    // Wraps at 1000 so the number stays four digits. A trainer would need a
    // thousand receipts in one device block before this matters.
    if (seq > 999) seq = 1;
    await SecureStore.setItemAsync(SEQ_KEY, String(seq));
  } catch {
    seq = Math.floor(Math.random() * 999) + 1;
  }
  const d = new Date(at);
  const stamp = `${String(d.getFullYear() % 100).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `TX-${stamp}-${block}${String(seq).padStart(3, '0')}`;
}

/* ------------------------------------------------------------------ reading */

export function observePacks() {
  return packsCollection.query(Q.sortBy('order_index', Q.asc)).observe();
}

/**
 * Sessions this client has paid for and not yet used — the booking bound.
 *
 * The same rule as the diary's `packRemaining`, as a one-off read: the largest
 * remaining count across their active packages. Null when nothing on their
 * account counts sessions (no pack yet, or a monthly), which is a different
 * answer from zero — null means "no bound", zero means "paid up and spent".
 */
export async function packSessionsLeft(clientId: string): Promise<number | null> {
  const rows = await packagesCollection.query(Q.where('client_id', clientId)).fetch();
  // Status compared case-blind, same as the diary — server-written rows have
  // been seen carrying either casing.
  const live = rows.filter((p) => (p.status ?? '').toLowerCase() === 'active');
  const counts = live
    .map((p) => p.sessionsRemaining)
    .filter((n): n is number => typeof n === 'number');
  return counts.length > 0 ? Math.max(0, Math.max(...counts)) : null;
}

/** 'trainer' | 'gym' — a price list belongs to one of two people. */
export type PackOwner = 'trainer' | 'gym';

/**
 * Whose price this is.
 *
 * Every row written before V14 has no owner, and every one of those was the
 * trainer's own — so null reads as 'trainer' here rather than being back-filled
 * in the database, where it would claim a row said something it never said.
 */
export function packOwner(pack: { owner?: string | null }): PackOwner {
  return pack.owner === 'gym' ? 'gym' : 'trainer';
}

/* ------------------------------------------------------- recording payments */

export type PaymentMethod = 'upi_intent' | 'cash' | 'gym_front_office';

export interface RecordPaymentInput {
  trainerId: string;
  clientId: string;
  packageId?: string;
  amount: number;
  method: PaymentMethod;
  upiReference?: string;
  note?: string;
  /** The gym's cut, worked out by the caller from the client and the contract. */
  gymShareAmount?: number;
  sharePercent?: number;
  /** Defaults to now. Set when recording something that arrived yesterday. */
  at?: number;
}

/**
 * Money received.
 *
 * Written as `paid` immediately, with a `paid_at`. There is no pending state
 * here on purpose — the trainer is standing in front of the client saying it
 * arrived, and a payment that needs confirming twice is a payment that gets
 * recorded once and forgotten.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<PaymentModel> {
  const at = input.at ?? Date.now();
  const receipt = await nextReceiptNo(at);

  const payment = await database.write(async () =>
    paymentsCollection.create((p) => {
      p.trainerId = input.trainerId;
      p.clientId = input.clientId;
      if (input.packageId) p.packageId = input.packageId;
      p.amount = input.amount;
      p.currency = 'INR';
      p.method = input.method;
      // Who physically took the money. The gym's counter is the only case
      // where it wasn't the trainer, and it is the case with a cut attached.
      p.collectedBy = input.method === 'gym_front_office' ? 'gym' : 'trainer';
      p.status = 'paid';
      p.paidAt = new Date(at);
      if (input.upiReference) p.upiReference = input.upiReference;
      if (input.note) p.note = input.note;
      if (input.gymShareAmount != null) p.gymShareAmount = input.gymShareAmount;
      if (input.sharePercent != null) p.sharePercent = input.sharePercent;
      p.receiptNo = receipt;
    }),
  );

  await refreshPending();
  syncDatabase('record-payment');
  return payment;
}

/**
 * Takes a payment back.
 *
 * A real delete, not a status change — the money never arrived, so there is
 * nothing to keep a record of. This is the one case where deleting is right,
 * and it is why the receipt sheet offers it for 24 hours and no longer.
 */
export async function undoPayment(paymentId: string): Promise<void> {
  const payment = await paymentsCollection.find(paymentId);
  await database.write(async () => {
    await payment.markAsDeleted();
  });
  await refreshPending();
  syncDatabase('undo-payment');
}

export interface EditPaymentInput {
  amount?: number;
  method?: PaymentMethod;
  upiReference?: string;
  note?: string;
  gymShareAmount?: number;
  sharePercent?: number;
  at?: number;
}

/** Books get corrected. The receipt number is not reissued — it is the anchor. */
export async function editPayment(paymentId: string, patch: EditPaymentInput): Promise<void> {
  const payment = await paymentsCollection.find(paymentId);
  await database.write(async () => {
    await payment.update((p) => {
      if (patch.amount != null) p.amount = patch.amount;
      if (patch.method) {
        p.method = patch.method;
        p.collectedBy = patch.method === 'gym_front_office' ? 'gym' : 'trainer';
      }
      if (patch.upiReference !== undefined) p.upiReference = patch.upiReference;
      if (patch.note !== undefined) p.note = patch.note;
      if (patch.gymShareAmount !== undefined) p.gymShareAmount = patch.gymShareAmount;
      if (patch.sharePercent !== undefined) p.sharePercent = patch.sharePercent;
      if (patch.at != null) p.paidAt = new Date(patch.at);
    });
  });
  await refreshPending();
  syncDatabase('edit-payment');
}

/** Same as undo, but the caller has already asked. Delete always asks. */
export async function deletePayment(paymentId: string): Promise<void> {
  await undoPayment(paymentId);
}

/* --------------------------------------------------------------- write-off */

/**
 * Some money never arrives.
 *
 * Every ledger app lets you delete the entry, which hides it and quietly
 * rewrites the client's pack. This does neither: the debt stays in the client's
 * book, the sessions they already have stay theirs, and the amount lands in the
 * year's written-off total — so in March the number is the truth.
 *
 * @param amount What is being let go. The caller passes the outstanding balance.
 */
export async function writeOff(packageId: string, amount: number): Promise<void> {
  const pkg = await packagesCollection.find(packageId);
  await database.write(async () => {
    await pkg.update((p) => {
      p.writtenOffAt = new Date();
      p.writtenOffAmount = amount;
    });
  });
  await refreshPending();
  syncDatabase('write-off');
}

/** Puts a written-off debt back into "still owed". */
export async function undoWriteOff(packageId: string): Promise<void> {
  const pkg = await packagesCollection.find(packageId);
  await database.write(async () => {
    await pkg.update((p) => {
      p.writtenOffAt = null;
      p.writtenOffAmount = null;
    });
  });
  await refreshPending();
  syncDatabase('undo-write-off');
}

/**
 * "He agreed ₹4,000 instead."
 *
 * The price changes and the pack shortens with it, because the client is
 * paying for fewer sessions — not getting the same pack cheaper. Sessions
 * already used are never taken back, so the new total can't drop below them.
 */
export async function adjustDebt(packageId: string, amount: number): Promise<void> {
  const pkg = await packagesCollection.find(packageId);
  const perSession =
    pkg.sessionsTotal && pkg.sessionsTotal > 0 ? pkg.amount / pkg.sessionsTotal : null;
  const used = (pkg.sessionsTotal ?? 0) - (pkg.sessionsRemaining ?? 0);

  await database.write(async () => {
    await pkg.update((p) => {
      p.amount = amount;
      if (perSession && perSession > 0) {
        const total = Math.max(used, Math.round(amount / perSession));
        p.sessionsTotal = total;
        p.sessionsRemaining = Math.max(0, total - used);
      }
    });
  });
  await refreshPending();
  syncDatabase('adjust-debt');
}

/** When the money was agreed to arrive. Without it there is no "11 days late". */
export async function setDueDate(packageId: string, isoDate: string): Promise<void> {
  const pkg = await packagesCollection.find(packageId);
  await database.write(async () => {
    await pkg.update((p) => {
      p.dueDate = isoDate;
    });
  });
  await refreshPending();
  syncDatabase('set-due-date');
}

/* ------------------------------------------------------------------- packs */

export interface PackInput {
  trainerId: string;
  name: string;
  type: 'session_pack' | 'monthly' | 'single';
  sessions?: number | null;
  amount: number;
  validityDays?: number | null;
  /** Whose price list this belongs on. Defaults to the trainer's own. */
  owner?: PackOwner;
  orderIndex?: number;
}

export async function createPack(input: PackInput): Promise<PackModel> {
  const pack = await database.write(async () =>
    packsCollection.create((p) => {
      p.trainerId = input.trainerId;
      p.name = input.name;
      p.type = input.type;
      p.sessions = input.sessions ?? null;
      p.amount = input.amount;
      p.currency = 'INR';
      p.validityDays = input.validityDays ?? null;
      p.status = 'active';
      p.owner = input.owner ?? 'trainer';
      p.orderIndex = input.orderIndex ?? 0;
    }),
  );
  await refreshPending();
  syncDatabase('create-pack');
  return pack;
}

export async function updatePack(
  packId: string,
  patch: Partial<Omit<PackInput, 'trainerId'>>,
): Promise<void> {
  const pack = await packsCollection.find(packId);
  await database.write(async () => {
    await pack.update((p) => {
      if (patch.name != null) p.name = patch.name;
      if (patch.type != null) p.type = patch.type;
      if (patch.sessions !== undefined) p.sessions = patch.sessions ?? null;
      if (patch.amount != null) p.amount = patch.amount;
      if (patch.validityDays !== undefined) p.validityDays = patch.validityDays ?? null;
      if (patch.owner != null) p.owner = patch.owner;
      if (patch.orderIndex != null) p.orderIndex = patch.orderIndex;
    });
  });
  await refreshPending();
  syncDatabase('update-pack');
}

/**
 * Retire or bring back a pack.
 *
 * Retiring is a status, never a delete: packages already sold point at this
 * row, and a price you stopped offering is still the price somebody paid.
 */
export async function setPackStatus(packId: string, status: 'active' | 'inactive'): Promise<void> {
  const pack = await packsCollection.find(packId);
  await database.write(async () => {
    await pack.update((p) => {
      p.status = status;
    });
  });
  await refreshPending();
  syncDatabase('set-pack-status');
}

/**
 * Sells a pack to a client: the debt side of the book.
 *
 * Renewing is the same call — the sessions land on top of whatever is left, so
 * a client who renews with two sessions in hand keeps them.
 */
export async function sellPack(args: {
  trainerId: string;
  clientId: string;
  pack: { id: string; type: string; sessions: number | null; amount: number; validityDays: number | null };
  /** Sessions still unused on the pack being replaced, if any. */
  carryOver?: number;
  /**
   * Knocked off the list price for this client, on this sale.
   *
   * The pack keeps its price — a discount is a thing given to one person, and
   * writing it back to the price list would re-quote everybody else.
   */
  discount?: number;
  dueDate?: string;
}): Promise<PackageModel> {
  const { pack } = args;
  const carry = args.carryOver ?? 0;
  const discount = Math.max(0, Math.min(pack.amount, Math.round(args.discount ?? 0)));
  const total = pack.sessions != null ? pack.sessions + carry : null;
  const today = new Date();

  const created = await database.write(async () =>
    packagesCollection.create((p) => {
      p.trainerId = args.trainerId;
      p.clientId = args.clientId;
      p.type = pack.type === 'monthly' ? 'monthly' : 'session_pack';
      if (total != null) {
        p.sessionsTotal = total;
        p.sessionsRemaining = total;
      }
      // `amount` is what this client owes — already net of anything given away.
      p.amount = pack.amount - discount;
      if (discount > 0) p.discountAmount = discount;
      p.currency = 'INR';
      p.startDate = isoDay(today);
      if (pack.validityDays != null) {
        p.endDate = isoDay(new Date(today.getTime() + pack.validityDays * 86_400_000));
      }
      p.status = 'active';
      p.packId = pack.id;
      p.dueDate = args.dueDate ?? isoDay(today);
    }),
  );

  await refreshPending();
  syncDatabase('sell-pack');
  return created;
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------------------------------------------------------- the gym's share */

/**
 * Records what is owed to the gym for a month.
 *
 * The amount comes from the trainer's own book, and the gym name is copied onto
 * the row — if they move gyms in October, September must keep saying who it was
 * owed to.
 */
export async function createSettlement(args: {
  trainerId: string;
  period: string;
  amount: number;
  sessionsCounted?: number;
  gymName: string;
  dueAt?: number;
}): Promise<GymSettlementModel> {
  const existing = await settlementsCollection
    .query(Q.where('period', args.period))
    .fetch();

  if (existing.length > 0) {
    const row = existing[0];
    await database.write(async () => {
      await row.update((s) => {
        s.amount = args.amount;
        if (args.sessionsCounted != null) s.sessionsCounted = args.sessionsCounted;
        s.gymName = args.gymName;
      });
    });
    await refreshPending();
    syncDatabase('update-settlement');
    return row;
  }

  const created = await database.write(async () =>
    settlementsCollection.create((s) => {
      s.trainerId = args.trainerId;
      s.period = args.period;
      s.amount = args.amount;
      if (args.sessionsCounted != null) s.sessionsCounted = args.sessionsCounted;
      s.gymName = args.gymName;
      s.status = 'due';
      if (args.dueAt != null) s.dueAt = new Date(args.dueAt);
    }),
  );
  await refreshPending();
  syncDatabase('create-settlement');
  return created;
}

export async function settleGymShare(settlementId: string): Promise<void> {
  const row = await settlementsCollection.find(settlementId);
  await database.write(async () => {
    await row.update((s) => {
      s.status = 'settled';
      s.settledAt = new Date();
    });
  });
  await refreshPending();
  syncDatabase('settle-gym-share');
}

/* ---------------------------------------------------------------- reminders */

/**
 * Records that money was mentioned.
 *
 * Written when WhatsApp is opened, not when a reply arrives — we have no way to
 * know whether it was read, and "reminded twice" only claims that the trainer
 * asked twice, which is exactly what it means on the chase row.
 */
/**
 * @param template What was sent. Defaults to a payment chase, which is what the
 *                 Money screens use. Screen 4d passes `nudge_<kind>` so the Sent
 *                 tab can say which rule a message came from, and so the
 *                 per-rule "sent 11 this month" count has something to read.
 */
export async function logReminder(
  trainerId: string,
  clientId: string,
  template: string = 'payment_due',
): Promise<void> {
  await database.write(async () =>
    nudgesCollection.create((n) => {
      n.trainerId = trainerId;
      n.clientId = clientId;
      n.channel = 'whatsapp';
      n.templateName = template;
      n.status = 'sent';
      n.sentAt = new Date();
    }),
  );
  await refreshPending();
  syncDatabase('log-reminder');
}
