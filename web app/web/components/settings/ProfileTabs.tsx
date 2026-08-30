'use client';

import { usePathname } from 'next/navigation';

import { PageTabs } from '@/components/shell/PageTabs';
import { PROFILE_TABS, profileTabHref, type ProfileTab } from '@/lib/profile/tabs';

/**
 * The profile's tab strip.
 *
 * A client component for one reason: it lives in `layout.tsx`, and a server
 * layout cannot read the pathname — Next gives it to the page, not to the
 * layout above it. Reading it here keeps the strip in the layout, which is what
 * stops it re-mounting on every tab change and taking its own focus with it.
 *
 * The longest matching prefix wins, and the order of the test matters for the
 * same reason it does in `AppShell.currentFor`: `/settings/profile/
 * certifications` starts with `/settings/profile`, so a shorter-first check
 * would light *Identity* on every tab.
 */
export function ProfileTabs() {
  const pathname = usePathname();

  const current: ProfileTab =
    PROFILE_TABS.filter((t) => t.key !== 'identity').find((t) =>
      pathname.startsWith(profileTabHref(t.key)),
    )?.key ?? 'identity';

  return (
    <PageTabs
      tabs={PROFILE_TABS.map((t) => ({ ...t, href: profileTabHref(t.key) }))}
      current={current}
      label="Your profile"
    />
  );
}
