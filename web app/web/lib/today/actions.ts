'use server';

import { revalidatePath } from 'next/cache';

import { getToken } from '@/lib/auth/session';
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

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';

async function call<T>(path: string, body: unknown, method = 'POST'): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error('signed out');

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ApiFailure(res.status, detail);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** The read half. `call` is POST-only; `closeLogs` has to fetch before it writes. */
async function read<T>(path: string): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error('signed out');

  const res = await fetch(`${BASE}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new ApiFailure(res.status, await res.text().catch(() => ''));
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

class ApiFailure extends Error {
  constructor(readonly status: number, readonly detail: string) {
    super(`${status}`);
  }
}

/**
 * The MESSAGING tier is 10 requests a minute because each call spends a WhatsApp
 * message, so a 429 here is the one refusal a trainer will actually meet — six
 * rows cleared in a row is six of the ten. It gets its own sentence rather than
 * "something went wrong", because the fix is to wait a minute and the trainer
 * cannot guess that.
 */
function readFailure(error: unknown, verb: string): ActionResult {
  if (error instanceof ApiFailure) {
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

interface NudgeWire {
  nudgeId: string;
  whatsappUrl: string;
  message: string;
}

/**
 * Money owed. `payment_reminder` is the one template the backend fills with live
 * figures — it looks the outstanding amount up itself rather than trusting a
 * number the caller passes, which is what keeps the message and the payments list from
 * disagreeing.
 */
export async function remind(clientId: string): Promise<ActionResult> {
  try {
    const res = await call<NudgeWire>(`/v1/clients/${clientId}/nudge`, {
      templateName: 'payment_reminder',
    });
    revalidatePath('/today');
    return { ok: true, whatsappUrl: res.whatsappUrl, message: res.message };
  } catch (error) {
    return readFailure(error, 'The reminder');
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
): Promise<ActionResult> {
  try {
    const res = await call<NudgeWire>(`/v1/clients/${clientId}/nudge`, { templateName });
    revalidatePath('/today');
    return { ok: true, whatsappUrl: res.whatsappUrl, message: res.message };
  } catch (error) {
    return readFailure(error, 'The check-in');
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
export async function wish(clientId: string): Promise<ActionResult> {
  try {
    const res = await call<NudgeWire>(`/v1/clients/${clientId}/nudge`, {
      templateName: 'well_done',
    });
    revalidatePath('/today');
    return { ok: true, whatsappUrl: res.whatsappUrl, message: res.message };
  } catch (error) {
    return readFailure(error, 'The message');
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
  let marked = 0;
  let failure: unknown = null;
  for (const id of sessionIds) {
    try {
      await call(`/v1/sessions/${id}/done`, {});
      marked += 1;
    } catch (error) {
      failure = error;
      break;
    }
  }
  revalidatePath('/today');
  if (failure && marked === 0) return readFailure(failure, 'Marking the session');
  if (failure) {
    return {
      ok: false,
      message: `${marked} of ${sessionIds.length} marked. The rest did not go through.`,
    };
  }
  return { ok: true };
}

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
    const res = await call<{ id: string }>('/v1/attention/dismissals', {
      clientId,
      kind,
      band,
      snoozeUntil,
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
    return { ok: true, dismissalId: res.id };
  } catch (error) {
    return readFailure(error, 'Dismissing the row');
  }
}

/**
 * Put a silenced row back in the queue.
 *
 * A DELETE, keyed by the dismissal's own id — which the browser has either from
 * `Deck.silenced` (the folded list) or from the `dismissRow` that just created it
 * (the row's Undo). Two callers, one route.
 *
 * `call` is POST-only, so this reaches for `fetch` directly rather than growing the
 * helper a method parameter for one use. Stated rather than hidden, because the
 * next verb that needs a DELETE should generalise it instead of copying this.
 */
export async function restoreRow(dismissalId: string): Promise<ActionResult> {
  try {
    const token = await getToken();
    if (!token) throw new Error('signed out');
    const res = await fetch(`${BASE}/v1/attention/dismissals/${dismissalId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    /*
     * A 404 is SUCCESS here. The row is gone, which is exactly what restoring it
     * means — the phone or another tab got there first, or the snooze lapsed and
     * something tidied it. Reporting a failure for a state the trainer asked for
     * would leave a row claiming to be silenced that is not.
     */
    if (!res.ok && res.status !== 404) {
      throw new ApiFailure(res.status, await res.text().catch(() => ''));
    }
    revalidatePath('/today');
    return { ok: true };
  } catch (error) {
    return readFailure(error, 'Restoring the row');
  }
}

/**
 * `WorkoutSessionService.WorkoutSessionResponse` — every field the row needs to
 * survive being written back. Not a subset: see `closeLogs`.
 */
/**
 * Two fields, where this used to need nine.
 *
 * The sync envelope made every column this row's business — it had to be sent
 * back whole or the upsert would erase what it was not told. `PUT /v1/workouts/
 * {id}` leaves an absent field alone, so all this read has to answer now is
 * "which of these is still open, and what is its id".
 */
interface WorkoutRowWire {
  id: string;
  endedAt: number | null;
}

/**
 * A log left open on a session that is over.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THIS USED TO BE THE ONLY VERB ON THIS SCREEN THAT SPOKE THE SYNC ENVELOPE
 *
 * `ended_at` reached the wire in exactly one place — `SyncService.pushWorkoutSessions`
 * — because `PUT /v1/workouts/{id}` took `UpdateSessionRequest(String notes)`
 * and nothing else. So this posted whole rows through `/v1/sync/push`, on a half
 * that does not otherwise speak that protocol, and it had to send each log back
 * WHOLE: the upsert assigns `notes` and `session_date` from what it is given, so
 * omitting either erased the note or failed the NOT NULL.
 *
 * `endedAt` is on the request since 28 Aug 2026. One field, one PUT, no envelope
 * and nothing to erase — the endpoint leaves an absent field alone.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IT STILL READS EACH LOG FIRST, FOR A DIFFERENT REASON THAN IT USED TO
 *
 * Not to send the row back — there is no row to send now. To tell an open log
 * from one the PHONE closed between this page rendering and the click. Closing
 * it again would restamp `ended_at` to the moment of the click, quietly moving a
 * time somebody else already recorded correctly. Skipping is not an error: the
 * trainer wanted them shut and they are shut.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AND IT IS INSTANT
 *
 * Nothing leaves for the client — no message, no WhatsApp, nothing anybody but
 * the trainer will ever see. `HELD_VERBS` is `Remind` and `Nudge` for that exact
 * reason, and ten seconds of countdown on a housekeeping write would make it feel
 * broken, the same call `Renew` already makes.
 */
export async function closeLogs(workoutIds: string[]): Promise<ActionResult> {
  if (workoutIds.length === 0) {
    return { ok: false, message: 'There is no open log left to close.' };
  }
  try {
    const rows = await Promise.all(
      workoutIds.map((id) => read<WorkoutRowWire>(`/v1/workouts/${id}`)),
    );
    const now = Date.now();
    const open = rows.filter((r) => r && r.endedAt === null);
    if (open.length === 0) {
      revalidatePath('/today');
      return { ok: true };
    }
    await Promise.all(
      open.map((r) => call(`/v1/workouts/${r.id}`, { endedAt: now }, 'PUT')),
    );
    revalidatePath('/today');
    revalidatePath('/schedule');
    return { ok: true };
  } catch (error) {
    return readFailure(error, 'Closing the log');
  }
}

/**
 * A pack that has run out, sold again.
 *
 * The new pack repeats the last one — same type, same amount, same session count
 * — because that is what renewing means, and asking a trainer to re-type a price
 * they set last month is how a one-click row becomes a form. `sessionsRemaining`
 * is seeded from `sessionsTotal` by the server and decremented by
 * `POST /v1/sessions/{id}/done`, so the pack is immediately live.
 *
 * The terms come from the CALLER rather than being looked up here, because the
 * page has already read every package on the roster — see `api.ts`. Looking them
 * up again would be a request to answer a question already answered.
 *
 * Instant, not held: nothing leaves for the client. If the trainer renewed the
 * wrong person's pack the row is theirs to delete in the money book, which is a
 * different affordance from a message that has already been read.
 */
export async function renew(
  clientId: string,
  terms: { type: string; amount: number; sessionsTotal: number | null },
): Promise<ActionResult> {
  if (!(terms.amount > 0)) {
    return {
      ok: false,
      message: 'That client has no pack to repeat. Sell one in the money book.',
    };
  }
  try {
    await call(`/v1/clients/${clientId}/packages`, {
      type: terms.type,
      amount: terms.amount,
      sessionsTotal: terms.sessionsTotal,
    });
    revalidatePath('/today');
    return { ok: true };
  } catch (error) {
    return readFailure(error, 'The renewal');
  }
}
