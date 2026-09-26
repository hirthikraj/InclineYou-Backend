import { Home } from '@/components/portal/Home';
import { TopBar } from '@/components/shell/TopBar';
import {
  PORTAL_LOOKAHEAD_DAYS,
  PORTAL_LOOKBACK_DAYS,
  getPortalCheckIns,
  getPortalMessages,
  getPortalMetrics,
  getPortalMilestones,
  getPortalPackages,
  getPortalProgram,
  getPortalSessions,
  getPortalWorkouts,
} from '@/lib/portal/api';
import { buildGlance, buildHero, buildNext, buildPack, buildWeek } from '@/lib/portal/home';
import { CONSISTENCY_DAYS, buildConsistency } from '@/lib/portal/progress';
import { requirePortal } from '@/lib/portal/guard';
import { DAY_MS, dayLong, startOfDay } from '@/lib/today/time';
import { PageHeader } from '@/web-components/ui/PageHeader';

export const metadata = { title: 'Today · InclineYou' };

/**
 * §1 · Home, at `/me/today`.
 *
 * ── THE ROUTE IS `/me/today` AND THE TAB SAYS *HOME* ────────────────────────
 *
 * Deliberately, and it is the one place the spec and this codebase are kept
 * apart on purpose. `destinationFor` in `lib/auth/session.ts` has sent every
 * client token to `/me/today` since sign-in was built, `app/page.tsx` forks
 * there on the role, and `/sign-in/role` redirects there for a single roster.
 * Renaming the route to `/me` would have touched all three for a label — and
 * `nav.tsx`'s `CLIENT_PRIMARY` carries the client's own word for it, which is
 * *Home*.
 *
 * ── SEVEN REQUESTS, AND THE WINDOW IS WHY THERE ARE NOT SIX ─────────────────
 *
 * Sessions are read across a window that reaches BACKWARDS as well as
 * forwards, which the hero does not need and `buildWeek` does: a Sunday's *3 of
 * 4 this week* has to see Monday, and §1's rest-day copy has to know whether a
 * session was missed in the last few days. So one windowed read serves the hero,
 * the week, the *Coming up* row AND the attendance figure, rather than four
 * reads for four questions about one table — which is what the window was
 * chosen for and why `PORTAL_LOOKBACK_DAYS` is `CONSISTENCY_DAYS` exactly.
 *
 * ── AND THE TWO THAT ARRIVED WITH THE FOOT'S FIGURES ────────────────────────
 *
 * `getPortalWorkouts` and `getPortalMilestones` are the sixth and seventh, and
 * they are both one narrow table. They are in the same `Promise.all` as the
 * other five, so the page costs one round trip's latency rather than seven —
 * which is the whole of §1's *"opens to the workout in under two seconds"*.
 *
 * `getPortalSets` is deliberately NOT here, and it is the read that would have
 * been the obvious eighth: it is unwindowed by design (a personal best is a
 * claim about the whole history) and it is the largest response in this half.
 * Progress pays for it because Progress is what it is for; a figure on Home
 * worth that is a figure that belongs on Progress.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const result = await requirePortal();
  /* The layout has already rendered `Unavailable` for a failure, so this branch
     is unreachable in practice — and it is here rather than a `!` because the
     alternative is an assertion that would crash the page instead of the
     layout catching it. */
  if (!result.ok) return null;

  const { me, now } = result;
  const today = startOfDay(now);

  const [sessions, program, packages, messages, metrics, workouts, milestones, checkIns] =
    await Promise.all([
      getPortalSessions(
        today - PORTAL_LOOKBACK_DAYS * DAY_MS,
        today + PORTAL_LOOKAHEAD_DAYS * DAY_MS,
      ),
      getPortalProgram(),
      getPortalPackages(),
      getPortalMessages(),
      getPortalMetrics(),
      getPortalWorkouts(),
      getPortalMilestones(),
      /* The eighth, and it is one narrow table — the list read strips the
         readings and the answers off every row, so this is eight fields a
         check-in rather than the twenty-six objects the flow's own read
         carries. In the same `Promise.all` as the other seven, so the page
         still costs one round trip's latency rather than eight. */
      getPortalCheckIns(),
    ]);

  const weights = metrics
    .filter((m) => m.metricType === 'weight')
    .sort((a, b) => a.recordedAt - b.recordedAt);
  const lastWeight = weights[weights.length - 1] ?? null;
  const todaysWeight = weights.find((m) => startOfDay(m.recordedAt) === today) ?? null;

  const pack = buildPack(packages, now);
  /* The same function Progress calls, over the same window, so the two screens
     cannot disagree about how often this client turned up — the rule
     `AGENTS.md` states for `computeLedger` against `computeTrend`, where two
     right readings of one table produce totals that will not agree. */
  const consistency = buildConsistency(sessions, me.client.startedAt, now);

  const data = {
    hero: buildHero(me, sessions, program, now, workouts),
    week: buildWeek(sessions, me.client.sessionsPerWeek, now),
    pack,
    next: buildNext(sessions, now),
    glance: buildGlance({
      attended: consistency.attended,
      offered: consistency.offered,
      workouts,
      sessionsLeft: pack.sessionsLeft,
      windowDays: CONSISTENCY_DAYS,
    }),
    /* The newest one, and exactly one — see `PortalHomeData.milestone`. The
       list arrives newest-first from `mock/seed.ts`'s own sort, and Progress
       reads the same order, so `[0]` is the same row on both screens. */
    milestone: milestones[0] ?? null,
    /* The newest one, read or not. Home draws exactly one — §1 asks for *a*
       message, and the history is on Me. An unread one is what the `New` tag is
       for; showing the last three would make the tag meaningless. */
    message: messages[0] ?? null,
    /* SENT AND NOT YET SENT BACK, soonest first — the wire hands them over
       newest-first, which is right for a list somebody is reading and wrong for
       a list of things to do: the one with the nearest date is the one to open.
       A returned check-in is dropped here rather than at the read, because the
       read is the one a history screen will want whole. */
    checkIns: checkIns
      .filter((c) => c.completedAt === null)
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)),
    weightToday: todaysWeight?.value ?? null,
    weightLast: lastWeight ? { value: lastWeight.value, at: lastWeight.recordedAt } : null,
  };

  const first = me.client.name.split(' ')[0];

  return (
    <>
      {/* No `onSearch`, and the bar drops the box on its own: `usePaletteOpener`
          is undefined outside `PaletteHost`, which the portal does not mount.
          `TopBar`'s own rule — a control that cannot do its job should not be on
          the screen. The bell goes the same way, and the workspace switcher. */}
      <TopBar crumb="Home" />
      <main className="main" id="main-content">
        {/* `.ph` INSIDE `.main`, and `.body` inside that. `AGENTS.md` records
            the whole `/settings` subtree rendering blank for a week because
            three pages opened with `<main className="body">` — `.body` has no
            grid area, so it auto-placed into the top row and was clipped. */}
        {/* ── THE SUBTITLE WAS THE HERO'S OWN KICKER, VERBATIM ───────────────

            It read `hero.kicker === 'Today' ? hero.headline : hero.kicker`,
            which on the commonest state printed *Today with Arun* sixty pixels
            above a card whose first line is *TODAY WITH ARUN* — and on the
            others printed *Rest day* or *Upper A* directly above the same
            string at 62px. `AGENTS.md`'s `.ph--today` rule is written about
            exactly this ("the date is said twice … the most expensive 60px on
            the page") and this header was making the mistake with the hero's
            own text rather than with the crumb's.

            The date is the fact that is nowhere else on this screen. The
            trainer's Today makes it the `<h1>`; here the `<h1>` is the greeting
            §1 asks for, so it goes in the slot the duplicate vacated — and it
            is NOT stood down on a phone the way `/today`'s is, because nothing
            here repeats it: the crumb says *Home* and the hero says the time.  */}
        <PageHeader className="ph--portal" title={`Hello, ${first}`} sub={dayLong(now)} />
        <div className="body">
          <Home me={me} data={data} now={now} />
        </div>
      </main>
    </>
  );
}
