import { ClientFilePage } from '@/components/clients/file/ClientFilePage';

/**
 * The window chip is a place — `?range=30d|90d|all` — and `Load older` is
 * `?older=n`, n whole windows back (R76). `all` reads the newest 400 days, L4's cap.
 */
export const dynamic = 'force-dynamic';

const RANGES = new Set(['30d', '90d', 'all']);

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const q = await searchParams;
  const range = (typeof q.range === 'string' && RANGES.has(q.range) ? q.range : '90d') as '30d' | '90d' | 'all';
  const older = typeof q.older === 'string' ? Math.max(0, Number(q.older) || 0) : 0;
  return <ClientFilePage clientId={clientId} tab="sessions" options={{ range, older }} />;
}
