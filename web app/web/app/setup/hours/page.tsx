import { HoursForm } from '@/components/setup/HoursForm';
import { SetupShell } from '@/components/setup/SetupShell';
import { getHours } from '@/lib/setup/api';
import { requireSetup } from '@/lib/setup/guard';

export const metadata = { title: 'When you work · X REP' };

/**
 * Frame 5c · step 6 of 8.
 *
 * The stored windows are passed down rather than counted, because this is the one
 * step whose form has to show back more than the rail does: a resumed trainer
 * sees the week they saved, not the default drawn over it.
 */
export default async function Page() {
  const state = await requireSetup();
  const stored = await getHours();
  return (
    <SetupShell current="hours" state={state}>
      <HoursForm stored={stored} />
    </SetupShell>
  );
}
