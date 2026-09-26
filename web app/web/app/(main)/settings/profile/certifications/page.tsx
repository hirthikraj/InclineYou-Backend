import { CertificationsPanel } from '@/components/settings/CertificationsPanel';
import { getIdentity } from '@/lib/profile/api';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Certifications · InclineYou' };

/**
 * CERTIFICATIONS — the profile's second tab.
 *
 * A route of its own rather than a section of the identity page, which is what
 * it was for half a day: seven sections are coming, and seven headings stacked
 * in one scrolling column is a page whose seventh section nobody has ever seen.
 * `lib/profile/tabs.ts` carries the rest of that argument.
 *
 * It reads the same `/v1/trainers/me` the identity tab does — one request, the
 * whole trainer — and uses one field of it. That is the right trade against a
 * `/v1/trainers/me/certifications` that would exist only so this panel could
 * fetch less: the endpoint is already the profile's, and the response is a few
 * hundred bytes.
 */
export default async function Page() {
  const identity = await getIdentity();

  return <CertificationsPanel initial={identity} />;
}
