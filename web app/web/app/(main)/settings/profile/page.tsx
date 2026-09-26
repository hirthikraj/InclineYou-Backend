import { IdentityForm } from '@/components/settings/IdentityForm';
import { getIdentity } from '@/lib/profile/api';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Your profile · InclineYou' };

/**
 * IDENTITY — the profile's first tab, and its root: `/settings/profile` is
 * this panel rather than a redirect to it, so the account menu's *Your profile*
 * and the settings index both land somewhere real in one hop.
 *
 * The bar, the title and the tab strip are in `layout.tsx`. This page is the
 * panel and nothing else.
 *
 * One request, and deliberately **not** `getSetupState`. That function reads a
 * full `/v1/sync/pull` alongside the profile, because two setup steps have no
 * REST endpoint — a cost its own header calls affordable *in setup and nowhere
 * else*. Pulling a live trainer's whole database to draw a bio is exactly the
 * shape of bug that warning exists to prevent. See `lib/profile/api.ts`.
 */
export default async function Page() {
  const identity = await getIdentity();

  return <IdentityForm initial={identity} />;
}
