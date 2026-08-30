/**
 * SETTINGS' SECTIONS, AND THE ORDER THEY ARE DRAWN IN.
 *
 * Settings was an INDEX — a card of three rows, each a link to a screen with its
 * own bar, its own back link and its own header. That was the right shape while
 * there were three of them and one was tagged *Soon*. It stops being the right
 * shape the moment Settings has sections of its own: a list whose rows are all
 * one hop away is a page whose only content is a table of contents, and every
 * row costs a page load to find out it was not the one you wanted.
 *
 * So Settings is a **tab strip**, exactly like `/settings/profile` — same
 * `PageTabs`, same layout-holds-the-chrome arrangement, same one-route-per-tab
 * rule. `lib/profile/tabs.ts` carries the full argument for that pattern and it
 * is not restated here; what is worth stating is the two things that are
 * different about this strip.
 *
 * ## The profile is not one of these tabs, and that is the point
 *
 * `/settings/profile` used to be the first row of the index and is now reached
 * from the account menu instead. It is seven tabs of its own, and a tab strip
 * whose first tab opens a second tab strip is a trainer being asked to hold two
 * positions at once. The two are also about different audiences, which is the
 * cleaner line: **the profile is what a CLIENT reads before they accept an
 * invite** — the settings index said exactly that — and everything on this strip
 * is what the TRAINER reads about their own account. Nothing on Settings is ever
 * shown to anybody else.
 *
 * *Your working week* went the same way for a smaller reason: it is a section of
 * the profile's *Work & hours* tab, and a second door onto one form is a second
 * place for it to be found in a state the other door did not expect.
 *
 * ## Nothing unbuilt goes in this list
 *
 * The rule the profile's strip already states, and the index was the exception
 * that proved it: a list of what settings EXIST is useful even where one is not
 * ready, so the index could afford a row tagged *Soon*. A tab strip is
 * navigation — a tab that opens nothing is a destination that lies, and the
 * trainer pays a page load to find out.
 *
 * ## Adding the next one
 *
 * A row here, a folder under `app/(main)/settings/`, and a panel. Account is
 * the root, so `/settings` is never a redirect — the same call `identity` makes
 * one level down.
 */

export type SettingsTab = 'account' | 'nudges';

export const SETTINGS_TABS: { key: SettingsTab; label: string }[] = [
  // First because it is the only section that is about the trainer rather than
  // about their work — and because two of the three things on it (the number
  // they sign in with, and the way out) are the ones somebody arrives at
  // Settings specifically looking for.
  { key: 'account', label: 'Account' },
  { key: 'nudges', label: 'Nudge messages' },
];

/** Account is Settings' root, so `/settings` is never a redirect. */
export function settingsTabHref(tab: SettingsTab): string {
  return tab === 'account' ? '/settings' : `/settings/${tab}`;
}
