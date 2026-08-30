import 'server-only';

import { redirect } from 'next/navigation';

import { getToken } from '@/lib/auth/session';
import { getSetupState, SetupApiError } from './api';
import type { SetupState } from './steps';

/**
 * The two guards every page under `/setup` runs, and the reason they are two.
 *
 * `redirect()` throws, so neither of these can sit inside a `try` that would
 * swallow it — which is why the fetch is wrapped and the redirect is not.
 */

/** Signed out is not a setup problem, and 401 is how we find out. */
async function loadOrSignIn(): Promise<SetupState> {
  if (!(await getToken())) redirect('/sign-in');

  try {
    return await getSetupState();
  } catch (error) {
    // A token the server no longer accepts — expired, or minted before a
    // redeploy. The cookie is 7 days and the token is 7 days, so this is a
    // narrow window, but landing a signed-out browser on a form it cannot save
    // is worse than sending it back to sign in.
    if (error instanceof SetupApiError && (error.status === 401 || error.status === 403)) {
      redirect('/sign-in');
    }
    // Anything else is a real failure and belongs to `app/setup/error.tsx`,
    // which can offer a retry. Swallowing it here would draw an empty rail and
    // a form whose Continue silently does nothing.
    throw error;
  }
}

/**
 * For the pre-flight screen and the eight steps.
 *
 * A trainer whose setup is already stamped complete does not belong in the
 * flow: the profile is theirs to edit in Settings from that point, and
 * re-entering here would offer `Finish` on answers that are already finished.
 */
export async function requireSetup(): Promise<SetupState> {
  const state = await loadOrSignIn();
  if (state.setupComplete) redirect('/today');
  return state;
}

/**
 * For `/setup/done` only, which is reached with the flow already stamped
 * complete — the same request that stamps it navigates here, so the guard above
 * would bounce a trainer off the screen that exists to tell them they finished.
 */
export async function requireFinished(): Promise<SetupState> {
  return loadOrSignIn();
}
