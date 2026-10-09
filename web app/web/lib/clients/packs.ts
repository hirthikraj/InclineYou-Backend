import type { ClientPackageWire } from './client-api';

/**
 * WHICH PACK IS THE CLIENT ON — ONE READING, FOR EVERY SCREEN THAT NAMES ONE.
 *
 * A client can hold more than one live pack, and that is the right shape: a
 * renewal taken before the last pack ran out, or sessions added mid-pack, leaves
 * two rows `active`, because a sale may not be edited — more sessions are a second
 * row, not a bigger first one. The server spends them OLDEST FIRST, while the wire
 * hands them over NEWEST FIRST, so `packages.find((p) => p.status === 'active')`
 * picks the pack that is NOT being spent. It was written that way on the file's
 * header and on its Overview card, and the two disagreed with each other (the
 * header said *Unlimited* where the card said *—* for one seeded client).
 *
 * `currentPack` mirrors the server's choice — the oldest live pack that is not
 * paused and still has something in it — and `packBalance` sums every live pack, so
 * six sessions bought on top of one remaining stops asking to be renewed.
 *
 * It reads no clock and no cookie, so the browser and the server can both import it.
 */
const DEAD = new Set(['completed', 'expired', 'cancelled', 'refunded']);

/** A pack a client can still use or owe for. `status` is the server's word. */
export const isLive = (p: ClientPackageWire): boolean => !DEAD.has(p.status);

/** The pack the next session comes off, or null when the client has none live. */
export function currentPack(packages: ClientPackageWire[]): ClientPackageWire | null {
  const live = packages.filter(isLive).sort((a, b) => a.createdAt - b.createdAt);
  if (live.length === 0) return null;
  return (
    live.find((p) => !p.pausedAt && (p.sessionsRemaining === null || p.sessionsRemaining > 0)) ??
    live[0]
  );
}

export interface PackBalance {
  /** Sessions left across every live SESSION pack; null when none is counted. */
  left: number | null;
  total: number | null;
  /** Live packs, and none of them counted in sessions (a monthly pack). */
  unlimited: boolean;
  /** How many live packs there are. */
  count: number;
}

export function packBalance(packages: ClientPackageWire[]): PackBalance {
  const live = packages.filter(isLive);
  const counted = live.filter((p) => typeof p.sessionsRemaining === 'number');
  return {
    left: counted.length > 0 ? counted.reduce((s, p) => s + (p.sessionsRemaining ?? 0), 0) : null,
    total:
      counted.length > 0 ? counted.reduce((s, p) => s + (p.sessionsTotal ?? 0), 0) : null,
    unlimited: live.length > 0 && counted.length === 0,
    count: live.length,
  };
}
