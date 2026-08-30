import { permanentRedirect } from 'next/navigation';

/**
 * `/money/2026-08` → `/business`. The month does NOT survive the move any more:
 * Business dropped its month segment when the period became a picker that can
 * also express a span — see `app/(main)/business/page.tsx`. This route is here
 * for what is already in a browser history; see `/money/page.tsx` for why these
 * files are redirects rather than deletions.
 */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await props.searchParams;
  const tab = typeof q.tab === 'string' ? `?tab=${encodeURIComponent(q.tab)}` : '';
  permanentRedirect(`/business${tab}`);
}
