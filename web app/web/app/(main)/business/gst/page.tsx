import { GstPage } from '@/components/business/GstPage';
import { Unavailable } from '@/components/today/Unavailable';
import { requireMoney } from '@/lib/money/guard';

/** `/business/gst` — see `components/business/GstPage.tsx`. */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'GST · Business · InclineYou' };

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

  return <GstPage data={money.data} />;
}
