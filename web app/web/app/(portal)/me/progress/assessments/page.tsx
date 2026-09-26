import { ProgressAssessments } from '@/components/portal/ProgressAssessments';
import { getPortalCheckIns, getPortalMetrics } from '@/lib/portal/api';
import { requirePortal } from '@/lib/portal/guard';
import { buildMeasureSeries } from '@/lib/portal/progress';

export const metadata = { title: 'Assessments · Progress · InclineYou' };

/**
 * §3 · Progress → **Assessments** — the check-ins and the tape, which used to
 * be two tabs.
 *
 * ── TWO READS, AND THEY ARE THE TWO CHEAPEST IN THE PORTAL ──────────────────
 *
 * `getPortalCheckIns` and `getPortalMetrics`, and nothing else: no sets, no
 * workouts, no sessions, no program. That is the tab split paying off in the
 * direction opposite to Exercises — a client who opens this to check their
 * waist pays for a list of six check-ins and a handful of readings, where
 * before the split every visit to Progress read four hundred set rows and every
 * workout they had ever logged.
 *
 * The check-ins read strips the readings and the answers off every row
 * (`checkInView` in `mock/portal.ts` says why: a page of check-ins carrying
 * fifteen tape readings and eleven answers each is six hundred values to draw a
 * list that shows two of them), so what a client actually said is fetched one
 * check-in at a time, by `/me/checkin/:id`.
 *
 * ── AND NO WINDOW ON EITHER, WHICH IS WHY THE CHIPS ARE NOT HERE ────────────
 *
 * **A tape is a record.** A trainer takes it every few weeks, so an eight-week
 * window routinely held ONE reading — which is why `buildMeasureSeries` once
 * grew a reach-back to the last reading before the window, and why the card had
 * to print *which is older than the last 8 weeks* to stay honest about the
 * dates under it. All of that was a window papering over itself.
 *
 * **And a check-in list is a record too.** *What did I tell them in July* is the
 * question this tab exists to answer, and a range chip is the control that
 * hides July. The range belongs to Summary, whose headline figures genuinely
 * change with it.
 *
 * ── THE OPEN CHECK-INS ARE DRAWN HERE AND ON HOME, AND THAT IS NOT DOUBLING ─
 *
 * `lib/notifications/types.ts` warns about a VERB with two homes — a row that
 * has to be cleared from two surfaces. There is no verb here: both screens link
 * to the same form, the form is the only thing that changes a check-in, and a
 * list of *everything, including what is still open* is what somebody arriving
 * at a tab called Assessments has come for. A list that silently omitted the one
 * due on Friday would be the more surprising of the two.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const result = await requirePortal();
  /* The layout above has already drawn `Unavailable` for a failure, and its
     pages return null rather than a second copy of it. */
  if (!result.ok) return null;
  const { me, now } = result;

  const [checkIns, metrics] = await Promise.all([getPortalCheckIns(), getPortalMetrics()]);

  /* `hideWeight` is applied in the BUILDER rather than filtered here, because
     the flag is a fact about the series the tab draws and every caller of
     `buildMeasureSeries` has to honour it the same way. */
  const series = buildMeasureSeries(metrics, me.prefs.hideWeight);

  return (
    <div className="body">
      <ProgressAssessments
        me={me}
        checkIns={checkIns}
        series={series}
        hideWeight={me.prefs.hideWeight}
        /* The SERVER's instant, threaded down for `dueClause` — trap 20. */
        now={now}
      />
    </div>
  );
}
