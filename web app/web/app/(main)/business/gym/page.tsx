import { GymPage } from '@/components/business/GymPage';
import { Unavailable } from '@/components/today/Unavailable';
import { requireMoney } from '@/lib/money/guard';

/** `/business/gym` — see `components/business/GymPage.tsx`. */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Gym share · Business · InclineYou' };

export default async function Page() {
  const money = await requireMoney();

  if (!money.ok) {
    return (
      <Unavailable
        kind={money.kind}
        status={money.kind === 'refused' ? money.status : undefined}
      />
    );
  }

  return <GymPage data={money.data} />;
}
