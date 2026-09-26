import { ProgressTabs } from '@/components/portal/ProgressTabs';
import { TopBar } from '@/components/shell/TopBar';
import { requirePortal } from '@/lib/portal/guard';
import { buildLead } from '@/lib/portal/progress';
import { PageHeader } from '@/web-components/ui/PageHeader';

/**
 * §3 · Progress, the chrome — one bar, one header, one strip, four panels.
 *
 * ── THE STRIP IS IN THE LAYOUT, AND THAT IS THE WHOLE REASON THIS FILE EXISTS ─
 *
 * `components/settings/ProfileTabs.tsx` states the rule: a layout is kept
 * across a navigation between its children, so the bar, the title and the strip
 * **do not re-mount** when a client moves between tabs. `ClientFile` on the
 * trainer's half is the counter-example this deliberately does not copy — it has
 * no layout, so six routes each re-render the whole header, and `AGENTS.md`
 * records that the profile's layout "was written specifically to avoid this."
 *
 * ── THE RANGE CHIPS ARE NOT HERE, AND THAT IS THE POINT ─────────────────────
 *
 * They were, in this header's `actions`, windowing all four tabs — and three of
 * the four only ever read the range in order to window THEMSELVES, which each
 * of them turned out to be better off not doing:
 *
 *   · **Exercises** promises *every movement you have recorded*, and a window
 *     is what hides some of them. Recency is already carried honestly by the
 *     `resting` state's own 35-day staleness rule.
 *   · **History** grew its own month and session filters, which answer the
 *     question more precisely — and a range ABOVE a month picker was two
 *     controls narrowing one list, with the month having to be resolved against
 *     the range on every read.
 *   · **Measurements** is a record. A tape has a handful of readings and the
 *     point of the tab is all of them; the `baselineIsOlder` reach-back existed
 *     only to paper over a window that should not have been there.
 *
 * So the control belongs to the one tab whose headline figures genuinely change
 * with it — *what has moved in eight weeks* against *since you started* — and it
 * sits in that tab's own body, where History's filters already sit.
 *
 * ── AND THE HEADER COSTS NO FETCH ───────────────────────────────────────────
 *
 * `buildLead` was changed to take `now` rather than a consistency block for
 * exactly this: *61 weeks with Arun* is `(now − startedAt) / 7 days` and never
 * needed a session row. So this layout reads nothing beyond `requirePortal()`,
 * whose `getMe` is `cache()`d — which means the four tabs share one round trip
 * for the chrome and each page pays only for its own panel.
 *
 * ── `.main` IS HERE, `.body` IS THE PAGE'S ──────────────────────────────────
 *
 * `.main` carries `grid-area:main`; `.body` carries none. Getting that
 * backwards is the documented defect that rendered the whole `/settings`
 * subtree blank for a week — correct server HTML, a green build, and a screen
 * clipped into the top bar's 56px row. Every leaf under here returns
 * `<div className="body">` and nothing else.
 */
export const dynamic = 'force-dynamic';

export default async function ProgressLayout({ children }: { children: React.ReactNode }) {
  const result = await requirePortal();
  /* The portal's own layout one level up already drew `Unavailable`, and its
     pages return null rather than a second copy of it. */
  if (!result.ok) return null;
  const { me, now } = result;

  return (
    <>
      <TopBar crumb="Progress" />
      <main className="main" id="main-content">
        <PageHeader className="ph--portal" title="Your progress" sub={buildLead(me, now)}>
          <ProgressTabs />
        </PageHeader>
        {children}
      </main>
    </>
  );
}
