/**
 * HOW A SESSION IS PAID FOR — V32, decided 9 Nov 2026.
 *
 * Booking never charges and never refuses: a pack is charged when the session is
 * DELIVERED (Mark done), and a booking the pack does not cover still goes in the
 * diary. What this file adds is that the trainer can see which kind of booking
 * they are making, before they press Book:
 *
 *   pack           the default — Mark done takes one off the client's live pack
 *   trial          free on purpose (before they buy)
 *   complimentary  free on purpose (any other reason)
 *   single         paid on its own: Mark done sells a one-session sale at `price`
 *
 * `coverage` repeats the server's choice of pack (`SessionStateJdbcRepository.
 * payingPack`: a live, unpaused session pack for the same service, never a single
 * session's own sale) and subtracts
 * what is already booked against it (`sessionsBookedAhead` on
 * `GET /v1/packages?scope=current`), so "6 of 12 left" stops reading as covered
 * when six sessions are already booked.
 */

export type Billing = 'pack' | 'trial' | 'complimentary' | 'single';

/** The service a pack must match — the server's `package.service`. */
export type Service = 'floor' | 'home_visit' | 'remote';

export const BILLING_CHOICES: { id: Billing; label: string }[] = [
  { id: 'pack', label: 'Pack' },
  { id: 'trial', label: 'Trial' },
  { id: 'complimentary', label: 'Free' },
  { id: 'single', label: 'Single' },
];

/**
 * A PROSPECT'S SESSION IS A TRIAL UNLESS THE TRAINER SAYS OTHERWISE (22 Nov 2026).
 *
 * A prospect has no pack, so the old default — Pack — booked their demo as a
 * session nothing would ever pay for, and Mark done reported it as money nobody
 * had asked for. The roster's two words for somebody who has not started are
 * `status = prospect` (Add client's prospect path) and an `invited` / `pending`
 * membership (`lib/schedule/pivot.ts` `absenceOf`), so either one counts.
 */
export function isProspect(c: { status?: string | null; membership?: string | null } | null | undefined): boolean {
  if (!c) return false;
  const status = (c.status ?? '').toLowerCase();
  const membership = (c.membership ?? '').toLowerCase();
  return status === 'prospect' || membership === 'invited' || membership === 'pending';
}

/** The Paid-by answer a new booking starts on, before the trainer picks one. */
export function defaultBilling(c: { status?: string | null; membership?: string | null } | null | undefined): Billing {
  return isProspect(c) ? 'trial' : 'pack';
}

/** The word a block on the grid carries for a session that is free on purpose. Null for the paid kinds. */
export function freeTag(b: Billing): string | null {
  return b === 'trial' ? 'Trial' : b === 'complimentary' ? 'Free' : null;
}

/** A wire `billing` read safely: anything unknown, or absent, is the default `pack`. */
export function asBilling(raw: string | null | undefined): Billing {
  return raw === 'trial' || raw === 'complimentary' || raw === 'single' ? raw : 'pack';
}

/** What a client's packs can pay for, per service. */
export interface ClientBilling {
  /** A gym client buys only the gym's packs, so cannot be sold a single session. */
  gymClient: boolean;
  /** The service a booking with no delivery mode of its own is charged as. */
  defaultService: Service;
  /** Live session packs (status active), one entry each. `start` / `end` are the pack's term, `YYYY-MM-DD` or null. */
  packs: { service: string; left: number; paused: boolean; start: string | null; end: string | null }[];
  /** The latest end date of any session pack on the wire, live or closed — "Pack ended 19 Nov". Null when none. */
  lastEnd: string | null;
  /** Pack-billed sessions still to be marked, per service. */
  bookedAhead: Partial<Record<string, number>>;
}

/** The slice of `CurrentPackage` this needs. */
export interface BillingPackWire {
  clientId: string;
  service: string;
  basis: 'sessions' | 'period';
  status: string;
  pausedAt: number | null;
  sessionsRemaining: number | null;
  sessionsBookedAhead?: number | null;
  /** 10 Nov 2026 — a single session's own sale: it pays for that session only, so it covers nothing else. */
  sessionId?: string | null;
  /** The pack's term, `YYYY-MM-DD`; Mark done charges only a pack whose term holds the session's day. */
  startDate?: string | null;
  endDate?: string | null;
}

export function billingByClient(
  packages: BillingPackWire[],
  clients: { id: string; clientType?: string | null; deliveryMode: string | null }[],
): Map<string, ClientBilling> {
  const out = new Map<string, ClientBilling>();
  for (const c of clients) {
    out.set(c.id, {
      gymClient: c.clientType === 'gym',
      defaultService: asService(c.deliveryMode),
      packs: [],
      lastEnd: null,
      bookedAhead: {},
    });
  }
  for (const p of packages) {
    const b = out.get(p.clientId);
    // A single session's sale pays only for its own session (13 Nov 2026), the server's payingPack rule.
    if (!b || p.basis !== 'sessions' || p.sessionId) continue;
    // Every pack of a client and service carries the same count (Mark done picks
    // the pack, not the booking), so any one of them is the answer.
    if (p.sessionsBookedAhead != null) b.bookedAhead[p.service] = p.sessionsBookedAhead;
    const end = p.endDate ?? null;
    if (end && (!b.lastEnd || end > b.lastEnd)) b.lastEnd = end;
    if (p.status === 'active') {
      b.packs.push({
        service: p.service,
        left: p.sessionsRemaining ?? 0,
        paused: p.pausedAt !== null,
        start: p.startDate ?? null,
        end,
      });
    }
  }
  return out;
}

function asService(mode: string | null | undefined): Service {
  return mode === 'remote' || mode === 'home_visit' ? mode : 'floor';
}

/** The service this booking is charged as: the mode the trainer picked, else the client's own. */
export function serviceOf(picked: 'floor' | 'remote' | null, b: ClientBilling | null): Service {
  return picked ?? b?.defaultService ?? 'floor';
}

export type Coverage =
  | { kind: 'covered'; after: number }
  | { kind: 'last' }
  | { kind: 'uncovered'; left: number; ahead: number }
  | { kind: 'paused' }
  | { kind: 'none' };

/** Will one more pack-billed booking be paid for when it is delivered? */
export function coverage(b: ClientBilling | null, service: Service, at?: number): Coverage {
  /* With the booking's instant, only a pack whose term holds that day can pay
     for it — Mark done's own rule — so a slot after the pack ends reads `none`. */
  const day = at === undefined ? null : dayOf(at);
  const live = (b?.packs ?? []).filter((p) => p.service === service
    && (day === null || ((p.start === null || p.start <= day) && (p.end === null || p.end >= day))));
  if (live.length === 0) return { kind: 'none' };
  const running = live.filter((p) => !p.paused);
  if (running.length === 0) return { kind: 'paused' };
  const left = running.reduce((n, p) => n + p.left, 0);
  const ahead = b?.bookedAhead[service] ?? 0;
  const free = left - ahead;
  if (free <= 0) return { kind: 'uncovered', left, ahead };
  if (free === 1) return { kind: 'last' };
  return { kind: 'covered', after: free - 1 };
}

/** `2026-11-19` for an instant, in this device's zone — the trainer's, as everywhere on the grid. */
function dayOf(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * NO PACK COVERS THIS BOOKED SESSION (25 Nov 2026, review §5 P0).
 *
 * A client whose pack lapsed kept three sessions a week on the grid, every one of
 * them headed for "Delivered · not charged", and nothing said so before the
 * session happened. This asks the server's own question of a session already in
 * the diary — `SessionStateJdbcRepository.payingPack`: a live session pack for the
 * same service whose term (start_date … end_date) holds the session's day — and
 * answers true when there is none. A PAUSED pack still counts as a pack (its own
 * line says paused); a pack with sessions left but booked over is the booking
 * panel's count, not this. Only a booked, pack-billed, uncharged session can be
 * uncovered; trial, free and single sessions say what pays for them already.
 *
 * Null `b` (packs not loaded) is never "no pack": a guess would be a false alarm
 * on every block.
 */
export function noPackCovers(
  s: { at: number; mode: 'floor' | 'remote'; billing: Billing; charged: boolean; done: boolean; dead: boolean; noShow: boolean },
  b: ClientBilling | null,
): boolean {
  if (!b || s.billing !== 'pack' || s.charged || s.done || s.dead || s.noShow) return false;
  // The session's own mode, else the client's — `home_visit` is drawn as floor on the grid.
  const service: Service = s.mode === 'remote' ? 'remote' : b.defaultService === 'home_visit' ? 'home_visit' : 'floor';
  const day = dayOf(s.at);
  return !b.packs.some((p) => p.service === service
    && (p.start === null || p.start <= day)
    && (p.end === null || p.end >= day));
}

/** The words for an uncovered session: why, when the wire says. */
export function noPackLine(s: { at: number }, b: ClientBilling | null, first: string): string {
  const day = dayOf(s.at);
  if (b?.lastEnd && b.lastEnd < day) {
    const [y, m, d] = b.lastEnd.split('-').map(Number);
    const ended = new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `${first}’s pack ended ${ended}. No pack covers this session, so it won’t be charged when you mark it done.`;
  }
  return `No pack covers this session, so it won’t be charged when you mark it done.`;
}

const SERVICE_WORD: Record<Service, string> = { floor: 'in-person', home_visit: 'home-visit', remote: 'online' };

/** The panel's one sentence about money, and whether it is a warning. */
export function coverageLine(c: Coverage, name: string, service: Service): { warn: boolean; text: string } {
  switch (c.kind) {
    case 'covered':
      return { warn: false, text: `Covered by ${name}’s pack · ${c.after} left after this one.` };
    case 'last':
      return { warn: true, text: `This is the last session ${name}’s pack covers — a good moment to talk about renewing.` };
    case 'uncovered':
      return {
        warn: true,
        text: `Not covered: ${c.left} left and ${c.ahead} already booked. This one won’t be charged unless they renew.`,
      };
    case 'paused':
      return { warn: true, text: `${name}’s pack is paused. This session won’t be charged until it’s resumed.` };
    case 'none':
      return { warn: true, text: `No ${SERVICE_WORD[service]} pack — this session won’t be charged. Book it as a trial, free or single if that is what it is.` };
  }
}

/** Why a delivered session was not charged — Mark done's `reason`. Null when it was charged. */
export function notChargedLine(reason: string | null | undefined): string | null {
  switch (reason) {
    case 'TRIAL': return 'A trial — delivered free.';
    // The chip says *Free*, so this does too (review, 26 Nov 2026) — never *Complimentary*.
    case 'COMPLIMENTARY': return 'Free — delivered, never charged.';
    case 'PACKAGE_PAUSED': return 'Not charged — their pack is paused.';
    case 'PACKAGE_EMPTY': return 'Not charged — their pack has none left.';
    case 'NO_PACKAGE': return 'Not charged — there is no running pack for it.';
    case 'SINGLE_GYM_CLIENT': return 'Not charged — a gym client can’t be sold a single session.';
    default: return null;
  }
}

/** Free on purpose: nothing to chase. */
export function isFree(reason: string | null | undefined): boolean {
  return reason === 'TRIAL' || reason === 'COMPLIMENTARY';
}

/** A price typed into the panel: whole rupees or paise, above 0. */
export function readPrice(raw: string): string | null {
  const t = raw.trim().replace(/,/g, '');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(t)) return null;
  return Number(t) > 0 ? t : null;
}
