import { synchronize } from '@nozbe/watermelondb/sync';
import { database } from './index';
import { api } from '../api/client';

export async function syncDatabase() {
  await synchronize({
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
  });
}
