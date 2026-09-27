'use client';

import { usePathname } from 'next/navigation';

import { CLIENT_ACCOUNT, CLIENT_PRIMARY, type RailKey } from '@/components/shell/nav';
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

  return (
    <div className="app app--rail-min" data-glass="on">
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
    </div>
  );
}
