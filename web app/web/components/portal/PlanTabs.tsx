'use client';

import { usePathname } from 'next/navigation';

import { PLAN_TABS, planTabHref, type PlanTab } from '@/lib/portal/plan-tabs';
import { PageTabs } from '@/components/shell/PageTabs';

/**
 * The strip, in the layout — so it does not remount when a tab changes.
 *
 * `ProgressTabs` is the template and both of its rules apply unchanged: it is a
 * client component for the one reason a server layout cannot be (**Next hands
 * the pathname to the page, not to the layout above it**), and **the root tab is
 * filtered out of the `startsWith` search** — `/me/plan/workouts` starts with
 * `/me/plan`, so a plain `find` over all three lights *Schedule* on every tab.
 * The root is the `??` fallback instead.
 *
 * `push`, not `replace`: three different fetches, so each is a real place.
 *
 * ── THE COUNT IS ON ONE TAB, AND ONLY WHEN IT IS NOT ZERO ───────────────────
 *
 * *Past plans* carries how many there are, because it is the one tab whose
 * emptiness a client cannot guess — they know whether they have a plan and
 * whether they have sessions booked, and they do not know whether this product
 * kept the block they finished in March. `PageTabs` omits a zero rather than
 * drawing one, which is what makes the badge worth having: a figure there means
 * there is something behind it.
 */
export function PlanTabs({ pastCount }: { pastCount: number }) {
  const pathname = usePathname();

  const current: PlanTab =
    PLAN_TABS.filter((t) => t.key !== 'schedule').find((t) =>
      pathname.startsWith(planTabHref(t.key)),
    )?.key ?? 'schedule';

  return (
    <PageTabs
      tabs={PLAN_TABS.map((t) => ({
        key: t.key,
        label: t.label,
        href: planTabHref(t.key),
        count: t.key === 'history' ? pastCount : null,
      }))}
      current={current}
      label="Your plan"
    />
  );
}
