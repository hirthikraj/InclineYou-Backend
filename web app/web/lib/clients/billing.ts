import type {
  ClientPackageWire,
  ClientPaymentWire,
  PriceListPackWire,
} from '@/lib/clients/client-api';

/**
 * WHO THE TRAINER BILLS, AND WHAT THE BILL SAYS.
 *
 * Pure. No React, no fetch, no `server-only` — so the rules below can be read,
 * reasoned about and compiled on their own, and so the Payments tab is a
 * drawing of them rather than the place they live.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * THE ONE RULE EVERYTHING HERE HANGS OFF
 * ════════════════════════════════════════════════════════════════════════════
 *
 * **An invoice belongs to a client the trainer collects from.**
 *
 * A trainer whose `workMode` is `both` has two kinds of person on one floor:
 * the ones they found themselves, who pay THEM, and the ones the gym's front
 * desk signed up, who pay the GYM and cost 30% of the sheet. The seed states
 * the same thing about its own data and adds the part that makes it usable
 * here — *"the flag is per CLIENT, not per purchase, because nobody changes
 * which counter they pay at between packs."*
 *
 * A gym-signed client has already been billed, by the gym, for the whole
 * amount. The trainer's share of it arrives later as a settlement against a
 * contract. A trainer who raised their own invoice for that session would be
 * billing for money they never took, for a service somebody else has already
 * billed for — two documents, one payment, and a client with a very reasonable
 * question.
 *
 * So the rule is not a UI preference and it is not enforced only here:
 * `POST /v1/payments/{id}/invoice` refuses a gym-collected row with a 409 and a
 * sentence. This module decides what to DRAW; that endpoint decides what is
 * true.
 *
 * ── AND IT IS OPTIONAL EVEN WHERE IT IS ALLOWED ─────────────────────────────
 *
 * Most clients never ask for a bill. A product that minted one per payment
 * would be generating paperwork for a cash handover in a car park, and a
 * numbered sequence with hundreds of documents nobody ever opened is worse than
 * no sequence at all — the CA reading it in March cannot tell which ones
 * mattered. So `invoiceNo` is null until somebody asks, `canInvoice` is about
 * eligibility and never about obligation, and the screen's verb is *Raise an
 * invoice* rather than a checkbox that was on by default.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * HOW "GYM-SIGNED" IS READ OFF THE WIRE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * There is no `client.isGymOwned` column and there should not be one: the fact
 * is already recorded twice, in the two places it is actually created.
 *
 *   1. `payment.collectedBy`  — who took the money. Written at record time.
 *   2. `package.packId` → `pack.owner` — whose price list it was sold off.
 *
 * (1) is the stronger signal, because it is a fact about money that moved
 * rather than about a catalogue entry, so it is read first. (2) is the fallback
 * for a client whose pack has no payment against it yet — a pack sold this
 * morning and not yet paid for — where the price list is the only evidence
 * there is.
 *
 * `trainerSplitPercent` is deliberately NOT consulted. The seed sets it from
 * the DELIVERY MODE (`remote ? 100 : 70`), so every floor client carries 70
 * whether the gym signed them or not, and a rule built on it would refuse an
 * invoice to two thirds of an independent trainer's roster.
 */

/* ------------------------------------------------------------------ money */

/** Coerce Spring's BigDecimal fields, which Jackson can serialise as a string. */
function n(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** Both spellings mean *the money arrived*. The backend writes `paid`; older
 *  rows and the phone's queue write `confirmed`. */
export function isCollected(p: { status: string }): boolean {
  return p.status === 'paid' || p.status === 'confirmed';
}

/* ------------------------------------------------- who the client is to us */

export type Arrangement = {
  /** True when the gym's counter signs this person up and takes the money. */
  viaGym: boolean;
  /**
   * Which evidence answered. `'payment'` is a fact about money that moved;
   * `'pricelist'` is an inference from the catalogue the pack came off;
   * `'none'` means a client with nothing sold yet, who is treated as the
   * trainer's own — because the only pack they can be sold from this screen is
   * one off the trainer's own list.
   */
  from: 'payment' | 'pricelist' | 'none';
};

export function arrangementOf(
  packages: ClientPackageWire[],
  payments: ClientPaymentWire[],
  priceList: PriceListPackWire[],
): Arrangement {
  const collected = payments.find((p) => p.collectedBy === 'gym' || p.collectedBy === 'trainer');
  if (collected) return { viaGym: collected.collectedBy === 'gym', from: 'payment' };

  const owners = packages
    .map((pkg) => (pkg.packId ? priceList.find((p) => p.id === pkg.packId)?.owner : null))
    .filter((o): o is string => Boolean(o));
  if (owners.length > 0) return { viaGym: owners.some((o) => o === 'gym'), from: 'pricelist' };

  return { viaGym: false, from: 'none' };
}

/**
 * Can THIS payment be billed for?
 *
 * Three refusals, and each one is a sentence the screen can print as it stands
 * rather than a boolean it has to translate:
 *
 * · the gym collected it — see the rule at the top of this file;
 * · it was written off — there is no longer money to bill for, and an invoice
 *   for an amount the trainer has decided never to chase is a document that
 *   contradicts the book it came from;
 * · nothing has landed yet. A bill for money that has not moved is a *quote*,
 *   and this product does not have those. The row is still a debt the trainer
 *   can chase; what it is not yet is a receipt.
 *
 * A row that already has a number is `true` with `already` set — the screen
 * shows the bill rather than offering to raise a second one, and the endpoint
 * is idempotent for the same reason.
 */
export type InvoiceEligibility =
  | { ok: true; already: boolean }
  | { ok: false; why: string };

export function canInvoice(p: ClientPaymentWire): InvoiceEligibility {
  if (p.invoiceNo) return { ok: true, already: true };
  if (p.collectedBy === 'gym') {
    return {
      ok: false,
      why: 'The gym collected this one and raises its own receipt.',
    };
  }
  if (p.status === 'write_off') {
    return { ok: false, why: 'This was written off — there is nothing left to bill for.' };
  }
  if (!isCollected(p)) {
    return { ok: false, why: 'Raise the bill once the money has landed.' };
  }
  return { ok: true, already: false };
}

/* ------------------------------------------------------- the document body */

/**
 * What the pack is CALLED on a bill — and the fallback chain is the point.
 *
 * A pack sold from the price list carries `packId`, and the trainer's own name
 * for it (*12 sessions*, *Monthly unlimited*) is the one the client will
 * recognise from the conversation where they bought it. A free-typed sale has
 * no entry to look up, so the count is the next best name, and a pack with no
 * count falls back to its type with the first letter lifted. `type` is never
 * shown raw: `monthly` on a document of proper nouns reads as a bug.
 */
export function packName(
  pkg: ClientPackageWire | null | undefined,
  priceList: PriceListPackWire[],
): string {
  if (!pkg) return 'Personal training';
  const listed = pkg.packId ? priceList.find((p) => p.id === pkg.packId) : null;
  if (listed?.name) return listed.name;
  if (pkg.sessionsTotal) return `${pkg.sessionsTotal}-session pack`;
  const t = (pkg.type ?? '').replace(/_/g, ' ').trim();
  return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)} pack` : 'Pack';
}

export type InvoiceFigures = {
  /** What the pack listed at, before anything came off. */
  gross: number;
  discount: number;
  /** What the client is actually being billed: `gross − discount`. */
  net: number;
  /** `12 × ₹750`, or null on a pack with no session count. */
  perSession: number | null;
  sessions: number | null;
};

/**
 * The arithmetic on the bill, taken from the PACKAGE and never from the
 * payment.
 *
 * A payment is what moved; the package is what was agreed, and a bill states
 * the agreement. They differ in exactly the case that matters — a client who
 * paid half — and an invoice whose line item says *12 sessions · ₹4,500* for a
 * ₹9,000 pack is a document that will be produced in an argument.
 *
 * `discountAmount` is carried as its own line rather than folded into the
 * price, because the number the client remembers being quoted is the list one.
 * A bill that silently shows ₹8,500 for a pack they were told costs ₹9,000
 * makes the trainer look like they moved the price.
 */
export function invoiceFigures(pkg: ClientPackageWire | null | undefined): InvoiceFigures {
  const net = n(pkg?.amount);
  const discount = n(pkg?.discountAmount);
  const gross = net + discount;
  const sessions = pkg?.sessionsTotal ?? null;
  return {
    gross,
    discount,
    net,
    sessions,
    perSession: sessions && sessions > 0 ? Math.round(net / sessions) : null,
  };
}

/**
 * The WhatsApp message that carries the bill.
 *
 * ── WHY THE MESSAGE IS THE DOCUMENT AND NOT A LINK TO IT ────────────────────
 *
 * The obvious build is a link. It is wrong here twice over: every screen in
 * this console is behind the trainer's own session, so a client tapping it gets
 * a sign-in wall for an account they do not have — and the client portal, which
 * they DO have, is a different surface with its own reading of what a payment
 * is. Until there is a public invoice route, the honest artefact is the text.
 *
 * It is also, in practice, what gets used. The person on the other end is
 * forwarding this to an office that wants a number, a date and an amount; a
 * message holding all three is already the thing they need, and it survives
 * being screenshotted, which a link does not.
 *
 * Plain text, no markdown: WhatsApp's own emphasis marks are `*bold*` and a
 * `**` that does not render is what a message written for the wrong client
 * looks like.
 */
export function invoiceMessage(input: {
  invoiceNo: string;
  clientName: string;
  trainerName: string;
  what: string;
  amount: string;
  paidOn: string;
  upiVpa?: string | null;
}): string {
  const first = input.clientName.split(' ')[0];
  const lines = [
    `Hi ${first}, here is your invoice.`,
    '',
    `Invoice ${input.invoiceNo}`,
    `${input.what} — ${input.amount}`,
    `Paid on ${input.paidOn}`,
    '',
    `From ${input.trainerName}`,
  ];
  if (input.upiVpa) lines.push(`UPI ${input.upiVpa}`);
  /* The line every accountant asks about, answered before they ask. A bill with
     no tax row reads as an unfinished bill; `computeGst` is the screen that
     watches the ₹20,00,000 line this sentence refers to. */
  lines.push('No GST charged — under the registration threshold for services.');
  return lines.join('\n');
}

/** `https://wa.me/…` for a 10-digit Indian number, or null if there is none. */
export function whatsappUrl(phone: string | null | undefined, message: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const e164 = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${e164}?text=${encodeURIComponent(message)}`;
}

/**
 * How the money arrived, in words.
 *
 * `method` is a free string on the wire (`upi`, `cash`, `card`, `bank`, `gym`)
 * and the table used to print it raw — `upi` in a column of proper nouns reads
 * as a bug, the same argument `packName` makes about `type`. An unknown value
 * is capitalised rather than dropped: a method this map has not heard of is a
 * real payment, and blanking it would hide a row the trainer recorded.
 */
const METHOD_WORDS: Record<string, string> = {
  upi: 'UPI',
  cash: 'Cash',
  card: 'Card',
  bank: 'Bank transfer',
  gym: 'Gym front office',
};

export function methodLabel(method: string | null | undefined): string | null {
  if (!method) return null;
  const key = method.trim().toLowerCase();
  if (!key) return null;
  return METHOD_WORDS[key] ?? `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}
