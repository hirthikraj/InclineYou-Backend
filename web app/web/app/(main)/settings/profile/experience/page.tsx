import { ExperiencePanel } from '@/components/settings/ExperiencePanel';
import { getIdentity } from '@/lib/profile/api';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Experience · X REP' };

/**
 * EXPERIENCE — the profile's third tab. One `/v1/trainers/me`, one field of it
 * used; see the certifications route for why that is the right trade against a
 * per-field endpoint.
 */
export default async function Page() {
  const identity = await getIdentity();

  return (
    <div className="body">
      <ExperiencePanel initial={identity} />
    </div>
  );
}
