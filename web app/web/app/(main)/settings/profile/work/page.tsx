import { WorkPanel } from '@/components/settings/WorkPanel';
import { getIdentity, getWorkingWeek } from '@/lib/profile/api';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Work & hours · InclineYou' };

/**
 * WORK & HOURS — the profile's sixth tab, and the only one that reads two
 * endpoints.
 *
 * Everything else under `/settings/profile` is columns on `trainer`, so one
 * `GET /v1/trainers/me` draws it. The working week is rows in `working_hours`
 * with their own route, for the reason `WorkingHoursController` gives: hanging
 * seven-to-fourteen rows off the profile response would make every profile read
 * carry them, including the six PATCHes setup performs.
 *
 * Fetched in parallel because neither depends on the other, and with
 * `Promise.all` rather than a catch per request: an empty week and a week that
 * failed to load look identical once one is swallowed, and the second one would
 * then be offered to the trainer as a suggestion to press Save on — which is how
 * a network blip would end up overwriting a real working week with a default.
 * A tab that fails to load says so.
 *
 * Both go into ONE panel with ONE Save. The two records are the page's problem,
 * not the trainer's — see the note at the top of `WorkPanel`.
 */
export default async function Page() {
  const [identity, hours] = await Promise.all([getIdentity(), getWorkingWeek()]);

  return <WorkPanel identity={identity} hours={hours} />;
}
