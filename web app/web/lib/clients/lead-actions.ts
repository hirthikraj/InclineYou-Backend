'use server';

import { revalidatePath } from 'next/cache';

import { ClientDetailApiError, deleteLeadContact, patchClient, postLeadContact } from './client-api';
import { closes, LEAD_CHANNELS, LEAD_OUTCOMES, LEAD_SOURCES, NOTE_MAX, SOURCE_DETAIL_MAX } from './lead';

/**
 * THE LEAD'S WRITE PATH (V48) — log a contact, take it back, and edit where they came from, what they asked about and
 * when to follow up. None of it waits for consent (the owner's call, 23 Nov 2026), and none of it sends anything.
 *
 * Every write refreshes Today and the roster as well as the file, because the follow-up date is what puts a prospect on
 * Today's queue and on the roster's *Follow up* line: a contact logged here must take the row off there at once.
 */

export interface LeadWriteResult {
  ok: boolean;
  message?: string;
  /** On a logged contact: its id, for the toast's Undo. */
  contactId?: string;
}

function fail(error: unknown, subject: string): LeadWriteResult {
  if (error instanceof ClientDetailApiError) {
    if (error.status === null) return { ok: false, message: `${subject} could not reach the server. Nothing changed.` };
    if (error.status === 401 || error.status === 403) return { ok: false, message: 'Your session expired. Sign in again.' };
    if (error.status === 404) return { ok: false, message: 'That client is no longer there.' };
    if (error.code === 'PRECONDITION_FAILED') {
      return { ok: false, message: 'This client was changed somewhere else. Reload the page and try again.' };
    }
    /* 400 VALIDATION names the field in its own sentence (`nextFollowUpOn: today or later`). */
    if (error.status === 400 && error.detail) return { ok: false, message: readable(error.detail) };
  }
  return { ok: false, message: `${subject} did not save. Nothing changed.` };
}

/** The server names the wire field; the trainer reads the label on the screen. */
function readable(detail: string): string {
  return detail
    .replace(/^nextFollowUpOn: today or later$/, 'Pick today or a later day for the follow-up.')
    .replace(/^nextFollowUpOn: within a year$/, 'Pick a follow-up within the next year.')
    .replace(/^interestedPackId: .*$/, 'That pack is no longer on your price list.')
    .replace(/^note: .*$/, `What they said fits in ${NOTE_MAX} characters.`);
}

function refresh(clientId: string): void {
  revalidatePath(`/clients/${clientId}`, 'layout');
  revalidatePath('/clients');
  revalidatePath('/today');
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Log one call, chat or visit. `nextFollowUpOn` REPLACES the client's follow-up (null clears it); a closing outcome
 * takes none. `id` is minted when the composer opens, so a retried Save answers the contact the first attempt made.
 */
export async function logLeadContact(
  clientId: string,
  input: { id: string; channel: string; outcome: string; note: string; nextFollowUpOn: string | null },
): Promise<LeadWriteResult> {
  if (!LEAD_CHANNELS.some((c) => c.id === input.channel)) return { ok: false, message: 'Pick how you reached them.' };
  if (!LEAD_OUTCOMES.some((o) => o.id === input.outcome)) return { ok: false, message: 'Pick what came of it.' };
  const note = input.note.trim();
  if (note.length > NOTE_MAX) return { ok: false, message: `What they said fits in ${NOTE_MAX} characters.` };
  const next = closes(input.outcome) ? null : input.nextFollowUpOn;
  if (next !== null && !ISO.test(next)) return { ok: false, message: 'That follow-up is not a date.' };
  try {
    const saved = await postLeadContact(clientId, {
      id: input.id,
      channel: input.channel,
      outcome: input.outcome,
      note: note || null,
      nextFollowUpOn: next,
    });
    refresh(clientId);
    return { ok: true, contactId: saved.contact.id };
  } catch (error) {
    return fail(error, 'The contact');
  }
}

/** The toast's Undo. */
export async function undoLeadContact(clientId: string, contactId: string): Promise<LeadWriteResult> {
  try {
    await deleteLeadContact(clientId, contactId);
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'Undo');
  }
}

/**
 * Where they came from, what they asked about, and the follow-up date set by hand. Only the keys given are sent — the
 * server's *absent means leave it alone* — and an empty answer clears.
 */
export async function saveLead(
  clientId: string,
  input: { source?: string | null; sourceDetail?: string | null; interestedPackId?: string | null; nextFollowUpOn?: string | null },
): Promise<LeadWriteResult> {
  const patch: Parameters<typeof patchClient>[1] = {};
  if (input.source !== undefined) {
    if (input.source !== null && !LEAD_SOURCES.some((s) => s.id === input.source)) {
      return { ok: false, message: 'Pick where they came from.' };
    }
    patch.leadSource = input.source;
  }
  if (input.sourceDetail !== undefined) {
    const detail = (input.sourceDetail ?? '').trim();
    if (detail.length > SOURCE_DETAIL_MAX) return { ok: false, message: `Keep that under ${SOURCE_DETAIL_MAX} characters.` };
    patch.leadSourceDetail = detail || null;
  }
  if (input.interestedPackId !== undefined) patch.interestedPackId = input.interestedPackId || null;
  if (input.nextFollowUpOn !== undefined) {
    if (input.nextFollowUpOn !== null && !ISO.test(input.nextFollowUpOn)) {
      return { ok: false, message: 'That follow-up is not a date.' };
    }
    patch.nextFollowUpOn = input.nextFollowUpOn;
  }
  if (Object.keys(patch).length === 0) return { ok: true };
  try {
    await patchClient(clientId, patch);
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'The lead');
  }
}
