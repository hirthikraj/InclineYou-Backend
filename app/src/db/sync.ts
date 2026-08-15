import { synchronize, hasUnsyncedChanges } from '@nozbe/watermelondb/sync';
import fetchLocalChanges from '@nozbe/watermelondb/sync/impl/fetchLocal';
import { database } from './index';
import { repairLocalData } from './repair';
import { api } from '../api/client';
import { resetLiveCaches } from './live';

export type SyncPhase = 'idle' | 'syncing' | 'error';

export interface SyncState {
  phase: SyncPhase;
  /** epoch ms of the last successful sync, null if we've never synced */
  lastSyncedAt: number | null;
  /** true while local writes are waiting to reach the server */
  hasPending: boolean;
  /**
   * How many records are queued. Zero when nothing is waiting, and also zero if
   * the count couldn't be taken — `hasPending` is the reliable signal, this is
   * the detail on top of it.
   */
  pendingCount: number;
  error: string | null;
}

let state: SyncState = {
  phase: 'idle',
  lastSyncedAt: null,
  hasPending: false,
  pendingCount: 0,
  error: null,
};

const listeners = new Set<() => void>();

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/**
 * Recomputes the pending badge from WatermelonDB's own bookkeeping.
 *
 * The count matters as well as the boolean: "4 changes waiting" tells a trainer
 * on a gym floor that their morning's work is safe, where "changes are waiting"
 * only tells them something is unfinished.
 */
export async function refreshPending() {
  try {
    const pending = await hasUnsyncedChanges({ database });
    setState({ hasPending: pending, pendingCount: pending ? await countPending() : 0 });
  } catch {
    // A read failure here is cosmetic — leave the previous value alone.
  }
}

/**
 * How many records are queued.
 *
 * `fetchLocalChanges` is the same function `synchronize` uses to build a push,
 * so the number is exactly what would go out — but it lives under `sync/impl`
 * and is not part of WatermelonDB's public surface. If a future version moves
 * it, this returns 0 and the banner falls back to saying "changes are waiting",
 * which is why nothing here is allowed to throw.
 */
/** WatermelonDB types `changes` as an index signature, so the values need naming. */
interface TableChanges {
  created: unknown[];
  updated: unknown[];
  deleted: unknown[];
}

async function countPending(): Promise<number> {
  try {
    const local = await fetchLocalChanges(database);
    const tables: TableChanges[] = Object.values(local.changes);
    return tables.reduce(
      (sum, table) => sum + table.created.length + table.updated.length + table.deleted.length,
      0,
    );
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------- FR-11 · which half */

/**
 * Whose slice of the database this phone is syncing.
 *
 * Null is the trainer's whole workspace — `/v1/sync`. A client id is one
 * client's slice of the same tables — `/v1/client/sync`, which is a different
 * endpoint because it answers to a different token and refuses to hand over
 * anybody else's rows.
 *
 * Set by `AuthContext` before the first trigger fires, and re-set on a lens
 * switch. It is module state rather than a parameter because the sync triggers
 * — foreground, reconnect, a write — all fire from places that have no business
 * knowing which lens is open.
 */
export interface SyncScope {
  clientId: string | null;
}

let scope: SyncScope | null = null;

export function setSyncScope(next: SyncScope | null) {
  scope = next;
}

// One sync at a time. Foreground + reconnect can fire together, and two
// concurrent synchronize() calls on the same database throw. 
let inFlight: Promise<void> | null = null;

const clientScope = () => (scope?.clientId ? scope.clientId : null);

function pullPath(): string {
  const cid = clientScope();
  return cid ? `/v1/client/sync/pull?clientId=${cid}` : '/v1/sync/pull';
}

function pushPath(): string {
  const cid = clientScope();
  return cid ? `/v1/client/sync/push?clientId=${cid}` : '/v1/sync/push';
}

/** `?` or `&` depending on whether the path already carries a client id. */
function cursor(lastPulledAt: number | null | undefined): string {
  if (!lastPulledAt) return '';
  return `${clientScope() ? '&' : '?'}lastPulledAt=${lastPulledAt}`;
}

/**
 * Ran once per process, before the first push.
 *
 * `repairLocalData` fixes rows the server cannot accept. Doing it here rather
 * than at app start is deliberate: this is the last point before anything
 * leaves the device, so a poisoned row cannot slip out through a sync triggered
 * by a reconnect or a foreground event that raced the startup path.
 */
let repaired: Promise<void> | null = null;

export function syncDatabase(reason: string = 'manual'): Promise<void> {
  if (inFlight) return inFlight;

  setState({ phase: 'syncing', error: null });

  // Awaited inside the chain rather than before it, so `inFlight` is still
  // assigned synchronously and two callers in the same tick share one sync.
  if (!repaired) repaired = repairLocalData();

  inFlight = repaired.then(() => synchronize({
    database,
    pullChanges: async ({ lastPulledAt }) => {
      const { data } = await api.get(`${pullPath()}${cursor(lastPulledAt)}`);
      return { changes: data.changes, timestamp: data.timestamp };
    },
    pushChanges: async ({ changes, lastPulledAt }) => {
      await api.post(pushPath(), { changes, lastPulledAt });
    },
    migrationsEnabledAtVersion: 1,
    /**
     * The server splits a pull into created and updated by comparing each row's
     * `created_at` against the client's cursor — which is all it can do, since
     * it has no record of what any one phone already holds. So a row written
     * before the cursor but touched after it arrives as an *update* for
     * something this phone has never seen: a client added on another device, a
     * backdated import, a row an admin edited.
     *
     * Without this flag WatermelonDB logs that as a "Diagnostic error … could
     * be a serious bug" for every such row, then creates it anyway. The flag is
     * the documented way to say the arrangement is deliberate; the outcome is
     * identical, minus a screenful of false alarms.
     */
    sendCreatedAsUpdated: true,
  }))
    .then(async () => {
      setState({ phase: 'idle', lastSyncedAt: Date.now(), error: null });
      await refreshPending();
    })
    .catch(async (e: unknown) => {
      // Offline is the expected case, not a failure — the queue survives and
      // the next trigger retries. Surface it without losing local writes.
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`[sync:${reason}] failed: ${message}`);
      setState({ phase: 'error', error: message });
      await refreshPending();
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Called on sign-out so the next trainer on this device starts clean. */
export async function resetLocalDatabase() {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
  // The screens hold the last emission outside React for a warm start. Wiping
  // the tables is not enough — those caches would hand the next trainer the
  // previous one's roster for a frame.
  resetLiveCaches();
  state = { phase: 'idle', lastSyncedAt: null, hasPending: false, pendingCount: 0, error: null };
  listeners.forEach((l) => l());
}
