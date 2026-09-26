import { PlanHistory } from '@/components/portal/PlanHistory';
import { getPortalProgram, getPortalPrograms } from '@/lib/portal/api';
import { requirePortal } from '@/lib/portal/guard';
import { buildPastPlans } from '@/lib/portal/plan';

export const metadata = { title: 'Past plans · Plan · InclineYou' };

/**
 * §4 · Plan → **Past plans**.
 *
 * ── THIS TAB IS WHY THE READS ARE SPLIT ─────────────────────────────────────
 *
 * `plan-tabs.ts`'s rule 1 says each page loads only its own panel, and this is
 * the route it buys the most on: nothing else in the portal reads the program
 * history, and *Schedule* and *Workouts* both read a 28-day diary this screen
 * has no use for.
 *
 * Both reads here are `cache()`d and the layout has already made them — the
 * summaries for the count on the tab strip, the active program for the header's
 * arc — so this page adds no request at all.
 *
 * `hasActive` is the one thing the active program is read for: it tells the two
 * empty states apart. *You are on your first block* and *nothing is assigned to
 * you at all* are different facts and want different sentences, and a client in
 * the second case is already being told so on the two tabs above.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const result = await requirePortal();
  if (!result.ok) return null;
  const { me } = result;

  const [rows, program] = await Promise.all([getPortalPrograms(), getPortalProgram()]);

  return (
    <div className="body">
      <PlanHistory me={me} plans={buildPastPlans(rows)} hasActive={program !== null} />
    </div>
  );
}
