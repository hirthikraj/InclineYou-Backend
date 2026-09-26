import { notFound } from 'next/navigation';

import { ENTRIES, byId } from '@/web-components/registry';
import { ENTRY_VIEWS } from '@/web-components/library/entries';

/**
 * One component's specimen, bare, for a `<Viewport>` to frame.
 *
 * The id is the same one `/library/[id]` takes — the design file's own anchor —
 * so the framed view and the page it sits on can never be showing two different
 * components.
 *
 * Only entries with a written page are generated. An entry without one has no
 * specimen to frame, and a frame containing the "not written yet" stub at two
 * widths would be two copies of a sentence.
 */
export function generateStaticParams() {
  return ENTRIES.filter((e) => ENTRY_VIEWS[e.id]).map((e) => ({ id: e.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = byId(id);
  const View = entry ? ENTRY_VIEWS[entry.id] : undefined;
  if (!View) notFound();

  return <View />;
}
