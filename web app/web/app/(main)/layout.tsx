import { AppShell } from '@/components/shell/AppShell';
import { getRoster, getTrainerName } from '@/lib/shell/api';
import { listWorkspaces, resolveWorkspaces } from '@/lib/workspace/api';

/**
 * Persistent shell for all main routes (today, schedule, money, clients).
 * Rail and TabBar live here so they survive client-side navigations between
 * these routes — only the <main> content swaps, the rail stays mounted.
 * Badge counts and pins are per-page concerns; pages that need them can add
 * a ShellContext later without touching this layout.
 */
export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* In parallel, not in sequence: independent reads on the critical path of
     every navigation inside the shell, and awaiting them one after the other
     would add the roster's latency to every page rather than overlapping it.

     The third is the top bar's workspace switcher, and it costs less than it
     looks: `getTrainerName`
     and `listWorkspaces` both read `/v1/trainers/me` through `getTrainerIdentity`,
     which is `cache()`d per request, so the two of them are ONE round trip plus
     `/v1/team`. */
  const [trainerName, roster, workspaces] = await Promise.all([
    getTrainerName(),
    getRoster(),
    listWorkspaces(),
  ]);
  /* After, not beside: both cookies are resolved AGAINST the list, so a trainer
     who has left a team is returned to their own book rather than left holding
     an active workspace nobody can switch away from — or a star on a row that
     is no longer drawn. */
  const { activeId, defaultId } = await resolveWorkspaces(workspaces);
  return (
    <AppShell
      trainerName={trainerName}
      roster={roster}
      workspaces={workspaces}
      activeWorkspaceId={activeId}
      defaultWorkspaceId={defaultId}
    >
      {children}
    </AppShell>
  );
}
