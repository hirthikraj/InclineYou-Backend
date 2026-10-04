'use server';

import { redirect } from 'next/navigation';

import { dropSkipped } from '@/lib/setup/skipped';
import {
  acceptPolicy,
  claimTrainerAccount,
  endSession,
  getDelivery,
  isClientSignInUnavailable,
  readSendFailure,
  readVerifyFailure,
  refusalCode,
  requestOtp,
  verifyOtp,
} from './api';
import { CODE_LENGTH, PHONE_PATTERN } from './policy';
import {
  clearActiveClient,
  clearPendingPhone,
  clearPolicyVersion,
  clearRequestId,
  clearSitting,
  clearToken,
  clearWall,
  destinationFor,
  getPolicyVersion,
  getRequestId,
  needsConsent,
  setPendingPhone,
  setActiveClient,
  setPolicyVersion,
  setRequestId,
  setResendAt,
  setToken,
} from './session';
import type {
  ClaimResult,
  DeliveryStatus,
  Membership,
  RequestResult,
  VerifyResult,
} from './types';

/**
 * Ask for a code.
 *
 * A server action rather than a client fetch, so the Spring API is only ever
 * reached from this server: the backend has no CORS configuration and needs
 * none, and the browser never learns the API's address.
 */
export async function sendCode(phoneInput: string): Promise<RequestResult> {
  const phone = phoneInput.replace(/\D/g, '');

  // The same regex as the server's `SendOtpRequest.PHONE_PATTERN`, less the +91.
  // Checked here as well as on the server because a number outside the 6–9
  // series can never receive a message, and letting it through renders the
  // server's 400 as a failure the trainer would otherwise read as a connection
  // problem.
  if (!PHONE_PATTERN.test(phone)) {
    return {
      ok: false,
      failure: { kind: 'invalid', detail: 'Indian mobile numbers start with 6, 7, 8 or 9.' },
    };
  }

  let issued;
  try {
    issued = await requestOtp(phone);
  } catch (err) {
    return { ok: false, failure: readSendFailure(err) };
  }

  // Only after the send succeeded: the verify screen exists to receive a code
  // that is actually on its way. The request id replaces any earlier one — a
  // newer request retires the older, so only the latest can be verified.
  await setRequestId(issued.requestId);
  await setResendAt(Date.now() + issued.resendAfterSeconds * 1000);
  await setPendingPhone(phone);
  return { ok: true, resendAfterSeconds: issued.resendAfterSeconds };
}

/**
 * Resend, from the verify screen. The same call, and a separate export because
 * the two screens report the outcome differently — the first navigates, and
 * this one restarts a countdown in place.
 */
export async function resendCode(phoneInput: string): Promise<RequestResult> {
  return sendCode(phoneInput);
}

/**
 * Exchange a code for a session.
 *
 * The credential is set as an httpOnly cookie here and is deliberately absent
 * from what this returns: the browser is told where to go, not what it was
 * given. The code is checked against the REQUEST it was sent for, whose id the
 * browser never held — it is in a cookie `sendCode` set.
 */
export async function verifyCode(otp: string): Promise<VerifyResult> {
  const code = otp.replace(/\D/g, '');

  // Shape, checked before the code is — the same guard, and for the same
  // reason, as the server's: nothing that fails this could ever have been the
  // code we sent, so refusing it must not spend one of the three attempts a
  // trainer gets.
  if (code.length !== CODE_LENGTH) {
    return { ok: false, failure: { kind: 'unknown' } };
  }

  // No request in flight: a reload after the cookie lapsed. There is nothing to
  // verify against, and the honest answer is the same as a lapsed code.
  const requestId = await getRequestId();
  if (!requestId) return { ok: false, failure: { kind: 'expired' } };

  let session;
  try {
    session = await verifyOtp(requestId, code);
  } catch (err) {
    if (isClientSignInUnavailable(err)) {
      // The code was right and the number is only somebody's client. Nothing was
      // minted; this is a wall, not a failure, and it spends nothing now either.
      await clearRequestId();
      await clearPendingPhone();
      return { ok: true, next: '/sign-in/client', role: 'client', trainerName: null };
    }
    return { ok: false, failure: readVerifyFailure(err) };
  }

  await setToken(session.token, session.expiresAt);
  await clearPendingPhone();
  await clearRequestId();

  // The notice in force, for the two screens that must send it back. Kept for a
  // new number and for a trainer whose acceptance is out of date; dropped
  // otherwise, so a stale one cannot outlive its use.
  if (session.role === 'pending' || needsConsent(session)) {
    await setPolicyVersion(session.currentPolicyVersion);
  } else {
    await clearPolicyVersion();
  }

  return {
    ok: true,
    next: destinationFor(session),
    role: session.role,
    trainerName: session.trainerName,
  };
}

/**
 * Where the WhatsApp message is, for the verify screen's "Didn't get it?" line.
 * Null when there is nothing to report — no request in flight, or the server no
 * longer knows it (used, superseded, expired), which is not an error to draw.
 */
export async function checkDelivery(): Promise<DeliveryStatus | null> {
  const requestId = await getRequestId();
  if (!requestId) return null;
  try {
    return (await getDelivery(requestId)).deliveryStatus;
  } catch {
    return null;
  }
}

/** "change number" on the verify screen. Drops the pending number and nothing else. */
export async function forgetPendingPhone(): Promise<void> {
  await clearPendingPhone();
}

/* ─────────────────────────────────────────────────────── frame 3a · 7a ──── */

/**
 * "I'm a trainer" — create the account and open the workspace.
 *
 * The one write on the sign-in path that is not a sign-in, and the reason it is
 * a deliberate button rather than a consequence of verifying: the likeliest first
 * launch in this product is a CLIENT typing their number before their trainer has
 * added them, and handing them a coaching workspace is a wrong turn they cannot
 * undo.
 *
 * The new token replaces the pending one in the cookie, which is what turns
 * "verified" into "signed in". `destinationFor` then decides where — `/setup` for
 * a brand-new account, and `/today` for the case that looks impossible and is
 * not: a `trainer` row already existed for this phone (created before the account
 * was split from the sign-in) and its setup is already stamped complete.
 */
export async function claimTrainer(): Promise<ClaimResult> {
  // The notice in force, as verify named it. Gone means the pending sitting
  // lapsed — the same state as a pending token past its fifteen minutes.
  const version = await getPolicyVersion();
  if (!version) return { ok: false, message: LAPSED };

  let session;
  try {
    session = await claimTrainerAccount(version);
  } catch (err) {
    const code = refusalCode(err);
    // The pending token is good for fifteen minutes. Past that, or once the
    // notice has moved on, nothing was created and starting again is the fix.
    if (code === 'SESSION_EXPIRED' || code === 'CONSENT_REQUIRED') return { ok: false, message: LAPSED };
    // Deliberately one sentence and not a taxonomy. The failure modes here are a
    // dropped connection and a 500, both of which mean "try again" — and the one
    // thing worth promising is what did NOT happen, because the button creates an
    // account and a trainer who does not know whether it exists will press it
    // again.
    return {
      ok: false,
      message: 'We could not set that up just now. No account was created — try again.',
    };
  }

  // The session replaces the pending token in the cookie, which is what turns
  // "verified" into "signed in".
  await setToken(session.token, session.expiresAt);
  await clearPendingPhone();
  await clearPolicyVersion();

  return { ok: true, next: destinationFor(session) };
}

const LAPSED =
  'That sign-in timed out, so nothing was created. Use a different number to start again — it takes a minute.';

/**
 * "I accept" on `/sign-in/consent` — the privacy notice has changed since they
 * last accepted it. Idempotent on the server (the original date is kept), so a
 * double press is harmless.
 */
export async function acceptNotice(): Promise<ClaimResult> {
  const version = await getPolicyVersion();
  if (!version) return { ok: false, message: 'That screen timed out. Sign in again to see the notice.' };
  try {
    await acceptPolicy(version);
  } catch {
    return { ok: false, message: 'We could not record that just now. Nothing changed — try again.' };
  }
  await clearPolicyVersion();
  // Onboarding may still be owed; the root fork knows, and it is not this
  // action's to decide.
  return { ok: true, next: '/' };
}

/**
 * "Use a different number" — and it DROPS THE TOKEN, which the phone does not
 * have to.
 *
 * On the phone the pending token was never stored ("a stored token is what the
 * app reads as signed in"), so going back is a navigation and nothing else. The
 * web had to store it — a cookie is the only thing that survives the redirect to
 * this URL and a reload of it — so going back has to un-store it. Leaving it
 * would mean the next visit to `/` reads as signed in, bounces to a screen the
 * pending token cannot load, and 401s its way back to sign-in.
 *
 * It also costs nothing to be right about: the token opens exactly one call, and
 * anybody starting again is about to spend a fresh code anyway.
 */
export async function abandonPending(): Promise<void> {
  await clearToken();
  await clearRequestId();
  await clearPolicyVersion();
  await clearPendingPhone();
  await clearActiveClient();
  await clearWall();
}

/* ────────────────────────────────────────────── webapp-rail.html · 2b ──── */

/**
 * Sign out, from the rail's account menu.
 *
 * The session is REVOKED on the server first — `DELETE /v1/auth/sessions/current`
 * — so a token that was copied out of this browser stops working now rather than
 * at its expiry. That is the point of the web having a revocable session at all.
 *
 * Then every cookie goes, and not just the token. The next person to open this
 * browser may be a different trainer on a shared gym desktop, and
 * `inclineyou_client` (which roster), `inclineyou_wall` (which refusal) and
 * `inclineyou_setup_skipped` (which steps were passed on) are all facts about the
 * sitting that just ended. `inclineyou_setup_skipped` is the one that would
 * bite: a 24-hour cookie left behind makes the NEXT trainer's onboarding skip
 * steps they never saw.
 *
 * The revoke is best effort and never blocks the rest. A server that cannot be
 * reached must not leave somebody unable to sign out of a shared machine — and
 * the cookie being gone is what ends THIS browser's session either way.
 *
 * AND THE PHONE'S SIGN-OUT SCREEN HAS NO WEB EQUIVALENT — BY THE ONLINE RULE.
 * `app/src/screens/main/drawer/SignOutScreen.tsx` is a whole screen because on a
 * phone sign-out is destructive: it wipes the local database, so unsynced writes
 * are lost. None of that is true here: this half is online-only, there is no
 * local database, and every write has already reached the server or already
 * failed in front of the trainer. See `AccountMenu.tsx` for the confirm step it
 * leads to instead.
 *
 * `redirect` rather than a returned path: this is called as a form action, so the
 * navigation is the framework's and happens whether or not the browser is still
 * running the script that submitted it.
 */
export async function signOut(): Promise<void> {
  try {
    await endSession();
  } catch {
    // Unreachable, or already gone. Either way there is nothing left to end.
  }
  await clearSitting();
  await dropSkipped();

  // `/sign-in` and not `/`: the root fork reads the token to choose a screen, and
  // the token is what we just deleted, so it would only bounce here anyway.
  redirect('/sign-in');
}

/* ─────────────────────────────────────────────────────── frame 2a · 5a ──── */

/**
 * Read every roster this client is on — NOT SERVED IN v1.
 *
 * It was a `POST /v1/auth/mode/client`, which returned "every live roster this
 * number is on". That route went with the rest of client sign-in: a number that
 * is only somebody's client is refused at verify (`CLIENT_SIGN_IN_UNAVAILABLE`),
 * and a trainer who is also a client signs in as the trainer with no mode
 * switch. So there is nothing to ask, and `/sign-in/role` and the portal's
 * roster switch, which both read this, find no rosters. They stay built behind
 * the release flag (WEB_LAUNCH.md MUST-19) and come back with the portal.
 */
export async function loadRosters(): Promise<
  { ok: true; memberships: Membership[]; name: string | null } | { ok: false }
> {
  return { ok: false };
}

/**
 * "Continue" on the picker — remember which roster, and open it.
 *
 * The only write is the cookie. There is no server call and there must not be:
 * the token already covers every roster this number is on, so choosing between
 * them is a question about this browser and not about the account. That is the
 * whole content of the screen's own footnote — "nothing here is a second account;
 * it is the same sign-in, read from the other side."
 *
 * `clientId` is checked against the rosters the SERVER just named rather than
 * trusted from the form. Not because the cookie is a permission — the sync
 * controller re-checks it on every request either way — but because an id that
 * is not one of these would write a cookie that makes the portal 404 with no
 * explanation, and the failure would look like the portal being broken.
 */
export async function chooseRoster(clientId: string): Promise<{ ok: boolean }> {
  const rosters = await loadRosters();
  if (!rosters.ok) return { ok: false };
  if (!rosters.memberships.some((m) => m.clientId === clientId)) return { ok: false };

  await setActiveClient(clientId);
  return { ok: true };
}
