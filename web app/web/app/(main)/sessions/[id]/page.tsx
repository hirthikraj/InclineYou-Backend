import { notFound } from 'next/navigation';

import { SessionDetail } from '@/components/sessions/SessionDetail';
import { Unavailable } from '@/components/today/Unavailable';
import { requireSessionDetail } from '@/lib/sessions/guard';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireSessionDetail(id);
  if (!result.ok) {
    if (result.kind === 'not_found') notFound();
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }
  return <SessionDetail data={result.data} />;
}
