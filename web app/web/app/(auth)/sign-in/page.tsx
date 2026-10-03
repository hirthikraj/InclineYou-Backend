import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth/AuthShell';
import { SignInForm } from '@/components/auth/SignInForm';
import { checkSession } from '@/lib/auth/api';
import { readClaims } from '@/lib/auth/claims';
import { sessionNotice } from '@/lib/auth/copy';
import { getToken } from '@/lib/auth/session';

export const metadata = { title: 'Sign in · InclineYou' };

/**
 * Frame 1a · `/sign-in`.
 *
 * A server component holding a client island. Nothing here needs the browser
 * except the form itself, and the check below has to happen on the server:
 * the cookie it reads is httpOnly and does not exist in browser JavaScript.
 *
 * ── A COOKIE IS NOT A SESSION ────────────────────────────────────────────────
 *
 * The cookie outlives the server's session — it is revoked from another device,
 * or simply ages out — so "there is a token" is not "this person is signed in".
 * Bouncing on the cookie alone made a loop: `/sign-in` sent a dead session to
 * `/today`, whose guard saw the 401 and sent it straight back. So a trainer's
 * token is asked about first, and a 401 goes to `/sign-in/expired`, which clears
 * the cookie and returns here with `?why=` saying which way it went.
 */
export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ why?: string }>;
}) {
  const { why } = await searchParams;

  const claims = readClaims(await getToken());
  if (claims) {
    // A new number part-way through: its token opens one screen, and it is not /today.
    if (claims.role === 'pending') redirect('/sign-in/new');

    const session = await checkSession();
    if (session.live) redirect('/today');
    redirect(`/sign-in/expired?why=${session.why}`);
  }

  return (
    <AuthShell>
      <SignInForm notice={sessionNotice(why)} />
    </AuthShell>
  );
}
