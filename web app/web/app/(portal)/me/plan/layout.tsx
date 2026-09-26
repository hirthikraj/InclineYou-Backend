import { PlanTabs } from '@/components/portal/PlanTabs';
import { TopBar } from '@/components/shell/TopBar';
import { getPortalProgram, getPortalPrograms } from '@/lib/portal/api';
import { requirePortal } from '@/lib/portal/guard';
import { buildPlan } from '@/lib/portal/plan';
import { PageHeader } from '@/web-components/ui/PageHeader';

/**
 * §4 · Plan, the chrome — one bar, one header, one strip, three panels.
 *
 * ── THE STRIP IS IN THE LAYOUT, AND THAT IS THE WHOLE REASON THIS FILE EXISTS ─
 *
 * `components/settings/ProfileTabs.tsx` states the rule and the Progress layout
 * repeats it: a layout is kept across a navigation between its children, so the
 * bar, the title and the strip **do not re-mount** when a client moves between
 * tabs. `ClientFile` on the trainer's half is the counter-example — no layout,
 * six routes, and the header re-rendered on every one of them.
 *
 * ── THE SUBTITLE IS THE ARC, AND IT IS SAID HERE AND NOWHERE ELSE ───────────
 *
 * The old page's header read `${n} sessions booked · Week 5 of 8 · Strength`
 * and the arc card directly beneath it was headed `Week 5 of 8 · Strength` —
 * the same string about 60px apart. That is `.ph--today`'s own rule broken
 * (*"the most expensive 60px on the page"*), and `AGENTS.md` records fixing it
 * on Home and then again on Progress. **Plan was the third instance.**
 *
 * The fix is structural rather than a deletion of one of the two. The arc is a
 * frame for all three tabs — it qualifies the diary, the days and the history
 * alike — so it belongs to the header, once. The session count went to the
 * *Coming up* card, which is the thing that has the sessions in it. And the
 * *Workouts* tab's own head carries the program's NAME, which the subtitle does
 * not say.
 *
 * ── THE TWO READS THIS HEADER PAYS FOR, AND WHY ─────────────────────────────
 *
 * The Progress layout reads nothing beyond `requirePortal()` and says so. This
 * one reads two things, and both are deliberate:
 *
 *   · **`getPortalProgram()`** for the arc. `cache()`d, and the *Schedule* and
 *     *Workouts* tabs both need it anyway, so on two of three routes it is free.
 *   · **`getPortalPrograms()`** for the count on the *Past plans* tab. Also
 *     `cache()`d, so that tab pays nothing for it.
 *
 * The count is worth one scoped read of a two-or-three-row summary list because
 * it is the one thing on this strip a client cannot guess. They know whether
 * they have a plan and whether they have sessions booked; they do not know
 * whether this product kept the block they finished in March. `PageTabs` omits
 * a zero rather than drawing one, which is what makes the badge honest — a
 * figure there means there is something behind it.
 *
 * The stated cost: *Schedule* and *Workouts* each carry one request they do not
 * themselves use.
 *
 * ── `.main` IS HERE, `.body` IS THE PAGE'S ──────────────────────────────────
 *
 * `.main` carries `grid-area:main`; `.body` carries none. Getting that backwards
 * is the documented defect that rendered the whole `/settings` subtree blank for
 * a week — correct server HTML, a green build, and a screen clipped into the top
 * bar's 46px row. Every leaf under here returns `<div className="body">` and
 * nothing else.
 */
export const dynamic = 'force-dynamic';

export default async function PlanLayout({ children }: { children: React.ReactNode }) {
  const result = await requirePortal();
  /* The portal's own layout one level up already drew `Unavailable`, and its
     pages return null rather than a second copy of it. */
  if (!result.ok) return null;
  const { me, now } = result;

  const [program, past] = await Promise.all([getPortalProgram(), getPortalPrograms()]);

  /* Only the arc is wanted here, and `buildPlan` is the one place it is
     derived — deriving it a second time in this file is how a header and a card
     end up disagreeing about which week it is. The sessions argument is empty
     because nothing in the arc reads the diary. */
  const { arc } = buildPlan(me, [], program, now);

  return (
    <>
      <TopBar crumb="Plan" />
      <main className="main" id="main-content">
        <PageHeader
          className="ph--portal"
          title="Your plan"
          /* Undefined where the trainer has assigned nothing — the *Schedule*
             tab draws that state as a card, and a header apologising for it as
             well would say it twice on the screen whose whole defect was saying
             things twice. */
          sub={arc ?? undefined}
        >
          <PlanTabs pastCount={past.length} />
        </PageHeader>
        {children}
      </main>
    </>
  );
}
