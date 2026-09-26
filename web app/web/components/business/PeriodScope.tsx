'use client';

import { createContext, useContext, useState } from 'react';

import { currentMonth, type Period } from '@/lib/money/period';

/**
 * THE PERIOD, HELD ABOVE THE SIX PAGES SO IT SURVIVES MOVING BETWEEN THEM.
 *
 * ── WHAT BROKE WHEN THE TABS BECAME ROUTES ───────────────────────────────────
 *
 * Business used to be one screen with seven tabs, and the period was `useState`
 * in the one component that drew all of them. `Business.tsx` said so: *"the
 * period survives a tab change because a tab change is a soft navigation — this
 * component keeps its place in the tree, and React keeps its state."*
 *
 * That sentence stopped being true the moment the tabs became six pages in the
 * section pane. Each page is its own route with its own component, so the state
 * unmounts on every move: a trainer who set *last 3 months* on the Overview and
 * clicked through to Transactions would land on the current month, with the
 * picker saying so and nothing to tell them why it had changed.
 *
 * The fix is the one the routing already offers. `app/(main)/business/layout.tsx`
 * does not re-render when the segment under it changes, so state held in a client
 * component INSIDE that layout outlives every navigation between the six — and
 * only those six. Leaving Business unmounts the layout and the period goes with
 * it, which is the same "a span is a lens, not a setting" the old screen had.
 *
 * ── WHY A CONTEXT AND NOT A SEARCH PARAM ─────────────────────────────────────
 *
 * `?period=` would survive a reload and would make the span linkable, and both
 * were considered and refused for the reason `lib/money/period.ts` gives about
 * the month: the period changes NOTHING the server fetches. `getMoney()` pulls
 * the book unwindowed and every `compute*` slices it in the browser. A param
 * that costs a navigation on every glance at a different month, to filter a
 * payload the browser already has, is the arrangement the month was taken out of
 * the path to escape. Putting it back in the query would be the same mistake in
 * a cheaper suit.
 */
interface PeriodScopeValue {
  period: Period;
  setPeriod: (p: Period) => void;
  /** The server's clock, threaded down so the picker and the pages agree. */
  now: number;
}

const Ctx = createContext<PeriodScopeValue | null>(null);

export function PeriodScope({
  now,
  children,
}: {
  /**
   * `Date.now()` read in the layout, on the server.
   *
   * Passed as a prop rather than read here so the first client render agrees
   * with the HTML it hydrates — `Business.tsx` made the same call with
   * `data.now` and for the same reason. It is a different clock from
   * `MoneyData.now` by a few milliseconds, which matters to nothing: this one
   * only ever decides which month is "current" and which years the picker
   * offers.
   */
  now: number;
  children: React.ReactNode;
}) {
  const [period, setPeriod] = useState<Period>(() => currentMonth(now));
  return <Ctx.Provider value={{ period, setPeriod, now }}>{children}</Ctx.Provider>;
}

/**
 * Throws rather than falling back to the current month.
 *
 * A page that reads the period outside the scope would silently get its own
 * private copy and stop moving with the picker — which is exactly the bug this
 * file exists to prevent, and a default value would hide it until somebody
 * noticed the numbers had stopped changing.
 */
export function usePeriodScope(): PeriodScopeValue {
  const v = useContext(Ctx);
  if (v === null) throw new Error('usePeriodScope outside <PeriodScope>');
  return v;
}
