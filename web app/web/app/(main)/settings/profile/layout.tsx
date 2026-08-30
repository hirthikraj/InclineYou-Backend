import Link from 'next/link';

import { ProfileTabs } from '@/components/settings/ProfileTabs';
import { SettingsBar } from '@/components/settings/SettingsBar';
import { Chevron } from '@/components/shell/Icons';

/**
 * The chrome every profile tab shares — the bar, the back link, the title and
 * the strip. Each page under here supplies only its own `.body`.
 *
 * It is a LAYOUT rather than a component every page calls, so the header and
 * the tab strip are not re-mounted when the tab changes: React keeps a layout
 * across a navigation between its children, so the strip does not flash and a
 * keyboard user does not lose their place in it.
 *
 * `.main` owns `grid-area:main` and `.body` owns none, which is why the panels
 * below are `.body` and this is `.main` — the settings index carries the whole
 * story of what happens when that is the other way round.
 */
export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsBar crumb="Settings / Your profile" />

      <main className="main" id="main-content">
        <div className="ph">
          <div style={{ marginBottom: 10 }}>
            <Link
              href="/settings"
              className="btn btn--ghost btn--sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
                <Chevron size={14} />
              </span>
              Settings
            </Link>
          </div>

          <div className="ph__row">
            <div className="ph__id">
              <h1 className="ph__t">Your profile</h1>
              <p className="ph__sub">
                Who a client sees when you invite them — and before they accept.
              </p>
            </div>
          </div>

          <ProfileTabs />
        </div>

        {children}
      </main>
    </>
  );
}
