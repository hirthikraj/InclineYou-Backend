import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth/AuthShell';
import { VerifyForm } from '@/components/auth/VerifyForm';
import { getPendingPhone, getToken } from '@/lib/auth/session';

export const metadata = { title: 'Enter the code · X REP' };

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
  if (await getToken()) redirect('/today');

  const phone = await getPendingPhone();
  if (!phone) redirect('/sign-in');

  return (
    <AuthShell quote="Two books, one login. Your own training never touches a client’s.">
      <VerifyForm phone={phone} />
    </AuthShell>
  );
}
