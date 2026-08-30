import { notFound } from 'next/navigation';

import { ClientFile } from '@/components/clients/file/ClientFile';
import { Unavailable } from '@/components/today/Unavailable';
import { requireClientFile } from '@/lib/clients/client-guard';

/** Frame 3a · the file. Overview is the bare route, so `/clients/:id` is a tab and not a redirect. */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const result = await requireClientFile(clientId);
  if (!result.ok) {
    if (result.kind === 'not_found') notFound();
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }
  return <ClientFile payload={result.payload} now={result.now} tab="overview" />;
}
