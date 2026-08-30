import { notFound } from 'next/navigation';

import { ExerciseHistory } from '@/components/log/ExerciseHistory';
import { Unavailable } from '@/components/today/Unavailable';
import { requireExerciseHistory } from '@/lib/log/guard';

/**
 * Frames 4a and 7a · `/clients/:id/exercises/:exerciseId`, with `?edit=:setId`.
 *
 * Under `/clients` and not under `/sessions` because it belongs to the client
 * rather than to any one session — and the correction form is a route rather
 * than a moment, because it is a place somebody is sent to from a report.
 */
export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  params: Promise<{ clientId: string; exerciseId: string }>;
}) {
  const { clientId, exerciseId } = await params;
  const result = await requireExerciseHistory(clientId, exerciseId);
  if (result.ok) return <ExerciseHistory data={result.data} />;
  if (result.kind === 'not_found') notFound();
  return (
    <Unavailable
      kind={result.kind}
      status={result.kind === 'refused' ? result.status : undefined}
    />
  );
}
