'use client';

import { usePathname } from 'next/navigation';

import { PageTabs } from '@/components/shell/PageTabs';
import { SETTINGS_TABS, settingsTabHref, type SettingsTab } from '@/lib/settings/tabs';

/**
 * Settings' tab strip.
 *
 * A client component for one reason, the same one `ProfileTabs` gives: it lives
 * in `layout.tsx`, and a server layout cannot read the pathname — Next gives it
 * to the page, not to the layout above it. Reading it here keeps the strip in
 * the layout, which is what stops it re-mounting on every tab change and taking
 * a keyboard user's place in it with them.
 *
 * The longest matching prefix wins, and the order of the test matters for the
 * reason `AppShell.currentFor` documents: `/settings/nudges` starts with
 * `/settings`, so a shorter-first check would light *Account* on every tab.
 */
export function SettingsTabs() {
  const pathname = usePathname();

  const current: SettingsTab =
    SETTINGS_TABS.filter((t) => t.key !== 'account').find((t) =>
      pathname.startsWith(settingsTabHref(t.key)),
    )?.key ?? 'account';

  return (
    <PageTabs
      tabs={SETTINGS_TABS.map((t) => ({ ...t, href: settingsTabHref(t.key) }))}
      current={current}
      label="Settings"
    />
  );
}
