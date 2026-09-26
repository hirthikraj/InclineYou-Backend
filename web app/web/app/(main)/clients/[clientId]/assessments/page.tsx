import { notFound } from 'next/navigation';

import { ClientFile } from '@/components/clients/file/ClientFile';
import { Unavailable } from '@/components/today/Unavailable';
import { loadClientAssessments } from '@/lib/assessments/guard';
import { requireClientFile } from '@/lib/clients/client-guard';

/**
 * `/clients/:id/assessments` — the file's Check-ins tab.
 *
 * TWO READS IN PARALLEL, which is `/progress`'s arrangement and its argument:
 * the file's payload is ten requests that every tab shares, and a check-in
 * list only one tab reads has no business in it. Adding it there would make
 * seven other tabs pay for a request they never draw.
 *
 * And the second read does not take the tab down. `loadClientAssessments`
 * answers `null` rather than throwing, because the header, the pinned strip and
 * the tab strip are all still worth drawing — and `ChecksTab` says what
 * happened rather than drawing an empty list, which would be this screen
 * inventing a fact about somebody's coaching.
 *
 * ── AND `/clients/assessments` IS NOT THIS ROUTE ────────────────────────────
 *
 * Trap 24 from a third angle. The book-wide list is a STATIC child of
 * `/clients`; this is a static child of `[clientId]`. They are two different
 * depths and cannot collide — but the pair is worth reading together, because
 * the difference between them is the whole product distinction: one answers
 * *who owes me twenty minutes and a tape*, and this one answers *what have I
 * ever asked this person*.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  const [file, assessments] = await Promise.all([
    requireClientFile(clientId),
    loadClientAssessments(clientId),
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
      tab="assessments"
      assessments={assessments}
    />
  );
}
