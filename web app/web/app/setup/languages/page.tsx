import { LanguagesForm } from '@/components/setup/LanguagesForm';
import { SetupShell } from '@/components/setup/SetupShell';
import { requireSetup } from '@/lib/setup/guard';

export const metadata = { title: 'Languages · InclineYou' };

/** Step 5 of 8 — the one field no competitor asks for. Skippable, like all but step 1. */
export default async function Page() {
  const state = await requireSetup();
  return (
    <SetupShell current="languages" state={state}>
      <LanguagesForm state={state} />
    </SetupShell>
  );
}
