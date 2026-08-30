import { PacksForm } from '@/components/setup/PacksForm';
import { SetupShell } from '@/components/setup/SetupShell';
import { getPacks } from '@/lib/setup/api';
import { requireSetup } from '@/lib/setup/guard';

export const metadata = { title: 'What you sell · X REP' };

/** Frame 5d · step 7 of 8 — the price before the pipe. */
export default async function Page() {
  const state = await requireSetup();
  const packs = await getPacks();
  return (
    <SetupShell current="packs" state={state}>
      <PacksForm state={state} packs={packs} />
    </SetupShell>
  );
}
