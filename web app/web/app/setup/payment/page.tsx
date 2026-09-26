import { PaymentForm } from '@/components/setup/PaymentForm';
import { SetupShell } from '@/components/setup/SetupShell';
import { requireSetup } from '@/lib/setup/guard';

export const metadata = { title: 'Getting paid · InclineYou' };

/** Frame 5e · step 8 of 8, and the end of the flow. */
export default async function Page() {
  const state = await requireSetup();
  return (
    <SetupShell current="payment" state={state}>
      <PaymentForm state={state} />
    </SetupShell>
  );
}
