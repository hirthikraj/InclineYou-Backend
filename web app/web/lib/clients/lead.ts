/**
 * FOLLOWING UP A PROSPECT — the vocabulary, one copy for every screen (V48, 23 Nov 2026).
 *
 * Where somebody came from, what they asked about, when to get back to them, and what they said each time. The ids are
 * the database's check constraints (`client_lead_source`, `lead_contact_channel`, `lead_contact_outcome`) and the
 * backend's `Lead.java`; the words are this half's. Pure and `server-only`-free (trap 18): the client file is
 * `'use client'` and Today's deck is built on the server, and both import this.
 *
 * Three rules the screens keep:
 *   · NOTHING SENDS. Call is `tel:` and WhatsApp is a plain `wa.me` chat from the trainer's own phone; logging a contact
 *     records what happened. It is not a nudge, so it never starts the client's 7-day quiet period.
 *   · NOT CONSENT-GATED (the owner's call). A prospect has almost never accepted an invite, and this is the enquiry's
 *     business record. The note is about the enquiry — the composer says so — and never about health.
 *   · A CONTACT MOVES THE FOLLOW-UP. The date sent with it replaces the client's; none clears it; a closing outcome
 *     ends the follow-ups.
 */

export type LeadSource =
  | 'walk_in' | 'referral' | 'instagram' | 'whatsapp' | 'phone_call' | 'google' | 'join_link' | 'gym_desk' | 'other';

/** In the order a trainer in India meets them: the gym floor and word of mouth first. */
export const LEAD_SOURCES: { id: LeadSource; label: string }[] = [
  { id: 'walk_in', label: 'Walk-in' },
  { id: 'referral', label: 'Referral' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'phone_call', label: 'Phone call' },
  { id: 'google', label: 'Google / Maps' },
  { id: 'gym_desk', label: 'Gym front desk' },
  { id: 'join_link', label: 'Join link' },
  { id: 'other', label: 'Other' },
];

export const SOURCE_DETAIL_MAX = 80;

/** What the detail field asks, per source — the words a picklist cannot hold. */
export function sourceDetailHint(source: LeadSource | null): string {
  switch (source) {
    case 'referral': return 'Who sent them? e.g. Kavya';
    case 'gym_desk': return 'Which gym?';
    case 'instagram': return 'Which post or reel, if you know';
    case 'other': return 'Where, in a few words';
    default: return 'Anything to add (optional)';
  }
}

export type LeadChannel = 'call' | 'whatsapp' | 'in_person';

export const LEAD_CHANNELS: { id: LeadChannel; label: string }[] = [
  { id: 'call', label: 'Call' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'in_person', label: 'In person' },
];

export type LeadOutcome =
  | 'interested' | 'wants_trial' | 'sent_price' | 'call_back' | 'no_answer'
  | 'too_expensive' | 'went_elsewhere' | 'timing_location' | 'not_interested';

/**
 * The outcomes, in two groups. `closes` is the four that end the follow-ups and double as the lost reason — the
 * backend's `Lead.CLOSING` and V48's `lead_contact_closing`. `days` is the follow-up the composer suggests for it.
 */
export const LEAD_OUTCOMES: { id: LeadOutcome; label: string; closes: boolean; days?: number }[] = [
  { id: 'interested', label: 'Interested', closes: false, days: 2 },
  { id: 'wants_trial', label: 'Wants a trial', closes: false, days: 1 },
  { id: 'sent_price', label: 'Sent the price', closes: false, days: 2 },
  { id: 'call_back', label: 'Call back later', closes: false, days: 3 },
  { id: 'no_answer', label: 'No answer', closes: false, days: 1 },
  { id: 'too_expensive', label: 'Too expensive', closes: true },
  { id: 'went_elsewhere', label: 'Went elsewhere', closes: true },
  { id: 'timing_location', label: 'Timing or place', closes: true },
  { id: 'not_interested', label: 'Not interested', closes: true },
];

export const NOTE_MAX = 280;

const SOURCE_LABEL = new Map(LEAD_SOURCES.map((s) => [s.id, s.label]));
const CHANNEL_LABEL = new Map(LEAD_CHANNELS.map((c) => [c.id, c.label]));
const OUTCOME = new Map(LEAD_OUTCOMES.map((o) => [o.id, o]));

export function sourceLabel(id: string | null | undefined): string | null {
  return id ? SOURCE_LABEL.get(id as LeadSource) ?? id : null;
}

export function channelLabel(id: string): string {
  return CHANNEL_LABEL.get(id as LeadChannel) ?? id;
}

export function outcomeLabel(id: string | null | undefined): string | null {
  return id ? OUTCOME.get(id as LeadOutcome)?.label ?? id : null;
}

export function closes(outcome: string | null | undefined): boolean {
  return !!outcome && !!OUTCOME.get(outcome as LeadOutcome)?.closes;
}

export function suggestedDays(outcome: LeadOutcome): number | null {
  return OUTCOME.get(outcome)?.days ?? null;
}

/** `GET /v1/clients[/{id}]`'s `lead`. The server omits nulls, so every field may be absent. */
export interface LeadWire {
  source?: string | null;
  sourceDetail?: string | null;
  interestedPackId?: string | null;
  interestedPackName?: string | null;
  /** ISO date in the workspace calendar. */
  nextFollowUpOn?: string | null;
  lastContactAt?: number | null;
  lastOutcome?: string | null;
}

/** `GET /v1/clients/{id}/lead-contacts`, one row. */
export interface LeadContactWire {
  id: string;
  channel: LeadChannel;
  outcome: LeadOutcome;
  note?: string | null;
  followUpOn?: string | null;
  createdAt: number;
}

/* ── dates ─────────────────────────────────────────────────────────────────
 * The follow-up is a DATE in the workspace's calendar (IST, the one zone v1 ships), compared as `YYYY-MM-DD` strings so
 * no instant ever crosses midnight on the way. */

export function todayIso(now: number): string {
  return new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b`, both ISO dates. */
export function daysFromTo(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export type FollowUpState =
  | { kind: 'none' }
  | { kind: 'late'; days: number }
  | { kind: 'today' }
  | { kind: 'ahead'; days: number };

export function followUpState(on: string | null | undefined, now: number): FollowUpState {
  if (!on) return { kind: 'none' };
  const d = daysFromTo(todayIso(now), on);
  if (d < 0) return { kind: 'late', days: -d };
  if (d === 0) return { kind: 'today' };
  return { kind: 'ahead', days: d };
}

/** True when the follow-up is today or has passed — what puts a row on Today. */
export function followUpDue(on: string | null | undefined, now: number): boolean {
  const s = followUpState(on, now);
  return s.kind === 'today' || s.kind === 'late';
}

/** `Follow up today` · `Follow-up 3 days late` · `Follow up tomorrow` · `Follow up Fri 28 Nov`. */
export function followUpPhrase(on: string | null | undefined, now: number): string {
  const s = followUpState(on, now);
  switch (s.kind) {
    case 'none': return 'No follow-up set';
    case 'today': return 'Follow up today';
    case 'late': return `Follow-up ${s.days} day${s.days === 1 ? '' : 's'} late`;
    case 'ahead':
      if (s.days === 1) return 'Follow up tomorrow';
      return `Follow up ${shortDay(on as string)}`;
  }
}

/** `Fri 28 Nov`, from an ISO date, without a timezone round trip. */
export function shortDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

/** The one line Today and the roster print under a due follow-up: when, where from, what they asked about. */
export function followUpLine(lead: LeadWire, now: number): string {
  const s = followUpState(lead.nextFollowUpOn, now);
  const when = s.kind === 'late' ? `${s.days} day${s.days === 1 ? '' : 's'} late` : 'due today';
  const bits = [`Follow-up ${when}`];
  if (lead.lastOutcome) bits.push(`last: ${outcomeLabel(lead.lastOutcome)?.toLowerCase()}`);
  else if (lead.source) bits.push(`from ${sourceLabel(lead.source)}`);
  if (lead.interestedPackName) bits.push(`asked about ${lead.interestedPackName}`);
  return bits.join(' · ');
}
