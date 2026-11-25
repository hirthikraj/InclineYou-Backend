import { JoinLink } from '@/components/clients/join/JoinLink';
import { Unavailable } from '@/components/today/Unavailable';
import { requireJoinLink } from '@/lib/join/guard';

export const metadata = { title: 'Join link · Clients · InclineYou' };
export const dynamic = 'force-dynamic';

/** `/clients/join-link` — the trainer's public join page and its settings (api-contract 1.2, jl-a1/jl-a2; V45). */
export default async function Page() {
  const result = await requireJoinLink();
  if (!result.ok) return <Unavailable kind={result.kind} status={result.kind === 'refused' ? result.status : undefined} />;
  return <JoinLink data={result.data} />;
}
