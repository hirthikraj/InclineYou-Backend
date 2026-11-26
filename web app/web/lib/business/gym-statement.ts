import { rupees } from '@/lib/today/time';
import type { GymStatement } from './types';

/**
 * THE GYM STATEMENT AS A WHATSAPP MESSAGE (26 Nov 2026, review P1 "No statement to
 * send the gym"; `release/business-module-plan.html` Phase 2, "share").
 *
 * The printed card is the PDF; this is the same month in a few lines, sent from the
 * trainer's own number — the product's rule for every message (a `wa.me` link the
 * trainer reviews and sends, nothing sent for them). Number-less `wa.me/?text=`,
 * because the product holds no number for a gym's manager: WhatsApp's own chooser
 * picks the chat, which is usually the gym's group anyway.
 *
 * Every figure is one the card prints, in the card's words, so the message and the
 * PDF cannot disagree. It ends with the card's own caveat — the trainer's record,
 * not the gym's — because a figure sent to the other side of an argument should say
 * where it came from.
 *
 * Pure and `server-only`-free (trap 18): the Gym page is a client component.
 */
export interface StatementMessageInput {
  gymName: string;
  /** "November 2026", or "the last 3 months" — `periodProse`. */
  periodLabel: string;
  statement: GymStatement;
  gymShare: number;
  yourShare: number;
  /** As of the last closed month; null when no pay terms are recorded. */
  stillOwed: number | null;
}

export function gymStatementMessage(i: StatementMessageInput): string {
  const s = i.statement;
  const packs = s.newSales + s.renewals;
  const lines = [
    `Statement for ${i.gymName} · ${i.periodLabel}`,
    '',
    `Clients coached: ${s.clientsCoached}`,
    `Sessions delivered: ${s.sessionsDelivered}`,
    `Packs sold: ${packs} (${s.newSales} new · ${s.renewals} renewed)`,
    `Sales I drove: ${rupees(s.billedYouBrought + s.billedGymDesk)} (${rupees(s.billedYouBrought)} from clients I brought · ${rupees(s.billedGymDesk)} from the gym desk)`,
    `${i.gymName}’s share: ${rupees(i.gymShare)} · My share: ${rupees(i.yourShare)}`,
    `Paid to me by ${i.gymName}: ${rupees(s.received)}`,
  ];
  if (i.stillOwed !== null) {
    lines.push(i.stillOwed < 0
      ? `Still owed to me: ₹0 — ${i.gymName} has paid ${rupees(i.stillOwed)} ahead (as of the last closed month)`
      : `Still owed to me: ${rupees(i.stillOwed)} (as of the last closed month)`);
  }
  lines.push('', 'From my own records in InclineYou: the packs I sold, the sessions I marked done and the payouts I recorded.');
  return lines.join('\n');
}

/**
 * A balance with its sign. `rupees` drops it (it formats a magnitude), which drew
 * a month the gym paid AHEAD the same as a month it still owes — the one figure on
 * a statement whose direction is the whole point. Minus means paid ahead.
 */
export function signedRupees(amount: number): string {
  return amount < 0 ? `−${rupees(amount)}` : rupees(amount);
}

export function gymStatementWhatsApp(i: StatementMessageInput): string {
  return `https://wa.me/?text=${encodeURIComponent(gymStatementMessage(i))}`;
}
