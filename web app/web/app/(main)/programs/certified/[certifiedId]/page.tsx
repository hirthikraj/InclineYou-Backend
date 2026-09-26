import { notFound } from 'next/navigation';

import { CertifiedPreview } from '@/components/programs/CertifiedPreview';
import { Unavailable } from '@/components/today/Unavailable';
import { requireCertifiedTemplate } from '@/lib/programs/guard';

/**
 * `/programs/certified/:id` — one certified program, read-only.
 *
 * A ROUTE and not a modal, for the reason `/programs/:id` is one: the back button
 * works between programs, and a trainer can send a colleague a link to the block
 * they are recommending. A dialog over the grid could do neither.
 *
 * `force-dynamic` because the *Open your copy* state on this page is computed
 * against the caller's own shelf, same as the catalogue's.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ certifiedId: string }>;
}) {
  const { certifiedId } = await params;
  const result = await requireCertifiedTemplate(certifiedId);
  return {
    title: result.ok
      ? `${result.data.template.name} · Templates · InclineYou`
      : 'Templates · InclineYou',
  };
}

export default async function Page({ params }: { params: Promise<{ certifiedId: string }> }) {
  const { certifiedId } = await params;
  const result = await requireCertifiedTemplate(certifiedId);

  // A program we retired, or a link somebody kept. `notFound()` rather than the
  // unavailable screen — "the server said no" is the wrong sentence for a
  // program that is simply not offered any more.
  if (!result.ok && result.kind === 'missing') notFound();

  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind === 'refused' ? 'refused' : 'unreachable'}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }

  return <CertifiedPreview data={result.data} />;
}
