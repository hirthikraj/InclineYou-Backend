'use server';

import { revalidatePath } from 'next/cache';

import {
  ClientDetailApiError,
  createNote,
  editNote,
  removeNote,
} from './client-api';

/**
 * THE NOTES WRITE PATH.
 *
 * Four verbs, one failure shape, and one thing worth stating before any of them:
 * **a note is free text and the product does not read it.** There is no injury
 * field, no condition field and no PAR-Q flag anywhere on this path, and there
 * must never be one — `InclineYou_MVP_interaction_map.md` excludes health data outright
 * under the DPDP Act 2023, and a field that tells a medical note apart from any
 * other note makes this a health record whatever it is called.
 *
 * A trainer typing "left knee — no deep squats" into the pinned strip is doing
 * what they would do on a paper card. The software stores the characters, shows
 * them back at the top of the file, and classifies nothing.
 */

export interface NoteWriteResult {
  ok: boolean;
  message?: string;
}

function fail(error: unknown, subject: string): NoteWriteResult {
  if (error instanceof ClientDetailApiError) {
    if (error.status === null) {
      return { ok: false, message: `${subject} could not reach the server. Nothing changed.` };
    }
    if (error.status === 401 || error.status === 403) {
      return { ok: false, message: 'Your session expired. Sign in again.' };
    }
    if (error.status === 404) {
      return { ok: false, message: `${subject}: that note is no longer there.` };
    }
    if (error.status === 400) {
      return { ok: false, message: `${subject} needs some text, and under 4,000 characters.` };
    }
    return { ok: false, message: `${subject} did not save. Nothing changed.` };
  }
  return { ok: false, message: `${subject} did not save. Nothing changed.` };
}

/**
 * `'layout'` because a note reaches two surfaces of the same file — the pinned
 * strip in the header and the list in the notes tab — and every tab is a route
 * under `/clients/[clientId]`. Revalidating the one page a trainer happened to
 * be on would leave the strip stale on the other five.
 *
 * Nothing outside the file is revalidated. A note changes no count, no queue and
 * no total, so `/today` and `/clients` have nothing to redraw.
 */
function refresh(clientId: string): void {
  revalidatePath(`/clients/${clientId}`, 'layout');
}

/**
 * Write a note. `pinned` puts it in the always-visible strip; `shared` lets the
 * client read it.
 *
 * Both default to `false`, and `shared` defaulting that way is the one that
 * matters: a caller that forgets the argument writes a private note, which is
 * the only direction this mistake is allowed to go.
 */
export async function addNote(
  clientId: string,
  body: string,
  pinned = false,
  shared = false,
): Promise<NoteWriteResult> {
  const text = body.trim();
  if (!text) return { ok: false, message: 'A note needs some text.' };
  try {
    await createNote(clientId, text, pinned, shared);
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'The note');
  }
}

/** Rewrite a note's text. The pin is left alone — the field is not sent. */
export async function saveNote(
  clientId: string,
  noteId: string,
  body: string,
): Promise<NoteWriteResult> {
  const text = body.trim();
  if (!text) return { ok: false, message: 'A note needs some text.' };
  try {
    await editNote(clientId, noteId, { body: text });
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'The note');
  }
}

/** Move a note into or out of the pinned strip. The text is not sent. */
export async function setNotePinned(
  clientId: string,
  noteId: string,
  pinned: boolean,
): Promise<NoteWriteResult> {
  try {
    await editNote(clientId, noteId, { pinned });
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, pinned ? 'Pinning it' : 'Unpinning it');
  }
}

/**
 * Show this note to the client, or take it back. The text is not sent.
 *
 * ── AND IT REVALIDATES THE PORTAL, WHICH THE OTHER THREE DO NOT ──────────────
 *
 * `addNote`, `saveNote` and `setNotePinned` change what the TRAINER sees, so
 * `refresh` covers the client file and stops. This one changes what somebody
 * else sees: a shared note joins `GET /v1/me/messages` beside the lines the
 * trainer wrote to them, and un-sharing takes it off that screen again. A
 * trainer who turns the switch off has retracted something, and the `/me` route
 * has to agree before the client next loads it.
 */
export async function setNoteShared(
  clientId: string,
  noteId: string,
  shared: boolean,
): Promise<NoteWriteResult> {
  try {
    await editNote(clientId, noteId, { sharedWithClient: shared });
    refresh(clientId);
    revalidatePath('/me', 'layout');
    return { ok: true };
  } catch (error) {
    return fail(error, shared ? 'Sharing it' : 'Making it private');
  }
}

export async function deleteNote(
  clientId: string,
  noteId: string,
): Promise<NoteWriteResult> {
  try {
    await removeNote(clientId, noteId);
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'Deleting the note');
  }
}
