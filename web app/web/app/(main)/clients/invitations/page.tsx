import { Invitations } from '@/components/clients/Invitations';
import { Unavailable } from '@/components/today/Unavailable';
import { requireInvitations } from '@/lib/clients/invite-guard';
import { INVITE_TABS } from '@/lib/clients/invite-types';

export const metadata = { title: 'Invitations · Clients · InclineYou' };

/** The guard reads a cookie, and the screen writes (a new link replaces the old one). */
export const dynamic = 'force-dynamic';

/**
 * `/clients/invitations` — the Invitations view (UC-CLI-14), the bulk invite (UC-CLI-16) and the resend.
 *
 * The tab is `?tab=` and picks which states are READ (`waiting` is pending and expired, the ones that need the trainer),
 * so it is in the address and re-read on the server, like the assessments list. An unknown tab is the default one.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const raw = typeof query.tab === 'string' ? query.tab : 'waiting';
  const tab = INVITE_TABS.find((t) => t.key === raw) ?? INVITE_TABS[0];

  const result = await requireInvitations(tab.states);
  if (!result.ok) {
    return <Unavailable kind={result.kind} status={result.kind === 'refused' ? result.status : undefined} />;
  }
  return <Invitations data={result.data} now={result.now} tab={tab.key} />;
}
