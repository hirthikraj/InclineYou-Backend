import { notFound } from 'next/navigation';

import { Programs } from '@/components/programs/Programs';
import { Unavailable } from '@/components/today/Unavailable';
import { requireBuilder } from '@/lib/programs/guard';

/**
 * `/programs/:id` — the shelf and the builder, which are one screen.
 *
 * `force-dynamic` for the reason the client file is: the builder autosaves, and
 * a cached shell would hand the trainer back the blueprint they had before the
 * last write on every soft navigation between two programs.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const result = await requireBuilder(templateId);
  return { title: result.ok ? `${result.data.template.name} · X REP` : 'Programs · X REP' };
}

export default async function Page({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const result = await requireBuilder(templateId);

  // A deleted program, or a link somebody kept. `notFound()` rather than the
  // unavailable screen, because "the server said no" is the wrong sentence for a
  // program that simply is not there any more.
  if (!result.ok && result.kind === 'missing') notFound();

  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind === 'refused' ? 'refused' : 'unreachable'}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }

  return (
    <Programs
      data={{ templates: result.data.templates, names: result.data.names }}
      open={result.data}
    />
  );
}
