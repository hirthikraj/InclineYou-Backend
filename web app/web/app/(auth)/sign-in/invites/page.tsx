import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth/AuthShell';
import { getMyInvites } from '@/lib/invite/api';
import { Avatar } from '@/web-components/ui/Avatar';

export const metadata: Metadata = {
  title: 'Your invites · InclineYou',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * `/sign-in/invites` — more than one trainer has invited this number (api-contract 1.2, D-16).
 *
 * The code was proved on the login page, so choosing one goes straight to its card with no second code. A list that failed to
 * load is not drawn as *no invites*: that would tell somebody with three waiting that nobody has asked, so it sends them back to sign
 * in, which is also what a lapsed session needs.
 */
export default async function Page() {
  const invites = await getMyInvites();
  if (invites === null) redirect('/sign-in');
  if (invites.length === 1) redirect(`/invite/${invites[0].inviteId}`);

  return (
    <AuthShell eyebrow="You’ve been invited" lead="More than one invite." quote="Pick the trainer you’re joining. You can join one at a time.">
      {invites.length === 0 ? (
        <>
          <h2 className="stp__hd" style={{ fontSize: 26 }}>Nothing waiting</h2>
          <p className="stp__sub" style={{ marginTop: 8 }}>The invites for this number have run out. Ask your trainer to send a new link.</p>
        </>
      ) : (
        <>
          <h2 className="stp__hd" style={{ fontSize: 26 }}>Who are you joining?</h2>
          <ul className="inv-list">
            {invites.map((i) => (
              <li key={i.inviteId}>
                <Link className="inv-list__i" href={`/invite/${i.inviteId}`}>
                  <Avatar name={i.trainerName} id={i.inviteId} />
                  <span className="inv-list__t">
                    <b>{i.trainerName}</b>
                    {i.headline && <i>{i.headline}</i>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </AuthShell>
  );
}
