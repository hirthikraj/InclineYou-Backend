'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';

import { markNotificationRead, markNotificationsRead } from '@/lib/portal/actions';
import type { PortalNotificationWire } from '@/lib/portal/api';

import { clientEmpty, clientViews } from './notificationViews';
import { CLIENT_ACCOUNT, CLIENT_PRIMARY, type RailKey } from '@/components/shell/nav';
import { NotificationsHost } from '@/components/shell/NotificationsHost';
import { Rail } from '@/components/shell/Rail';
import { TabBar } from '@/components/shell/TabBar';
import { ToastHost } from '@/components/shell/ToastHost';

/**
 * The client portal's shell — the same `Rail` and the same `TabBar` the trainer
 * half draws, with four destinations instead of five.
 *
 * ── WHY IT IS NOT `AppShell` WITH A FLAG ─────────────────────────────────────
 *
 * `AppShell` mounts three providers, and the client portal wants none of them.
 * That is not a small difference in configuration; it is three features the
 * client role does not have:
 *
 *   · **`PaletteHost`** — ⌘K over the roster. A client has no roster. The
 *     palette's floor is *the trainer's clients*, and a command palette whose
 *     whole index is one person is a control that opens to say nothing.
 *   · **`WorkspaceHost`** — the tenant switcher. A trainer works in three
 *     books; a client's two rosters are not tenants, they are two arrangements,
 *     and `/sign-in/role` is where that question is asked.
 *
 * A flag on `AppShell` would have to skip both, which means each of those
 * providers becomes conditional and the trainer's shell grows a branch for a
 * role it does not serve. Two compositions of the same components is the honest
 * structure — and it is what `AppShell` itself is, a composition rather than a
 * component.
 *
 * `ToastHost` IS here, and it transfers unchanged: every write in this portal
 * happens behind a form that closes or on a screen that navigates, which is
 * exactly the case `lib/toast`'s own header says a receipt is for.
 *
 * ── AND `NotificationsHost` IS HERE NOW, WHICH REVERSES WHAT THIS FILE SAID ──
 *
 * It used to be the second of the three refusals, on the grounds that
 * §"Notifications" is item 8 of an eight-item build order and was not built —
 * *"`TopBar` drops the bell when there is no host, which is what makes leaving
 * it out a working screen rather than a dead glyph."* That was the right call
 * while there was no feed and it is not a reason to have two hosts now that
 * there is: the host was made generic over `NotificationView`, so what this
 * shell mounts is the SAME component the trainer's does, over the client's five
 * kinds and the client's routes.
 *
 * The bell then appears on every `/me/*` screen for free, because `TopBar` is
 * already drawing the control and already asking `useNotifications()` whether
 * there is a panel to open.
 *
 * **The workout flow gets it too, and that is deliberate rather than
 * overlooked.** `/me/workout/:id` renders inside this shell, so a client mid-set
 * can see that their trainer wrote to them. The alternative is a shell that
 * drops a control on one route, which is the thing this codebase keeps deleting
 * from the other direction — and the feed carries no verb, so the worst it can
 * do is be read.
 */
function currentFor(pathname: string): RailKey {
  /* Longest prefix first. `/me/today` and `/me/plan` do not collide, but
     `/me/workout/...` would fall through to nothing — and it lights *Home*
     deliberately: the flow is launched from Home's one button and Home is where
     finishing returns to, which is `AppShell.currentFor`'s own argument for
     `/sessions` falling through to `today`. */
  if (pathname.startsWith('/me/progress')) return 'me-progress';
  if (pathname.startsWith('/me/plan')) return 'me-plan';
  if (pathname.startsWith('/me/account')) return 'me-account';
  return 'me-home';
}

export function PortalShell({
  clientName,
  clientPhone,
  trainerName,
  notifications,
  children,
}: {
  /** Whose portal this is. The rail's foot prints it. */
  clientName: string;
  /**
   * The number this session signs in with. The foot menu's header prints it so
   * somebody on a shared phone can see which account is open — the identical
   * reason `TrainerWire` was given a `phone` field for the trainer's own foot.
   */
  clientPhone: string | null;
  /**
   * Whose book is open, for the foot's second line.
   *
   * `AccountMenu` draws *Trainer* there for a trainer, and that word answers
   * *which of the two halves of this product am I in*. A client has one half,
   * so the useful fact is the other one: whose roster this is, which is the
   * question somebody on two rosters actually has and the only place in this
   * shell that answers it.
   */
  trainerName: string;
  /**
   * §"Notifications" · the client's feed, read once by the layout.
   *
   * A prop rather than a read inside the host, for `lib/portal/api.ts`'s stated
   * reason: a count each page had to remember to fetch is a count that is
   * absent on the screens somebody forgot, and an absent count on a bell is the
   * claim that nothing happened.
   */
  notifications: PortalNotificationWire[];
  children: React.ReactNode;
}) {
  const current = currentFor(usePathname());
  /*
    THE RAIL IS FIXED AT 64px HERE TOO, and this file has argued both sides twice.

    It first refused `.app--rail-min` — four rows beside a 920px column is not the
    trade a trainer makes for a week of a diary — then reversed, because a rail
    that can be put away on one half of the product and not the other is the same
    control missing. What settled it is that the control left the rail on BOTH
    halves (13 Sep 2026, `paneCollapse.ts`): the collapsed state was always the
    better drawing of this column and is now the only one, so the two halves stay
    identical with no per-device answer to remember. The portal draws no pane —
    `CLIENT_PRIMARY` has no `pages` — so there is no collapse control here at all.
  */

  /* The trainer's FIRST name, which four of the five rows lead with — see
     `lib/portal/notifications.ts` on why a client's feed bolds the coach where
     the trainer's bolds the client. Taken from the same string the rail's foot
     prints, so the two cannot disagree about what to call them. */
  const trainerFirst = trainerName.split(' ')[0];
  /* Memoised on the array the layout handed down. Without it every render of
     this shell builds a new view array, and the host — which merges its own
     read stamps over whatever it is given — would be diffing a fresh identity
     on every keystroke anywhere below. */
  const views = useMemo(
    () => clientViews(notifications, trainerFirst),
    [notifications, trainerFirst],
  );
  const empty = useMemo(() => clientEmpty(trainerFirst), [trainerFirst]);

  return (
    <div className="app app--rail-min" data-glass="on">
      {/* Outside `ToastHost` rather than inside, which is the order `AppShell`
          settles for its four: `.ntf` is z 35 and `.toasts` is z 60, so the
          deck has to be mounted last or a receipt lands under a panel somebody
          left open. */}
      <NotificationsHost
        views={views}
        onRead={(id) => void markNotificationRead(id)}
        onReadAll={() => void markNotificationsRead()}
        empty={empty}
      >
      <ToastHost>
        <Rail
          current={current}
          destinations={CLIENT_PRIMARY}
          accountRows={CLIENT_ACCOUNT}
          accountRole={`with ${trainerName.split(' ')[0]}`}
          trainerName={clientName}
          trainerPhone={clientPhone}
          /* No pins. The rail's pin group is today's sessions, plural, which is
             a trainer's day — a client has at most one, and it is the hero of
             the screen the rail is beside. */
        />
        <a className="skip" href="#main-content">Skip to main content</a>
        {children}
        <TabBar current={current} tabs={CLIENT_PRIMARY} trainerName={clientName} />
      </ToastHost>
      </NotificationsHost>
    </div>
  );
}
