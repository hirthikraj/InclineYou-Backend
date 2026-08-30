import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth/AuthShell';
import { SignInForm } from '@/components/auth/SignInForm';
import { getToken } from '@/lib/auth/session';

export const metadata = { title: 'Sign in · X REP' };

/**
 * Frame 1a · `/sign-in`.
 *
 * A server component holding a client island. Nothing here needs the browser
 * except the form itself, and the check below has to happen on the server:
 * the cookie it reads is httpOnly and does not exist in browser JavaScript.
 */
export default async function SignInPage() {
  // Already signed in — /sign-in is not a screen to strand somebody on.
  if (await getToken()) redirect('/today');

  return (
    <AuthShell quote="Two books, one login. Your own training never touches a client’s.">
      <SignInForm />
    </AuthShell>
  );
}
