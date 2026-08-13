/**
 * Nudges — screens 4d and 4e, derived from the rules and the book.
 *
 * Everfit and Trainerize both automate messages on triggers. This file takes the
 * triggers and refuses the default: **every rule starts on "Ask me first."**
 * Train X drafts the message and queues it, and nothing leaves the trainer's
 * WhatsApp until they tap send — because one badly timed automated nudge costs a
 * client, and that is more expensive than any time the automation saves.
 *
 * Two limits below are constants and not settings, and that is the point:
 *
 *   · `SEND_FROM_HOUR` / `SEND_TO_HOUR` — nudges only go out between 9am and 8pm
 *   · `COOLDOWN_DAYS` — never twice in seven days to the same person
 *
 * Both are stated on the rule editor. A limit with a text field beside it is not
 * a limit, and these two exist to protect the trainer from themselves.
 *
 * The waiting list is DERIVED, not stored. There is no queue table: a draft is
 * what the rule says about the data right now, so a client who trained this
 * morning drops off the list without anything having to clean up after them.
 * A stored queue would eventually hold a reminder to chase a debt that was
 * settled on Tuesday, and sending that is worse than sending nothing.
 */

import { DAY_MS, daysBetween, startOfDay } from '../home/time';
import type { RuleAction, RuleKind } from '../db/nudges';

export type { RuleAction, RuleKind };

/* --------------------------------------------------------------- the limits */

/** 9am. Before this a trainer's message is an alarm clock. */
export const SEND_FROM_HOUR = 9;
/** 8pm. After this it is an intrusion. */
export const SEND_TO_HOUR = 20;
/** Never twice in this many days to the same person, whatever the rules say. */
export const COOLDOWN_DAYS = 7;

export function withinSendWindow(now: number): boolean {
  const hour = new Date(now).getHours();
  return hour >= SEND_FROM_HOUR && hour < SEND_TO_HOUR;
}

/* -------------------------------------------------------------------- input */

export interface RuleRow {
  id: string;
  kind: string;
  threshold: number | null;
  action: string;
  message: string | null;
  enabled: boolean;
  orderIndex: number;
}

export interface NudgeClient {
  id: string;
  name: string;
  phone?: string | null;
  status: string;
}

export interface NudgeSession {
  clientId: string;
  scheduledAt: Date | number;
  status: string;
}

export interface NudgePackage {
  clientId: string;
  sessionsRemaining?: number | null;
  amount: number;
  status: string;
  dueDate?: string | null;
  writtenOffAt?: Date | number | null;
}

export interface NudgePayment {
  clientId: string;
  packageId?: string | null;
  amount: number;
  status: string;
  paidAt?: Date | number | null;
}

export interface NudgeSet {
  workoutSessionId: string;
  exerciseId: string;
  loadKg?: number | null;
  reps?: number | null;
}

export interface NudgeLogRow {
  id: string;
  clientId: string;
  channel: string;
  templateName?: string | null;
  status: string;
  sentAt: Date | number;
}

export interface NudgeInput {
  rules: RuleRow[];
  clients: NudgeClient[];
  sessions: NudgeSession[];
  packages: NudgePackage[];
  payments: NudgePayment[];
  logs: NudgeLogRow[];
}

export const EMPTY_NUDGE_INPUT: NudgeInput = {
  rules: [],
  clients: [],
  sessions: [],
  packages: [],
  payments: [],
  logs: [],
};

function ms(value: Date | number | null | undefined): number {
  if (value == null) return 0;
  return value instanceof Date ? value.getTime() : value;
}

const DONE = new Set(['done', 'completed']);
const PAID = new Set(['paid', 'confirmed', 'completed', 'success']);
const DEAD_PACKAGE = new Set(['cancelled', 'canceled', 'refunded', 'expired']);

/* ------------------------------------------------------------- rule shapes */

export interface RuleMeta {
  kind: RuleKind;
  title: string;
  /** Threshold options offered by the editor. Empty when the rule has no threshold. */
  options: number[];
  /** "days" or "sessions" — what the number means, in the editor and on the pill. */
  unit: 'days' | 'sessions' | null;
  /** The condition, written out. */
  when: (threshold: number | null) => string;
  /** The wording used when the trainer hasn't written their own. */
  message: string;
  /** Variables this rule can substitute. Shown as chips under the message box. */
  variables: string[];
}

export const RULE_META: Record<RuleKind, RuleMeta> = {
  quiet: {
    kind: 'quiet',
    title: 'Gone quiet',
    options: [5, 7, 10, 14],
    unit: 'days',
    when: (t) => `No workout in ${t ?? 7} days`,
    message:
      "Hi {name}, haven't seen you log since {lastdate}. Everything alright? Want me to move your sessions this week?",
    variables: ['{name}', '{lastdate}', '{days}'],
  },
  pack_low: {
    kind: 'pack_low',
    title: 'Pack running out',
    options: [1, 2, 3, 5],
    unit: 'sessions',
    when: (t) => `${t ?? 2} session${(t ?? 2) === 1 ? '' : 's'} left`,
    message:
      'Hi {name}, you have {left} sessions left on your pack. Want me to set up the next one so we keep the same slots?',
    variables: ['{name}', '{left}'],
  },
  overdue: {
    kind: 'overdue',
    title: 'Payment overdue',
    options: [1, 3, 7, 14],
    unit: 'days',
    when: (t) => `${t ?? 3} day${(t ?? 3) === 1 ? '' : 's'} past due`,
    message:
      'Hi {name}, a gentle reminder that {amount} is pending from {days} days ago. You can pay by UPI or cash whenever suits.',
    variables: ['{name}', '{amount}', '{days}'],
  },
  well_done: {
    kind: 'well_done',
    title: 'Well done',
    options: [],
    unit: null,
    when: () => 'New personal record',
    message: 'That was a personal best today, {name}. Properly strong work.',
    variables: ['{name}'],
  },
  birthday: {
    kind: 'birthday',
    title: 'Birthday',
    options: [],
    unit: null,
    when: () => 'On the day',
    message: 'Happy birthday, {name}! Have a good one — back on the floor tomorrow.',
    variables: ['{name}'],
  },
};

export const RULE_ACTIONS: { key: RuleAction; title: string; meta: string }[] = [
  { key: 'ask', title: 'Ask me first', meta: 'Queue it for one tap' },
  { key: 'auto', title: 'Send it for me', meta: 'Straight to WhatsApp' },
];

export function isRuleKind(value: string): value is RuleKind {
  return value in RULE_META;
}

/* --------------------------------------------------------- 4d · the rules */

export interface RuleCard {
  id: string;
  kind: RuleKind;
  title: string;
  when: string;
  then: string;
  /** "Waiting on 3 · Arjun, Meenakshi, Bharat", or what went out this month. */
  note: string | null;
  enabled: boolean;
  threshold: number | null;
  action: RuleAction;
  message: string | null;
}

export interface Draft {
  key: string;
  ruleId: string;
  kind: RuleKind;
  clientId: string;
  clientName: string;
  phone: string | null;
  /** The message, with every variable already substituted. */
  text: string;
  /** Why this one is here. "11 days since the last workout". */
  reason: string;
  /** False when the cooldown or the send window says not yet. */
  sendable: boolean;
  /** Present only when it isn't sendable, and says which limit stopped it. */
  held: string | null;
}

export interface NudgesView {
  subtitle: string;
  rules: RuleCard[];
  waiting: Draft[];
  sent: SentEntry[];
  empty: boolean;
}

export interface SentEntry {
  id: string;
  clientId: string;
  clientName: string;
  what: string;
  when: string;
  channel: string;
  status: string;
}

export function buildNudges(input: NudgeInput, now: number): NudgesView {
  const waiting = buildWaiting(input, now);
  const perRule = new Map<string, Draft[]>();
  waiting.forEach((d) => {
    const list = perRule.get(d.ruleId) ?? [];
    list.push(d);
    perRule.set(d.ruleId, list);
  });

  const sentThisMonth = countSentThisMonth(input.logs, now);

  const rules = [...input.rules]
    .filter((r) => isRuleKind(r.kind))
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map<RuleCard>((rule) => {
      const meta = RULE_META[rule.kind as RuleKind];
      const action: RuleAction = rule.action === 'auto' ? 'auto' : 'ask';
      const drafts = perRule.get(rule.id) ?? [];

      return {
        id: rule.id,
        kind: rule.kind as RuleKind,
        title: meta.title,
        when: meta.when(rule.threshold),
        then: action === 'auto' ? 'Send it for me' : 'Ask me first',
        note: ruleNote(rule.kind as RuleKind, drafts, sentThisMonth),
        enabled: rule.enabled,
        threshold: rule.threshold,
        action,
        message: rule.message,
      };
    });

  const on = rules.filter((r) => r.enabled).length;
  return {
    subtitle: `${on} rule${on === 1 ? '' : 's'} on · ${waiting.length} waiting`,
    rules,
    waiting,
    sent: buildSent(input, now),
    empty: rules.length === 0,
  };
}

function ruleNote(kind: RuleKind, drafts: Draft[], sentThisMonth: Map<string, number>): string | null {
  if (drafts.length) {
    const names = drafts.slice(0, 3).map((d) => firstName(d.clientName));
    const more = drafts.length > names.length ? ` +${drafts.length - names.length}` : '';
    return `Waiting on ${drafts.length} · ${names.join(', ')}${more}`;
  }
  const sent = sentThisMonth.get(kind) ?? 0;
  return sent ? `Sent ${sent} this month` : null;
}

/* ------------------------------------------------------- the waiting list */

/**
 * Every draft the enabled rules produce right now.
 *
 * Two rules are not evaluated here and their absence is deliberate:
 *
 *   · **`well_done`** fires on a personal record, which is an event and not a
 *     state. There is no "is currently a PR" to test — the workout screen is
 *     where a PR is recognised, at the moment it happens. Listing it here would
 *     mean re-drafting the same congratulation every time the screen opened.
 *   · **`birthday`** needs a date of birth, and this app does not collect one.
 *     The rule ships off and the editor says why rather than pretending.
 */
export function buildWaiting(input: NudgeInput, now: number): Draft[] {
  const drafts: Draft[] = [];
  const clients = new Map(input.clients.map((c) => [c.id, c] as const));
  const lastNudge = lastNudgePerClient(input.logs);

  const enabled = input.rules.filter((r) => r.enabled && isRuleKind(r.kind));

  enabled.forEach((rule) => {
    const kind = rule.kind as RuleKind;
    if (kind === 'quiet') quietDrafts(rule, input, clients, now, drafts);
    if (kind === 'pack_low') packDrafts(rule, input, clients, drafts);
    if (kind === 'overdue') overdueDrafts(rule, input, clients, now, drafts);
  });

  // One person, one message. If a client is quiet AND owes money, the quiet
  // message is the one that goes — the relationship is the thing to fix first,
  // and two messages in a morning from the same trainer reads as pestering.
  const seen = new Set<string>();
  const unique = drafts.filter((d) => {
    if (seen.has(d.clientId)) return false;
    seen.add(d.clientId);
    return true;
  });

  return unique.map((draft) => {
    const last = lastNudge.get(draft.clientId);
    const sinceLast = last ? daysBetween(last, now) : Infinity;

    if (sinceLast < COOLDOWN_DAYS) {
      const wait = COOLDOWN_DAYS - sinceLast;
      return {
        ...draft,
        sendable: false,
        held: `Messaged ${sinceLast === 0 ? 'today' : `${sinceLast}d ago`} — free in ${wait}d`,
      };
    }
    if (!withinSendWindow(now)) {
      return { ...draft, sendable: false, held: `Outside ${SEND_FROM_HOUR}am–${SEND_TO_HOUR - 12}pm` };
    }
    return { ...draft, sendable: true, held: null };
  });
}

function quietDrafts(
  rule: RuleRow,
  input: NudgeInput,
  clients: Map<string, NudgeClient>,
  now: number,
  out: Draft[],
) {
  const threshold = rule.threshold ?? 7;
  const lastTrained = new Map<string, number>();
  input.sessions.forEach((s) => {
    if (!DONE.has(s.status.toLowerCase())) return;
    const at = ms(s.scheduledAt);
    if (at > (lastTrained.get(s.clientId) ?? 0)) lastTrained.set(s.clientId, at);
  });

  clients.forEach((client) => {
    const status = client.status.toLowerCase();
    // A paused client asked for the silence. Chasing them is the fastest way to
    // turn a pause into a cancellation.
    if (status !== 'active' && status !== 'trial') return;

    const last = lastTrained.get(client.id);
    if (!last) return; // Never trained at all — that is an onboarding problem, not a nudge.
    const days = daysBetween(last, now);
    if (days < threshold) return;

    out.push({
      key: `quiet:${client.id}`,
      ruleId: rule.id,
      kind: 'quiet',
      clientId: client.id,
      clientName: client.name,
      phone: client.phone ?? null,
      text: renderMessage(rule.message ?? RULE_META.quiet.message, {
        name: firstName(client.name),
        lastdate: stamp(last),
        days: String(days),
      }),
      reason: `${days} days since the last session`,
      sendable: true,
      held: null,
    });
  });
}

function packDrafts(
  rule: RuleRow,
  input: NudgeInput,
  clients: Map<string, NudgeClient>,
  out: Draft[],
) {
  const threshold = rule.threshold ?? 2;

  input.packages.forEach((pkg) => {
    if (DEAD_PACKAGE.has(pkg.status.toLowerCase())) return;
    const left = pkg.sessionsRemaining;
    // A monthly plan has no session count, so it can't run out of sessions.
    if (left == null || left > threshold || left < 0) return;

    const client = clients.get(pkg.clientId);
    if (!client) return;

    out.push({
      key: `pack_low:${pkg.clientId}`,
      ruleId: rule.id,
      kind: 'pack_low',
      clientId: client.id,
      clientName: client.name,
      phone: client.phone ?? null,
      text: renderMessage(rule.message ?? RULE_META.pack_low.message, {
        name: firstName(client.name),
        left: String(left),
      }),
      reason: left === 0 ? 'Pack finished' : `${left} session${left === 1 ? '' : 's'} left`,
      sendable: true,
      held: null,
    });
  });
}

function overdueDrafts(
  rule: RuleRow,
  input: NudgeInput,
  clients: Map<string, NudgeClient>,
  now: number,
  out: Draft[],
) {
  const threshold = rule.threshold ?? 3;
  const paidPerClient = new Map<string, number>();
  input.payments.forEach((p) => {
    if (!PAID.has(p.status.toLowerCase())) return;
    paidPerClient.set(p.clientId, (paidPerClient.get(p.clientId) ?? 0) + p.amount);
  });

  const owedPerClient = new Map<string, { amount: number; since: number }>();
  input.packages.forEach((pkg) => {
    if (DEAD_PACKAGE.has(pkg.status.toLowerCase())) return;
    // Written off is not owed. That was the trainer's decision, and chasing it
    // afterwards is the app arguing with them.
    if (pkg.writtenOffAt) return;
    if (!pkg.dueDate) return;

    const due = Date.parse(`${pkg.dueDate}T00:00:00`);
    if (!Number.isFinite(due)) return;
    const late = daysBetween(due, now);
    if (late < threshold) return;

    const entry = owedPerClient.get(pkg.clientId) ?? { amount: 0, since: due };
    entry.amount += pkg.amount;
    entry.since = Math.min(entry.since, due);
    owedPerClient.set(pkg.clientId, entry);
  });

  owedPerClient.forEach((owed, clientId) => {
    const client = clients.get(clientId);
    if (!client) return;
    const outstanding = owed.amount - (paidPerClient.get(clientId) ?? 0);
    if (outstanding <= 0) return;

    const days = daysBetween(owed.since, now);
    out.push({
      key: `overdue:${clientId}`,
      ruleId: rule.id,
      kind: 'overdue',
      clientId,
      clientName: client.name,
      phone: client.phone ?? null,
      text: renderMessage(rule.message ?? RULE_META.overdue.message, {
        name: firstName(client.name),
        amount: `₹${Math.round(outstanding).toLocaleString('en-IN')}`,
        days: String(days),
      }),
      reason: `₹${Math.round(outstanding).toLocaleString('en-IN')} · ${days} days late`,
      sendable: true,
      held: null,
    });
  });
}

/* ------------------------------------------------------------------- sent */

function buildSent(input: NudgeInput, now: number): SentEntry[] {
  const names = new Map(input.clients.map((c) => [c.id, c.name] as const));
  return [...input.logs]
    .sort((a, b) => ms(b.sentAt) - ms(a.sentAt))
    .slice(0, 40)
    .map((log) => ({
      id: log.id,
      clientId: log.clientId,
      clientName: names.get(log.clientId) ?? 'A client',
      what: prettyTemplate(log.templateName),
      when: relativeDay(ms(log.sentAt), now),
      channel: log.channel || 'whatsapp',
      status: log.status,
    }));
}

function countSentThisMonth(logs: NudgeLogRow[], now: number): Map<string, number> {
  const d = new Date(now);
  const from = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const out = new Map<string, number>();
  logs.forEach((log) => {
    if (ms(log.sentAt) < from) return;
    const kind = (log.templateName ?? '').toLowerCase();
    const match = (Object.keys(RULE_META) as RuleKind[]).find((k) => kind.includes(k));
    if (match) out.set(match, (out.get(match) ?? 0) + 1);
  });
  return out;
}

function lastNudgePerClient(logs: NudgeLogRow[]): Map<string, number> {
  const out = new Map<string, number>();
  logs.forEach((log) => {
    const at = ms(log.sentAt);
    if (at > (out.get(log.clientId) ?? 0)) out.set(log.clientId, at);
  });
  return out;
}

/* ------------------------------------------------------------------ words */

/**
 * Substitutes `{name}`-style variables.
 *
 * An unknown variable is left in place rather than blanked. A message reading
 * "you have {left} sessions" is obviously a bug; one reading "you have
 * sessions" is a bug that gets sent to a client.
 */
export function renderMessage(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => vars[key] ?? whole);
}

/** WhatsApp's own scheme. The app never sends — it opens the conversation. */
export function whatsappUri(phone: string | null, text: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(text)}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function stamp(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function relativeDay(at: number, now: number): string {
  const days = daysBetween(at, now);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return stamp(at);
}

function prettyTemplate(name: string | null | undefined): string {
  if (!name) return 'A message';
  const kind = (Object.keys(RULE_META) as RuleKind[]).find((k) => name.toLowerCase().includes(k));
  if (kind) return RULE_META[kind].title;
  return name.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export { DAY_MS, startOfDay };
