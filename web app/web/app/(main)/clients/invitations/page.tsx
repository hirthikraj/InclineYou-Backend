import { redirect } from 'next/navigation';

/**
 * `/clients/invitations` was its own page until 22 Nov 2026; invitations now live in Clients → Joining beside the join
 * requests. A temporary redirect (not a 308), keeping the old `?tab=` meaning, so a bookmark lands on the same people.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tab = (await searchParams).tab;
  redirect(tab === 'joined' ? '/clients/joining?view=joined' : tab === 'declined' || tab === 'withdrawn' ? '/clients/joining?view=declined' : '/clients/joining');
}
