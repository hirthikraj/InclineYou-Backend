import { ClientFilePage } from '@/components/clients/file/ClientFilePage';

export const dynamic = 'force-dynamic';

const RANGES = new Set(['30d', '90d', 'all']);

/**
 * The Sessions tab, in two views: the list (default) and `?view=month`, the
 * month grid that was the Calendar tab until 6 Nov 2026. Each view keeps its
 * own read — the list a range window, the month that month ±7 days — so the
 * toggle is a navigation, as the old tab was.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const q = await searchParams;
  if (q.view === 'month') {
    const month = typeof q.month === 'string' ? q.month : undefined;
    return <ClientFilePage clientId={clientId} tab="calendar" options={{ month }} />;
  }
  const range = (typeof q.range === 'string' && RANGES.has(q.range) ? q.range : '90d') as '30d' | '90d' | 'all';
  const older = typeof q.older === 'string' ? Math.max(0, Number(q.older) || 0) : 0;
  return <ClientFilePage clientId={clientId} tab="sessions" options={{ range, older }} />;
}
