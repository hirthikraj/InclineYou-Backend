'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { signOut } from '@/lib/auth/actions';
import { PHONE_PATTERN } from '@/lib/auth/policy';
import {
  AccountApiError,
  challengeCurrentPhone,
  confirmNewPhone,
  deleteAccount,
  patchAccount,
  requestNewPhone,
  verifyCurrentPhone,
  type Account,
  type AccountFailure,
} from './api';
import { MAX_EMAIL, MAX_NAME, looksLikeEmail } from './rules';

/**
 * THE WRITES BEHIND `/settings` — and the one on this screen that cannot be
 * undone.
 *
 * Three groups, and they are deliberately not one:
 *
 *   * `saveAccount` — a name and an email. An ordinary PATCH, the same shape
 *     every profile tab uses, and the only thing here a trainer can change back.
 *   * `startPhoneChange` … `confirmPhoneChange` — four steps and two SMS codes.
 *   * `closeAccount` — a soft delete and a sign-out, in that order.
 *
 * ── WHERE THE TICKET LIVES, AND WHY IT IS A COOKIE ──────────────────────────
 *
 * Step 2 answers with a signed ten-minute ticket proving the trainer holds the
 * number they are leaving, and steps 3 and 4 have to present it. Returning it to
 * the component would put it in browser JavaScript, which is the one thing this
 * half has never done with anything the server signed — `lib/auth/session.ts`
 * opens by saying the JWT is *absent* from browser JS rather than merely hard to
 * read, and a second factor that is easier to steal than the first is not a
 * second factor.
 *
 * So it is an httpOnly cookie, ten minutes, matching the ticket's own life:
 * the same job `inclineyou_pending_phone` does for the number between two sign-in
 * screens and `inclineyou_wall` does for which refusal a sitting ended at. It expires
 * on its own, which is the whole reason the backend chose a signed ticket over a
 * row — see `AccountService`.
 *
 * A caller that has lost it gets `unproven`, which the panel renders by sending
 * them back to step 1. That is the correct recovery for every way it can go:
 * expired, a second browser, a cleared jar.
 *
 * ── AND WHY THE OTP REFUSALS ARE WORDED LIKE SIGN-IN'S ──────────────────────
 *
 * Because they are the same machinery. `OtpService` throttles, locks and expires
 * per number whether the code was asked for by `/v1/auth/otp/request` or by this
 * screen, so a trainer who has met *"that code has expired"* at sign-in should
 * meet the same sentence here. `messageFor` below is the one place this half
 * writes them; it does not import `lib/auth/copy.ts`, because those sentences
 * name the sign-in screen's own recoveries ("start again with your number") and
 * this screen's recovery is different at every step.
 */

/** The proof from step 2. Ten minutes, matching `JwtService.PHONE_CHANGE_MINUTES`. */
const TICKET_COOKIE = 'inclineyou_phone_change';
const TICKET_MAX_AGE = 10 * 60;

const SECURE = process.env.NODE_ENV === 'production';

export type AccountResult = { ok: true; account: Account } | { ok: false; message: string };
export type StepResult = { ok: true } | { ok: false; message: string; restart?: boolean };

/* ────────────────────────────────────────────────── the name and the email ── */

/**
 * Both fields, one button.
 *
 * Sent as two keys and never as a whole profile: every field on the backend's
 * `UpdateRequest` is nullable and means *leave it alone*, so this cannot clobber
 * a bio or a certification list the screen never drew. `lib/profile/actions.ts`
 * carries that argument at length for the seven tabs one level down; it is the
 * same rule and it matters more here, because Settings and the profile are two
 * screens a trainer can genuinely have open at once.
 */
export async function saveAccount(input: { name: string; email: string }): Promise<AccountResult> {
  const name = input.name.trim().slice(0, MAX_NAME);
  // The server IGNORES a blank name rather than clearing it — `trainer.name` is
  // NOT NULL — so an empty value would report a successful save and change
  // nothing. Named here rather than let through.
  if (name.length === 0) {
    return { ok: false, message: 'Your name is the one thing we can’t skip.' };
  }

  const email = input.email.trim().slice(0, MAX_EMAIL);
  // Answered before the request, because "that isn't an email address" is a
  // sentence this half can write correctly and a round trip cannot improve on.
  // Deliberately looser than the server's check, never stricter: a copy that
  // refused what the server would have taken is the worse failure, since the
  // trainer has no way to appeal to the thing that would have said yes.
  if (email.length > 0 && !looksLikeEmail(email)) {
    return { ok: false, message: 'That doesn’t look like an email address.' };
  }

  try {
    // `''` CLEARS the column, which is the correct meaning of emptying a field
    // and pressing Save — the same rule every profile tab follows. Omitting it
    // would make this screen able to add an address and never remove one.
    const account = await patchAccount({ name, email });
    // The account menu, the rail's foot and every screen that greets the trainer
    // by name read `/v1/trainers/me`. Without this a renamed trainer keeps the
    // old name in the shell until a hard reload.
    revalidatePath('/', 'layout');
    return { ok: true, account };
  } catch (error) {
    return { ok: false, message: messageFor(error) };
  }
}

/* ───────────────────────────────────────────────────── changing the number ── */

/** 1 · a code to the number they are signed in with. */
export async function startPhoneChange(): Promise<StepResult> {
  try {
    await challengeCurrentPhone();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: messageFor(error) };
  }
}

/** 2 · that code back. The ticket goes straight into the cookie, never to the browser. */
export async function verifyCurrentNumber(otp: string): Promise<StepResult> {
  try {
    const ticket = await verifyCurrentPhone(otp);
    (await cookies()).set(TICKET_COOKIE, ticket, {
      httpOnly: true,
      secure: SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: TICKET_MAX_AGE,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: messageFor(error), restart: isUnproven(error) };
  }
}

/** 3 · the new number. Refused here if it is taken, before an SMS is spent on it. */
export async function requestNewNumber(phone: string): Promise<StepResult> {
  const digits = phone.replace(/\D/g, '').slice(-10);
  // The same pattern `AuthController` enforces and `lib/auth/policy.ts` mirrors:
  // TRAI allocates only the 6–9 series to mobile, so a number outside them can
  // never receive an SMS and there is nothing to retry.
  if (!PHONE_PATTERN.test(digits)) {
    return { ok: false, message: 'That isn’t a 10-digit Indian mobile number.' };
  }

  const ticket = await readTicket();
  if (!ticket) return { ok: false, message: EXPIRED_PROOF, restart: true };

  try {
    await requestNewPhone(ticket, digits);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: messageFor(error), restart: isUnproven(error) };
  }
}

/**
 * 4 · the code from the new number, and the swap.
 *
 * Nothing is written to the session cookie: the confirm answers `{ phone }` and no token (v1.1), and the
 * browser that made the change keeps the session it has. The server ends every OTHER browser's session
 * with the reason `phone_changed`. (Before v1.1 this wrote a fresh JWT here, because a JWT carries the
 * number in a claim; passing the new answer to `setToken` would store `undefined`.)
 */
export async function confirmPhoneChange(
  phone: string,
  otp: string,
): Promise<{ ok: true; phone: string } | { ok: false; message: string; restart?: boolean }> {
  const digits = phone.replace(/\D/g, '').slice(-10);
  const ticket = await readTicket();
  if (!ticket) return { ok: false, message: EXPIRED_PROOF, restart: true };

  try {
    const changed = await confirmNewPhone(ticket, digits, otp);
    (await cookies()).delete(TICKET_COOKIE);
    // The shell prints the number in the account menu's header, so a trainer
    // with two accounts can see which one they are signed in to.
    revalidatePath('/', 'layout');
    return { ok: true, phone: changed.phone };
  } catch (error) {
    return { ok: false, message: messageFor(error), restart: isUnproven(error) };
  }
}

/** Leaving the flow half-done. The ticket is a fact about a sitting that ended. */
export async function cancelPhoneChange(): Promise<void> {
  (await cookies()).delete(TICKET_COOKIE);
}

/* ────────────────────────────────────────────────────────── closing it down ── */

/**
 * Delete, then sign out — and never the other way round.
 *
 * Signing out first would drop the token the delete needs, so the call would
 * 401 and the trainer would land on `/sign-in` believing they had closed an
 * account that is still open. Which they could then sign straight back into,
 * with no way to tell whether the button had worked.
 *
 * `signOut` `redirect`s, so nothing after it runs and there is no success
 * message to write. That is the right ending: the screen that would have shown
 * it belongs to an account that no longer resolves.
 */
export async function closeAccount(confirmPhone: string): Promise<{ ok: false; message: string }> {
  try {
    await deleteAccount(confirmPhone);
  } catch (error) {
    return { ok: false, message: messageFor(error) };
  }
  await signOut();
  // Unreachable — `signOut` redirects. Present because the compiler cannot know
  // that, and returning a lie here would be worse than an unreachable line.
  return { ok: false, message: '' };
}

/* ────────────────────────────────────────────────────────────────── shared ── */

const EXPIRED_PROOF = 'That took a while — confirm your current number again to carry on.';

async function readTicket(): Promise<string | null> {
  return (await cookies()).get(TICKET_COOKIE)?.value ?? null;
}

function isUnproven(error: unknown): boolean {
  return error instanceof AccountApiError && error.failure.kind === 'unproven';
}

/**
 * A refusal, as a sentence.
 *
 * The server's own `detail` wins wherever it wrote one — `lib/packs/api.ts`
 * records what happens when it is not read: *"A pack needs a price"* reaching
 * the log and never the trainer. `classify` in `api.ts` has already promoted the
 * ones that carry a number or need a specific recovery into their own kinds, so
 * what is left here is turning each of those into words.
 */
function messageFor(error: unknown): string {
  if (!(error instanceof AccountApiError)) return 'That didn’t work. Try again in a moment.';
  return sentenceFor(error.failure);
}

/**
 * A wait, in words — and NOT `mmss`, which is what the sign-in screens use.
 *
 * Found by rendering, and it is the difference between a countdown and a
 * sentence. `mmss` is right on `/sign-in/verify`, where a figure is TICKING
 * beside a resend button and `2:41` is read as "nearly there". Here the number
 * is frozen in a sentence, and the two waits this screen can quote are of very
 * different sizes: three wrong codes is ten minutes, but the ten-a-day ceiling
 * is up to twenty-four hours. `mmss` rendered that as **`112:32`**, which does
 * not read as one hour fifty-two — it reads as a clock time, and the one thing
 * a wait must not be mistaken for is a time of day.
 *
 * Rounded UP below an hour, so the message never expires before the wait does,
 * and hedged with *about* above one, because an hour quoted to the minute is a
 * precision the trainer has no use for and we would then have to honour.
 */
function waitPhrase(seconds: number): string {
  const s = Math.max(1, Math.round(seconds));
  if (s < 90) return `${s} seconds`;
  const minutes = Math.ceil(s / 60);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(s / 3600);
  return hours <= 1 ? 'about an hour' : `about ${hours} hours`;
}

function sentenceFor(f: AccountFailure): string {
  switch (f.kind) {
    case 'offline':
      return 'Couldn’t reach the server. Nothing changed — try again in a moment.';
    case 'locked':
      // The wait is the whole content of this message: without it the trainer
      // retries immediately, fails again, and reads the product as broken.
      return `Too many wrong codes. Try again in ${waitPhrase(f.retryAfterSeconds)}.`;
    case 'throttled':
      return `Wait ${waitPhrase(f.retryAfterSeconds)} before asking for another code.`;
    case 'expired':
      return 'That code has expired. Ask for a new one.';
    case 'wrong':
      // `attemptsLeft: 0` means the next code is the wall rather than that zero
      // tries remain to spend, so it is not worth announcing — the same reading
      // `readVerifyFailure` applies at sign-in.
      return f.attemptsLeft && f.attemptsLeft > 0
        ? `That code isn’t right. ${f.attemptsLeft} ${f.attemptsLeft === 1 ? 'try' : 'tries'} left.`
        : 'That code isn’t right.';
    case 'unproven':
      return EXPIRED_PROOF;
    case 'taken':
      return 'That number already belongs to an InclineYou account. If it is yours, sign in with it — an account can’t be moved onto another one.';
    case 'refused':
      return f.detail;
    default:
      return 'That didn’t work. Try again in a moment.';
  }
}
