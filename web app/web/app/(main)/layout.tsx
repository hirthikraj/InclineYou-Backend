import { redirect } from 'next/navigation';

import { AppShell } from '@/components/shell/AppShell';
import { TrainerOnly } from '@/components/auth/TrainerOnly';
import { readClaims } from '@/lib/auth/claims';
import { getToken, getTokenRole } from '@/lib/auth/session';
import { getRoster, getTrainerIdentity, getTrainerName } from '@/lib/shell/api';
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
  /* WHO IS ASKING, BEFORE ANYTHING IS READ (25 Nov 2026). These are trainer routes; a client's session reaching them
     used to fall through to each page's own fetches, and what the backend's refusal became depended on the page —
     a redirect on `/today`, a 500 on `/settings/nudges`. The root page's own reading of the session decides: no
     session signs in, an unfinished signup goes to setup, a client is told this page is a trainer's. */
  const claims = readClaims(await getToken(), await getTokenRole());
  if (!claims) redirect('/sign-in');
  if (claims.role === 'pending') redirect('/sign-in/new');
  if (claims.role === 'client') return <TrainerOnly />;
  if (claims.role !== 'trainer') redirect('/sign-in');

  const [trainerName, roster, workspaces, identity] = await Promise.all([
    getTrainerName(),
    getRoster(),
    listWorkspaces(),
    /* `cache()`d with `getTrainerName`, so this is the same one request: the gym
       on the profile is what shows the *Gym share* page in Business. */
    getTrainerIdentity(),
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
      hasGym={identity.gymName !== ''}
    >
      {children}
    </AppShell>
  );
}
