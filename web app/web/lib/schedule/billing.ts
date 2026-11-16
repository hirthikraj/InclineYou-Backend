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

/** What a client's packs can pay for, per service. */
export interface ClientBilling {
  /** A gym client buys only the gym's packs, so cannot be sold a single session. */
  gymClient: boolean;
  /** The service a booking with no delivery mode of its own is charged as. */
  defaultService: Service;
  /** Live session packs (status active), one entry each. */
  packs: { service: string; left: number; paused: boolean }[];
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
    if (p.status === 'active') {
      b.packs.push({ service: p.service, left: p.sessionsRemaining ?? 0, paused: p.pausedAt !== null });
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
export function coverage(b: ClientBilling | null, service: Service): Coverage {
  const live = (b?.packs ?? []).filter((p) => p.service === service);
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
    case 'COMPLIMENTARY': return 'Complimentary — delivered free.';
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
