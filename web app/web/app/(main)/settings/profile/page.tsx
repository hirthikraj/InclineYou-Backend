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
 * One request, and deliberately **not** `getSetupState`. That function
 * assembles the whole setup flow — profile, working week, price list, skipped
 * steps — and a profile tab has no use for three of the four. See
 * `lib/profile/api.ts`.
 */
export default async function Page() {
  const identity = await getIdentity();

  return <IdentityForm initial={identity} />;
}
