import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth/AuthShell';
import { RosterPicker } from '@/components/auth/RosterPicker';
import { loadRosters } from '@/lib/auth/actions';
import { readClaims } from '@/lib/auth/claims';
import { getToken } from '@/lib/auth/session';

export const metadata = { title: 'Whose book · X REP' };

/**
 * Frame 2a · `/sign-in/role`.
 *
 * Reached from `destinationFor` for one case: `role: 'client'` with more than one
 * live roster. Everybody else resolves silently.
 *
 * ── THE GUARDS ───────────────────────────────────────────────────────────────
 *
 * No token → `/sign-in`. A trainer's token → `/today`: their home role is not
 * ambiguous, and the mode switch lives in the rail foot rather than at sign-in.
 *
 * Then the roster count, which can have CHANGED since the redirect that sent
 * somebody here — a trainer can end an arrangement between the verify and this
 * render, and a reload of this URL days later is the same thing more slowly:
 *
 *   · two or more  → ask the question;
 *   · exactly one  → do not ask a question with one answer. Straight to the
 *     portal, which resolves a single roster itself — see below;
 *   · none         → `/sign-in`. The token opens nothing, which is the state the
 *     backend would call `unattached`.
 *
 * A failed lookup lands on `/sign-in` too. It is the same destination for a
 * different reason and that is deliberate: this screen's entire input is the
 * roster list, so without it there is no question to put — and `/sign-in` is a
 * working screen they can retry from, rather than a portal that would fail again
 * one navigation later.
 *
 * ── WHY THIS PAGE WRITES NO COOKIE ───────────────────────────────────────────
 *
 * It used to call `setActiveClient` for the single-roster case, and that 500d:
 * **a cookie cannot be written during a render**, only in a Server Action or a
 * Route Handler. The fix is not to move the write into a handler — it is that the
 * write does not belong here at all.
 *
 * Choosing a roster is `chooseRoster`'s job (an action, reached from the button).
 * Resolving an unambiguous one is the PORTAL's, and it has to be: `/me/today` must
 * already work with no cookie — a cleared cookie, a second browser, a link opened
 * from a message — so "no cookie and one roster" is a case it owns anyway.
 * Duplicating that rule here would be a second place for it to drift.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const claims = readClaims(await getToken());
  if (!claims) redirect('/sign-in');

  if (claims.role !== 'client') {
    // Not a client token. `trainer` is the live case; anything else has its own
    // screen and none of them is this one.
    redirect(claims.role === 'trainer' ? '/today' : '/sign-in');
  }

  const rosters = await loadRosters();
  if (!rosters.ok || rosters.memberships.length === 0) redirect('/sign-in');
  if (rosters.memberships.length === 1) redirect('/me/today');

  return (
    <AuthShell quote="One number, two trainers. Both books are yours and neither can see the other.">
      <RosterPicker memberships={rosters.memberships} name={rosters.name} />
    </AuthShell>
  );
}
