'use client';

import { usePathname } from 'next/navigation';

import type { RailKey } from './nav';
import { Rail } from './Rail';
import { TabBar } from './TabBar';

/**
 * Map a pathname to the rail's current key.
 *
 * ── EVERY ROUTE HERE IS ONE THIS SHELL ACTUALLY WRAPS ────────────────────────
 *
 * The six paths the five-destination pass folded in — `/exercises`, `/money`,
 * `/money/[month]`, `/packages`, `/reports`, `/nudges` — are NOT in this list,
 * and their absence is deliberate rather than an omission. They still exist as
 * routes and they redirect, but they were moved OUT of the `(main)` group in the
 * same pass so that a redirect does not pay for the layout's `getTrainerName()`
 * round trip on its way to throwing. Nothing under them ever renders this shell,
 * so a branch for them here would be a line that can never run.
 *
 * ── AND IT REFUSES TO GUESS FOR `/sessions` ──────────────────────────────────
 *
 * Sessions is deliberately not a destination any more: it is a FLOW, launched
 * from Today or from Schedule, and the history it used to list now lives on the
 * client's timeline. There is no *Sessions* row to light, and lighting *Schedule*
 * instead would claim the console is part of a screen the trainer did not open.
 * It falls through to `today`, which is where the flow is started from most and
 * where `Finish` returns to.
 *
 * `/settings` and `/team` resolve to keys no `PRIMARY` row carries, so the rail
 * lights nothing and the bar lights *More* — the true answer on both.
 */
function currentFor(pathname: string): RailKey {
  if (pathname.startsWith('/today')) return 'today';
  if (pathname.startsWith('/clients')) return 'clients';
  if (pathname.startsWith('/schedule')) return 'sched';
  // `/programs` and `/programs/exercises` — one destination, two tabs.
  if (pathname.startsWith('/programs')) return 'prog';
  if (pathname.startsWith('/business')) return 'biz';

  // The account shelf. None is in the five, so none lights a rail row.
  // `/settings/profile` is tested BEFORE `/settings`, or the longer path falls
  // into the shorter prefix and the sheet marks *Settings* as the current page
  // while the trainer is looking at their profile.
  if (pathname.startsWith('/settings/profile')) return 'profile';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/team')) return 'team';

  // `/sessions` lands here on purpose — see above.
  return 'today';
}

/**
 * Persistent app shell — Rail, skip link, children, TabBar — in a single
 * client component so `usePathname()` can drive `current` without making every
 * page a client component. The layout fetches `trainerName` server-side once;
 * badge counts stay per-page for now (the Rail shows destinations without
 * counts rather than stale ones from a previous page).
 */
export function AppShell({
  trainerName,
  children,
}: {
  trainerName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const current = currentFor(pathname);

  return (
    <div className="app" data-theme="dark" data-glass="on">
      <Rail current={current} trainerName={trainerName} />
      <a className="skip" href="#main-content">Skip to main content</a>
      {children}
      <TabBar current={current} trainerName={trainerName} />
    </div>
  );
}
