'use server';

import { revalidatePath } from 'next/cache';

import { ClientDetailApiError, patchClient } from './client-api';

/**
 * THE CONTACT AND PHYSICAL WRITE PATH — `PATCH /v1/clients/{id}` (Clients A6).
 *
 * Each card sends only the keys it owns, so neither can clobber the other, and
 * each sends `If-Match` with the `version` it was drawn from: a save over an
 * edit made in another tab is a 412 the trainer is told about, not a silent
 * overwrite.
 *
 * The phone is the number the client will sign in with, which is why it is
 * checked here and goes out E.164 — ten digits, or nothing is sent.
 */

export interface ContactWriteResult {
  ok: boolean;
  message?: string;
}

/** The ten digits: a leading 0, or the 91 of a pasted `+91…`, is dropped. */
function cleanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits.startsWith('0') ? digits.slice(1) : digits;
}

/** The refusals a trainer can act on, by `code` — the UI never branches on prose. */
const BY_CODE: Record<string, string> = {
  PRECONDITION_FAILED: 'This client was changed somewhere else. Reload the page and try again.',
  PHONE_ALREADY_YOURS: 'That number is already on another client on your roster.',
  PHONE_ON_ANOTHER_ROSTER: 'That number belongs to a client of another coach in this workspace.',
  PHONE_IS_TRAINER: 'That is a trainer\'s number, not a client\'s.',
  CLIENT_UNDER_18: 'Clients must be 18 or older.',
};

function fail(error: unknown): ContactWriteResult {
  if (error instanceof ClientDetailApiError) {
    if (error.code && BY_CODE[error.code]) return { ok: false, message: BY_CODE[error.code] };
    if (error.detail) return { ok: false, message: error.detail };
    if (error.status === null) {
      return { ok: false, message: 'Could not reach the server. Nothing changed.' };
    }
    if (error.status === 401 || error.status === 403) {
      return { ok: false, message: 'Your session expired. Sign in again.' };
    }
    if (error.status === 404) {
      return { ok: false, message: 'That client is no longer there.' };
    }
  }
  return { ok: false, message: 'It did not save. Nothing changed.' };
}

/**
 * `'layout'` and not the page: the name is in the file header, in the pinned
 * strip's sentence and on every one of the seven tabs, so revalidating the one
 * route the trainer happened to be on would leave their own heading stale.
 *
 * `/clients` as well, which the notes path deliberately does not do — a note
 * changes no roster row, and a name changes the one the trainer will look for
 * this person under.
 */
function refresh(clientId: string): void {
  revalidatePath(`/clients/${clientId}`, 'layout');
  revalidatePath('/clients');
}

/** Save the name and the number. Both are sent; both are required. */
export async function saveContact(
  clientId: string,
  version: string,
  name: string,
  phone: string,
): Promise<ContactWriteResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, message: 'A client needs a name.' };
  if (trimmed.length > 120) return { ok: false, message: 'That name is too long.' };

  const digits = cleanPhone(phone);
  if (digits.length !== 10) {
    return { ok: false, message: 'A mobile number is ten digits, without the country code.' };
  }

  try {
    await patchClient(clientId, { name: trimmed, phone: `+91${digits}` }, version);
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/* ──────────────────────────────────────────────── the physical card ── */

/**
 * Height, birth date and activity level — the client's own physical fields
 * (R30). Never a weight: a body is measured in an assessment and nowhere else.
 *
 * Every field is optional and a blank clears it. The bounds are refusals, not
 * clamps — 17cm is a typo for 170, and writing the nearest legal value writes a
 * number nobody typed. 18+ is checked here as well as refused by the server
 * (MUST-22), so the sentence arrives before the round trip.
 */
export async function savePhysical(
  clientId: string,
  version: string,
  input: { heightCm: string; dateOfBirth: string; activityLevel: string },
): Promise<ContactWriteResult> {
  const rawHeight = input.heightCm.trim();
  let heightCm: number | null = null;
  if (rawHeight) {
    const n = Number(rawHeight);
    if (!Number.isFinite(n) || n < 50 || n > 250) {
      return { ok: false, message: 'A height is in centimetres, somewhere between 50 and 250.' };
    }
    heightCm = Math.round(n * 10) / 10;
  }

  const rawDob = input.dateOfBirth.trim();
  let dateOfBirth: string | null = null;
  if (rawDob) {
    const born = new Date(`${rawDob}T00:00:00`);
    if (Number.isNaN(born.getTime())) return { ok: false, message: 'That is not a date.' };
    if (born.getFullYear() < 1900) return { ok: false, message: 'Check the year on that birth date.' };
    const adult = new Date(born);
    adult.setFullYear(born.getFullYear() + 18);
    if (adult.getTime() > Date.now()) return { ok: false, message: BY_CODE.CLIENT_UNDER_18 };
    dateOfBirth = rawDob;
  }

  const activityLevel = input.activityLevel || null;

  try {
    await patchClient(clientId, { heightCm, dateOfBirth, activityLevel }, version);
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
