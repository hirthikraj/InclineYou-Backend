import { permanentRedirect } from 'next/navigation';

/**
 * `/business/transactions` was renamed **Payments** on 23 Nov 2026 (`release/business-module-plan.html`): the page is every
 * rupee by state — to confirm, owed, paid, written off — and "transactions" named a table, not the question. Bookmarks and
 * old links keep working; the query (`?filter=`, `?record=`) rides along.
 */
export default async function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await props.searchParams;
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (typeof v === 'string') out.set(k, v);
  const s = out.toString();
  permanentRedirect(`/business/payments${s ? `?${s}` : ''}`);
}
