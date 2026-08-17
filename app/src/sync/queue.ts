/**
 * 8a–8c · The sync queue, in words a trainer can act on.
 *
 * Every "Queued" tag in the app is a promise that somewhere there is a screen
 * saying **what** is waiting. This builds that screen's content, and the whole
 * design brief for it is one sentence: a trainer who has just recorded ₹3,000
 * on a gym floor with no signal needs to see ₹3,000 in a list, not "1 change in
 * `payments`".
 *
 * ── Read from the push, never from a log of our own ───────────────────────
 *
 * The rows come from `pendingChanges`, which reads WatermelonDB's own dirty
 * state — the same function the push is built from. An outbox table written
 * alongside the writes would eventually disagree with what actually goes out,
 * and a queue screen that disagrees with the queue is worse than no screen.
 *
 * ── What a row is allowed to claim ────────────────────────────────────────
 *
 * Only what is on the raw row itself, plus names looked up by id. A delete
 * carries nothing but an id, so it says "Removed" and stops. Anything we cannot
 * read honestly is left off rather than guessed at, which is the same rule the
 * reports screen keeps.
 *
 * ── Grouped by what the trainer would lose ────────────────────────────────
 *
 * Not by table, and not alphabetically. Money first, because a recorded payment
 * is the one queued write whose loss ends the relationship — the same reason
 * sign-out blocks on unsynced writes. Then the day's sessions, then the floor
 * log, then everything that is really settings.
 */

import { relativePast, rupees } from '../home/time';
import type { PendingAction, PendingChange } from '../db/pending';
import type { SyncPhase } from '../db/sync';

export type QueueKind = 'money' | 'sessions' | 'training' | 'clients' | 'plans' | 'setup';

export interface QueueRow {
  /** Table and id — stable across rebuilds, unique inside a queue. */
  key: string;
  title: string;
  /** The second line. Empty string when there is nothing honest to add. */
  line: string;
  action: PendingAction;
  /** `updated_at`, for newest-first inside a group. 0 when unreadable. */
  at: number;
}

export interface QueueGroup {
  kind: QueueKind;
  label: string;
  /** Why this group is worth its own heading — shown under the label. */
  note: string;
  rows: QueueRow[];
}

export interface QueueView {
  groups: QueueGroup[];
  total: number;
  /** The app bar's subtitle. */
  subtitle: string;
  /**
   * Why it has not gone out yet, or null when nothing is waiting.
   *
   * Three honest answers and no fourth: the last attempt failed and here is
   * what it said, a sync is running right now, or nothing is wrong and the next
   * window will carry it.
   */
  reason: string | null;
  /** True when the last attempt failed — 8c. The screen colours on this. */
  failed: boolean;
}

export interface QueueState {
  phase: SyncPhase;
  lastSyncedAt: number | null;
  error: string | null;
}

/** Names by id, so a row can say "Ravi Kannan" instead of a uuid. */
export interface QueueNames {
  clients: Map<string, string>;
  exercises: Map<string, string>;
}

export const NO_NAMES: QueueNames = { clients: new Map(), exercises: new Map() };

const GROUPS: { kind: QueueKind; label: string; note: string; tables: string[] }[] = [
  {
    kind: 'money',
    label: 'Money',
    note: 'Recorded on this phone. Nothing here is lost — it goes out on the next connection.',
    tables: ['payments', 'packages', 'packs', 'gym_settlements'],
  },
  {
    kind: 'sessions',
    label: 'Sessions',
    note: 'Bookings, moves and the ones you marked done.',
    tables: ['scheduled_sessions', 'time_blocks', 'batches'],
  },
  {
    kind: 'training',
    label: 'The floor log',
    note: 'Sets logged during a session. These are written offline by design.',
    tables: ['workout_sessions', 'workout_exercises', 'set_logs'],
  },
  {
    kind: 'clients',
    label: 'Clients',
    note: 'Intake, edits and body metrics.',
    tables: ['clients', 'body_metrics'],
  },
  {
    kind: 'plans',
    label: 'Plans',
    note: 'Programs, templates and your exercise library.',
    tables: ['programs', 'program_exercises', 'templates', 'exercises', 'exercise_favourites'],
  },
  {
    kind: 'setup',
    label: 'Settings',
    note: 'Working hours, nudge rules and your own details.',
    tables: ['working_hours', 'nudge_rules', 'nudge_logs', 'coaches'],
  },
];

/** Anything not named above still has to appear — it is a real queued write. */
const FALLBACK: QueueKind = 'setup';

const KIND_OF: Map<string, QueueKind> = new Map(
  GROUPS.flatMap((g) => g.tables.map((t) => [t, g.kind] as [string, QueueKind])),
);

export function buildQueue(
  changes: PendingChange[],
  names: QueueNames,
  state: QueueState,
  now: number,
): QueueView {
  const buckets = new Map<QueueKind, QueueRow[]>();

  for (const change of changes) {
    const kind = KIND_OF.get(change.table) ?? FALLBACK;
    const rows = buckets.get(kind) ?? [];
    rows.push(describe(change, names, now));
    buckets.set(kind, rows);
  }

  const groups: QueueGroup[] = [];
  for (const group of GROUPS) {
    const rows = buckets.get(group.kind);
    if (!rows || rows.length === 0) continue;
    rows.sort((a, b) => b.at - a.at);
    groups.push({ kind: group.kind, label: group.label, note: group.note, rows });
  }

  const total = changes.length;

  return {
    groups,
    total,
    subtitle: subtitle(total, state, now),
    reason: reason(total, state),
    failed: total > 0 && state.phase === 'error',
  };
}

function subtitle(total: number, state: QueueState, now: number): string {
  if (total === 0) {
    if (state.lastSyncedAt === null) return 'Nothing has been written on this phone yet';
    return `Everything is on the server · ${relativePast(state.lastSyncedAt, now).toLowerCase()}`;
  }
  return `${total} change${total === 1 ? '' : 's'} waiting`;
}

/**
 * The "why" half of "what is waiting and why".
 *
 * The server's own words are used when there are any. A trainer who is told
 * "sync failed" learns nothing; one who is told the request timed out knows to
 * walk outside, and one who is told a row was refused knows to call support.
 */
function reason(total: number, state: QueueState): string | null {
  if (total === 0) return null;
  if (state.phase === 'syncing') return 'Going out now.';
  if (state.phase === 'error' && state.error) {
    return `The last attempt did not get through — ${state.error}. Everything below is still on this phone, and the next attempt carries it.`;
  }
  if (state.phase === 'error') {
    return 'The last attempt did not get through. Everything below is still on this phone, and the next attempt carries it.';
  }
  return 'Waiting for a connection. Nothing below needs you to do anything — it goes out on its own.';
}

/* ---------------------------------------------------------------- one row */

function describe(change: PendingChange, names: QueueNames, now: number): QueueRow {
  const key = `${change.table}:${change.id}`;
  const at = num(change.raw, 'updated_at') ?? num(change.raw, 'created_at') ?? 0;
  const when = at > 0 ? relativePast(at, now) : '';

  if (change.action === 'deleted') {
    return { key, title: removedLabel(change.table), line: '', action: 'deleted', at };
  }

  const { title, line } = label(change, names);
  return {
    key,
    title,
    line: [line, when].filter(Boolean).join(' · '),
    action: change.action,
    at,
  };
}

function label(change: PendingChange, names: QueueNames): { title: string; line: string } {
  const raw = change.raw;
  const client = who(raw, names);

  switch (change.table) {
    case 'payments': {
      const amount = num(raw, 'amount');
      const method = str(raw, 'method');
      return {
        title: amount === null ? 'A payment' : `${rupees(amount)}${client ? ` from ${client}` : ''}`,
        line: method ? methodLabel(method) : 'Payment',
      };
    }
    case 'packages': {
      const total = num(raw, 'sessions_total');
      return {
        title: client ? `Pack for ${client}` : 'A pack',
        line: total ? `${total} sessions` : 'Sold',
      };
    }
    case 'packs':
      return { title: str(raw, 'name') ?? 'Price list entry', line: 'Your price list' };
    case 'gym_settlements':
      return { title: "The gym's cut", line: 'Settlement' };

    case 'scheduled_sessions': {
      const status = str(raw, 'status')?.toLowerCase();
      const at = num(raw, 'scheduled_at');
      return {
        title: `${sessionVerb(status, change.action)}${client ? ` · ${client}` : ''}`,
        line: at ? sessionWhen(at) : '',
      };
    }
    case 'time_blocks':
      return { title: str(raw, 'reason') ?? 'Time blocked out', line: 'Your diary' };
    case 'batches':
      return { title: str(raw, 'name') ?? 'A batch', line: 'Group session' };

    case 'workout_sessions':
      return { title: client ? `Workout · ${client}` : 'A workout', line: 'Logged on this phone' };
    case 'workout_exercises': {
      const exercise = names.exercises.get(str(raw, 'exercise_id') ?? '');
      return { title: exercise ?? 'An exercise', line: 'Added to a workout' };
    }
    case 'set_logs': {
      const load = num(raw, 'load_kg');
      const reps = num(raw, 'reps');
      const exercise = names.exercises.get(str(raw, 'exercise_id') ?? '');
      const set = num(raw, 'set_number');
      return {
        title: exercise ? `${exercise}` : 'A set',
        line:
          load !== null && reps !== null
            ? `Set ${set ?? ''} · ${load} kg × ${reps}`.replace('  ', ' ')
            : 'Set logged',
      };
    }

    case 'clients':
      return {
        title: str(raw, 'name') ?? 'A client',
        line: change.action === 'created' ? 'Added' : 'Edited',
      };
    case 'body_metrics': {
      const value = num(raw, 'value');
      const unit = str(raw, 'unit');
      const type = str(raw, 'metric_type');
      return {
        title: client ? `${type ?? 'Metric'} · ${client}` : (type ?? 'A measurement'),
        line: value === null ? 'Recorded' : `${value}${unit ? ` ${unit}` : ''}`,
      };
    }

    case 'programs':
      return {
        title: str(raw, 'name') ?? 'A program',
        line: client ? `On ${client}` : 'Assigned plan',
      };
    case 'program_exercises':
      return {
        title: names.exercises.get(str(raw, 'exercise_id') ?? '') ?? 'An exercise',
        line: 'Changed in a plan',
      };
    case 'templates':
      return { title: str(raw, 'name') ?? 'A template', line: 'Your program shelf' };
    case 'exercises':
      return { title: str(raw, 'name') ?? 'An exercise', line: 'Your exercise library' };
    case 'exercise_favourites':
      return {
        title: names.exercises.get(str(raw, 'exercise_id') ?? '') ?? 'An exercise',
        line: 'Starred',
      };

    case 'working_hours':
      return { title: 'Working hours', line: 'Your week' };
    case 'nudge_rules':
      return { title: str(raw, 'name') ?? 'A nudge rule', line: 'Turned on or off' };
    case 'nudge_logs':
      return { title: client ? `Nudge · ${client}` : 'A nudge', line: 'Marked as sent' };
    case 'coaches':
      return { title: str(raw, 'name') ?? 'Your profile', line: 'Your details' };

    default:
      return { title: humanTable(change.table), line: change.action === 'created' ? 'Added' : 'Edited' };
  }
}

/**
 * A session's queued write, said as the thing the trainer did.
 *
 * `status` is what the row is now, which is what they last tapped — a session
 * that went from scheduled to completed is "Marked done", and one that arrived
 * as a create is "Booked".
 */
function sessionVerb(status: string | undefined, action: PendingAction): string {
  switch (status) {
    case 'completed':
      return 'Marked done';
    case 'no_show':
    case 'noshow':
      return 'Marked no-show';
    case 'cancelled':
    case 'canceled':
      return 'Cancelled';
    default:
      return action === 'created' ? 'Booked' : 'Changed';
  }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 24-hour, because this is a dense list — the system's rule. */
function sessionWhen(at: number): string {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${hh}:${mm}`;
}

function methodLabel(method: string): string {
  switch (method.toLowerCase()) {
    case 'cash':
      return 'Cash';
    case 'upi':
      return 'UPI';
    case 'card':
      return 'Card';
    case 'bank':
    case 'transfer':
      return 'Bank transfer';
    default:
      return method;
  }
}

function removedLabel(table: string): string {
  switch (table) {
    case 'set_logs':
      return 'A set was deleted';
    case 'scheduled_sessions':
      return 'A session was removed';
    case 'program_exercises':
      return 'An exercise was taken off a plan';
    case 'clients':
      return 'A client was removed';
    default:
      return `${humanTable(table)} — removed`;
  }
}

function humanTable(table: string): string {
  const words = table.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function who(raw: Record<string, unknown> | null, names: QueueNames): string | null {
  const id = str(raw, 'client_id');
  if (!id) return null;
  return names.clients.get(id) ?? null;
}

function num(raw: Record<string, unknown> | null, key: string): number | null {
  const v = raw?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(raw: Record<string, unknown> | null, key: string): string | undefined {
  const v = raw?.[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
