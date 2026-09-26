
import { ProfileAside } from '@/components/settings/ProfileAside';
import { ProfileDraftProvider } from '@/components/settings/ProfileDraft';
import { ProfileTabs } from '@/components/settings/ProfileTabs';
import { SettingsBar } from '@/components/settings/SettingsBar';
import { Chevron } from '@/components/shell/Icons';
import { getIdentity } from '@/lib/profile/api';
import { Button } from '@/web-components/ui/Button';
import { Sidecar } from '@/web-components/ui/Sidecar';

export const dynamic = 'force-dynamic';

/**
 * The chrome every profile tab shares — the bar, the back link, the title, the
 * strip, **the scroller and the preview beside it**.
 *
 * It is a LAYOUT rather than a component every page calls, so the header and
 * the tab strip are not re-mounted when the tab changes: React keeps a layout
 * across a navigation between its children, so the strip does not flash and a
 * keyboard user does not lose their place in it.
 *
 * ── THE PREVIEW IS THE LAYOUT'S NOW, AND SO IS `.body` ──────────────────────
 *
 * Two changes, and the second follows from the first.
 *
 * The card *How clients see you* used to live inside the identity form, which
 * put it inside ONE of the seven tabs — the six that also feed it could not
 * see it, and on the tab that could it was the first thing to scroll away.
 * MEASURED at 1536×695 before the move: a 560px column of fields in a 1409px
 * content area (849px of empty canvas), 1046px of content in a 510px window,
 * and the card gone by the time the bio was being typed. It is a layout
 * concern — it is about the profile, not about any tab of it — so it is drawn
 * here, fed by `ProfileDraftProvider`, and sticky.
 *
 * Which means `.body` has to be here too. It is the scrollport, and a sticky
 * aside cannot stick inside a scroller that a sibling page owns: each of the
 * seven pages used to render its own `<div className="body">`, so the sidecar
 * would have been seven sidecars, each only as tall as its own tab. The pages
 * render their panel and nothing else now.
 *
 * `.main` owns `grid-area:main` and `.body` owns none, which is why this is
 * `.main` wrapping a `.body` — the settings index carries the whole story of
 * what happens when that is the other way round.
 *
 * ── AND IT READS THE PROFILE, WHICH THE PAGE ALSO READS ─────────────────────
 *
 * One request, not two: `getIdentity` is `cache()`d, so the layout and the page
 * under it share the same `/v1/trainers/me` within one render. That is the
 * whole reason the memo was added — before it, putting the card up here would
 * have doubled every profile page's wire cost to draw something the page had
 * already fetched.
 */
export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const identity = await getIdentity();

  return (
    <>
      <SettingsBar crumb="Settings / Your profile" />

      <main className="main" id="main-content">
        <div className="ph ph--named">
          <div style={{ marginBottom: 10 }}>
            <Button
              href="/settings"
              variant="ghost"
              size="sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
                <Chevron size={14} />
              </span>
              Settings
            </Button>
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

        <ProfileDraftProvider initial={identity}>
          <div className="body">
            <Sidecar aside={<ProfileAside />} asideLabel="How clients see you">
              {children}
            </Sidecar>
          </div>
        </ProfileDraftProvider>
      </main>
    </>
  );
}
