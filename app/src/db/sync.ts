import { synchronize, hasUnsyncedChanges } from '@nozbe/watermelondb/sync';
import { database } from './index';
import { api } from '../api/client';

export type SyncPhase = 'idle' | 'syncing' | 'error';

export interface SyncState {
  phase: SyncPhase;
  /** epoch ms of the last successful sync, null if we've never synced */
  lastSyncedAt: number | null;
  /** true while local writes are waiting to reach the server */
  hasPending: boolean;
  error: string | null;
}

let state: SyncState = {
  phase: 'idle',
  lastSyncedAt: null,
  hasPending: false,
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

/** Recomputes the pending badge from WatermelonDB's own bookkeeping. */
export async function refreshPending() {
  try {
    setState({ hasPending: await hasUnsyncedChanges({ database }) });
  } catch {
    // A read failure here is cosmetic — leave the previous value alone.
  }
}

// One sync at a time. Foreground + reconnect can fire together, and two
// concurrent synchronize() calls on the same database throw.
let inFlight: Promise<void> | null = null;

export function syncDatabase(reason: string = 'manual'): Promise<void> {
  if (inFlight) return inFlight;

  setState({ phase: 'syncing', error: null });

  inFlight = synchronize({
    database,
    pullChanges: async ({ lastPulledAt }) => {
      const params = lastPulledAt ? `?lastPulledAt=${lastPulledAt}` : '';
      const { data } = await api.get(`/v1/sync/pull${params}`);
      return { changes: data.changes, timestamp: data.timestamp };
    },
    pushChanges: async ({ changes, lastPulledAt }) => {
      await api.post('/v1/sync/push', { changes, lastPulledAt });
    },
    migrationsEnabledAtVersion: 1,
  })
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
  state = { phase: 'idle', lastSyncedAt: null, hasPending: false, error: null };
  listeners.forEach((l) => l());
}
