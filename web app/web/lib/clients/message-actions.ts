'use server';

import { revalidatePath } from 'next/cache';

import { ClientDetailApiError, deleteMessage, patchMessage, postMessage } from './client-api';
import { MAX_MESSAGE } from './message-limits';

/**
 * LINES TO THE CLIENT — api-contract 1.2, tr-a7.
 *
 * A message is plain words in the trainer's voice, at most a thousand characters, and nothing is sent to WhatsApp: the
 * client reads it in the portal. The id is minted by the composer when it opens and kept until a send lands, so a retry after
 * a dropped response answers the message the first press made instead of writing two.
 */
export interface MessageWriteResult {
  ok: boolean;
  message?: string;
}

/** The refusals a trainer can act on, by `code` — the UI never branches on prose. */
const BY_CODE: Record<string, string> = {
  CLIENT_NOT_ON_PORTAL: 'They haven’t joined the portal, so there is nowhere for a message to go.',
  MESSAGE_ALREADY_READ: 'They have already opened it, so it can’t be reworded. Write a new one.',
  RECAP_EXISTS: 'There is already a note about that session. Edit it instead.',
  PRECONDITION_FAILED: 'This message changed somewhere else. Reload the page and try again.',
  ID_CONFLICT: 'That message could not be saved. Try again.',
};

function fail(error: unknown): MessageWriteResult {
  if (error instanceof ClientDetailApiError) {
    if (error.code && BY_CODE[error.code]) return { ok: false, message: BY_CODE[error.code] };
    if (error.detail) return { ok: false, message: error.detail };
    if (error.status === null) return { ok: false, message: 'Could not reach the server. Nothing was sent.' };
    if (error.status === 401 || error.status === 403) return { ok: false, message: 'Your session expired. Sign in again.' };
    if (error.status === 404) return { ok: false, message: 'That message is no longer there.' };
  }
  return { ok: false, message: 'It did not go through. Nothing changed.' };
}

/** The file's Personal information tab reads the list; nothing else on the roster does. */
function refresh(clientId: string): void {
  revalidatePath(`/clients/${clientId}`, 'layout');
}

function check(body: string): string | null {
  const text = body.trim();
  if (!text) return 'Write something first.';
  if (text.length > MAX_MESSAGE) return `That is ${text.length - MAX_MESSAGE} characters over the ${MAX_MESSAGE} limit.`;
  return null;
}

export async function sendMessage(clientId: string, id: string, body: string, weekly: boolean): Promise<MessageWriteResult> {
  const problem = check(body);
  if (problem) return { ok: false, message: problem };
  try {
    await postMessage(clientId, { id, body: body.trim(), ...(weekly ? { kind: 'weekly' as const } : {}) });
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function editMessage(clientId: string, messageId: string, version: string, body: string): Promise<MessageWriteResult> {
  const problem = check(body);
  if (problem) return { ok: false, message: problem };
  try {
    await patchMessage(clientId, messageId, body.trim(), version);
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** Soft, and there is no way back from here — the client may have read it — so the screen asks first. */
export async function retractMessage(clientId: string, messageId: string): Promise<MessageWriteResult> {
  try {
    await deleteMessage(clientId, messageId);
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
