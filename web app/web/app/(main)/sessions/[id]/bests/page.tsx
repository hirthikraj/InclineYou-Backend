import { notFound } from 'next/navigation';

import { Bests } from '@/components/log/Bests';
import { Unavailable } from '@/components/today/Unavailable';
import { requireBests } from '@/lib/sessionlog/finish-guard';

/** Frame 2a · `/sessions/:id/bests` — every top set judged. Its own route
    because a trainer opens it after the session and wants to link to it. */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireBests(id);
  if (result.ok) return <Bests data={result.data} />;
  if (result.kind === 'not_found') notFound();
  return (
    <Unavailable
      kind={result.kind}
      status={result.kind === 'refused' ? result.status : undefined}
    />
  );
}
