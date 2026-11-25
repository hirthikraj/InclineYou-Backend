import { BusinessPanel } from '@/components/settings/BusinessPanel';
import { Unavailable } from '@/components/today/Unavailable';
import { getBusiness } from '@/lib/practice/api';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Business · Settings · InclineYou' };

/** `/settings/business` — the active workspace's business (api-contract 1.2, bz-a1/bz-a2; V46). */
export default async function Page() {
  const business = await getBusiness();
  if (!business) return <Unavailable kind="unreachable" />;
  return (
    <div className="body">
      <BusinessPanel initial={business} />
    </div>
  );
}
