import type ClientModel from './models/Client';
import type PackageModel from './models/Package';
import type PaymentModel from './models/Payment';
import type ProgramModel from './models/Program';
import type { Tone } from '../theme';

/**
 * The FR-1.6 roster chip rules, deliberately free of any database import so the
 * logic can be reasoned about (and run) on its own. `clientStatus.ts` supplies
 * the queries; this file only decides what the signals mean.
 */

export interface StatusChip {
  key: string;
  label: string;
  tone: Tone;
}

/** Boolean view of the same signals, used to filter the roster. */
export interface ClientFlags {
  active: boolean;
  paymentDue: boolean;
  packLow: boolean;
  planExpiring: boolean;
}

export interface ClientStatus {
  chips: StatusChip[];
  flags: ClientFlags;
}

const DAY_MS = 86_400_000;

/** A session pack is "low" at or below this many sessions remaining. */
export const PACK_LOW_THRESHOLD = 3;
/** A package or program is "expiring" this many days out. */
export const EXPIRING_WITHIN_DAYS = 7;

// Statuses are free-form strings by design (see the additive-only schema contract:
// no Postgres ENUMs), so match on sets and treat anything unknown as still live.
const DUE_PAYMENT_STATUSES = new Set(['pending', 'due', 'unpaid', 'overdue']);
const OVERDUE_PAYMENT_STATUSES = new Set(['overdue']);
const DEAD_PACKAGE_STATUSES = new Set(['cancelled', 'canceled', 'completed', 'expired', 'refunded']);
const DEAD_PROGRAM_STATUSES = new Set(['cancelled', 'canceled', 'completed', 'archived']);

/** Optional columns come back as null despite the decorators typing them non-null. */
function parseDate(value?: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function daysUntil(timestamp: number, now: number): number {
  return Math.ceil((timestamp - now) / DAY_MS);
}

function statusChip(client: ClientModel): StatusChip {
  const status = (client.status || 'active').toLowerCase();
  if (status === 'active') return { key: 'status', label: 'active', tone: 'good' };
  if (status === 'paused' || status === 'on_hold') {
    return { key: 'status', label: 'paused', tone: 'warn' };
  }
  return { key: 'status', label: status, tone: 'neutral' };
}

/** `now` is injected rather than read from the clock so the rules stay pure. */
export function deriveClientStatus(
  client: ClientModel,
  packages: PackageModel[],
  payments: PaymentModel[],
  programs: ProgramModel[],
  now: number,
): ClientStatus {
  const chips: StatusChip[] = [statusChip(client)];
  const flags: ClientFlags = {
    active: (client.status || 'active').toLowerCase() === 'active',
    paymentDue: false,
    packLow: false,
    planExpiring: false,
  };

  // --- Payment due (FR-6.5: surfaced in both collection modes) ---
  const duePayments = payments.filter((p) =>
    DUE_PAYMENT_STATUSES.has((p.status || '').toLowerCase()),
  );
  if (duePayments.length > 0) {
    flags.paymentDue = true;
    const overdue = duePayments.some((p) =>
      OVERDUE_PAYMENT_STATUSES.has((p.status || '').toLowerCase()),
    );
    const total = duePayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const amount = total > 0 ? ` ₹${Math.round(total)}` : '';
    chips.push({
      key: 'payment',
      label: overdue ? `overdue${amount}` : `payment due${amount}`,
      tone: overdue ? 'danger' : 'warn',
    });
  }

  const livePackages = packages.filter(
    (p) => !DEAD_PACKAGE_STATUSES.has((p.status || '').toLowerCase()),
  );

  // --- Session pack running low ---
  const remaining = livePackages
    .map((p) => p.sessionsRemaining)
    .filter((n): n is number => typeof n === 'number');
  if (remaining.length > 0) {
    const fewest = Math.min(...remaining);
    if (fewest <= 0) {
      flags.packLow = true;
      chips.push({ key: 'pack', label: 'pack empty', tone: 'danger' });
    } else if (fewest <= PACK_LOW_THRESHOLD) {
      flags.packLow = true;
      chips.push({
        key: 'pack',
        label: `${fewest} session${fewest === 1 ? '' : 's'} left`,
        tone: 'warn',
      });
    }
  }

  // --- Plan expiring (packages and programs share the rule) ---
  const liveProgramEnds = programs
    .filter((p) => !DEAD_PROGRAM_STATUSES.has((p.status || '').toLowerCase()))
    .map((p) => parseDate(p.endDate));
  const packageEnds = livePackages.map((p) => parseDate(p.endDate));
  const ends = [...packageEnds, ...liveProgramEnds].filter((t): t is number => t != null);

  if (ends.length > 0) {
    const soonest = Math.min(...ends);
    const days = daysUntil(soonest, now);
    if (days < 0) {
      flags.planExpiring = true;
      chips.push({ key: 'expiry', label: 'expired', tone: 'danger' });
    } else if (days <= EXPIRING_WITHIN_DAYS) {
      flags.planExpiring = true;
      chips.push({
        key: 'expiry',
        label: days === 0 ? 'ends today' : `${days}d left`,
        tone: 'warn',
      });
    }
  }

  return { chips, flags };
}
