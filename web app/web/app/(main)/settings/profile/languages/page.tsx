import { LanguagesPanel } from '@/components/settings/LanguagesPanel';
import { getIdentity } from '@/lib/profile/api';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Languages · X REP' };

/** LANGUAGES — the profile's fifth tab. */
export default async function Page() {
  const identity = await getIdentity();

  return (
    <div className="body">
      <LanguagesPanel initial={identity} />
    </div>
  );
}
