'use client';

import { useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';

import { markAllRead, markRead } from '@/lib/notifications/actions';
import type { Notification } from '@/lib/notifications/types';
import type { Workspace } from '@/lib/workspace/types';

import { sectionFor, type RailKey } from './nav';
import { NotificationsHost } from './NotificationsHost';
import { TRAINER_EMPTY, trainerViews } from './notificationViews';
import { PaletteHost } from './PaletteHost';
import { Rail } from './Rail';
import { SectionPane } from './SectionPane';
import { usePaneCollapsed, usePaneCollapseShortcut } from './paneCollapse';
import { usePanePreview } from './panePreview';
import { TabBar } from './TabBar';
import { ToastHost } from './ToastHost';
import { WorkspaceHost } from './WorkspaceHost';

/**
 * Map a pathname to the rail's current key.
 *
 * ── EVERY ROUTE HERE IS ONE THIS SHELL ACTUALLY WRAPS ────────────────────────
 *
 * The six paths the five-destination pass folded in — `/exercises`, `/money`,
 * `/money/[month]`, `/packages`, `/reports`, `/nudges` — are NOT in this list,
 * and their absence is deliberate rather than an omission. They still exist as
 * routes and they redirect, but they were moved OUT of the `(main)` group in the
 * same pass so that a redirect does not pay for the layout's `getTrainerName()`
 * round trip on its way to throwing. Nothing under them ever renders this shell,
 * so a branch for them here would be a line that can never run.
 *
 * ── AND IT REFUSES TO GUESS FOR `/sessions` ──────────────────────────────────
 *
 * Sessions is deliberately not a destination any more: it is a FLOW, launched
 * from Today or from Schedule, and the history it used to list now lives on the
 * client's timeline. There is no *Sessions* row to light, and lighting *Schedule*
 * instead would claim the console is part of a screen the trainer did not open.
 * It falls through to `today`, which is where the flow is started from most and
 * where `Finish` returns to.
 *
 * `/settings` and `/team` resolve to keys no `PRIMARY` row carries, so the rail
 * lights nothing and the bar lights *More* — the true answer on both.
 */
function currentFor(pathname: string): RailKey {
  if (pathname.startsWith('/today')) return 'today';
  if (pathname.startsWith('/clients')) return 'clients';
  if (pathname.startsWith('/schedule')) return 'sched';
  /* `/programs`, `/programs/workouts`, `/programs/certified` and
     `/programs/exercises` — one destination, FOUR PAGES, and the pane beside the
     rail is what draws them now. The routes keep the `/programs` prefix while
     the row above them reads *Fitness*; `nav.tsx` says why the label moved and
     the paths did not. */
  if (pathname.startsWith('/programs')) return 'prog';
  if (pathname.startsWith('/business')) return 'biz';

  // The account shelf. None is in the five, so none lights a rail row.
  // `/settings/profile` is tested BEFORE `/settings`, or the longer path falls
  // into the shorter prefix and the sheet marks *Settings* as the current page
  // while the trainer is looking at their profile.
  if (pathname.startsWith('/settings/profile')) return 'profile';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/team')) return 'team';

  // `/sessions` lands here on purpose — see above.
  return 'today';
}

/**
 * Persistent app shell — Rail, skip link, children, TabBar — in a single
 * client component so `usePathname()` can drive `current` without making every
 * page a client component. The layout fetches `trainerName` server-side once;
 * badge counts stay per-page for now (the Rail shows destinations without
 * counts rather than stale ones from a previous page).
 */
export function AppShell({
  trainerName,
  roster,
  notifications,
  workspaces,
  activeWorkspaceId,
  defaultWorkspaceId,
  children,
}: {
  trainerName: string;
  /** The palette's floor. See `PaletteHost` for why it is the shell that holds it. */
  roster: { id: string; name: string }[];
  /** The bell's feed. Same argument as `roster` — `NotificationsHost` says it. */
  notifications: Notification[];
  /** Every book this trainer can open, and which one is open. Same argument
   *  again, and `WorkspaceHost` states it: the bar that draws the switcher is
   *  mounted by twenty screens rather than by this shell. */
  workspaces: Workspace[];
  activeWorkspaceId: string;
  /** The one the app opens in. Never empty — `resolveWorkspaces` falls back to
   *  the solo book, so exactly one row in the menu is ever starred. */
  defaultWorkspaceId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const current = currentFor(pathname);
  /* THE PANE IS A FUNCTION OF THE ROUTE AND NOTHING ELSE.
     No `useState`, no toggle, and deliberately so — `nav.tsx`'s `SectionPage`
     header has the argument. A deep link, the back button and a click on the
     rail all land on the same chrome, because there is no second source of truth
     for it to disagree with. `undefined` on Today, Schedule and every account
     screen, and `.app--pane` comes off with it so `.main` reclaims the track. */
  const section = sectionFor(current);
  const views = useMemo(() => trainerViews(notifications), [notifications]);
  /* WHETHER THE PANE IS THERE AT ALL IS THE CHOICE; THE RAIL'S WIDTH IS NOT —
     `app--rail-min` is unconditional. `app--pane-min` rides on `app--pane`, so a
     route with no section draws neither and the remembered answer waits for one
     that does. Since 14 Sep 2026 the collapsed pane is not a 56px strip — the
     track slides to 0 and the whole column goes with it — and the switch that
     brings it back is in the RAIL, the only column that is always drawn. */
  const [paneCollapsed, togglePane] = usePaneCollapsed();

  /* `[`, and only where there is a pane to collapse. `paneCollapse.ts` has the
     guard list and why. */
  usePaneCollapseShortcut(togglePane, Boolean(section));

  /* AND THE OTHER WAY IN: rest on a rail row and that section's pages open
     WITHOUT NAVIGATING. Transient, never written down, and `panePreview.ts`
     holds both the state and the two delays.

     THE PREVIEW IS A SECTION, NOT A COLUMN, and the two render paths below are
     the whole feature:

       the track is open  → the pane ALREADY on screen swaps its contents, and
                            nothing floats. A flyout over a pane at the same 212
                            px, in the same place, showing the same kind of list,
                            would be one column pretending to be two.
       the track is shut  → a flyout, over the page, changing no layout at all.

     Either way the ROUTE is untouched: `section` still says where the trainer
     is, `previewSection` says what they are pointing at, and the pinned state
     never learns a hover happened. */
  const preview = usePanePreview<RailKey>();
  const previewSection = preview.key ? sectionFor(preview.key) : undefined;
  /* What the flyout renders while it fades out — see `shown`. Falls back to the
     live one so the first open has something on frame one. */
  const shownSection = sectionFor(preview.shown ?? preview.key ?? current);
  /* The track is a column the trainer can see. When it is, the preview goes in
     it; when it is not, the preview floats. */
  const trackOpen = Boolean(section) && !paneCollapsed;

  /* A CLICK IN THE FLYOUT IS A NAVIGATION, AND A NAVIGATION ENDS THE QUESTION.
     Without this the flyout hangs under the pointer after the page it opened has
     already loaded behind it — and on a route whose own section is the one being
     previewed, the answer arrives in the track as well, so the same list is
     drawn twice. `pathname` and not the click, because `[`, the back button and
     a link inside the page all end it for the same reason. */
  useEffect(() => {
    preview.close();
    // `preview.close` is stable; the route is the only real dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div
      className={`app app--rail-min${section ? ' app--pane' : ''}${
        section && paneCollapsed ? ' app--pane-min' : ''
      }`}
      data-glass="on"
    >
      {/* Wraps the whole shell rather than only `children`, so the Rail and the
          TabBar can reach the opener too — both draw their own way into search
          on a phone, and both were as unwired as the TopBar was. */}
      {/* Outside the palette rather than inside it, and the order is the one
          §03 gives the surfaces: this provider draws nothing at all — it holds
          the workspace and hands it to whichever `TopBar` the current screen
          mounted — so it has no box to stack and no reason to sit between two
          things that do. */}
      <WorkspaceHost
        workspaces={workspaces}
        activeId={activeWorkspaceId}
        defaultId={defaultWorkspaceId}
      >
      <PaletteHost roster={roster}>
        {/* Inside the palette's provider rather than outside it, so that the
            two surfaces stack in the order §03 gives them: `.pal` is z 50 and
            `.ntf` is z 35, and mounting the palette last means a ⌘K opened
            over an open panel paints above it rather than under. */}
        {/* The wire rows become views HERE rather than in the host, because
            "which plate, which glyph, which sentence, which route" is the one
            thing about a feed that is not shared between the two halves of this
            product — `notificationViews.tsx` beside this file is the trainer's
            answer and `components/portal/notificationViews.tsx` is the
            client's. Memoised on the array the layout handed down, so a
            re-render of the shell does not rebuild every row and hand the host
            a new identity to diff against. */}
        <NotificationsHost
          views={views}
          onRead={(id) => void markRead(id)}
          onReadAll={() => void markAllRead()}
          empty={TRAINER_EMPTY}
        >
          {/* INSIDE `.app`, and inside every provider rather than around them.
              `.toasts` reads `--w-tabs` — the tab bar's own height token, which
              is declared on `.app` under 900px — to lift the deck clear of the
              navigation; a host mounted in `layout.tsx` around `<AppShell>`
              would sit outside that declaration and drop four confirms behind
              the bar on every phone.

              Last of the four, so the deck paints over the palette and the
              notification centre. It is the only surface here that reports
              something that has ALREADY happened, and a confirm a trainer
              cannot see because a menu they left open is covering it is a
              confirm that did not happen. */}
          <ToastHost>
          <Rail
            current={current}
            trainerName={trainerName}
            /* Only where there is a pane to close, which is the same condition
               the `[` shortcut is bound under. A switch on `/today` would toggle
               a remembered answer nothing on screen reflects. */
            pane={
              section
                ? { label: section.label, collapsed: paneCollapsed, onToggle: togglePane }
                : undefined
            }
            onPreview={preview.enter}
            onPreviewLeave={preview.leave}
          />
          {/* AFTER the rail and BEFORE the skip link, which is the reading order
              and not an accident of the grid. The two columns are one navigation
              read left to right — section, then page — and a tab from the last
              rail row should land on the first page of the section it just
              named. The skip link stays the last thing before `.main` so that
              *Skip to main content* still skips ALL of the navigation; putting
              the pane after it would offer a trainer an escape from the rail
              into a column they then have to escape again. */}
          {/* THE TRACK. Its contents are the previewed section when there is
              one — that is the "when expand is on, moving to another row changes
              the column" half — and the route's section otherwise. `section` is
              what decides whether the column EXISTS, because the track belongs
              to the route; the preview only decides what is printed in it. */}
          {section && (
            <SectionPane
              section={(trackOpen && previewSection) || section}
              pathname={pathname}
              hover={{ hold: preview.hold, leave: preview.leave }}
            />
          )}
          {/* THE FLYOUT, and it is rendered whenever the track is not a column
              the trainer can see — collapsed, or a route with no section at all.
              MOUNTED EVEN WHEN CLOSED: it fades and slides out, and React
              unmounting it on frame one would take the exit with it. */}
          {!trackOpen && shownSection && (
            <SectionPane
              section={shownSection}
              pathname={pathname}
              float
              open={Boolean(previewSection)}
              hover={{ hold: preview.hold, leave: preview.leave }}
            />
          )}
          <a className="skip" href="#main-content">Skip to main content</a>
          {children}
          <TabBar current={current} trainerName={trainerName} />
          </ToastHost>
        </NotificationsHost>
      </PaletteHost>
      </WorkspaceHost>
    </div>
  );
}
