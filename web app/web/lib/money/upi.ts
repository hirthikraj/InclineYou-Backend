/**
 * A UPI pay link — `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…` — the NPCI deep link every
 * UPI app (GPay, PhonePe, Paytm, BHIM, bank apps) opens with the payee, the amount
 * and a note filled in. Nothing moves through InclineYou: the link only fills in a
 * payment the client then approves in their own app, and the trainer still marks it
 * received.
 *
 * Pure and `server-only`-free (AGENTS trap 18), so the portal's client components
 * and any server code can build the same link.
 *
 * `am` is sent with two decimals and only when positive, because several UPI apps
 * refuse a link whose amount is `0` or has more than two decimals. `tn` is capped at
 * 50 characters, the length the common apps display before cutting it.
 */
export function upiPayLink(input: {
  vpa: string;
  payeeName?: string | null;
  amount?: number | null;
  note?: string | null;
  currency?: string;
}): string {
  const q = new URLSearchParams();
  q.set('pa', input.vpa.trim());
  if (input.payeeName?.trim()) q.set('pn', input.payeeName.trim());
  if (input.amount != null && Number.isFinite(input.amount) && input.amount > 0) {
    q.set('am', input.amount.toFixed(2));
  }
  q.set('cu', input.currency ?? 'INR');
  if (input.note?.trim()) q.set('tn', input.note.trim().slice(0, 50));
  // URLSearchParams writes a space as `+`; UPI apps read `%20`.
  return `upi://pay?${q.toString().replace(/\+/g, '%20')}`;
}

/* The UPI ID's format check is `isUpiFormat` in lib/setup/upi.ts — one pattern, the phone's, character for character. */
