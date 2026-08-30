'use client';

import { TopBar } from '@/components/shell/TopBar';

/**
 * The shell's top bar, for the `/settings` subtree.
 *
 * `TopBar` takes an `onSearch` callback, which makes it a client component's to
 * render — and every settings page is a server component. Rather than turn three
 * pages client-side to pass a function, this is the one-line boundary.
 *
 * The no-op `onSearch` is the established call here, not a shortcut: `Team.tsx`
 * and `Business.tsx` both pass `() => {}` already. The palette belongs to the
 * screens that have something to search.
 *
 * The crumb carries the hierarchy the way `ClientFile` does — *Settings / Your
 * profile* — so a nested settings screen says where it is without the rail,
 * which lights nothing under `/settings`.
 */
export function SettingsBar({ crumb }: { crumb: string }) {
  return <TopBar crumb={crumb} onSearch={() => {}} />;
}
