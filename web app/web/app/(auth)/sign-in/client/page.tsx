import { redirect } from 'next/navigation';

/**
 * `/sign-in/client` was the "Client sign-in opens soon" wall, for a verify the
 * backend answered `403 CLIENT_SIGN_IN_UNAVAILABLE`. The backend has not sent that
 * since the client lens (V20): a client's number now signs straight into the
 * portal or onto its own wall (`/sign-in/paused`, `/removed`, `/unattached`). So
 * nothing reaches this route; an old link lands on the ordinary sign-in.
 * Removed 6 Nov 2026 with `ClientSignIn.tsx` and `isClientSignInUnavailable`.
 */
export default function Page() {
  redirect('/sign-in');
}
