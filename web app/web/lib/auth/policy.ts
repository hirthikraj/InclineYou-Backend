/**
 * The OTP policy, as the server enforces it.
 *
 * Every value here is a copy of `app.otp` in
 * `backend/src/main/resources/application.yml`, which is the only copy that is
 * enforced. The mobile app keeps its own mirror in `app/src/api/auth.ts`; this
 * is the third. A screen that quotes a number the server does not honour tells
 * a trainer a lie they find out about by waiting, so when one of these changes
 * all three change together.
 *
 * The mobile *design document* disagrees with all of them — it says 5 wrong
 * codes and a 5-minute lock. The server says 3 and 10, and the server wins.
 */
export const CODE_LENGTH = 6;              // OTP_PATTERN: ^\d{6}$
export const CODE_TTL_MINUTES = 10;        // otp.expiry-minutes
export const MAX_ATTEMPTS = 3;             // otp.max-attempts
export const LOCK_MINUTES = 10;            // otp.lock-minutes
export const LOCK_SECONDS = LOCK_MINUTES * 60;
export const MAX_SENDS_PER_DAY = 10;       // otp.max-sends-per-day

/**
 * otp.resend-ladder-seconds. The wait before the 1st, 2nd and 3rd resend; the
 * last entry repeats for every resend after it.
 */
export const RESEND_LADDER = [30, 60, 120] as const;

/** Attempts remaining is shown from 3 left onward: warn before the wall, not at it. */
export const ATTEMPTS_WARN_FROM = 3;

/**
 * TRAI allocates only the 6, 7, 8 and 9 series to mobile, so a number outside
 * them can never receive a message and there is nothing to retry. The server's
 * `SendOtpRequest.PHONE_PATTERN` is this with the `+91` the wire carries — checking the length instead used to send a
 * number starting 5 to the server and render its 400 as "couldn't send the
 * code. Try again.", which names nothing and invites the same number again.
 */
export const PHONE_PATTERN = /^[6-9]\d{9}$/;

/**
 * The second IDENTITY, and it is further off than the second delivery path.
 *
 * WhatsApp above needs a BSP wired to an endpoint that already exists. This
 * needs an endpoint that does not: there is no `/v1/auth/google`, no OAuth
 * client, and — the part that is a product decision rather than a task — no
 * answer to what a Google identity IS here. The account in this system is the
 * mobile number. The roster, the two books, `inclineyou_client` and every check
 * the sync controller makes against the token all key off it, so an email
 * arriving from Google maps to no trainer until the backend can exchange one
 * for a phone and say what happens when it cannot.
 *
 * The control is drawn on `/sign-in` behind this flag. Flip it the day the
 * exchange exists, and not before: a button that starts a flow with no other
 * end than a 404 is worse than one that says it is not ready.
 */
export const GOOGLE_SIGN_IN_ENABLED = false;

/**
 * After this many resends — or as soon as the request's delivery status says
 * `failed` — the screen stops offering only "resend".
 */
export const SECOND_PATH_AFTER_RESENDS = 2;

/** Support number for the hand-signed-in route, e.g. 919876543210. */
export const SUPPORT_WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '';

/** The wait before resend number `n` (0-indexed), in seconds. */
export function resendDelay(resendCount: number): number {
  const i = Math.min(resendCount, RESEND_LADDER.length - 1);
  return RESEND_LADDER[Math.max(0, i)];
}

/** `0:30`, `9:08` — the shape both countdowns on these screens use. */
export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** `+91 98410 22119` — the grouping an Indian trainer reads their own number in. */
export function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : `+91 ${d}`;
}
