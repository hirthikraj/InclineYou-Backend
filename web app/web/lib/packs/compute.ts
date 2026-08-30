import { perSession, type PackType } from '@/lib/setup/money';
import { rupees } from '@/lib/today/time';
import type { WorkMode } from '@/lib/setup/options';

/**
 * `buildPacks` from `app/src/money/money.ts`, on this half.
 *
 * Ported rather than re-derived, because the two halves must not disagree about
 * what a price list *says*. The one real difference is where the second list
 * comes from: the phone shows it whenever a gym has a name, and this reads
 * `workMode` as well — which is the same answer asked out loud instead of
 * inferred, and the whole of what "independent shows one list, both shows two"
 * means on this screen.
 */

/* ------------------------------------------------------------ public shapes */
/* Declared here rather than in `api.ts` so the client component can import
   them: `api.ts` is `server-only`, and `modeOf` is a value, not a type. */

/**
 * One entry on a price list, as the screen needs it.
 *
 * Wider than `lib/setup/money.ts`'s `Pack` by two fields setup has no use for:
 * `status`, because setup only ever adds and this screen retires and restores,
 * and `activeClients`, because "3 clients are on it" is what makes retiring a
 * decision rather than a click.
 */
export interface PriceListPack {
  id: string;
  name: string;
  type: PackType;
  /** Null on a monthly fee — there is no session count to divide by. */
  sessions: number | null;
  amount: number;
  validityDays: number | null;
  status: 'active' | 'inactive';
  /** Whose list this is on. The gym's counter sets its own; see V19. */
  owner: 'trainer' | 'gym';
  orderIndex: number;
  activeClients: number;
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
  /**
   * Which lists exist. Null on a profile that predates the question — see
   * `modeOf` below, which is where the fallback lives rather than here, so the
   * raw answer and the derived one never get confused for each other.
   */
  workMode: WorkMode | null;
  gymName: string | null;
  gymSharePercent: number | null;
  setupComplete: boolean;
}

export interface PacksData {
  trainer: PacksTrainer;
  packs: PriceListPack[];
  live: LivePackage[];
  clientNames: Map<string, string>;
  now: number;
}

/**
 * A trainer with a gym on file from before `workMode` existed was shown both
 * price lists, so `both` is the faithful reading of pre-workMode data — the same
 * fallback `PacksForm` applies at setup. Everything else is on their own.
 */
export function modeOf(trainer: PacksTrainer): WorkMode {
  return trainer.workMode ?? (trainer.gymName ? 'both' : 'independent');
}

/** Three sessions left is when renewing stops being early and starts being late.
 *  The phone's constant, same value, same file position. */
export const PACK_ENDING_AT = 3;

export interface PackRow {
  id: string;
  name: string;
  type: PriceListPack['type'];
  sessions: number | null;
  amount: number;
  perSession: number | null;
  validityDays: number | null;
  active: boolean;
  owner: 'trainer' | 'gym';
  /** How many people are on it right now. Counted by the server, not here. */
  clients: number;
  /** "₹750 each · 3 clients on this" — the subtitle under the name. */
  detail: string;
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
  /** Which lists this screen draws. Nothing else branches on `workMode`. */
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

function toRow(pack: PriceListPack): PackRow {
  const per = perSession(pack);
  const on = pack.activeClients;
  return {
    id: pack.id,
    name: pack.name,
    type: pack.type,
    sessions: pack.sessions,
    amount: pack.amount,
    perSession: per,
    validityDays: pack.validityDays,
    active: pack.status === 'active',
    owner: pack.owner,
    clients: on,
    detail: [
      per != null ? `${rupees(per)} each` : pack.type === 'monthly' ? 'per month' : null,
      `${on} client${on === 1 ? '' : 's'} on this`,
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

export function buildPacks(input: {
  packs: PriceListPack[];
  live: LivePackage[];
  clientNames: Map<string, string>;
  mode: WorkMode;
  gymName: string | null;
}): PacksView {
  const rows = [...input.packs]
    .sort((a, b) => a.orderIndex - b.orderIndex || a.amount - b.amount)
    .map(toRow);

  const selling = rows.filter((r) => r.active && r.owner === 'trainer');
  const gymSelling = rows.filter((r) => r.active && r.owner === 'gym');

  /**
   * WHOSE LISTS EXIST — the rule this screen was built for.
   *
   * *On my own* draws one list. *Both* draws two. *At a gym* draws the gym's,
   * and still draws the trainer's whenever they have prices of their own on
   * file, because hiding a list a trainer has already filled in is losing their
   * data behind a radio button they can change back.
   *
   * A defaults hint, never a gate — the same words `lib/setup/options.ts` uses.
   * Who actually collects is decided per client at add-client time.
   */
  const showsOwn = input.mode !== 'gym' || selling.length > 0;
  const showsGym = input.mode === 'gym' || input.mode === 'both';

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
    // receipt whichever list it came off, and two dim groups of one row each is
    // ceremony for something already below the fold.
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
 * "5 you sell · 6 active", or "1 you sell · 1 Revoke Gym sells · 6 active".
 *
 * The two halves echo the two group HEADINGS on the screen word for word, which
 * is the whole reason it is not the phone's phrasing. `buildPacks` on the phone
 * writes "1 yours · 1 the gym's" — read at 1440 against real data, that renders
 * as **"1 yours"**, which is not English, and "1 the gym's" only escapes it by
 * being wrong in a way the eye skims. A count and a verb agree at every number.
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
 *
 * The arithmetic nobody does on paper, which is the entire argument for a screen
 * that lists prices side by side.
 */
export function pricingNote(rows: PackRow[]): string | null {
  const priced = rows
    .filter((r) => r.sessions != null && r.perSession != null && r.sessions > 1)
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
