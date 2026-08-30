/**
 * The UPI ID — what we can check about one, and what we cannot.
 *
 * We check that a UPI ID LOOKS like a UPI ID. We do not call a payment
 * provider, so we cannot confirm the account exists or that it belongs to this
 * trainer, and **one wrong letter passes this check and sends the money to a
 * stranger**. That is a real risk to somebody's income, which is why frame 5e
 * stops being a form on a valid format and becomes a read-back, and why the
 * word on that screen is never "verified".
 *
 * The day a provider is wired in, the read-back is replaced by a NAME LOOKUP —
 * not softened into "verified".
 */

import { UPI_HANDLES } from './options';

/**
 * NPCI's virtual payment address shape: a handle after an `@`, no spaces.
 * Character for character the app's `UPI_PATTERN`, so a value the phone accepts
 * is one this screen accepts.
 */
const UPI_PATTERN = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

export function isUpiFormat(value: string): boolean {
  return UPI_PATTERN.test(value.trim());
}

/**
 * The five suggestions, built from the trainer's own number.
 *
 * §16's decision, and the reason this step is one click on the web where it is
 * eleven typed characters on the phone: the common shape in India is
 * `<phone>@<psp>`, and **the phone number is the one string this product has
 * just proved correct by sending a code to it**. So the typo surface for the
 * majority case is a handle picked off a list, not a local part typed from
 * memory.
 *
 * Empty when we have no number — the picker is not drawn rather than drawn with
 * `@okhdfcbank` and nothing in front of it.
 */
export function upiSuggestions(phone: string): string[] {
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return [];
  return UPI_HANDLES.map((handle) => `${digits}${handle}`);
}

/**
 * The `upi://pay` deep link behind "send yourself ₹1 to prove it".
 *
 * A one-rupee self-transfer is the only proof available to us today, so it is
 * offered rather than implied. On a desktop browser it will usually resolve to
 * nothing installed, which is why the screen says what to do instead rather
 * than assuming the link worked.
 */
export function selfTestLink(upiId: string, name: string): string {
  const pa = encodeURIComponent(upiId.trim());
  const pn = encodeURIComponent(name.trim() || 'Me');
  return `upi://pay?pa=${pa}&pn=${pn}&am=1&cu=INR`;
}
