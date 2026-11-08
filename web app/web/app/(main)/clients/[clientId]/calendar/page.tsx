import { redirect } from 'next/navigation';

/**
 * The Calendar tab became the Sessions tab's *Month* view on 6 Nov 2026. A
 * bookmark or an open second window lands on the same month there. `redirect`
 * rather than `permanentRedirect`: a 308 is cached by the browser, and the
 * shape of this file is young enough that a later pass may want this URL back.
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
  const month = typeof q.month === 'string' && /^\d{4}-\d{2}$/.test(q.month) ? `&month=${q.month}` : '';
  redirect(`/clients/${clientId}/sessions?view=month${month}`);
}
