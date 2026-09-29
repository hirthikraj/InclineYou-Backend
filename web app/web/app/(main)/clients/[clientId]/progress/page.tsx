import { ClientFilePage } from '@/components/clients/file/ClientFilePage';
import { requireProgress } from '@/lib/log/guard';
import type { ProgressRange } from '@/lib/log/log';

/** Progress reads set-history and readings (Client file · Progress), beside the header. */
export const dynamic = 'force-dynamic';

const RANGES = new Set(['8w', '6m', 'all']);

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const query = await searchParams;
  const raw = typeof query.range === 'string' ? query.range : '8w';
  const range = (RANGES.has(raw) ? raw : '8w') as ProgressRange;
  const focus = typeof query.focus === 'string' ? query.focus : null;
  return (
    <ClientFilePage
      clientId={clientId}
      tab="progress"
      extra={requireProgress(clientId, range, focus).then((p) => ({ progress: p.ok ? p.data : null }))}
    />
  );
}
