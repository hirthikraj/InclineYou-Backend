'use server';

import { redirect } from 'next/navigation';

import { dropSkipped } from '@/lib/setup/skipped';
import {
  claimTrainerAccount,
  isAlreadyTrainer,
  isApiFailure,
  readSendFailure,
  readVerifyFailure,
  requestOtp,
  switchToClientMode,
  verifyOtp,
} from './api';
import { CODE_LENGTH, PHONE_PATTERN } from './policy';
import {
  clearActiveClient,
  clearPendingPhone,
  clearToken,
  clearWall,
  destinationFor,
  liveMemberships,
  needsSetup,
  roleOf,
  setActiveClient,
  setPendingPhone,
  setToken,
  setWall,
} from './session';
import type {
  ClaimResult,
  Membership,
  RequestResult,
  Role,
  VerifyResult,
  WallKind,
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

  // The same regex as `AuthController.PHONE_PATTERN`. Checked here as well as
  // on the server because a number outside the 6–9 series can never receive an
  // SMS, and letting it through renders the server's 400 as a failure the
  // trainer would otherwise read as a connection problem.
  if (!PHONE_PATTERN.test(phone)) {
    return {
      ok: false,
      failure: { kind: 'invalid', detail: 'Indian mobile numbers start with 6, 7, 8 or 9.' },
    };
  }

  try {
    await requestOtp(phone);
  } catch (err) {
    return { ok: false, failure: readSendFailure(err) };
  }

  // Only after the send succeeded: the verify screen exists to receive a code
  // that is actually on its way.
  await setPendingPhone(phone);
  return { ok: true };
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
 * The JWT is set as an httpOnly cookie here and is deliberately absent from
 * what this returns: the browser is told where to go, not what it was given.
 */
export async function verifyCode(phoneInput: string, otp: string): Promise<VerifyResult> {
  const phone = phoneInput.replace(/\D/g, '');
  const code = otp.replace(/\D/g, '');

  // Shape, checked before the code is — the same guard, and for the same
  // reason, as `AuthController.OTP_PATTERN`: nothing that fails this could ever
  // have been the code we sent, so refusing it must not spend one of the three
  // attempts a trainer gets.
  if (code.length !== CODE_LENGTH) {
    return { ok: false, failure: { kind: 'unknown' } };
  }
  if (!PHONE_PATTERN.test(phone)) {
    return { ok: false, failure: { kind: 'unknown' } };
  }

  let session;
  try {
    session = await verifyOtp(phone, code);
  } catch (err) {
    return { ok: false, failure: readVerifyFailure(err) };
  }

  const next = destinationFor(session);
  if (!next || !session.token) {
    // Nothing to sign in with and no screen that fits — a failure rather than a
    // blank app. `gym_admin` is the live case: reserved, and nothing builds it.
    return { ok: false, failure: { kind: 'unknown' } };
  }

  await setToken(session.token);
  await clearPendingPhone();

  /*
   * A client with exactly one live roster never sees the picker — "everybody
   * else resolves silently and goes straight through", which is the rule the
   * design states twice. But `/me/today` still has to know WHICH roster, because
   * a client token is bound to the phone rather than to a membership.
   *
   * So the one case that skips the screen has its answer written here instead.
   * Without this, the silent path would land on a portal with no roster selected
   * and the multi-roster path would be the only one that worked — which is the
   * shape of bug that only shows up for the majority of users.
   */
  /*
   * WHICH WALL, IF ANY — recorded here because here is the only place it is
   * known. `clientView` mints an `invited` token for a real invite, an
   * unacknowledged removal AND a fully unattached number, so the claim cannot
   * tell them apart afterwards; the response can. See `WallKind`.
   *
   * Cleared on every other destination, so a wall from an earlier sitting on this
   * browser cannot be read by a later one.
   */
  const wall = wallFor(roleOf(session));
  if (wall) await setWall(wall);
  else await clearWall();

  if (roleOf(session) === 'client') {
    const live = liveMemberships(session);
    if (live.length === 1) await setActiveClient(live[0].clientId);
    // Two or more: `/sign-in/role` sets it. Deliberately NOT preselected here —
    // a cookie written before the person chose would make a reload of the picker
    // look like it had already been answered.
    else await clearActiveClient();
  } else {
    // A trainer's sign-in must not inherit a roster from a previous client
    // session on this browser.
    await clearActiveClient();
  }

  return {
    ok: true,
    next,
    role: roleOf(session),
    trainerName: session.trainerName ?? null,
  };
}

/** "change number" on the verify screen. Drops the pending number and nothing else. */
export async function forgetPendingPhone(): Promise<void> {
  await clearPendingPhone();
}

/**
 * Is this sign-in a wall, and which one.
 *
 * Off the ROLE rather than off the route `destinationFor` returned, and the
 * difference is not cosmetic: the first version matched route strings in a table,
 * so a renamed route or a typo'd key would silently stop recording the wall — and
 * the screen that reads it would then send everybody back to sign-in, which looks
 * like a broken screen rather than a missing cookie.
 *
 * `WallKind`'s three values are three of `Role`'s, deliberately spelled the same,
 * so this is a narrowing check the compiler enforces instead of a lookup that can
 * miss.
 */
function wallFor(role: Role): WallKind | null {
  return role === 'unattached' || role === 'removed' || role === 'paused' ? role : null;
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
  let session;
  try {
    session = await claimTrainerAccount();
  } catch (err) {
    if (isAlreadyTrainer(err)) {
      /*
       * The server says this token is already a trainer's — its subject is a
       * UUID, not a phone. Nothing was created and nothing needs to be: the
       * cookie already holds a working trainer token, so the recovery is to use
       * it rather than to report a failure for a state that is fine.
       *
       * Reachable by pressing the button twice quickly, and by coming back to
       * this URL after claiming.
       */
      return { ok: true, next: '/today' };
    }
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

  if (!session.token) {
    // Belt and braces: `claimTrainer` always mints one, and a response without a
    // token would leave the pending cookie in place and the screen claiming
    // success.
    return { ok: false, message: 'We could not set that up just now. Please try again.' };
  }

  await setToken(session.token);
  await clearPendingPhone();

  return {
    ok: true,
    next: destinationFor(session) ?? (needsSetup(session) ? '/setup' : '/today'),
  };
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
  await clearPendingPhone();
  await clearActiveClient();
  await clearWall();
}

/* ────────────────────────────────────────────── webapp-rail.html · 2b ──── */

/**
 * Sign out, from the rail's account menu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THERE IS NO SERVER CALL, AND THERE IS NOTHING TO CALL
 *
 * `backend/API.md` has no `POST /v1/auth/logout` and needs none: the JWT is a
 * self-contained 7-day bearer token with no server-side session behind it and no
 * revocation list, so signing out is exactly and only *forgetting the token*.
 * Anything else here would be a request that could fail and leave the trainer
 * looking at a screen that says it signed them out and did not.
 *
 * Which makes the cookie jar the whole of it — and every cookie has to go, not
 * just the token. The next person to open this browser may be a different trainer
 * on a shared gym desktop, and `inclineyou_client` (which roster), `inclineyou_wall` (which
 * refusal) and `inclineyou_setup_skipped` (which steps were passed on) are all facts
 * about the sitting that just ended. `inclineyou_setup_skipped` is the one that would
 * bite: a 24-hour cookie left behind makes the NEXT trainer's onboarding skip
 * steps they never saw.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AND THE PHONE'S SIGN-OUT SCREEN HAS NO WEB EQUIVALENT — BY THE ONLINE RULE
 *
 * `app/src/screens/main/drawer/SignOutScreen.tsx` is a whole screen because on a
 * phone sign-out is destructive: it wipes the local database, so unsynced writes
 * are lost, and "an alert cannot show *what* is unsynced ... a queued nudge log
 * is worth losing and a recorded payment is not."
 *
 * None of that is true here. This half is online-only, there is no local
 * database, and every write has already reached the server or already failed in
 * front of the trainer. So the design set's `Sign out&hellip;` — whose ellipsis
 * its own note explains as "it leads to a screen that lists what is still queued
 * rather than to a dialog that cannot name it" — cannot lead there, because there
 * is no queue to list. See `AccountMenu.tsx` for what the ellipsis leads to
 * instead, and why it keeps one.
 *
 * `redirect` rather than a returned path: this is called as a form action, so the
 * navigation is the framework's and happens whether or not the browser is still
 * running the script that submitted it.
 */
export async function signOut(): Promise<void> {
  await clearToken();
  await clearActiveClient();
  await clearWall();
  await clearPendingPhone();
  await dropSkipped();

  // `/sign-in` and not `/`: the root fork reads the token to choose a screen, and
  // the token is what we just deleted, so it would only bounce here anyway.
  redirect('/sign-in');
}

/* ─────────────────────────────────────────────────────── frame 2a · 5a ──── */

/**
 * Read every roster this client is on, fresh.
 *
 * ── A POST USED AS A READ, AND WHY THAT IS THE RIGHT CALL HERE ───────────────
 *
 * There is no GET that answers "which rosters is this number on". A client
 * token's subject is the phone, and the only read scoped to a membership —
 * `/v1/client/sync/pull` — needs the `clientId` this screen exists to choose. So
 * the options are a POST that returns them, or carrying the list forward from the
 * verify response in a cookie.
 *
 * The POST wins on the thing that matters most for a PICKER: freshness. A cookie
 * written at verify would offer a roster that ended between two sign-ins, and
 * finding that out after you tap is exactly what the cards' proof lines exist to
 * prevent. `POST /v1/auth/mode/client` is documented as "any authenticated token"
 * and returns "every live roster this number is on, same as any other client
 * sign-in" — which is this screen's input, exactly.
 *
 * The side effect is a fresh client token of the same scope, and the previous one
 * is left to expire. Swapping a client token for an equivalent client token is a
 * no-op semantically; it is the same call the phone makes to change mode.
 */
export async function loadRosters(): Promise<
  { ok: true; memberships: Membership[]; name: string | null } | { ok: false }
> {
  let session;
  try {
    session = await switchToClientMode();
  } catch (err) {
    /*
     * ONLY the failures this call can actually have.
     *
     * The first version caught everything, and the everything it caught was a
     * bug in this function: it also called `setToken`, and **a cookie cannot be
     * written during a render** — only in a Server Action or a Route Handler. So
     * Next threw, the catch turned it into `{ ok: false }`, and the page quietly
     * redirected to `/me/today`. A screen that silently went somewhere else for a
     * reason no log named.
     *
     * The token write is gone (see below) and the catch is now narrow: a refusal
     * or an unreachable server is an answer this screen can render, and anything
     * else is a defect that belongs in the error boundary rather than in a
     * redirect.
     */
    if (isApiFailure(err)) return { ok: false };
    throw err;
  }

  /*
   * THE FRESH TOKEN IS DISCARDED, ON PURPOSE.
   *
   * `mode/client` mints one as its side effect. Storing it is what broke this
   * function, and it turns out to be unnecessary: a client token is bound to the
   * PHONE and not to a membership, so the token already in the cookie has exactly
   * the same scope as the one just minted. Nothing is gained by swapping them,
   * and the one left unstored is simply left to expire — which is what API.md
   * already says happens to the loser of a mode switch.
   */
  {
    const memberships = session.clientOf ?? [];
    return {
      ok: true,
      memberships,
      /*
       * The client's OWN name, and only when every roster agrees on it.
       *
       * The backend answers `trainerName: null` for a client sign-in, so the
       * design's "Welcome back, {FIRST}" cannot be built from what it assumed —
       * see the note on the page. What IS available is `clientName`, which is
       * what each trainer typed. Two trainers can have typed different things,
       * and greeting somebody by a coin flip between two spellings of their own
       * name is worse than not greeting them, so disagreement falls back to the
       * plain greeting.
       */
      name: agreedName(memberships),
    };
  }
}

function agreedName(memberships: Membership[]): string | null {
  const names = new Set(
    memberships.map((m) => m.clientName?.trim()).filter((n): n is string => !!n),
  );
  if (names.size !== 1) return null;
  const full = [...names][0];
  return full.split(/\s+/)[0] || null;
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
