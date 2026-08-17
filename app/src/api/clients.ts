/**
 * The roster's one online question.
 *
 * Everything else about a client is written to SQLite and synced later — that is
 * the whole design. This is the exception, and it is an exception because the
 * answer cannot be known locally: whether a number belongs to a trainer, or is
 * already on somebody else's roster, is a fact about the rest of the product.
 *
 * Asked early so the refusal lands while the add form is still open. It is not
 * the enforcement — `POST /v1/clients` and the sync push both apply the same
 * rule — so a phone with no signal skips it and finds out at the next sync.
 *
 * A POST for a question that writes nothing, and the number goes in the body:
 * a query string is logged by every hop it passes through, and this number is
 * not even the trainer's own.
 */

import { api } from './client';

export interface PhoneAvailability {
  available: boolean;
  /**
   * `PHONE_IS_TRAINER` | `PHONE_ON_YOUR_ROSTER` | `PHONE_ON_ANOTHER_ROSTER`,
   * or null when available.
   */
  code: string | null;
  /** Ready to put on screen. Null when available. */
  message: string | null;
}

export async function checkClientPhone(phone: string): Promise<PhoneAvailability> {
  const { data } = await api.post<PhoneAvailability>('/v1/clients/phone-availability', { phone });
  return data;
}
