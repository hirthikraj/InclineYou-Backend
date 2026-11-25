import { PaymentSetup } from '@/components/business/PaymentSetup';
import { Unavailable } from '@/components/today/Unavailable';
import { getBusiness } from '@/lib/practice/api';

/** `/business/payment-setup` — how clients pay you (V50, bz-a4). See `components/business/PaymentSetup.tsx`. */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Payment setup · Business · InclineYou' };

export default async function Page() {
  const business = await getBusiness();
  if (!business) return <Unavailable kind="unreachable" />;
  return <PaymentSetup initial={business} />;
}
