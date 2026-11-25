/**
 * "I'VE PAID" — a client's report of a payment (V50; api-contract 1.2, pc-l1 · pm-a1). Types and plain helpers only, no
 * `server-only` (trap 18): the trainer's To confirm card and the portal's payments screen are both client components.
 *
 * A claim changes nothing owed. It waits until the trainer confirms it — which records an ordinary payment — or says it has
 * not arrived. `packageId` is null when the client paid before a pack was sold; confirming it then needs the pack the trainer
 * sells. `collector` is `gym` for a gym client, who paid at the gym's desk.
 */

export type ClaimStatus = 'open' | 'confirmed' | 'declined' | 'withdrawn';

export interface PaymentClaimWire {
  id: string;
  clientId: string;
  clientName: string;
  packageId: string | null;
  packageName: string | null;
  /** A decimal string, like every money field: "1000.00". */
  amount: string;
  currency: string;
  /** YYYY-MM-DD — the day the client says they paid. */
  paidOn: string;
  /** The UPI reference (UTR), if the client gave one. Optional for both sides. */
  reference: string | null;
  note: string | null;
  collector: 'trainer' | 'gym';
  status: ClaimStatus;
  paymentId: string | null;
  decidedAt: number | null;
  declineReason: string | null;
  createdAt: number;
}

/** What the trainer may change when confirming; every key is "use this instead of what the client said". */
export interface ConfirmInput {
  packageId?: string;
  amount?: string;
  method?: 'upi' | 'cash' | 'bank_transfer';
  reference?: string | null;
  paidAt?: number;
  note?: string | null;
}

/** A UTR is 12 digits; banks and apps sometimes show it with spaces. Optional, so this only shapes what was typed. */
export function cleanReference(raw: string): string | null {
  const t = raw.trim();
  return t === '' ? null : t.slice(0, 64);
}

/** "23 Nov" / "23 Nov 2025" — the day a claim says the money went, in words. */
export function claimDay(paidOn: string, now: number): string {
  const [y, m, d] = paidOn.split('-').map(Number);
  const at = new Date(y, m - 1, d);
  const sameYear = y === new Date(now).getFullYear();
  return at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}
