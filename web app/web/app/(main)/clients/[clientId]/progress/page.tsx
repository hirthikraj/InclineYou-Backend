import { notFound } from 'next/navigation';

import { ClientFile } from '@/components/clients/file/ClientFile';
import { Unavailable } from '@/components/today/Unavailable';
import { requireClientFile } from '@/lib/clients/client-guard';
import { requireProgress } from '@/lib/log/guard';
import type { ProgressRange } from '@/lib/log/log';

/**
 * Frame 4b, folded into the file · `/clients/:id/progress`.
 *
 * The one tab that loads twice, because it draws two things from two places: the
 * file's payload for the measurement history, and the console's `requireProgress`
 * for volume, records and the top-set sequence. They are fetched in parallel.
 *
 * `range` and `focus` stay in the query string. They were the standalone screen's
 * and they belong there for its reason — a chosen range is a **place**, and a
 * trainer showing a client six months should be able to send them that link.
 *
 * Progress failing does not fail the tab. The measurement half is in the file's
 * own payload and is worth drawing on its own, and a client with no set logs is
 * the ordinary state of somebody a trainer has only ever weighed.
 */
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

  const [file, progress] = await Promise.all([
    requireClientFile(clientId),
    requireProgress(clientId, range, focus),
  ]);

  if (!file.ok) {
    if (file.kind === 'not_found') notFound();
    return (
      <Unavailable kind={file.kind} status={file.kind === 'refused' ? file.status : undefined} />
    );
  }

  return (
    <ClientFile
      payload={file.payload}
      now={file.now}
      tab="progress"
      progress={progress.ok ? progress.data : null}
    />
  );
}
