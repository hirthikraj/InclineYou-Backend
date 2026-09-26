import { SetupShell } from '@/components/setup/SetupShell';
import { SpecialitiesForm } from '@/components/setup/SpecialitiesForm';
import { requireSetup } from '@/lib/setup/guard';

export const metadata = { title: 'Specialities · InclineYou' };

/** Frame 5b · step 3 of 8, and the cap. */
export default async function Page() {
  const state = await requireSetup();
  return (
    <SetupShell current="specialities" state={state}>
      <SpecialitiesForm state={state} />
    </SetupShell>
  );
}
