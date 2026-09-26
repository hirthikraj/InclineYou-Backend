'use server';

import { revalidatePath } from 'next/cache';

import {
  ClientDetailApiError,
  putClientContact,
  putClientPhysical,
} from './client-api';

/**
 * THE CONTACT WRITE PATH — the two fields a client record actually carries.
 *
 * ── WHY THIS IS TWO FIELDS AND NOT THE FIVE A FORM USUALLY HAS ───────────────
 *
 * `ClientDetailWire` is `name` and `phone`. There is no first/last split, no
 * e-mail, no address and no date of birth, and the form draws exactly what the
 * record holds rather than three inputs that would save nowhere. The gap is
 * written up in `BACKEND_GAPS.md`; until the API grows the fields, a form that
 * showed them would be a form that lies.
 *
 * ── THE PHONE IS THE LOGIN, WHICH IS WHY IT IS CHECKED HERE ──────────────────
 *
 * A client signs in with an OTP to the last ten digits of this field. So a save
 * that quietly accepted eight digits would not produce a client with a slightly
 * wrong number — it would produce a client who cannot open the portal, and no
 * screen anywhere would say so. Ten digits, or nothing is sent.
 *
 * ── AND NOTHING ELSE GOES IN THE BODY ────────────────────────────────────────
 *
 * `PUT /v1/clients/{id}` is partial, so this sends the two keys it owns and
 * leaves `metadata`, `weeklySchedule`, `status` and the rest of the row alone —
 * the same contract `putClientStatus` relies on, and the reason that one has to
 * read `metadata` before it writes and this one does not.
 */

export interface ContactWriteResult {
  ok: boolean;
  message?: string;
}

/** Digits only, and an Indian mobile typed with a leading 0 loses it. */
function cleanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('0') ? digits.slice(1) : digits;
}

function fail(error: unknown): ContactWriteResult {
  if (error instanceof ClientDetailApiError) {
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
    if (error.status === 409) {
      return { ok: false, message: 'That number is already on somebody else on your roster.' };
    }
    return { ok: false, message: 'It did not save. Nothing changed.' };
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
    await putClientContact(clientId, { name: trimmed, phone: digits });
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/* ──────────────────────────────────────────────── the physical card ── */

/**
 * Height and birth date.
 *
 * It was three fields. `sex` was stored for one reason — the constant that
 * differs between Mifflin-St Jeor's two forms — and when the metabolism rows
 * were cut on 15 Sep 2026 it lost its only reader, so the column went with
 * them. A sex field nothing reads is personal data held for no stated purpose.
 *
 * ── EVERY FIELD IS OPTIONAL, AND THAT IS THE POINT ───────────────────────────
 *
 * A trainer knows some of this about some of their roster. The card is not a
 * form that must be completed — it is three facts that improve two derived
 * figures when they are there, and an empty one is a normal state rather than an
 * error. So a blank clears the value rather than failing the save, and the only
 * refusals below are for values that are not facts at all.
 *
 * ── THE BOUNDS ARE REFUSALS, NOT CLAMPS ─────────────────────────────────────
 *
 * A height of 17cm is a typo for 170 and a birth date in 1893 is a typo for
 * 1993, and silently clamping either to the nearest legal value writes a number
 * the trainer did not type into a field a client may later read. The save is
 * refused with the reason instead.
 */
export async function savePhysical(
  clientId: string,
  input: { heightCm: string; dateOfBirth: string },
): Promise<ContactWriteResult> {
  const rawHeight = input.heightCm.trim();
  let heightCm: number | null = null;
  if (rawHeight) {
    const n = Number(rawHeight);
    if (!Number.isFinite(n) || n < 60 || n > 250) {
      return { ok: false, message: 'A height is in centimetres, somewhere between 60 and 250.' };
    }
    heightCm = Math.round(n * 10) / 10;
  }

  const rawDob = input.dateOfBirth.trim();
  let dateOfBirth: string | null = null;
  if (rawDob) {
    const at = new Date(`${rawDob}T00:00:00`).getTime();
    if (Number.isNaN(at)) return { ok: false, message: 'That is not a date.' };
    /* The future is the mistake this catches — a date picker opened on today
       and arrowed the wrong way. 130 years is the other end, and both are
       refusals rather than corrections. */
    if (at > Date.now()) return { ok: false, message: 'A birth date is in the past.' };
    if (Date.now() - at > 130 * 365.25 * 86_400_000) {
      return { ok: false, message: 'Check the year on that birth date.' };
    }
    dateOfBirth = rawDob;
  }

  try {
    await putClientPhysical(clientId, { heightCm, dateOfBirth });
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
