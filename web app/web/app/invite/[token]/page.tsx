import type { Metadata } from 'next';

import { AuthShell } from '@/components/auth/AuthShell';
import { InviteView } from '@/components/invite/InviteView';
import { getInviteCard, getMyInvite } from '@/lib/invite/api';
import { redirect } from 'next/navigation';

/**
 * `/invite/{token}` — the page a trainer's WhatsApp link opens (api-contract 1.2, inv-a1).
 *
 * A client never signs up: a trainer invites them, and this is the first thing they see. It shows who is asking before it asks
 * for anything. The token is a credential, so the page is never indexed, never cached, and sends no `Referer` to anything it
 * links to (the trainer's Instagram and YouTube are links out, never embeds).
 */
export const metadata: Metadata = {
  title: 'You’ve been invited · InclineYou',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // A UUID is not a link: it is the id of an invite waiting for a number that has ALREADY signed in (api-contract 1.2, D-16), and
  // it is read with that session. A link's token is 43 characters, so the two cannot be mistaken for each other.
  const byId = UUID.test(token);
  const card = byId ? await getMyInvite(token) : await getInviteCard(token);
  if (byId && card === null) redirect('/sign-in');
  const valid = card?.state === 'valid';

  return (
    <AuthShell
      eyebrow={valid ? 'You’ve been invited' : 'Your invite'}
      lead={valid ? 'Your trainer added you.' : 'About this link.'}
      quote="The plan, the sets and the payments — in one place both of you can see."
    >
      <InviteView card={card} token={token} signedIn={byId} />
    </AuthShell>
  );
}
