import { notFound } from 'next/navigation';

import { ClientFile } from '@/components/clients/file/ClientFile';
import { Unavailable } from '@/components/today/Unavailable';
import { requireClientFile } from '@/lib/clients/client-guard';

/**
 * The client's contact fields and the trainer's own notes, side by side.
 *
 * The path is still `/notes`. The tab was renamed *Personal information* on
 * 14 Sep 2026 when the contact form landed beside the list, and the segment was
 * left alone on purpose: a bookmark or a second window on this URL is worth more
 * than a route that matches the label. `TABS` in `shared.tsx` carries the note.
 *
 * V29 · no frame owes it.
 */
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
  return <ClientFile payload={result.payload} now={result.now} tab="notes" />;
}
