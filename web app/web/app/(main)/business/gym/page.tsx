import { GymPage } from '@/components/business/GymPage';
import { Unavailable } from '@/components/today/Unavailable';
import { requireGym } from '@/lib/business/guard';

/**
 * `/business/gym` — the split on the gym's money, and what the gym owes.
 *
 * Reached from the section's pane only when the trainer has a gym on the profile
 * (`components/shell/NavFlags.tsx`); the route itself answers to anyone, so a
 * bookmark after leaving a gym lands on an empty state that says what to do rather
 * than a 404. See `components/business/GymPage.tsx`.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Gym share · Business · InclineYou' };

export default async function Page() {
  const result = await requireGym();

  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }

  return <GymPage start={{ now: result.now, gym: result.gym }} />;
}
