import { rupees } from '@/lib/today/time';
import type { PackBasis, PackService } from './vocab';

/**
 * The price list's model — what the screen shows, derived from the server's rows.
 *
 * `buildPacks` on the phone is the ancestor, and the two halves must not
 * disagree about what a price list *says*. What changed on this half is the
 * source: v1 packs carry `service` + `basis`, a gym pack carries the trainer's
 * share, and the gym's own part is derived by the server (`gymSharePercent` /
 * `gymShareAmount`) and only displayed here — never typed, never recomputed.
 */

/* ------------------------------------------------------------ public shapes */
/* Declared here rather than in `api.ts` so the client component can import
   them: `api.ts` is `server-only`. */

/**
 * One entry on a price list, as the screen needs it.
 *
 * `status` because setup only ever adds and this screen retires and restores;
 * `activeClients` and `soldCount` because "3 on it · sold 14" is what makes
 * retiring or deleting a decision rather than a click — `include=usage` brings
 * both down in one grouped pass, so no sold package ever reaches this screen.
 */
export interface PriceListPack {
  id: string;
  name: string;
  service: PackService;
  basis: PackBasis;
  /** Null on a period pack — there is no session count to divide by. */
  sessions: number | null;
  amount: number;
  validityDays: number | null;
  status: 'active' | 'inactive';
  /** Whose list this is on. The gym's counter sets its own prices. */
  owner: 'trainer' | 'gym';
  orderIndex: number;
  activeClients: number;
  soldCount: number;
  /** A gym pack carries EXACTLY ONE of these two: the trainer's part of the price. */
  trainerSharePercent: number | null;
  trainerShareAmount: number | null;
  /** What the gym keeps — the server's, derived, never typed. Null on a pack with no share. */
  gymSharePercent: number | null;
  gymShareAmount: number | null;
  version: string;
}

/** A package somebody is actually running — only what *Ending soon* needs. */
export interface LivePackage {
  id: string;
  clientId: string;
  sessionsRemaining: number | null;
  sessionsTotal: number | null;
}

export interface PacksTrainer {
  name: string;
  /** The gym on the profile, typed or picked. Null when there is none. */
  gymName: string | null;
  /** Kept so saving the gym can add `gym_floor` without dropping the other modes. */
  trainingModes: string[];
  setupComplete: boolean;
}

export interface PacksData {
  trainer: PacksTrainer;
  packs: PriceListPack[];
  live: LivePackage[];
  clientNames: Map<string, string>;
  now: number;
}

/** Three sessions left is when renewing stops being early and starts being late.
 *  The phone's constant, same value, same file position. */
export const PACK_ENDING_AT = 3;

export interface PackRow {
  id: string;
  name: string;
  service: PackService;
  basis: PackBasis;
  sessions: number | null;
  amount: number;
  /** The whole price over the count — and on a gym pack, the TRAINER's part of it. */
  perSession: number | null;
  validityDays: number | null;
  active: boolean;
  owner: 'trainer' | 'gym';
  orderIndex: number;
  /** How many people are on it right now, and how many it has ever sold. Counted by the server. */
  clients: number;
  sold: number;
  /** Gym packs only: what the trainer gets and what the gym keeps, per sale at this price. */
  split: { trainer: number; gym: number; trainerLabel: string } | null;
  /** The source row, for the edit form. */
  source: PriceListPack;
}

export interface EndingRow {
  packageId: string;
  clientId: string;
  name: string;
  remaining: number;
  total: number | null;
  detail: string;
}

export interface PacksView {
  /** Which lists this screen draws. */
  showsOwn: boolean;
  showsGym: boolean;
  selling: PackRow[];
  gymSelling: PackRow[];
  retired: PackRow[];
  ending: EndingRow[];
  activePackages: number;
  priceNote: string | null;
  subtitle: string;
}

/** The trainer's part of a gym pack's price, from whichever of the two forms it was entered in. */
function trainerPart(p: PriceListPack): number | null {
  if (p.trainerShareAmount !== null) return p.trainerShareAmount;
  if (p.trainerSharePercent !== null) return Math.round((p.amount * p.trainerSharePercent) / 100);
  return null;
}

function toRow(pack: PriceListPack): PackRow {
  const trainer = pack.owner === 'gym' ? trainerPart(pack) : null;
  /* The gym's part is the server's own figure whenever it sent one; the
     subtraction is only the fallback for a pack whose derived field is absent,
     so a stale API cannot make the two halves of one price disagree. */
  const gym = trainer === null
    ? null
    : pack.gymShareAmount !== null ? pack.gymShareAmount : Math.max(pack.amount - trainer, 0);
  const basis = trainer ?? pack.amount;
  return {
    id: pack.id,
    name: pack.name,
    service: pack.service,
    basis: pack.basis,
    sessions: pack.sessions,
    amount: pack.amount,
    perSession: pack.basis === 'sessions' && (pack.sessions ?? 0) > 0
      ? Math.round(basis / (pack.sessions as number))
      : null,
    validityDays: pack.validityDays,
    active: pack.status === 'active',
    owner: pack.owner,
    orderIndex: pack.orderIndex,
    clients: pack.activeClients,
    sold: pack.soldCount,
    split: trainer === null || gym === null
      ? null
      : {
          trainer,
          gym,
          trainerLabel: pack.trainerSharePercent !== null
            ? `${pack.trainerSharePercent}%`
            : rupees(trainer),
        },
    source: pack,
  };
}

export function buildPacks(input: {
  packs: PriceListPack[];
  live: LivePackage[];
  clientNames: Map<string, string>;
  gymName: string | null;
}): PacksView {
  const rows = [...input.packs]
    .sort((a, b) => a.orderIndex - b.orderIndex || a.amount - b.amount)
    .map(toRow);

  const selling = rows.filter((r) => r.active && r.owner === 'trainer');
  const gymSelling = rows.filter((r) => r.active && r.owner === 'gym');

  /**
   * WHOSE LISTS EXIST. The trainer's own always does. The gym's draws whenever
   * there is a gym on the profile, and also whenever gym packs are on file —
   * hiding a list a trainer has already filled in is losing their data behind a
   * setting they can change back. (`workMode` is gone from the wire: the gym
   * name, with `gym_floor` among the training modes, is what v1 keeps.)
   */
  const showsOwn = true;
  const showsGym = input.gymName !== null || rows.some((r) => r.owner === 'gym');

  const ending: EndingRow[] = input.live
    .filter((p) => (p.sessionsRemaining ?? 0) > 0 && (p.sessionsRemaining ?? 0) <= PACK_ENDING_AT)
    .map((p) => {
      const left = p.sessionsRemaining ?? 0;
      return {
        packageId: p.id,
        clientId: p.clientId,
        name: input.clientNames.get(p.clientId) ?? 'Someone',
        remaining: left,
        total: p.sessionsTotal,
        detail: `${left} session${left === 1 ? '' : 's'} left${
          p.sessionsTotal ? ` · ${p.sessionsTotal}-session pack` : ''
        }`,
      };
    })
    .sort((a, b) => a.remaining - b.remaining);

  return {
    showsOwn,
    showsGym,
    selling,
    gymSelling,
    // Retired keeps both owners together. A price nobody sells any more is a
    // receipt whichever list it came off.
    retired: rows.filter((r) => !r.active),
    ending,
    activePackages: input.live.length,
    // Only the trainer's own prices are judged. Telling somebody their gym has
    // priced its own packages badly is advice they cannot act on.
    priceNote: pricingNote(selling),
    subtitle: subtitleFor(showsGym, selling.length, gymSelling.length, input.live.length, input.gymName),
  };
}

/**
 * "5 you sell · 6 active", or "1 you sell · 1 Iron Yard sells · 6 active".
 *
 * The two halves echo the two group HEADINGS on the screen word for word. A
 * count and a verb agree at every number.
 */
function subtitleFor(
  showsGym: boolean,
  own: number,
  gym: number,
  live: number,
  gymName: string | null,
): string {
  const active = `${live} active`;
  const mine = `${own} you sell`;
  if (!showsGym) return `${mine} · ${active}`;
  return `${mine} · ${gym} ${gymName ?? 'the gym'} sells · ${active}`;
}

/**
 * Checks the one thing that is easy to get wrong and expensive to leave wrong:
 * a shorter pack should cost MORE per session than a longer one. Pricing them
 * the other way round means the discount is being given for nothing.
 */
export function pricingNote(rows: PackRow[]): string | null {
  const priced = rows
    .filter((r) => r.basis === 'sessions' && r.sessions != null && r.perSession != null && r.sessions > 1)
    .sort((a, b) => (a.sessions as number) - (b.sessions as number));
  if (priced.length < 2) return null;

  const short = priced[0];
  const long = priced[priced.length - 1];
  const shortPer = short.perSession as number;
  const longPer = long.perSession as number;

  if (shortPer > longPer) {
    return `Your ${short.sessions}-session pack is ${rupees(shortPer)} a session against ${rupees(
      longPer,
    )} on the ${long.sessions}. That's the right way round — shorter packs should cost more per session.`;
  }
  if (shortPer === longPer) {
    return `Your ${short.sessions} and ${long.sessions}-session packs both work out to ${rupees(
      shortPer,
    )} a session. The longer one gives no reason to commit.`;
  }
  return `Your ${short.sessions}-session pack is ${rupees(shortPer)} a session against ${rupees(
    longPer,
  )} on the ${long.sessions} — the wrong way round. A shorter pack should cost more per session.`;
}
