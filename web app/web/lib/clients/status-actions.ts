'use server';

import { revalidatePath } from 'next/cache';

import { api, ApiError } from '@/lib/http/client';

/**
 * PAUSE, RESUME, ARCHIVE, UNARCHIVE — the roster's verbs, on api-contract 1.1
 * Clients A1–A3 and unarchive.
 *
 * Each answers `{ client, effects }` (R72): the receipt reads the counts from
 * `effects`, and a 200 with all-zero effects means another tab got there first —
 * "already done", never an error.
 *
 * Pausing a client DOES pause their packs now (R19, decided 26 Sep): the server
 * stops every running pack's clock and cancels the sessions inside the pause, and
 * Resume starts the packs again and books the week. A re-pause restores only
 * what a pause cancelled, never a session somebody called off by hand (R70).
 */

export type ArchiveReason = 'goal_reached' | 'moved_away' | 'cost' | 'no_time' | 'switched_trainer' | 'other';

export interface StatusWriteResult {
  ok: boolean;
  message?: string;
  effects?: Record<string, number>;
}

function fail(error: unknown, subject: string): StatusWriteResult {
  if (error instanceof ApiError) {
    if (error.problem.detail) return { ok: false, message: error.problem.detail };
    if (error.status === null) return { ok: false, message: `${subject} could not reach the server. Nothing changed.` };
    if (error.status === 401 || error.status === 403) return { ok: false, message: 'Your session expired. Sign in again.' };
    if (error.status === 404) return { ok: false, message: `${subject}: that client is no longer there.` };
  }
  return { ok: false, message: `${subject} did not save. Nothing changed.` };
}

/** The roster, the client's file (its header is in the layout) and Today all draw the status. */
function refresh(clientId: string): void {
  revalidatePath('/clients');
  revalidatePath(`/clients/${clientId}`, 'layout');
  revalidatePath('/today');
}

async function verb(clientId: string, name: string, body: unknown, subject: string): Promise<StatusWriteResult> {
  try {
    const res = await api<{ effects: Record<string, number> }>(
      `/v1/clients/${encodeURIComponent(clientId)}/${name}`, { method: 'POST', body },
    );
    refresh(clientId);
    return { ok: true, effects: res?.effects };
  } catch (error) {
    return fail(error, subject);
  }
}

/** `pausedUntil` is the day they're back (`yyyy-MM-dd`), or null for open-ended. */
export async function pauseClient(clientId: string, pausedUntil: string | null): Promise<StatusWriteResult> {
  return verb(clientId, 'pause', { pausedUntil }, 'Pausing them');
}

export async function resumeClient(clientId: string): Promise<StatusWriteResult> {
  return verb(clientId, 'resume', {}, 'Resuming them');
}

/** Off the roster — nothing is deleted, and a pack still owed stays open for Business. */
export async function archiveClient(clientId: string, reason: ArchiveReason, note: string | null): Promise<StatusWriteResult> {
  return verb(clientId, 'archive', { reason, note: note?.trim() || null }, 'Archiving them');
}

export async function unarchiveClient(clientId: string): Promise<StatusWriteResult> {
  return verb(clientId, 'unarchive', {}, 'Bringing them back');
}

/**
 * The one verb with no way back — `deleteClient`, not `removeClient`, because
 * the button it sits behind says Delete. It is NOT the hard delete that copy
 * might suggest: the server tombstones the row the same way every soft delete
 * in this schema works, so payments and packages survive for the money book
 * and for GST records, and a pack still owed stays open exactly as archive
 * leaves it. What is gone from every screen: the phone number, birth day,
 * goal, activity level, height and every note.
 *
 * `confirmName` is checked server-side against the client's own name — typing
 * it is the only proof of which client is going, the same shape closing the
 * trainer's own account uses.
 */
export async function deleteClient(clientId: string, confirmName: string): Promise<StatusWriteResult> {
  return verb(clientId, 'delete', { confirmName }, 'Deleting them');
}
