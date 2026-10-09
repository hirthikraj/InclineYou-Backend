/**
 * THE PRICE LIST'S TWO VOCABULARIES, AND THE ONE PLACE THEY MEET.
 *
 * v1 describes a pack by `service` (where it is delivered) and `basis` (what it
 * is counted in): a block of **sessions**, or a **period** of time. The setup
 * flow and the phone still speak the older three-way `type` — *session pack ·
 * monthly · single session* (R24) — because that is how a trainer says it out
 * loud. `POST /v1/packs` refuses `type` now, so the two are translated HERE, at
 * the edge, and nowhere inside a screen: a screen holds one vocabulary or the
 * other, never a mixture.
 *
 * Client-safe: no `server-only`, so a form and a server action can both import it.
 */
export type PackType = 'session_pack' | 'monthly' | 'single';

export type PackService = 'floor' | 'home_visit' | 'remote' | 'programming';
export type PackBasis = 'sessions' | 'period';

export const SERVICES: { id: PackService; label: string; note: string }[] = [
  { id: 'floor', label: 'In person', note: 'On a gym floor or studio' },
  { id: 'home_visit', label: 'Home visit', note: 'You go to the client' },
  { id: 'remote', label: 'Online', note: 'Video sessions' },
  { id: 'programming', label: 'Programming only', note: 'A plan, no sessions — a period pack' },
];

export function serviceLabel(service: PackService): string {
  return SERVICES.find((s) => s.id === service)?.label ?? service;
}

/** What a monthly fee is valid for when the trainer did not say. */
export const MONTH_DAYS = 30;

/** The wire half of a pack's terms: what `POST` and `PATCH` take for them. */
export interface PackTerms {
  service: PackService;
  basis: PackBasis;
  sessions: number | null;
  validityDays: number | null;
}

/**
 * The old three-way answer, as terms. In person unless the caller says
 * otherwise: the old `type` had no service, and the floor is what every pack
 * written under it meant.
 */
export function termsFromType(
  type: PackType,
  sessions: number | null,
  validityDays: number | null,
  service: PackService = 'floor',
): PackTerms {
  if (type === 'monthly') {
    return { service, basis: 'period', sessions: null, validityDays: validityDays ?? MONTH_DAYS };
  }
  return { service, basis: 'sessions', sessions: type === 'single' ? 1 : sessions, validityDays };
}

/** And back: a period pack is the monthly fee, a one-session block is the single. */
export function typeFromTerms(terms: Pick<PackTerms, 'basis' | 'sessions'>): PackType {
  if (terms.basis === 'period') return 'monthly';
  return terms.sessions === 1 ? 'single' : 'session_pack';
}

/** A length of time in the words a trainer says it in: 30 → *1 month*, 84 → *12 weeks*. */
export function periodLabel(days: number): string {
  if (days % 30 === 0) {
    const m = days / 30;
    return m === 1 ? '1 month' : `${m} months`;
  }
  if (days % 7 === 0) return `${days / 7} weeks`;
  return `${days} days`;
}

/** The lengths a period pack is usually sold for. */
export const PERIOD_CHOICES: { days: number; label: string }[] = [
  { days: 30, label: '1 month' },
  { days: 60, label: '2 months' },
  { days: 84, label: '12 weeks' },
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
];

/** How long a block of sessions is usually good for; `null` is no expiry. */
export const VALIDITY_CHOICES: { days: number | null; label: string }[] = [
  { days: null, label: 'No expiry' },
  { days: 30, label: '30 days' },
  { days: 60, label: '60 days' },
  { days: 90, label: '90 days' },
  { days: 120, label: '120 days' },
];

/** What a new price list can start from. Terms only: the price is the trainer's to say. */
export const PRESETS: { id: string; title: string; note: string; terms: Omit<PackTerms, 'validityDays'> & { validityDays: number | null } }[] = [
  { id: 'twelve', title: '12 sessions', note: 'In person · valid 60 days', terms: { service: 'floor', basis: 'sessions', sessions: 12, validityDays: 60 } },
  { id: 'monthly', title: 'Monthly', note: 'In person · unlimited for a month', terms: { service: 'floor', basis: 'period', sessions: null, validityDays: 30 } },
  { id: 'single', title: 'Single session', note: 'In person · pay as you go', terms: { service: 'floor', basis: 'sessions', sessions: 1, validityDays: null } },
];
