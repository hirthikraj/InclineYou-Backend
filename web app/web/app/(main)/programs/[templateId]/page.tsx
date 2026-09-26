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
  return { title: result.ok ? `${result.data.template.name} · InclineYou` : 'Fitness · InclineYou' };
}

/* NO `searchParams`, AND `?copied=1` IS GONE WITH IT.
   The certified copy used to land here carrying that flag so the builder could
   seed a `.pg__flash` band from it — a round trip through the URL that existed
   only because a confirm raised on the shelf could not survive the navigation
   to this screen. The toast deck is mounted in the app shell, above the
   router's children, so it does; `CertifiedCard` raises the card and pushes,
   and nothing has to be read back out of the query string here. */
export default async function Page({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
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
      /* See the sibling route, and `Guarded<T>` for why it is the guard's. */
      now={result.now}
    />
  );
}
