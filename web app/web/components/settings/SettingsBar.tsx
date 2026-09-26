'use client';

import { TopBar } from '@/components/shell/TopBar';

/**
 * The shell's top bar, for the `/settings` subtree.
 *
 * `TopBar` is a client component, and every settings page is a server one.
 * Rather than turn three pages client-side, this is the one-line boundary.
 *
 * It used to pass a no-op `onSearch`, and the comment here defended that by
 * pointing at `Team.tsx` and `Business.tsx` doing the same — which was true, and
 * was the bug rather than the precedent: three screens agreeing to draw a search
 * box that does nothing is three broken screens. The palette is the shell's now
 * and `onSearch` is optional, so settings gets a working one by saying nothing.
 *
 * The crumb carries the hierarchy the way `ClientFile` does — *Settings / Your
 * profile* — so a nested settings screen says where it is without the rail,
 * which lights nothing under `/settings`.
 */
export function SettingsBar({ crumb }: { crumb: string }) {
  return <TopBar crumb={crumb} />;
}
