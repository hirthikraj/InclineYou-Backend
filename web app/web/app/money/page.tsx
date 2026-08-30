import { permanentRedirect } from 'next/navigation';

/**
 * `/money` is `/business` now — the ledger is one of seven tabs on it.
 *
 * Kept as a redirect and not deleted, and this is the one in the set with the
 * most links pointing at it: the client file's *Sell a pack*, Today's hero and
 * its week card, the phone stack's stat tile and the command palette all pointed
 * here for the whole of this half's life. Every one of them has been repointed at
 * `/business` in the same pass, and this route exists for what is already in a
 * browser history or a message.
 *
 * The tab rides along so `/money?tab=owed` still lands on *Owed*: the money
 * book's six tab names are the first six of Business' seven, unchanged, which is
 * what makes the redirect lossless. The one name that is not carried is
 * `?tab=packages`, and it does not need to be — it now lands on the REAL price
 * list rather than the one the money book inferred from sold rows.
 */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await props.searchParams;
  const tab = typeof q.tab === 'string' ? `?tab=${encodeURIComponent(q.tab)}` : '';
  permanentRedirect(`/business${tab}`);
}
