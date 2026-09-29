import { ClientFilePage } from '@/components/clients/file/ClientFilePage';

/** The month shown is a place — `?month=yyyy-MM` — so stepping it reads only that month (Client file · Calendar). */
export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const q = await searchParams;
  const month = typeof q.month === 'string' ? q.month : undefined;
  return <ClientFilePage clientId={clientId} tab="calendar" options={{ month }} />;
}
