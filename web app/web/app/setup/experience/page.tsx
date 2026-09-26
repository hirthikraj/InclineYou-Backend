import { ExperienceForm } from '@/components/setup/ExperienceForm';
import { SetupShell } from '@/components/setup/SetupShell';
import { requireSetup } from '@/lib/setup/guard';

export const metadata = { title: 'Experience · InclineYou' };

/** Step 2 of 8. Not drawn as its own frame — §10 explains why. */
export default async function Page() {
  const state = await requireSetup();
  return (
    <SetupShell current="experience" state={state}>
      <ExperienceForm state={state} />
    </SetupShell>
  );
}
