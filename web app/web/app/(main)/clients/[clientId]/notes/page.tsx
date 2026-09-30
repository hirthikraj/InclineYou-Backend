import { permanentRedirect } from 'next/navigation';

/**
 * Renamed to `/information` on 30 Sep 2026 — the key finally followed the
 * label (`Personal information`, since 14 Sep). `permanentRedirect` and not a
 * 404: `(portal)/me/progress/measurements/page.tsx` makes the identical call
 * for the identical reason. `redirect` would be the temporary form; this
 * mapping is settled, so it's the 308 instead.
 */
export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  permanentRedirect(`/clients/${clientId}/information`);
}
