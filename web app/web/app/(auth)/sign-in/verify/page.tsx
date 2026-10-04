import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth/AuthShell';
import { VerifyForm } from '@/components/auth/VerifyForm';
import { resendDelay } from '@/lib/auth/policy';
import { getPendingPhone, getResendWait, getToken } from '@/lib/auth/session';

export const metadata = { title: 'Enter the code · InclineYou' };

/**
 * Frames 1b and 1c · `/sign-in/verify`.
 *
 * The number is read from a cookie, not the URL. A phone number in a path is a
 * phone number in browser history, in a screenshot, and in any referrer that
 * leaks — and this screen prints it back to the trainer, so it has to have it.
 *
 * Arriving here without one means a reload after the cookie lapsed, or a
 * bookmark. There is no code in flight to enter, so it is the first screen's
 * job, not a form with nothing behind it.
 */
export default async function VerifyPage() {
  // Signed in already (or part-way through becoming a trainer): the root fork
  // sends each credential where it works.
  if (await getToken()) redirect('/');

  const phone = await getPendingPhone();
  if (!phone) redirect('/sign-in');

  // The server's own wait for this request, not the first rung assumed: signing in
  // again soon after a code is on a later one. No record means the first rung.
  const cooldown = (await getResendWait()) ?? resendDelay(0);

  return (
    <AuthShell
      lead="Six digits. That is it."
      quote="No password to remember and nothing to reset — the code lands in about ten seconds."
    >
      <VerifyForm phone={phone} initialCooldown={cooldown} />
    </AuthShell>
  );
}
