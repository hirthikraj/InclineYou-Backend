import { ClientFilePage } from '@/components/clients/file/ClientFilePage';
import { requireProgress } from '@/lib/log/guard';

/** Frame 3a · the file. Overview is the bare route, so `/clients/:id` is a tab and not a redirect. */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return (
    <ClientFilePage
      clientId={clientId}
      tab="overview"
      /* THE RECORDS CARD READS THE SAME SET HISTORY THE PROGRESS TAB DOES, over the whole of it:
         a personal best is a claim about every session, so a window would hand out records for
         numbers that were beaten last year. A failed read is `null`, and the card says nothing
         rather than inventing an empty state. */
      extra={requireProgress(clientId, 'all', null).then((p) => ({ progress: p.ok ? p.data : null }))}
    />
  );
}
