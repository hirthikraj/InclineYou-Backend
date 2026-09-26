'use server';

import { revalidatePath } from 'next/cache';

import {
  ClientDetailApiError,
  archiveClientRow,
  getClientDetail,
  putClientStatus,
} from './client-api';

/**
 * PAUSE, RESUME, ARCHIVE — the roster's own three verbs.
 *
 * They sat on the row menu marked *Soon* and disabled since the screen was
 * written, and the mark had expired: **every derived half of both states was
 * already built.** `buildRoster` drops `archived` rows before it builds one and
 * still counts them into `Roster.archived`; `deriveTag` ranks `paused` above
 * every tag it could otherwise compute; `buildRow` writes *Paused 4 Sep · 6
 * sessions left* off `metadata.pausedAt`; `SEGMENTS` carries a *Paused* filter
 * and `TAGS` its hint, *Paused by you*. The reader for all of that has been on
 * the screen the whole time with nothing able to produce it. What was missing
 * was two REST calls.
 *
 * ── WHY "PAUSED BY YOU" IS THE WHOLE POINT ───────────────────────────────────
 *
 * Every other tag on the roster is DERIVED — *At risk*, *Expiring*, *Lapsed* are
 * the app reading sessions and packs and drawing a conclusion. `paused` is the
 * one a trainer asserts, and it outranks the derived ones on purpose: a client
 * who is on holiday for a month and has not trained for three weeks is not
 * drifting, and a roster that shouts *At risk* at their trainer about somebody
 * they agreed to pause is a roster that gets ignored. So pausing does not change
 * a single fact about the client — it changes what the screen is allowed to
 * conclude from them.
 *
 * ── PAUSING A CLIENT IS NOT PAUSING THEIR PACK ───────────────────────────────
 *
 * Deliberately, and the two must not be folded together. `POST /v1/packages/{id}/pause`
 * is a MONEY event: it stops an expiry clock and hands the days back on resume,
 * it writes a `package_adjustment` row, and it is refused if the pack is already
 * paused. This is a roster statement with no money in it. A trainer who wants
 * both does both, from the two screens that own them — and the one who pauses a
 * client for a fortnight has not asked anybody for a refund of a fortnight.
 *
 * ── AND `pausedAt` IS WHY PAUSE READS BEFORE IT WRITES ───────────────────────
 *
 * `metadata` is one JSON object, so `PUT` with `{ pausedAt }` alone would take
 * `mode` with it — the legacy key `readMode` still falls back to, per
 * `lib/today/mode.ts`. The read is one request against a book this action is
 * about to invalidate anyway. Resume does not clear the stamp: it is the day the
 * last pause began and it is dead the moment `status` moves, where deleting it
 * would cost a request to say nothing.
 */

export interface StatusWriteResult {
  ok: boolean;
  message?: string;
}

/**
 * The server's own sentence where there is one — `ClientDetailApiError` carries
 * a `ProblemDetail`'s `detail` for exactly this. The cases below are the ones
 * with no sentence to read.
 */
function fail(error: unknown, subject: string): StatusWriteResult {
  if (error instanceof ClientDetailApiError) {
    if (error.detail) return { ok: false, message: error.detail };
    if (error.status === null) {
      return { ok: false, message: `${subject} could not reach the server. Nothing changed.` };
    }
    if (error.status === 401 || error.status === 403) {
      return { ok: false, message: 'Your session expired. Sign in again.' };
    }
    if (error.status === 404) {
      return { ok: false, message: `${subject}: that client is no longer there.` };
    }
    return { ok: false, message: `${subject} did not save. Nothing changed.` };
  }
  return { ok: false, message: `${subject} did not save. Nothing changed.` };
}

/**
 * Three surfaces, because `status` reaches all three.
 *
 * The roster is the obvious one. `/clients/[clientId]` is `'layout'` for the
 * reason the notes path already gives — the status tag is in the file's HEADER,
 * which every tab under it renders. `/today` is the one worth stating: the deck
 * builds its cards from the same client rows, so a client archived from the
 * roster has to stop appearing on the screen a trainer starts their morning on.
 */
function refresh(clientId: string): void {
  revalidatePath('/clients');
  revalidatePath(`/clients/${clientId}`, 'layout');
  revalidatePath('/today');
}

/** Stop the roster drawing conclusions about somebody who is away. */
export async function pauseClient(clientId: string): Promise<StatusWriteResult> {
  try {
    const before = await getClientDetail(clientId);
    await putClientStatus(clientId, {
      status: 'paused',
      metadata: { ...(before.metadata ?? {}), pausedAt: Date.now() },
    });
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'Pausing them');
  }
}

/**
 * Back to `active`, and the derived tags get their turn again.
 *
 * Whatever the data says on the day they come back is what the roster will say
 * — a pause that ran through a pack's expiry hands back an *Expiring* row, and
 * that is correct: the tag was suppressed, not the fact.
 */
export async function resumeClient(clientId: string): Promise<StatusWriteResult> {
  try {
    await putClientStatus(clientId, { status: 'active' });
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'Resuming them');
  }
}

/**
 * Off the roster. NOT a deletion — the row, the sessions, the payments and the
 * history all stay, and the business report still counts them, which is why the
 * money book is not revalidated differently from anything else here.
 *
 * There is no un-archive on this half yet, and it is NOT a backend gap:
 * `GET /v1/clients?status=archived` already answers, and `Roster.archived` is
 * already counted from the unfiltered rows. What is missing is a screen —
 * `SEGMENTS` has no *Archived* filter, so the row leaves and there is nowhere to
 * bring it back from. That is the whole reason the menu asks first, and whoever
 * builds the eighth segment can delete the confirm along with this paragraph.
 */
export async function archiveClient(clientId: string): Promise<StatusWriteResult> {
  try {
    await archiveClientRow(clientId);
    refresh(clientId);
    return { ok: true };
  } catch (error) {
    return fail(error, 'Archiving them');
  }
}
