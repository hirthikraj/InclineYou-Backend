import { NameForm } from '@/components/setup/NameForm';
import { SetupShell } from '@/components/setup/SetupShell';
import { requireSetup } from '@/lib/setup/guard';

export const metadata = { title: 'Your name · X REP' };

/** Frame 5a · step 1 of 8. */
export default async function Page() {
  const state = await requireSetup();
  return (
    <SetupShell current="name" state={state}>
      <NameForm state={state} />
    </SetupShell>
  );
}
