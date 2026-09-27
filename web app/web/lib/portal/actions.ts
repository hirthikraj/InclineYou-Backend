'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { PHONE_PATTERN } from '@/lib/auth/policy';

import type { CheckInDetailWire } from './checkin';
import { clearActiveClient, clearToken, setToken } from '@/lib/auth/session';

import {
  PortalApiError,
  challengeMyPhone,
  confirmMyNewPhone,
  deleteMe,
  getMe,
  getPortalExport,
  patchMe,
  patchPrefs,
  postFinish,
  postMessageRead,
  postCheckInAnswer,
  postCheckInSubmit,
  postSet,
  postSwap,
  postWorkout,
  requestMyNewPhone,
  verifyMyPhone,
  type PortalWorkoutWire,
} from './api';

/**
 * Every write the client portal makes.
 *
 * ── ONE RESULT SHAPE, AND THE SERVER OWNS THE SENTENCE ───────────────────────
 *
 * Three of the refusals here are things a CLIENT reads — a swap their trainer
 * has not approved, a set arriving after the log closed, a phone number that is
 * not ten digits — and every one of them is better said by the rule that
 * refused it than by anything this layer could invent. `lib/packs/api.ts`
 * reached the same conclusion and `messageFor` below is the same function.
 *
 * ── AND NONE OF THESE IS HELD FOR TEN SECONDS ────────────────────────────────
 *
 * `lib/today/actions.ts` holds six verbs for ten seconds, and its own docstring
 * says what the hold is about: a QUEUE, six rows cleared fast, where the verb
 * messages somebody and waiting is how a mis-click is recovered. Nothing here
 * is that shape. A set is typed by the person it is about, who is looking at
 * the number they just entered; the undo is re-typing it, which the handler
 * supports by construction. A ten-second window on a set would put a spinner
 * between a client and their next rep.
 */

export type PortalResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; message: string };

/**
 * One rung of the phone-change ladder. `restart` is the ten-minute ticket
 * having gone — the panel renders it by sending them back to step 1, which is
 * the correct recovery for every way it can happen: expired, a second browser,
 * a cleared jar.
 */
export type PortalStepResult = { ok: true } | { ok: false; message: string; restart?: boolean };

/**
 * The server's own sentence, then a fallback per status.
 *
 * The fallbacks are deliberately written for a CLIENT rather than for a
 * trainer: *"Your trainer's diary would not take that"* is a sentence somebody
 * can act on, where *"409 Conflict"* is not, and a client has nobody to escalate
 * to except the person the app is about.
 */
function messageFor(e: unknown): string {
  if (e instanceof PortalApiError) {
    if (e.detail) return e.detail;
    if (e.status === null) return 'No connection just now. Try that again in a moment.';
    if (e.status === 401) return 'You have been signed out. Sign in again to carry on.';
    if (e.status === 403) return 'That is not yours to change.';
    if (e.status === 404) return 'That is not there any more.';
  }
  return 'That did not save. Try again.';
}

async function run<T>(fn: () => Promise<T>): Promise<PortalResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, message: messageFor(e) };
  }
}

/* ── §2 · the workout flow ──────────────────────────────────────────────── */

/**
 * Start today's workout, or open the one already running, and navigate to it.
 *
 * The `redirect` is OUTSIDE the try — `redirect()` throws to unwind, so a
 * `catch` around it turns every successful start into "that did not save",
 * which is the shape of bug that makes a working button look broken.
 */
export async function startWorkout(sessionId?: string | null): Promise<PortalResult> {
  const res = await run(() => postWorkout(sessionId ?? null));
  if (!res.ok) return res;
  revalidatePath('/me/today');
  redirect(`/me/workout/${res.value.id}`);
}

export async function saveSet(
  workoutId: string,
  exerciseId: string,
  setNumber: number,
  loadKg: number | null,
  reps: number | null,
): Promise<PortalResult> {
  /* A row with neither a load nor a rep count is not a set — it is an empty row
     somebody tabbed through. The trainer's console makes the same refusal for
     the same reason, and it is checked here so the client's tick does not spend
     a round trip to be told nothing happened. */
  if (loadKg === null && reps === null) {
    return { ok: false, message: 'Put in a weight or a rep count first.' };
  }
  const res = await run(() => postSet(workoutId, { exerciseId, setNumber, loadKg, reps }));
  if (!res.ok) return res;
  revalidatePath(`/me/workout/${workoutId}`);
  return { ok: true, value: undefined };
}

export async function swapExercise(
  workoutId: string,
  exerciseId: string,
  toExerciseId: string,
): Promise<PortalResult> {
  const res = await run(() => postSwap(workoutId, exerciseId, toExerciseId));
  if (!res.ok) return res;
  revalidatePath(`/me/workout/${workoutId}`);
  return { ok: true, value: undefined };
}

/**
 * §2's finish: the celebration, the summary, and the one question.
 *
 * The feedback is OPTIONAL on this call and the flow lets it be: §2 asks three
 * taps and a client who has put their phone in their bag has given none of
 * them. Making the answer mandatory would mean a log that cannot be closed
 * without it, and an unclosed log is the `log-open` band on the trainer's own
 * queue — a nag for the trainer produced by a question the client ignored.
 */
export async function finishWorkout(
  workoutId: string,
  effort?: 'easy' | 'right' | 'hard',
  note?: string,
): Promise<PortalResult<PortalWorkoutWire>> {
  const res = await run(() =>
    postFinish(workoutId, effort ? { effort, note: note?.trim() || null } : undefined),
  );
  if (!res.ok) return res;
  revalidatePath('/me/today');
  revalidatePath('/me/progress');
  revalidatePath(`/me/workout/${workoutId}`);
  return res;
}

/* ── §5 · the client's own settings and their data rights ────────────────── */

export async function setHideWeight(hidden: boolean): Promise<PortalResult> {
  const res = await run(() => patchPrefs({ hideWeight: hidden }));
  if (!res.ok) return res;
  /* Both, and the reason is the rule: §3 says a hidden metric must not still
     have an input, so Home's quick log drops its weight field on this write —
     a screen the client is not looking at when they make it. */
  revalidatePath('/me/progress');
  revalidatePath('/me/today');
  revalidatePath('/me/account');
  return { ok: true, value: undefined };
}

/**
 * §5 · *Correct my data* — and it is the health text ALONE now.
 *
 * ── THE PHONE NUMBER LEFT THIS FUNCTION, AND THAT WAS THE POINT ─────────────
 *
 * It used to take a `phone` here beside the health text, validated to ten
 * digits and saved by the same button. For a trainer that shape is fine; for a
 * client it was the one thing on the screen that could not be undone. The
 * number IS the account — no email, no password, and `resolve()` in
 * `mock/portal.ts` finds the person by matching the token's `phone` claim
 * against the roster — so a mistyped last digit moved the account to a
 * stranger's phone with nothing to appeal to.
 *
 * `components/settings/PhoneChange.tsx` had already argued this for the
 * trainer, whose account is the easier of the two to recover, and called one
 * extra code *"not a close call"*. The four-step ladder below is that
 * component's flow on the portal's wire.
 */
export async function correctMyDetails(fields: { health: string }): Promise<PortalResult> {
  const res = await run(() => patchMe({ health: fields.health.trim() }));
  if (!res.ok) return res;
  revalidatePath('/me/account/settings');
  return { ok: true, value: undefined };
}

/* ── §5 · moving the number they sign in with · four steps, two codes ──────
 *
 * `lib/account/actions.ts` holds the trainer's half of this and every argument
 * in its docstring applies unchanged, so they are not repeated here — read that
 * file for why the ticket is an httpOnly cookie and why the OTP refusals are
 * worded the way sign-in words them.
 *
 * TWO things differ, and both are about the client:
 *
 *   · **the cookie has its own name.** `inclineyou_phone_change` is the trainer's. A
 *     shared name would be one flow's ticket presented by the other on a
 *     browser where somebody signed out of one role and into the other, and the
 *     server would answer `unproven` for a reason no screen could explain.
 *   · **the fresh token matters more.** A trainer holding the stale one still
 *     resolves — `personaFor` falls through to a fresh trainer with an empty
 *     book. A client does not: their next read is a 403 `NOT_A_CLIENT`, because
 *     the number in the claim is no longer on anybody's roster. So `setToken`
 *     is not tidiness here, it is the difference between a moved number and a
 *     locked-out client.
 */

/** The proof from step 2. Ten minutes, matching the ticket's own life. */
const PHONE_TICKET_COOKIE = 'inclineyou_portal_phone_change';
const PHONE_TICKET_MAX_AGE = 10 * 60;

const EXPIRED_PROOF = 'That took a while — confirm your current number again to carry on.';

async function readPhoneTicket(): Promise<string | null> {
  return (await cookies()).get(PHONE_TICKET_COOKIE)?.value ?? null;
}

/** 1 · a code to the number they are signed in with. */
export async function startMyPhoneChange(): Promise<PortalStepResult> {
  const res = await run(() => challengeMyPhone());
  return res.ok ? { ok: true } : { ok: false, message: res.message };
}

/** 2 · that code back. The ticket goes straight into the cookie, never to the browser. */
export async function verifyMyCurrentNumber(otp: string): Promise<PortalStepResult> {
  try {
    const ticket = await verifyMyPhone(otp);
    (await cookies()).set(PHONE_TICKET_COOKIE, ticket, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: PHONE_TICKET_MAX_AGE,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: messageFor(e) };
  }
}

/** 3 · the new number. Refused before an SMS is spent on it. */
export async function requestMyNewNumber(phone: string): Promise<PortalStepResult> {
  const digits = phone.replace(/\D/g, '').slice(-10);
  /* The same pattern `AuthController` enforces and `lib/auth/policy.ts`
     mirrors: TRAI allocates only the 6-9 series to mobile, so a number outside
     them can never receive an SMS and there is nothing to retry. */
  if (!PHONE_PATTERN.test(digits)) {
    return { ok: false, message: 'That is not a 10-digit Indian mobile number.' };
  }

  const ticket = await readPhoneTicket();
  if (!ticket) return { ok: false, message: EXPIRED_PROOF, restart: true };

  const res = await run(() => requestMyNewPhone(ticket, digits));
  return res.ok ? { ok: true } : { ok: false, message: res.message };
}

/** 4 · the code from the new number, the swap, and the fresh token. */
export async function confirmMyPhoneChange(
  phone: string,
  otp: string,
): Promise<{ ok: true; phone: string } | { ok: false; message: string; restart?: boolean }> {
  const digits = phone.replace(/\D/g, '').slice(-10);
  const ticket = await readPhoneTicket();
  if (!ticket) return { ok: false, message: EXPIRED_PROOF, restart: true };

  try {
    const changed = await confirmMyNewPhone(ticket, digits, otp);
    /* Before the cookie is dropped and before anything revalidates: every read
       after this point needs the new claim. See the note above. */
    await setToken(changed.token);
    (await cookies()).delete(PHONE_TICKET_COOKIE);
    /* The whole layout: the delete card checks the typed number against this
       one, and the shell's foot prints it. */
    revalidatePath('/', 'layout');
    return { ok: true, phone: changed.phone };
  } catch (e) {
    return { ok: false, message: messageFor(e) };
  }
}

/** Leaving the flow half-done. The ticket is a fact about a sitting that ended. */
export async function cancelMyPhoneChange(): Promise<void> {
  (await cookies()).delete(PHONE_TICKET_COOKIE);
}

/**
 * DPDP §14 · naming, or withdrawing, the person who may act for them.
 *
 * `null` withdraws it. That is a right too — §14 says a data principal MAY
 * nominate, and a screen that could only ever add one would be a screen where
 * the safest thing a cautious person can do is never start.
 */
export async function setNominee(
  nominee: { name: string; phone: string } | null,
): Promise<PortalResult> {
  if (nominee) {
    const name = nominee.name.trim();
    const digits = nominee.phone.replace(/\D/g, '').slice(-10);
    if (!name) return { ok: false, message: 'Their name is the part we cannot skip.' };
    if (!PHONE_PATTERN.test(digits)) {
      return { ok: false, message: 'That is not a 10-digit Indian mobile number.' };
    }
    const res = await run(() => patchPrefs({ nominee: { name, phone: digits } }));
    if (!res.ok) return res;
  } else {
    const res = await run(() => patchPrefs({ nominee: null }));
    if (!res.ok) return res;
  }
  revalidatePath('/me/account/privacy');
  return { ok: true, value: undefined };
}

/**
 * §5 · *Download my data*, and it hands back the document rather than a link.
 *
 * The browser turns it into a file. That is the one place this portal writes to
 * the client's own device, and it is deliberately not a route: a signed URL
 * that returns somebody's whole training record is a URL that gets forwarded,
 * cached and indexed, and the thing being exported is the record this screen
 * exists to promise nobody else can read.
 */
export async function downloadMyData(): Promise<PortalResult<string>> {
  const res = await run(() => getPortalExport());
  if (!res.ok) return res;
  return { ok: true, value: JSON.stringify(res.value, null, 2) };
}

/**
 * §5 · *Delete my account*, and it really deletes — see `mock/portal.ts` for
 * what survives and why.
 *
 * Two things about the order here are load-bearing, and the first is a bug this
 * codebase has already recorded once: **the delete runs before the sign-out.**
 * `AccountService`'s own note says it — signing out first drops the token the
 * delete needs, so it 401s and the person lands on `/sign-in` believing they
 * closed an account that is still open.
 *
 * And the cookie jar is cleared rather than only the token: `inclineyou_client` names
 * a roster that no longer exists, and a browser holding it would send it on the
 * next sign-in for a row the server would refuse.
 */
export async function deleteMyAccount(confirmation: string): Promise<PortalResult> {
  /* THE TYPED NUMBER IS CHECKED HERE, NOT ONLY IN THE FORM.
     A confirmation that lives in a client component is a confirmation a mis-wired
     button skips, and this is the one call in the portal that cannot be undone.
     Matched on the last ten digits so `+91 98401 37911` — which the account
     screen prints one card up — is an accepted answer, which is the same
     latitude `AccountService` gives the trainer's own delete. */
  const digits = confirmation.replace(/\D/g, '').slice(-10);
  let me: Awaited<ReturnType<typeof getMe>>;
  try {
    me = await getMe();
  } catch (e) {
    return { ok: false, message: messageFor(e) };
  }
  if (digits.length !== 10 || digits !== (me.client.phone ?? '').replace(/\D/g, '').slice(-10)) {
    return { ok: false, message: 'That is not the number on this account.' };
  }

  const res = await run(() => deleteMe());
  if (!res.ok) return res;
  await clearActiveClient();
  await clearToken();
  redirect('/sign-in?left=1');
}

export async function markMessageRead(messageId: string): Promise<PortalResult> {
  const res = await run(() => postMessageRead(messageId));
  if (!res.ok) return res;
  revalidatePath('/me/today');
  revalidatePath('/me/account');
  return { ok: true, value: undefined };
}

/* â”€â”€ Â§"assessments" Â· the check-in, one ask at a time â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

   EVERY STEP IS A WRITE, and that is the decision this whole surface hangs
   on. A block check-in is twenty-six asks; held in the browser and posted at
   the end, a locked phone or a closed tab loses the lot, and a tape reading is
   worse to lose than a set because the tape has already been put away.

   So the shape is `Flow.tsx`'s exactly: the draft is local until it is
   committed, the commit is one request, and the screen redraws from what comes
   back rather than from what it hoped had happened. What is NOT the same is
   the revalidation â€” a set belongs to one workout route, and a check-in is
   drawn on Home as well, which is where a client goes to find it.            */

/** What one saved ask carries. The union the wire takes, typed at the caller. */
export type CheckInAnswerInput =
  | { kind: 'measurement'; key: string; value: number }
  | { kind: 'question'; questionId: string; yes: boolean }
  | { kind: 'question'; questionId: string; rating: number }
  | { kind: 'question'; questionId: string; text: string }
  | { kind: 'question'; questionId: string; optionIds: string[]; text?: string };

/**
 * Save one ask.
 *
 * The bounds on a tape reading are checked here as well as on the server, and
 * not for tidiness: the server refuses a
 * non-positive number, so `885` for `88.5` goes straight through and then sits
 * in the client's own history, where the min/max scaling of every chart built
 * on it makes nine real readings a flat line. 1â€“400 covers every unit in the
 * catalogue â€” kilos, centimetres, a percentage, a heart rate, a plank in
 * seconds â€” and refuses the fat finger. It is a typo guard and says so.
 */
export async function saveCheckInAnswer(
  id: string,
  input: CheckInAnswerInput,
): Promise<PortalResult<CheckInDetailWire>> {
  if (input.kind === 'measurement') {
    if (!Number.isFinite(input.value) || input.value <= 0 || input.value > 400) {
      return { ok: false, message: 'That does not look right â€” check the number and try again.' };
    }
  }
  const res = await run(() => postCheckInAnswer(id, { ...input }));
  if (res.ok) revalidatePath('/me/today');
  return res;
}

/**
 * Take an answer back out â€” what *Skip* does to a step somebody had answered.
 *
 * A separate action rather than a nullable value on the one above: clearing is
 * not saving nothing, and a `value: null` travelling through the same path
 * would have to be told apart from a field somebody has not filled in yet at
 * every point between the control and the row.
 */
export async function clearCheckInAnswer(
  id: string,
  ask: { kind: 'measurement'; key: string } | { kind: 'question'; questionId: string },
): Promise<PortalResult<CheckInDetailWire>> {
  const res = await run(() => postCheckInAnswer(id, { ...ask, clear: true }));
  if (res.ok) revalidatePath('/me/today');
  return res;
}

/**
 * Send it back.
 *
 * Home is revalidated because the card that sent them here is on it, and the
 * flow's own route because the check-in it draws is closed now â€” a client who
 * presses back and lands on a form that still says *step 24 of 26* would be
 * looking at a screen offering to change an answer their trainer can already
 * read.
 */
export async function submitCheckIn(id: string): Promise<PortalResult<CheckInDetailWire>> {
  const res = await run(() => postCheckInSubmit(id));
  if (res.ok) {
    revalidatePath('/me/today');
    revalidatePath(`/me/checkin/${id}`);
  }
  return res;
}
