import { redirect } from 'next/navigation';

import { readClaims } from '@/lib/auth/claims';
import { getToken } from '@/lib/auth/session';

/**
 * Nothing lives at the root. It is the fork between signed in and not — and
 * between the two kinds of "signed in" this product now has.
 *
 * ── WHY IT READS THE ROLE, AND NOT JUST WHETHER A TOKEN EXISTS ───────────────
 *
 * It used to be `token ? '/today' : '/sign-in'`, which was right while every
 * token in the cookie was a trainer's. Frame 3a broke that: a `pending` token is
 * stored — it has to be, because a cookie is the only thing that survives the
 * redirect to `/sign-in/new` and a reload of it — and it opens exactly one call.
 *
 * So a client who verified, landed on 3a and reloaded the tab used to be sent to
 * `/today`, where all eight of the deck's requests 401 and the guard bounces them
 * to `/sign-in` — losing the screen they were on and the code they spent to reach
 * it. Reading the role sends each token where it works.
 *
 * `invited` and `removed` are deliberately NOT handled here. Both need a
 * `clientId` from the sign-in response to build their URL, and neither is on the
 * token — so the honest answer for them is the phone field, which is what the
 * fallthrough does. They are also the two that are answered once and never
 * revisited.
 */
export default async function RootPage() {
  const claims = readClaims(await getToken());
  if (!claims) redirect('/sign-in');

  switch (claims.role) {
    case 'pending':
      redirect('/sign-in/new');
    case 'client':
      redirect('/me/today');
    case 'trainer':
      redirect('/today');
    default:
      // `unattached`, `paused`, `gym_admin`, and anything a newer backend mints
      // that this build does not know. A token whose screen we cannot name is not
      // a session we should draw an app for.
      redirect('/sign-in');
  }
}
