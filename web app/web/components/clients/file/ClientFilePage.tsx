import { notFound } from 'next/navigation';

import { Unavailable } from '@/components/today/Unavailable';
import type { ClientTab, TabOptions } from '@/lib/clients/client-api';
import { requireClientFile } from '@/lib/clients/client-guard';

import { ClientFile, type ClientFileProps } from './ClientFile';

/**
 * Every tab route is this: the header and the tab's own reads, or the reason
 * there are none. `extra` is what a tab loads outside the file's payload —
 * Progress's view, the Assessments list — fetched beside it, not after.
 */
export async function ClientFilePage({
  clientId,
  tab,
  options,
  extra,
}: {
  clientId: string;
  tab: ClientTab;
  options?: TabOptions;
  extra?: Promise<Partial<Pick<ClientFileProps, 'progress' | 'assessments'>>>;
}) {
  const [file, more] = await Promise.all([requireClientFile(clientId, tab, options), extra ?? {}]);
  if (!file.ok) {
    if (file.kind === 'not_found') notFound();
    return <Unavailable kind={file.kind} status={file.kind === 'refused' ? file.status : undefined} />;
  }
  return <ClientFile payload={file.payload} now={file.now} tab={tab} options={options} {...more} />;
}
