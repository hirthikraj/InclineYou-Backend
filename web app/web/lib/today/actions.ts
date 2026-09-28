'use server';

import { revalidatePath } from 'next/cache';

import { api, ApiError } from '@/lib/http/client';
/* HOLD_SECONDS, HELD_VERBS and ActionResult live next door because a 'use server'
   module may export only async functions — see lib/today/hold.ts. */
import type { ActionResult } from './hold';

/**
 * The verbs on the queue — and the one design decision that separates this screen
 * from the phone's.
 *
 * `Remind`, `Check in`, `Wish`, `Renew`, `Mark`, `Close`, plus the two writes that
 * silence a row. The first three message somebody and are held; the rest write a
 * row and tell nobody, so they are instant. `Close` is also the only one that does
 * not go through REST at all — see its own note. `Assign` is not here, because a
 * navigation is not a write: the row carries an `href` and the queue renders a
 * link.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PHONE NEVER SENDS. THIS SCREEN DOES.
 *
 * `actOn` in the app's home screen navigates: tapping **Remind** opens the
 * client's file, and its own comment says why — "§ 04 is explicit that none of
 * them ever sends anything silently". That is right on a phone, where the
 * client's file is one tap away and the queue is three rows in a scroll.
 *
 * On the web it makes the queue a menu rather than a queue. Six rows, each
 * costing a navigation and a return, on a screen whose whole argument is that a
 * trainer's home is a to-do list. So the web COMMITS IN PLACE — and the ten
 * seconds below are what that promotion costs, not a patch on an oversight.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE HOLD BELONGS TO THE VERB, NOT TO THE ROW
 *
 * `Remind`, `Check in` and `Wish` send a WhatsApp message to a client. Undo after
 * the message has gone is an apology rather than an undo, so the SENDING is held
 * for ten seconds, not just the row's appearance — the request has not left this
 * server when the row says "Held".
 *
 * `Renew` writes a package row, `Mark` stamps a session done and `Close` shuts a
 * log; none of them tells anybody. Holding any of the three would make it feel
 * broken. So the line is whether somebody outside this account finds out, which is
 * the honest reading of `AttentionItem.action` rather than a blanket delay.
 *
 * The hold itself lives in the browser (`AttentionQueue`), because that is where
 * the ten seconds are visible and interruptible. This module is only ever called
 * once the ten seconds are up — there is nothing here to cancel.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE RULE THIS HALF CANNOT ENFORCE, AND SAYS SO
 *
 * `COOLDOWN_DAYS` in `app/src/nudges/rules.ts` — "never twice in seven days to
 * the same person" — is computed ON THE PHONE from the local `nudge_log` table.
 * The backend logs every nudge but does not enforce the cap; `nudge_logs` reaches
 * the wire only inside the sync envelope, so this half cannot read it without the
 * full pull `api.ts` exists to avoid.
 *
 * The consequence is stated rather than hidden: a reminder sent from the web is
 * not checked against one sent from the phone this morning. It IS logged, so the
 * phone sees it and its own cap holds from then on. Closing this properly means
 * the cap moving to the backend — where it belongs, since it is a promise to the
 * client rather than a preference of the device — and that is a backend change
 * this pass did not make.
 */

/**
 * The MESSAGING tier is 10 requests a minute because each call spends a WhatsApp
 * message, so a 429 here is the one refusal a trainer will actually meet — six
 * rows cleared in a row is six of the ten. It gets its own sentence rather than
 * "something went wrong", because the fix is to wait a minute and the trainer
 * cannot guess that.
 */
function readFailure(error: unknown, verb: string): ActionResult {
  // `ApiError` is the common client's (`lib/http/client.ts`); a null status is
  // "nothing answered", which reads as unreachable below.
  if (error instanceof ApiError && error.status !== null) {
    if (error.status === 429) {
      return { ok: false, message: 'Too many messages in a minute. Wait a moment and try again.' };
    }
    if (error.status === 404) {
      return { ok: false, message: 'That client is no longer on your roster.' };
    }
    if (error.status === 401 || error.status === 403) {
      return { ok: false, message: 'Your session expired. Sign in again.' };
    }
    return { ok: false, message: `${verb} did not go through. Nothing was sent.` };
  }
  return { ok: false, message: `${verb} could not reach the server. Nothing was sent.` };
}

/** `NudgeDraftService.Draft` — api-contract Today A2. */
interface NudgeWire {
  id: string;
  whatsappUrl: string;
  message: string;
  sentAt: number;
}

type NudgeTemplateName = 'payment_reminder' | 'check_in' | 'missed_session' | 'well_done';

/**
 * `POST /v1/clients/{clientId}/nudges` (1.1). `requestId` is the id the server
 * stores the draft under, and it must come from the BROWSER — one per attempt,
 * kept across its retries (`AttentionQueue`'s `attempts`). Minted here, every
 * call would carry a fresh one and a retry would log a second row, which is the
 * duplicate the id exists to prevent: the log is append-only and it would skew
 * the cooldown. The fallback is only for a caller that has no attempt to name.
 */
function draft(clientId: string, template: NudgeTemplateName, requestId?: string): Promise<NudgeWire> {
  return api<NudgeWire>(`/v1/clients/${encodeURIComponent(clientId)}/nudges`, {
    method: 'POST',
    body: { id: requestId ?? crypto.randomUUID(), template },
  });
}

/** 409 CLIENT_NO_PHONE is the one refusal with its own fix: add a number. */
function noPhone(error: unknown): ActionResult | null {
  return error instanceof ApiError && error.problem.code === 'CLIENT_NO_PHONE'
    ? { ok: false, message: 'This client has no phone number on file. Add one in their file first.' }
    : null;
}

/**
 * Money owed. `payment_reminder` is the one template the backend fills with live
 * figures — it looks the outstanding amount up itself rather than trusting a
 * number the caller passes, which is what keeps the message and the payments list from
 * disagreeing.
 */
export async function remind(clientId: string, requestId?: string): Promise<ActionResult> {
  try {
    const res = await draft(clientId, 'payment_reminder', requestId);
    revalidatePath('/today');
    return { ok: true, whatsappUrl: res.whatsappUrl, message: res.message };
  } catch (error) {
    return noPhone(error) ?? readFailure(error, 'The reminder');
  }
}

/**
 * Gone quiet, or two sessions missed. `check_in` and `missed_session` — not
 * `payment_reminder`, because the difference between asking for a payment and
 * asking after somebody is the whole reason there are two verbs.
 *
 * ── ONE VERB, TWO TEMPLATES, AND THE TEMPLATE IS THE CALLER'S ────────────────
 *
 * Both bands read **Check in** on the row, because they are the same act as far as
 * the trainer is concerned. The MESSAGE is not the same: `check_in` asks how the
 * week is going, which is a question; `missed_session` names a thing that happened
 * and offers to move the week around, which is what somebody who has missed two
 * needs to hear. Sending the general one to a client who has missed two sessions
 * reads as not having noticed, which is worse than saying nothing.
 *
 * So the queue passes the band's own template rather than this function inferring
 * one from a row it cannot see. Defaulted, so an older caller still compiles into
 * the behaviour it had.
 */
export async function checkIn(
  clientId: string,
  templateName: 'check_in' | 'missed_session' = 'check_in',
  requestId?: string,
): Promise<ActionResult> {
  try {
    const res = await draft(clientId, templateName, requestId);
    revalidatePath('/today');
    return { ok: true, whatsappUrl: res.whatsappUrl, message: res.message };
  } catch (error) {
    return noPhone(error) ?? readFailure(error, 'The check-in');
  }
}

/**
 * A milestone — the hundredth session delivered.
 *
 * `well_done`, a template V12's `nudge_rule` has declared since the drawer was
 * designed and nothing ever rendered. The backend does not interpolate the figure
 * and that is deliberate: it would have to count the sessions again to say "your
 * 100th", which is a second opinion about a number the trainer is looking at on
 * the row. The draft says well done; the trainer adds the number in their own
 * words, in their own composer.
 *
 * Held like the other two messages, for the same reason and one more — this is the
 * one message on the screen that cannot be walked back with a follow-up. A
 * mistaken payment reminder is embarrassing; a mistaken "well done, you've been
 * showing up" to somebody who has not is worse.
 */
export async function wish(clientId: string, requestId?: string): Promise<ActionResult> {
  try {
    const res = await draft(clientId, 'well_done', requestId);
    revalidatePath('/today');
    return { ok: true, whatsappUrl: res.whatsappUrl, message: res.message };
  } catch (error) {
    return noPhone(error) ?? readFailure(error, 'The message');
  }
}

/**
 * Yesterday's sessions, marked attended.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THIS IS THE ONLY INSTANT VERB ON THE QUEUE THAT MOVES MONEY
 *
 * `POST /v1/sessions/{id}/done` "creates the corresponding workout session and
 * **decrements the client's session pack**". So marking a session is not the
 * housekeeping it looks like: it is the write that makes every pack figure on this
 * screen correct, which is exactly why the row outranks `log-open`.
 *
 * It is still instant rather than held, because the hold is about whether somebody
 * outside this account finds out and nobody does. If the trainer marked the wrong
 * session, the money book can undo a pack decrement and the diary can re-open the
 * booking; a WhatsApp that has been read cannot be un-read. Different affordance,
 * different guarantee.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SEQUENTIAL, NOT `Promise.all`, AND THAT IS THE POINT
 *
 * Each call decrements the same pack. Fired in parallel against a pack with one
 * session left, two requests both read `sessions_remaining = 1` and both write 0 —
 * a lost decrement, on the figure the whole first priority of this queue is about.
 * The endpoint is `@Transactional` per call and nothing serialises the callers, so
 * the serialising happens here.
 *
 * And a partial failure is REPORTED rather than rolled back. Three sessions where
 * the second 404s leaves one marked, and saying "1 of 3 marked" is the truth; a
 * silent all-or-nothing would need an un-mark endpoint that does not exist, and
 * pretending none of them landed would make the next refresh look like a bug.
 */
export async function markAttended(sessionIds: string[]): Promise<ActionResult> {
  if (sessionIds.length === 0) {
    return { ok: false, message: 'There is no session left to mark.' };
  }
  try {
    /*
     * One batch call — `POST /v1/sessions/done`. The server marks them in the
     * order they happened, each in its own transaction, and charges the pack
     * under a row lock, so the old one-at-a-time loop guarding the pack count
     * is gone. A session marked but not charged (no pack, a paused or empty
     * pack) is still marked: that is the fact the row asked about.
     */
    const { results } = await api<{ results: MarkResult[] }>('/v1/sessions/done', {
      method: 'POST',
      body: { sessionIds },
    });
    revalidatePath('/today');
    revalidatePath('/schedule');

    const marked = results.filter((r) => MARKED.has(r.outcome)).length;
    if (marked === results.length) return { ok: true };
    const why = results.find((r) => !MARKED.has(r.outcome));
    return {
      ok: false,
      message: `${marked} of ${results.length} marked. ${NOT_MARKED[why?.reason ?? why?.outcome ?? ''] ?? 'The rest could not be marked.'}`,
    };
  } catch (error) {
    return readFailure(error, 'Marking the session');
  }
}

/** One outcome of `POST /v1/sessions/done` — `SessionWriteService.MarkResult`. */
interface MarkResult {
  sessionId: string;
  outcome: 'done' | 'already_done' | 'not_charged' | 'skipped' | 'not_found';
  packageId?: string;
  sessionsRemaining?: number;
  reason?: string;
}

/** Outcomes where the session now reads delivered, charged or not. */
const MARKED = new Set(['done', 'already_done', 'not_charged']);

const NOT_MARKED: Record<string, string> = {
  SESSION_CANCELLED: 'One was cancelled, so it was left alone.',
  // 1.1: a no-show CAN be marked done now (the client came after all); what
  // is skipped instead is a session whose start time hasn't come.
  SESSION_NOT_STARTED: "One hasn't started yet, so it was left alone.",
  not_found: 'One is no longer in your diary.',
};

/* ──────────────────────────────────────────────── silencing a row ────────── */

/**
 * "Not now" — a snooze, or "not again" — a permanent dismissal. V28.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A SERVER WRITE AND NOT A BROWSER KEY
 *
 * The filter chips on this screen live in `localStorage`, and this deliberately
 * does not. A filter is a preference of a device — "show me the floor sessions" —
 * and a dismissal is a fact about a client: the trainer has dealt with Meera's
 * pack, off-app, and nothing should raise it again. Three consequences follow, and
 * the first is the one that decided it: a gym desktop is shared, so a browser key
 * silences the row for whoever sits down next and for nobody's second machine.
 *
 * `band` travels with the write, and the whole trustworthiness of the feature
 * rests on it. It records how bad the thing was WHEN it was silenced, so an
 * escalation comes back: see `isSilenced` in `deck.ts`. Passing the wrong band
 * here would hide a pack going empty behind a Monday dismissal of a pack running
 * low — silently, and on the priority this queue puts first.
 *
 * Not held. Nothing leaves for the client and the row's own Undo is the affordance
 * — and unlike the messages, the undo here is a real reversal: `restoreRow`
 * deletes the row this created.
 */
export async function dismissRow(
  clientId: string,
  kind: string,
  band: string,
  snoozeUntil: number | null,
): Promise<ActionResult & { dismissalId?: string }> {
  try {
    await api(`/v1/attention/dismissals/${encodeURIComponent(clientId)}/${encodeURIComponent(kind)}`, {
      method: 'PUT',
      body: { band, snoozedUntil: snoozeUntil },
    });
    /*
     * THE ONE WRITE ON THIS SCREEN THAT DELIBERATELY DOES NOT REVALIDATE.
     *
     * Every other verb leaves the row in place — a reminded client still owes the
     * money, so the row survives the refresh and carries its receipt. A dismissed
     * row does not: revalidating here removes it from `Deck.attention` on the next
     * paint, which takes the receipt and its Undo with it. The trainer would press
     * Dismiss and watch the row vanish with no way back except finding the folded
     * list under the card.
     *
     * So the row stays until something else refreshes the screen — the five-minute
     * heartbeat, a navigation, another verb — by which time the trainer has had the
     * undo in front of them and the row is genuinely gone. `restoreRow` DOES
     * revalidate, because bringing a row back is exactly a change to the queue.
     */
    // A dismissal has no id of its own (R1): client + kind is its key, and
    // this is the handle Undo and Restore send back — the same one the deck
    // builds for `Deck.silenced`.
    return { ok: true, dismissalId: `${clientId}:${kind}` };
  } catch (error) {
    return readFailure(error, 'Dismissing the row');
  }
}

/**
 * Put a silenced row back in the queue.
 *
 * Keyed by client + kind — the `dismissalId` the browser holds is exactly that,
 * `"<clientId>:<kind>"`, whether it came from `Deck.silenced` (the folded list)
 * or from the `dismissRow` that just created it (the row's Undo). The server
 * answers 204 even when the row was already gone (another tab got there
 * first), because "not silenced" is then true either way.
 */
export async function restoreRow(dismissalId: string): Promise<ActionResult> {
  const [clientId, kind] = dismissalId.split(':');
  try {
    await api(`/v1/attention/dismissals/${encodeURIComponent(clientId)}/${encodeURIComponent(kind)}`, {
      method: 'DELETE',
    });
    revalidatePath('/today');
    return { ok: true };
  } catch (error) {
    return readFailure(error, 'Restoring the row');
  }
}

/**
 * Close the logs a queue row counted — `POST /v1/sessions/end`.
 *
 * In v1 a log IS the scheduled session (started_at / ended_at), so the ids here
 * are session ids, and the server closes every open one in a single UPDATE. A
 * log someone else already closed keeps its time and comes back `skipped`
 * (`ALREADY_CLOSED`) in `results[]`, which is still success: the state the
 * trainer asked for is true. Closing a
 * log does not mark the session delivered or charge the pack.
 *
 * Not held: nothing leaves for the client.
 */
export async function closeLogs(sessionIds: string[]): Promise<ActionResult> {
  if (sessionIds.length === 0) {
    return { ok: false, message: 'There is no open log left to close.' };
  }
  try {
    await api<{ results: { sessionId: string; outcome: string; reason?: string }[] }>('/v1/sessions/end', {
      method: 'POST',
      body: { sessionIds },
    });
    revalidatePath('/today');
    revalidatePath('/schedule');
    return { ok: true };
  } catch (error) {
    return readFailure(error, 'Closing the log');
  }
}

/**
 * Renew — `POST /v1/packages/{packageId}/renew`, one click and no body.
 *
 * The server copies the terms: a price-list pack that is still on sale renews
 * at its CURRENT price, sessions, validity and share; a custom pack (or one
 * since retired) repeats its own terms (R5). So the browser sends nothing but
 * which pack to repeat — the client's newest, from `TodayData.renewTerms`.
 *
 * A second renew of a pack that was already renewed is refused with
 * `409 PACKAGE_ALREADY_RENEWED`; a double click is caught by the client-minted
 * `id`, which the server answers a second time with the same package.
 *
 * Instant, not held: nothing leaves for the client.
 */
export async function renew(packageId: string | undefined, requestId?: string): Promise<ActionResult> {
  if (!packageId) {
    return {
      ok: false,
      message: 'That client has no pack to repeat. Sell one in the money book.',
    };
  }
  try {
    await api(`/v1/packages/${encodeURIComponent(packageId)}/renew`, {
      method: 'POST',
      // The browser's attempt id (see `draft`): a retry of a renew that landed
      // answers 200 with the same package instead of 409 already-renewed.
      body: { id: requestId ?? crypto.randomUUID() },
    });
    revalidatePath('/today');
    revalidatePath('/clients');   // the roster's action column renews too
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError && error.problem.code === 'PACKAGE_ALREADY_RENEWED') {
      return { ok: false, message: 'Already renewed — there is a newer pack running for this client.' };
    }
    return readFailure(error, 'The renewal');
  }
}
