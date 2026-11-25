import type { Metadata } from 'next';

import { AuthShell } from '@/components/auth/AuthShell';
import { JoinView } from '@/components/join/JoinView';
import { getJoinCard } from '@/lib/join/api';

/**
 * `/join/{slug}` — a trainer's public join page (api-contract 1.2, jn-a1…jn-a3; V45).
 *
 * The one page in the product meant to be found by people who are not on it yet: it lives in an Instagram bio and on a QR code.
 * It shows who is asking before it asks for anything, and all it can make is a REQUEST — the trainer decides. No referrer to
 * anything it links to, like the invite page; unlike the invite it may be indexed, because it is the trainer's shop window.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const card = await getJoinCard(slug);
  if (card?.state === 'open') {
    return {
      title: `Train with ${card.trainer.name} · InclineYou`,
      description: card.welcomeLine ?? card.trainer.headline ?? `Ask ${card.trainer.name} to be your trainer.`,
      referrer: 'no-referrer',
    };
  }
  return { title: 'Join · InclineYou', robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const card = await getJoinCard(slug);
  const open = card?.state === 'open';
  return (
    <AuthShell
      eyebrow={open ? 'Ask to train' : 'Join'}
      lead={open ? 'Train with me.' : 'About this page.'}
      quote="The plan, the sets and the payments — in one place both of you can see."
    >
      {/* `.jn-page` is `display:contents` — a hook for the phone rule in app.css (side gaps around the card), not a box. */}
      <div className="jn-page">
        <JoinView card={card} slug={slug.toLowerCase()} />
      </div>
    </AuthShell>
  );
}
