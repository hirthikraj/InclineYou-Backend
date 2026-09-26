'use server';

import { revalidatePath } from 'next/cache';

import { NudgeApiError, postNudge, resetTemplate, saveTemplate } from './api';
import type { NudgeSendResult, NudgeTemplate } from './types';

/**
 * EVERY NUDGE WRITE ON THIS HALF.
 *
 * One send, two template edits. `lib/today/actions.ts` keeps its own `remind`,
 * `checkIn` and `wish` — see the note at the bottom of this file for why those
 * are not folded in here.
 */

/**
 * Turn a refusal into a sentence.
 *
 * The server writes one for every rule it enforces, so `detail` is preferred
 * over anything this file could invent — `lib/packs/api.ts` records what happens
 * when it is not read: *"A pack needs a price"* reaching the log and never the
 * trainer. The three cases below are the ones with no `detail` to read.
 */
function fail(error: unknown, subject: string): NudgeSendResult {
  if (error instanceof NudgeApiError) {
    if (error.detail) return { ok: false, message: error.detail };
    if (error.status === null) {
      return { ok: false, message: `${subject} could not reach the server. Nothing was drafted.` };
    }
    /*
     * The MESSAGING tier is 10 a minute because each call spends a WhatsApp on
     * somebody's behalf, so this is the one refusal a trainer will actually meet
     * — clearing six queue rows is six of the ten. It gets its own sentence
     * rather than "something went wrong", because the fix is to wait a minute
     * and nobody can guess that from a generic error.
     */
    if (error.status === 429) {
      return { ok: false, message: 'Too many messages in a minute. Wait a moment and try again.' };
    }
    if (error.status === 401 || error.status === 403) {
      return { ok: false, message: 'Your session expired. Sign in again.' };
    }
    return { ok: false, message: `${subject} did not go through. Nothing was drafted.` };
  }
  return { ok: false, message: `${subject} did not go through. Nothing was drafted.` };
}

/**
 * Draft a message to one client and hand back the WhatsApp link.
 *
 * ── NOT HELD, AND THE QUEUE'S TEN SECONDS ARE NOT AN INCONSISTENCY ───────────
 *
 * `lib/today/hold.ts` puts `Remind`, `Check in` and `Wish` behind ten seconds
 * with an Undo, and its reasoning is about the queue: six rows cleared in a row,
 * fast, from a list whose whole purpose is to be emptied — one mis-click in that
 * rhythm is a message to the wrong person.
 *
 * These buttons are the opposite act. A trainer pressing *Remind* on Meera's row
 * in the pending list, or *Send summary* under a session they have just finished,
 * has arrived at one person and pressed one button about them. And the review
 * step is already built into the delivery: nothing leaves this product — the
 * WhatsApp composer opens with the draft in it and the trainer reads it before
 * pressing send. Ten seconds of countdown on top of a composer they have to
 * confirm anyway is a delay with no failure to prevent.
 *
 * What DOES happen either way is the log row, and that is the honest cost of an
 * unheld send: a mis-pressed button marks the client contacted and quiets their
 * queue row for a week. It is why the button says who it is about.
 *
 * ── AND IT REVALIDATES /today ────────────────────────────────────────────────
 *
 * Because the queue's ranking reads the log now. A reminder sent from the pending
 * list has to take that client's row out of tomorrow morning's top six, and
 * without this it would not until the five-minute heartbeat.
 */
export async function sendNudge(
  clientId: string,
  templateName: string,
): Promise<NudgeSendResult> {
  try {
    const res = await postNudge(clientId, templateName);
    revalidatePath('/today');
    revalidatePath('/clients', 'layout');
    return { ok: true, whatsappUrl: res.whatsappUrl, draft: res.message, sentAt: res.sentAt };
  } catch (error) {
    return fail(error, 'The message');
  }
}

export interface TemplateWriteResult {
  ok: boolean;
  message?: string;
  template?: NudgeTemplate;
}

/**
 * Save the trainer's own wording.
 *
 * Returns the saved row so the editor can paint `isDefault: false` — and with it
 * the *Reset* button — without a second request. The library is eight cards on
 * one screen; re-reading all of them to learn one thing about one of them is a
 * round trip for nothing.
 */
export async function saveNudgeTemplate(
  name: string,
  body: string,
): Promise<TemplateWriteResult> {
  try {
    const template = await saveTemplate(name, body);
    revalidatePath('/settings/nudges');
    return { ok: true, template };
  } catch (error) {
    const result = fail(error, 'The template');
    return { ok: false, message: result.message };
  }
}

/** Back to the built-in wording. Answers the default, so the box can repaint. */
export async function resetNudgeTemplate(name: string): Promise<TemplateWriteResult> {
  try {
    const template = await resetTemplate(name);
    revalidatePath('/settings/nudges');
    return { ok: true, template };
  } catch (error) {
    const result = fail(error, 'The reset');
    return { ok: false, message: result.message };
  }
}

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY `lib/today/actions.ts` STILL HAS `remind`, `checkIn` AND `wish`
 *
 * They are the same POST. They are not folded into `sendNudge` because the
 * queue's contract is different in two ways that are not cosmetic: its verbs are
 * held for ten seconds behind an Undo (`HELD_VERBS`), and they answer an
 * `ActionResult` the queue's state machine reads — the same shape `renew`,
 * `markAttended` and `closeLogs` answer, so one component can drive eight verbs
 * without branching on which kind it is.
 *
 * Merging them would mean either giving every button in the app a hold it does
 * not need, or giving the queue's state machine a second result shape. Two thin
 * wrappers over one endpoint is the cheaper of the three, and it is written down
 * here so the third person to read it does not "fix" it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
