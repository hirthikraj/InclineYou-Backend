import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth/AuthShell';
import { UnknownNumber } from '@/components/auth/UnknownNumber';
import { formatPhone, readClaims } from '@/lib/auth/claims';
import { getPendingPhone, getPolicyVersion, getToken } from '@/lib/auth/session';

export const metadata = { title: 'We don’t know this number · InclineYou' };

/**
 * Frame 3a · `/sign-in/new`.
 *
 * Reached from `destinationFor` when a verify comes back `role: 'pending'` — the
 * number is proved, and it is on nobody's roster.
 *
 * ── THE GUARDS, AND WHY THE ROLE ONE IS NOT PARANOIA ─────────────────────────
 *
 * No token is signed out, and belongs at `/sign-in`.
 *
 * A token that is NOT pending has to be turned away too, and that case is real
 * rather than theoretical: a trainer whose cookie is live and who types this URL,
 * or a bookmark kept from a first session. `POST /v1/trainers` would answer
 * 200 for them without creating anything, so the screen would draw two exits of which the important one
 * cannot work — which is the "live button that cannot work" defect, on the one
 * screen where the button creates an account.
 *
 * `readClaims` reads the cookie's own role without a round trip and without
 * granting anything: see the note in `claims.ts` about why reading a claim we
 * minted is not the authorisation decision it resembles.
 *
 * `dynamic = 'force-dynamic'` because everything above reads cookies.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const token = await getToken();
  const claims = readClaims(token);

  if (!claims) redirect('/sign-in');

  if (claims.role !== 'pending') {
    // Send them where their token actually works. Not `/sign-in`: they are signed
    // in, and bouncing a working session back to a phone field for visiting a URL
    // reads as being logged out.
    redirect('/today');
  }

  /*
   * The number, for the one line that prints it back.
   *
   * The pending-phone cookie first, because it is the copy the trainer's own
   * browser holds and it is the same source frame 1b reads. `verifyCode` clears
   * it on success, so on the first arrival here it is usually already gone —
   * which is why the token's own `phone` claim is the fallback and, in practice,
   * the source. Both, rather than one, because a reload of this URL 30 minutes
   * later has the token and not the cookie, and a screen that loses the number it
   * is asking about is a screen that cannot say "typed it wrong?".
   */
  const phone = formatPhone((await getPendingPhone()) ?? claims.phone);

  // The notice the button accepts, as verify named it. Gone means the pending
  // sitting lapsed, and so has the 15-minute token behind it.
  const policyVersion = await getPolicyVersion();
  if (!policyVersion) redirect('/sign-in');

  return (
    <AuthShell
      eyebrow="New number"
      lead="Everyone starts here."
      quote="Clients are added by their trainer; trainers open their own account. Either way it begins with this number."
    >
      <UnknownNumber phone={phone} policyVersion={policyVersion} />
    </AuthShell>
  );
}
