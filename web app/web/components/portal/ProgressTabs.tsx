'use client';

import { usePathname } from 'next/navigation';

import { PROGRESS_TABS, progressTabHref, type ProgressTab } from '@/lib/portal/progress-tabs';
import { PageTabs } from '@/components/shell/PageTabs';

/**
 * The strip, in the layout — so it does not remount when a tab changes.
 *
 * It is a client component for exactly one reason, and it is the one
 * `ProfileTabs` and `SettingsTabs` both state: **a server layout cannot read
 * the pathname.** Next hands it to the page, not to the layout above it. So the
 * layout stays a server component and delegates the one thing that needs the
 * URL — which tab is current — to this.
 *
 * ── THE ROOT TAB IS FILTERED OUT OF THE SEARCH ──────────────────────────────
 *
 * `/me/progress/exercises` starts with `/me/progress`, so a plain
 * `find(startsWith)` over all four lights *Summary* on every tab. The root is
 * the `??` fallback instead, which is the ordering bug `AppShell.currentFor`
 * documents and both settings strips already avoid.
 *
 * ── AND `push`, NOT `replace` ───────────────────────────────────────────────
 *
 * `PageTabs`' own note draws the line: `replace` is for a strip selecting a view
 * of data the browser already holds — the money book's six, where six history
 * entries per visit makes the back button take six presses. **These four are
 * four different fetches** (only Exercises reads every set ever logged; only
 * History reads every workout), so each is a real place and belongs in history.
 */
export function ProgressTabs() {
  const pathname = usePathname();

  const current: ProgressTab =
    PROGRESS_TABS.filter((t) => t.key !== 'summary').find((t) =>
      pathname.startsWith(progressTabHref(t.key)),
    )?.key ?? 'summary';

  return (
    <PageTabs
      tabs={PROGRESS_TABS.map((t) => ({
        key: t.key,
        label: t.label,
        href: progressTabHref(t.key),
      }))}
      current={current}
      label="Your progress"
    />
  );
}
