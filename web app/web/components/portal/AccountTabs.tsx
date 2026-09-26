'use client';

import { usePathname } from 'next/navigation';

import { ACCOUNT_TABS, accountTabHref, type AccountTab } from '@/lib/portal/account-tabs';
import { PageTabs } from '@/components/shell/PageTabs';

/**
 * The strip, in the layout — so it does not remount when a tab changes.
 *
 * `PlanTabs` is the template and both of its rules apply unchanged: it is a
 * client component for the one reason a server layout cannot be (**Next hands
 * the pathname to the page, not to the layout above it**), and **the root tab is
 * filtered out of the `startsWith` search** — `/me/account/settings` starts with
 * `/me/account`, so a plain `find` over all three lights *Me* on every tab. The
 * root is the `??` fallback instead.
 *
 * `push`, not `replace`: three different fetches, so each is a real place.
 *
 * ── NO COUNT ON ANY OF THE THREE ────────────────────────────────────────────
 *
 * `PlanTabs` badges *Past plans*, on the argument that it is the one tab whose
 * emptiness a client cannot guess. Nothing here is in that position: a client
 * knows they have a trainer, they know they have settings, and a figure on
 * *Privacy* would be a count of their own rights, which is not a quantity
 * anybody reads. `PageTabs` omits a zero rather than drawing one, so passing
 * `null` is what makes the badge worth having on the tab that does use it.
 */
export function AccountTabs() {
  const pathname = usePathname();

  const current: AccountTab =
    ACCOUNT_TABS.filter((t) => t.key !== 'me').find((t) =>
      pathname.startsWith(accountTabHref(t.key)),
    )?.key ?? 'me';

  return (
    <PageTabs
      tabs={ACCOUNT_TABS.map((t) => ({
        key: t.key,
        label: t.label,
        href: accountTabHref(t.key),
        count: null,
      }))}
      current={current}
      label="Your account"
    />
  );
}
