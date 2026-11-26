'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import type { Workspace } from '@/lib/workspace/types';

import { activePageKey, sectionFor, type RailKey } from './nav';
import { PaletteHost } from './PaletteHost';
import { Rail } from './Rail';
import { NavFlagsProvider, visiblePages } from './NavFlags';
import { SectionPane } from './SectionPane';
import { SIDEBAR_KEY, usePaneCollapsed, usePaneCollapseShortcut } from './paneCollapse';
import { usePanePreview } from './panePreview';
import { useTodayBadge } from './railCount';
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
/** Is `p` inside the triangle `from` → the card's top-left → bottom-left? */
function inTriangle(
  p: { x: number; y: number },
  from: { x: number; y: number },
  card: DOMRect,
): boolean {
  const t = { x: card.left, y: card.top };
  const u = { x: card.left, y: card.bottom };
  const side = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = side(from, t, p);
  const d2 = side(t, u, p);
  const d3 = side(u, from, p);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

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
  workspaces,
  activeWorkspaceId,
  defaultWorkspaceId,
  hasGym,
  children,
}: {
  trainerName: string;
  /** The palette's floor. See `PaletteHost` for why it is the shell that holds it. */
  roster: { id: string; name: string }[];
  /** Every book this trainer can open, and which one is open. Same argument
   *  again, and `WorkspaceHost` states it: the bar that draws the switcher is
   *  mounted by twenty screens rather than by this shell. */
  workspaces: Workspace[];
  activeWorkspaceId: string;
  /** The one the app opens in. Never empty — `resolveWorkspaces` falls back to
   *  the solo book, so exactly one row in the menu is ever starred. */
  defaultWorkspaceId: string;
  /** A gym is on the trainer's profile — switches on the pages that exist only for one. */
  hasGym: boolean;
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
  /* WHETHER THE PANE IS THERE AT ALL IS THE CHOICE; THE RAIL'S WIDTH IS NOT —
     `app--rail-min` is unconditional. `app--pane-min` rides on `app--pane`, so a
     route with no section draws neither and the remembered answer waits for one
     that does. Since 14 Sep 2026 the collapsed pane is not a 56px strip — the
     track slides to 0 and the whole column goes with it — and the switch that
     brings it back is in the RAIL, the only column that is always drawn. */
  const [paneCollapsed, togglePane] = usePaneCollapsed(SIDEBAR_KEY);

  /* `[`, and only where there is a pane to collapse. `paneCollapse.ts` has the
     guard list and why. */
  /* THE SIDEBAR'S SWITCH, since 26 Nov 2026. The rail + section pane became
     one labelled sidebar with the current section's pages nested in it; the
     remembered "collapsed" answer (same key, so nobody's choice was lost) now
     narrows the SIDEBAR to the 64px icon rail, on every route — so `[` works
     everywhere, not only where there used to be a pane. */
  usePaneCollapseShortcut(togglePane, true);

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
  const todayBadge = useTodayBadge();
  const preview = usePanePreview<RailKey>();
  /* Where the hovered row is, so the card opens beside it. */
  const [anchorTop, setAnchorTop] = useState(0);
  /* The last two pointer positions while a card is open — the menu-aim test
     below needs a direction, and two samples are one. */
  const trail = useRef<{ x: number; y: number }[]>([]);
  useEffect(() => {
    if (!preview.key) return;
    const onMove = (e: MouseEvent) => {
      trail.current = [...trail.current.slice(-1), { x: e.clientX, y: e.clientY }];
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, [preview.key]);

  const onPreview = useCallback(
    (key: RailKey | null, top?: number) => {
      /* AIMING: is the pointer inside the triangle from where it just was to
         the open card's near edge? Then the row it is crossing is on the way,
         not the destination (`AIM_DELAY` in panePreview.ts). */
      const card = document.querySelector('.pane--float.pane--open')?.getBoundingClientRect();
      const [a, b] = trail.current;
      const aiming = Boolean(card && a && b && b.x > a.x && inTriangle(b, a, card));
      if (key && typeof top === 'number' && !aiming) setAnchorTop(top);
      preview.enter(key, aiming);
    },
    [preview],
  );
  /* The current section's pages, nested under its row while the sidebar is
     open — the second column's job, done in the first. */
  const sub =
    section && !paneCollapsed
      ? (() => {
          const pages = visiblePages(section.pages ?? [], { hasGym });
          return { pages, active: activePageKey(pages, pathname) };
        })()
      : undefined;
  const previewSection = preview.key ? sectionFor(preview.key) : undefined;
  /* What the flyout renders while it fades out — see `shown`. Falls back to the
     live one so the first open has something on frame one. */
  const shownSection = sectionFor(preview.shown ?? preview.key ?? current);
  /* The track is a column the trainer can see. When it is, the preview goes in
     it; when it is not, the preview floats. */

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
    <NavFlagsProvider value={{ hasGym }}>
    <div
      className={`app app--side${paneCollapsed ? ' app--rail-min' : ''}`}
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
          {/* INSIDE `.app`, and inside every provider rather than around them.
              `.toasts` reads `--w-tabs` — the tab bar's own height token, which
              is declared on `.app` under 900px — to lift the deck clear of the
              navigation; a host mounted in `layout.tsx` around `<AppShell>`
              would sit outside that declaration and drop four confirms behind
              the bar on every phone.

              Last of the providers, so the deck paints over the palette. It is
              the only surface here that reports
              something that has ALREADY happened, and a confirm a trainer
              cannot see because a menu they left open is covering it is a
              confirm that did not happen. */}
          <ToastHost>
          {/* FIRST, and not after the navigation. A skip link skips what comes
              BEFORE its target and AFTER itself; this one used to sit between the
              pane and `.main` on the argument that it should skip the whole
              navigation — but a link placed after the navigation skips nothing,
              because a keyboard user has already tabbed through the rail and the
              pane to reach it. WCAG 2.4.1 wants it as the first stop on the page. */}
          <a className="skip" href="#main-content">Skip to main content</a>
          <Rail
            current={current}
            trainerName={trainerName}
            /* Only where there is a pane to close, which is the same condition
               the `[` shortcut is bound under. A switch on `/today` would toggle
               a remembered answer nothing on screen reflects. */
            pane={{ label: 'sidebar', collapsed: paneCollapsed, onToggle: togglePane }}
            sub={sub}
            counts={todayBadge ? { today: todayBadge } : {}}
            onPreview={onPreview}
            onPreviewLeave={preview.leave}
          />
          {/* AFTER the rail, which is the reading order
              and not an accident of the grid. The two columns are one navigation
              read left to right — section, then page — and a tab from the last
              rail row should land on the first page of the section it just
              named. The skip link is the first stop on the page and so skips
              both columns, rail and pane together. */}
          {/* THE TRACK. Its contents are the previewed section when there is
              one — that is the "when expand is on, moving to another row changes
              the column" half — and the route's section otherwise. `section` is
              what decides whether the column EXISTS, because the track belongs
              to the route; the preview only decides what is printed in it. */}
          {/* THE HOVER CARD — a section's pages beside the row that asked,
              in either width of the sidebar. Never for the section already
              nested in place (the rail reports `null` for that row). MOUNTED
              EVEN WHEN CLOSED: it fades out, and unmounting on frame one would
              take the exit with it. */}
          {shownSection && (
            <SectionPane
              section={shownSection}
              pathname={pathname}
              float
              open={Boolean(previewSection)}
              anchorTop={anchorTop}
              hover={{ hold: preview.hold, leave: preview.leave }}
            />
          )}
          {children}
          <TabBar current={current} trainerName={trainerName} />
          </ToastHost>
      </PaletteHost>
      </WorkspaceHost>
    </div>
    </NavFlagsProvider>
  );
}
