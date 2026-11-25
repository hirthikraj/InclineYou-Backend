import { Joining } from '@/components/clients/join/Joining';
import { Unavailable } from '@/components/today/Unavailable';
import { requireJoining, type JoiningView } from '@/lib/join/joining';

export const metadata = { title: 'Joining · Clients · InclineYou' };
export const dynamic = 'force-dynamic';

/**
 * `/clients/joining` — invitations and join requests in one list (22 Nov 2026). `?view=` picks which states are READ, so it is
 * in the address and re-read on the server, like the two pages it replaced.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const view: JoiningView = q.view === 'joined' || q.view === 'declined' || q.view === 'invite' ? q.view : 'active';
  const result = await requireJoining(view);
  if (!result.ok) return <Unavailable kind={result.kind} status={result.kind === 'refused' ? result.status : undefined} />;
  return <Joining data={result.data} view={view} now={result.now} />;
}
