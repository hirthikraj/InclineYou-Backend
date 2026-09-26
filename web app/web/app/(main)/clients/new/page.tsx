import { NewClient } from '@/components/clients/NewClient';
import { Unavailable } from '@/components/today/Unavailable';
import { requireNewClient } from '@/lib/clients/new-guard';

export const metadata = { title: 'Add a client · InclineYou' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const result = await requireNewClient();
  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }
  return <NewClient data={result.data} now={result.now} />;
}
