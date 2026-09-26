import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth/AuthShell';
import { Unattached } from '@/components/auth/Unattached';
import { formatPhone, readClaims } from '@/lib/auth/claims';
import { getPendingPhone, getToken, getWall } from '@/lib/auth/session';

export const metadata = { title: 'Nobody is coaching you · InclineYou' };

/**
 * §08 · 7e · `/sign-in/unattached`.
 *
 * Reached from `destinationFor` on `role: 'unattached'` — every membership this
 * number ever had is answered and gone.
 *
 * ── THE GUARD IS A COOKIE, AND IT HAS TO BE ──────────────────────────────────
 *
 * `AuthService.clientView` mints `generateInvited(phone)` for this case, for an
 * unacknowledged removal, and for a real outstanding invite. Three destinations,
 * one `role` claim — so unlike `/sign-in/new` and `/sign-in/role`, this screen
 * cannot verify itself from the token.
 *
 * It would be actively harmful to guess. Telling somebody who has an invite
 * waiting that nobody is coaching them is how they give up instead of accepting,
 * and it is the one wrong answer on a screen whose entire job is to be honest
 * about a dead end.
 *
 * So `verifyCode` records which wall it sent them to and this reads that back.
 * No cookie means a stale bookmark or a direct visit, and the right answer there
 * is a fresh sign-in: it costs one code and it produces a screen that is
 * certainly true, which is a better trade than a screen that is probably true.
 *
 * A trainer's token is turned away to `/today` for the same reason as the other
 * two: they are signed in, and their session works.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const claims = readClaims(await getToken());
  if (!claims) redirect('/sign-in');
  if (claims.role === 'trainer') redirect('/today');

  if ((await getWall()) !== 'unattached') redirect('/sign-in');

  /*
   * The number, for the one line that matters on this screen: the trainer has to
   * be given the number that was actually verified, not the one the client
   * remembers. A wrong digit is how somebody ends up here in the first place.
   *
   * `verifyCode` clears the pending cookie on success, so the token's own claim
   * is the source in practice — the same fallback pair as `/sign-in/new`.
   */
  const phone = formatPhone((await getPendingPhone()) ?? claims.phone);

  return (
    /* The plate says what the form cannot: the structural fact that produces this
       screen. Repeating the subtitle here — which the first version did — spends
       the one sentence the product gets read before anything is asked on
       something the reader is about to read anyway. */
    <AuthShell
      eyebrow="Nothing live"
      lead="Your trainer opens the door."
      quote="InclineYou works from a trainer’s roster. The moment somebody adds this number, everything is here waiting."
    >
      {/* Null at a cold sign-in: the unattached response carries no memberships
          and no `trainerName`. The decline and acknowledge flows will have one to
          pass when they are built. */}
      <Unattached phone={phone} trainerName={null} />
    </AuthShell>
  );
}
