import { SettingsBar } from '@/components/settings/SettingsBar';
import { SettingsTabs } from '@/components/settings/SettingsTabs';

/**
 * The chrome every settings section shares — the bar, the title and the strip.
 * Each page under here supplies only its own `.body`.
 *
 * It is a LAYOUT rather than a component every page calls, so the header and the
 * strip are not re-mounted when the tab changes: React keeps a layout across a
 * navigation between its children, so the strip does not flash and a keyboard
 * user does not lose their place in it. `settings/profile/layout.tsx` makes the
 * same call one level down.
 *
 * ── WHY THIS IS IN A ROUTE GROUP ─────────────────────────────────────────────
 *
 * `app/(main)/settings/layout.tsx` would have been the obvious place and is the
 * wrong one: it wraps EVERYTHING under `/settings`, including
 * `/settings/profile`, which has seven tabs and a layout of its own. A trainer
 * on the profile would have got two top bars, two headings and two tab strips,
 * the second of which would be marking *Account* as the current page.
 *
 * `(sections)` costs nothing in the URL — `/settings` and `/settings/nudges` are
 * unchanged — and draws the line exactly where the strip's own vocabulary draws
 * it: what is in `lib/settings/tabs.ts` is in here, and the profile and the
 * `/settings/hours` redirect are outside it. A redirect that paid for this
 * layout on its way to throwing is the same waste `AppShell` moved six other
 * redirects out of `(main)` to avoid.
 *
 * ── AND THERE IS NO BACK LINK ────────────────────────────────────────────────
 *
 * Both pages under here used to draw one, up to `/settings` — correct when
 * `/settings` was an index above them and wrong now that it IS the first tab.
 * A back link pointing at the strip the trainer is already looking at is a
 * control that does nothing and reads as though it should.
 *
 * `.main` owns `grid-area:main` and `.body` owns none, which is why the panels
 * below are `.body` and this is `.main` — the settings index carried the whole
 * story of what happens when that is the other way round, and it is worth
 * keeping in mind here because that bug was invisible to the build, the type
 * checker and the linter alike.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsBar crumb="Settings" />

      <main className="main" id="main-content">
        <div className="ph">
          <div className="ph__row">
            <div className="ph__id">
              <h1 className="ph__t">Settings</h1>
              <p className="ph__sub">Your account, and the words InclineYou sends in your name.</p>
            </div>
          </div>

          <SettingsTabs />
        </div>

        {children}
      </main>
    </>
  );
}
