import { PortalShell } from '@/components/portal/PortalShell';
import { Unavailable } from '@/components/portal/Unavailable';
import { requirePortal } from '@/lib/portal/guard';

/**
 * The client portal's shell, for every `/me/*` route.
 *
 * ── ONE REQUEST, AND FOUR SCREENS READ IT ────────────────────────────────────
 *
 * `getMe` is `cache()`d per request, so this layout's `requirePortal()` and each
 * page's own call to it are ONE round trip. That is what lets the guard live
 * here — where it can refuse the whole subtree — and in the pages, where the
 * data is actually used, without paying twice.
 *
 * It matters more here than on the trainer's half. `(main)/layout.tsx` makes
 * parallel reads for the rail, the roster and the workspace switcher; the client's rail needs two strings, and a layout that spent a
 * request per navigation to fetch them would be the largest cost on a screen
 * whose whole performance budget is §1's *"opens to the workout in under two
 * seconds"*.
 *
 * ── AND A FAILURE IS RENDERED HERE RATHER THAN THROWN ────────────────────────
 *
 * `requireToday`'s rule, for its reason: the error boundary next door is for
 * bugs, not for a restarting server. A layout that threw would take the shell
 * down with the page, so a client whose connection dropped would lose the tab
 * bar as well as the screen — and with it every way out of the failure.
 */
export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const result = await requirePortal();

  if (!result.ok) {
    /* No shell. There is nothing to navigate to — every `/me/*` route reads the
       same `/v1/me`, so a rail whose four destinations all fail is four ways to
       meet this screen again. `.app--noshell` is the same frame `Unavailable`
       uses on the trainer's half. */
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }

  return (
    <PortalShell
      clientName={result.me.client.name}
      clientPhone={result.me.client.phone}
      trainerName={result.me.trainer.name}
    >
      {children}
    </PortalShell>
  );
}
