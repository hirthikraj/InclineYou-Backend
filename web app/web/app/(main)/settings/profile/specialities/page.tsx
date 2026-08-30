import { SpecialitiesPanel } from '@/components/settings/SpecialitiesPanel';
import { getIdentity } from '@/lib/profile/api';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Specialities · X REP' };

/** SPECIALITIES — the profile's fourth tab. */
export default async function Page() {
  const identity = await getIdentity();

  return (
    <div className="body">
      <SpecialitiesPanel initial={identity} />
    </div>
  );
}
