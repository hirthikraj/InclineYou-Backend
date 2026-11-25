import { redirect } from 'next/navigation';

/** `/clients/join-requests` merged into Clients → Joining on 22 Nov 2026; the old `?view=` keeps its meaning. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const view = (await searchParams).view;
  redirect(view === 'approved' ? '/clients/joining?view=joined' : view === 'declined' ? '/clients/joining?view=declined' : '/clients/joining');
}
