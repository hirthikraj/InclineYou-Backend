import { SocialPanel } from '@/components/settings/SocialPanel';
import { getIdentity } from '@/lib/profile/api';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Social links · X REP' };

/** SOCIAL LINKS — the profile's seventh and last tab. V35. */
export default async function Page() {
  const identity = await getIdentity();

  return (
    <div className="body">
      <SocialPanel initial={identity} />
    </div>
  );
}
