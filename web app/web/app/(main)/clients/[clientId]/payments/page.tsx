import { ClientFilePage } from '@/components/clients/file/ClientFilePage';
import { getBusiness } from '@/lib/practice/api';
import { loadClaims } from '@/lib/claims/actions';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  // The workspace's business (V46) rides beside the file: it is the invoice's From block, and only this tab draws it.
  return <ClientFilePage clientId={clientId} tab="payments" extra={Promise.all([getBusiness(), loadClaims('open', clientId)]).then(([business, claims]) => ({ business, claims }))} />;
}
