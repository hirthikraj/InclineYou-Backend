import { ClientFilePage } from '@/components/clients/file/ClientFilePage';

/** Frame 3a · the file. Overview is the bare route, so `/clients/:id` is a tab and not a redirect. */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return <ClientFilePage clientId={clientId} tab="overview" />;
}
