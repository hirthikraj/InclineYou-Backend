import { buildRow, type ClientTag } from './roster';
import type { ClientWire, PackageWire } from './api';
import type { ClientDetailWire, ClientPackageWire } from './client-api';

/**
 * WHAT THE ROSTER WOULD SAY ABOUT THIS CLIENT, on the client's own file.
 *
 * The roster calls somebody *At risk* or *Expiring* and prints the reason beside
 * it (*No workout logged in 12 days*); the file used to open on a green *Active*
 * for the same person, because its header drew the membership status and nothing
 * derived. A trainer who clicked through to find out why landed on a page that
 * said all was well.
 *
 * This is not a second derivation: it is the roster's own `buildRow`, called with
 * the one client and the one client's packs. `ClientDetailWire` carries every
 * field `buildRow` reads (`stats`, `slots`, `program`, `status`, `pausedUntil`,
 * `createdAt`), so the two screens cannot disagree about a person — which a copy of
 * `readTag` here eventually would.
 *
 * The REASON is returned only when there is one worth saying: a derived tag that
 * is not plain *Active*, or an attention line (money owed, a pack ending). A calm
 * active client's line is a plan name or *Last session 14 Sep*, which the tabs
 * below already say.
 */
export interface FileStatus {
  tag: ClientTag;
  reason: string | null;
}

export function fileStatus(
  client: ClientDetailWire,
  packages: ClientPackageWire[],
  now: number,
): FileStatus | null {
  /* An archived client is not on the roster at all, and `readTag` would call them
     active. The header keeps its own *Archived* tag for that case. */
  if (client.status === 'archived') return null;
  const row = buildRow(
    client as unknown as ClientWire,
    now,
    new Map([[client.id, packages as unknown as PackageWire[]]]),
  );
  return {
    tag: row.tag,
    reason: row.attention || row.tag !== 'active' ? row.line : null,
  };
}
