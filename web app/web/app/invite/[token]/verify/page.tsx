import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth/AuthShell';
import { InviteVerify } from '@/components/invite/InviteVerify';
import { getInviteCard } from '@/lib/invite/api';
import { getSitting } from '@/lib/invite/cookie';

/**
 * `/invite/{token}/verify` — the second half of the invite: the code that was just sent, and *Let me in*.
 *
 * It exists only inside a sitting: no sealed cookie for THIS link means a bookmark, a lapsed half hour or another browser, and
 * the answer is the card again — which is also where a dead link finds out it is dead, since the card is the page that says so.
 */
export const metadata: Metadata = {
  title: 'Enter your code · InclineYou',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [sitting, card] = await Promise.all([getSitting(token), getInviteCard(token)]);
  if (!sitting || card?.state !== 'valid') redirect(`/invite/${encodeURIComponent(token)}`);

  return (
    <AuthShell
      eyebrow="One step left"
      lead="Check WhatsApp."
      quote="The plan, the sets and the payments — in one place both of you can see."
    >
      <InviteVerify
        token={token}
        trainerFirstName={card.trainer.name.split(' ')[0] || 'your trainer'}
        phoneEnding={card.phoneMasked.replace(/^•+/, '')}
        resendAt={sitting.resendAt}
      />
    </AuthShell>
  );
}
