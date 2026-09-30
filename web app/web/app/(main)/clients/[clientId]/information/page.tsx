import { ClientFilePage } from '@/components/clients/file/ClientFilePage';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return <ClientFilePage clientId={clientId} tab="information" />;
}
