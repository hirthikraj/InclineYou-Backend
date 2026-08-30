import { notFound } from 'next/navigation';

import { Finish } from '@/components/log/Finish';
import { Unavailable } from '@/components/today/Unavailable';
import { requireFinish } from '@/lib/log/guard';

/** Frame 5b · `/sessions/:id/finish` — four figures, and the pack sentence. */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireFinish(id);
  if (result.ok) return <Finish data={result.data} />;
  if (result.kind === 'not_found') notFound();
  return (
    <Unavailable
      kind={result.kind}
      status={result.kind === 'refused' ? result.status : undefined}
    />
  );
}
