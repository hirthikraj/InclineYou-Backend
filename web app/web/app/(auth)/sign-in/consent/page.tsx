import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth/AuthShell';
import { Consent } from '@/components/auth/Consent';
import { readClaims } from '@/lib/auth/claims';
import { getPolicyVersion, getToken } from '@/lib/auth/session';

export const metadata = { title: 'Privacy notice · InclineYou' };

/**
 * `/sign-in/consent` — a signed-in trainer whose accepted notice is out of date.
 *
 * The version to accept is the one verify named (`currentPolicyVersion`), kept in
 * a cookie, so a notice that moves on between sign-in and this press cannot be
 * accepted at the wrong version: the server refuses a stale one with
 * `CONSENT_REQUIRED`. No cookie means a bookmark or a lapsed sitting, and the
 * answer is a fresh sign-in.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const claims = readClaims(await getToken());
  if (!claims || claims.role !== 'trainer') redirect('/sign-in');

  const version = await getPolicyVersion();
  if (!version) redirect('/sign-in');

  return (
    <AuthShell
      eyebrow="Before you continue"
      lead="One thing has changed."
      quote="We tell you when the notice changes and ask again — nothing else about your account does."
    >
      <Consent version={version} />
    </AuthShell>
  );
}
