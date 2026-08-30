import { permanentRedirect } from 'next/navigation';

/**
 * `/business/2026-08` → `/business`.
 *
 * The month is not a route any more — it is a period the trainer picks on the
 * screen, and it can be a span rather than a month, which no path segment can
 * spell. See `app/(main)/business/page.tsx` for why the segment was never
 * carrying its weight.
 *
 * Kept as a redirect rather than deleted, on the same reasoning as `/money` and
 * `/money/[month]`: this path was live for the whole of this half's life and is
 * in browser histories and bookmarks. What it cannot carry over is the month
 * itself — the destination has no place to put it — so an old link to an old
 * month lands on the current one. That is a loss of one click, against a 404.
 *
 * The tab rides along, because that half of the URL is still real.
 */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await props.searchParams;
  const tab = typeof q.tab === 'string' ? `?tab=${encodeURIComponent(q.tab)}` : '';
  permanentRedirect(`/business${tab}`);
}
