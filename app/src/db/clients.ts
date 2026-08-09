import { Q } from '@nozbe/watermelondb';
import { map } from 'rxjs';
import { database } from './index';
import ClientModel from './models/Client';
import BodyMetricModel from './models/BodyMetric';
import type { DeliveryMode } from '../home/mode';
import { refreshPending, syncDatabase } from './sync';

export interface NewClientInput {
  name: string;
  phone?: string;
  goal?: string;
  paymentMode: 'trainer_collects' | 'gym_collects';
  /** How they're usually trained. Home's Today chips filter on it. */
  deliveryMode?: DeliveryMode;
  trainerSplitPercent?: number;
  heightCm?: number;
  activityLevel?: string;
  startingWeightKg?: number;
  sessionsPerWeek?: number;
  sessionDurationMinutes?: number;
}

export interface ClientPatch {
  name: string;
  phone?: string;
  goal?: string;
  status: string;
  paymentMode: 'trainer_collects' | 'gym_collects';
  deliveryMode?: DeliveryMode;
  trainerSplitPercent?: number;
  heightCm?: number;
  activityLevel?: string;
  sessionsPerWeek?: number;
  sessionDurationMinutes?: number;
  weeklySchedule?: string;
}

export const CLIENT_STATUSES = ['active', 'paused', 'inactive'] as const;

export const clientsCollection = database.get<ClientModel>('clients');
export const bodyMetricsCollection = database.get<BodyMetricModel>('body_metrics');

export function observeClients() {
  return clientsCollection.query(Q.sortBy('created_at', Q.desc)).observe();
}

/**
 * Emits null instead of throwing when the row is gone, so a screen that's open
 * while a delete syncs in unmounts cleanly rather than crashing.
 */
export function observeClient(clientId: string) {
  return clientsCollection
    .query(Q.where('id', clientId))
    .observe()
    .pipe(map((rows) => rows[0] ?? null));
}

export function observeBodyMetrics(clientId: string) {
  return bodyMetricsCollection
    .query(Q.where('client_id', clientId), Q.sortBy('recorded_at', Q.desc))
    .observe();
}

/**
 * Writes the client (and its baseline weight) to SQLite immediately, then kicks
 * off a sync. The write is what matters — sync is best-effort, and the record
 * stays queued if we're offline.
 */
export async function createClient(trainerId: string, input: NewClientInput) {
  const now = new Date();

  const client = await database.write(async () => {
    const created = await clientsCollection.create((c) => {
      c.trainerId = trainerId;
      c.name = input.name.trim();
      if (input.phone) c.phone = input.phone.trim();
      if (input.goal) c.goal = input.goal.trim();
      c.status = 'active';
      c.paymentMode = input.paymentMode;
      if (input.deliveryMode) c.deliveryMode = input.deliveryMode;
      if (input.trainerSplitPercent != null) c.trainerSplitPercent = input.trainerSplitPercent;
      if (input.heightCm != null) c.heightCm = input.heightCm;
      if (input.activityLevel) c.activityLevel = input.activityLevel;
      if (input.sessionsPerWeek != null) c.sessionsPerWeek = input.sessionsPerWeek;
      if (input.sessionDurationMinutes != null) c.sessionDurationMinutes = input.sessionDurationMinutes;
    });

    if (input.startingWeightKg != null) {
      await bodyMetricsCollection.create((m) => {
        m.clientId = created.id;
        m.metricType = 'weight';
        m.value = input.startingWeightKg!;
        m.unit = 'kg';
        m.recordedAt = now;
      });
    }

    return created;
  });

  await refreshPending();
  syncDatabase('create-client');
  return client;
}

// Optional columns are nullable in SQLite, but the model decorators type them as
// non-null. Clearing a field means writing null, so the cast is deliberate.
const orNull = <T>(value: T | undefined): T => (value === undefined ? null : value) as T;

/** Saves the weekly slot pattern and session config fields on an existing client. */
export async function saveWeeklySchedule(
  clientId: string,
  sessionsPerWeek: number,
  sessionDurationMinutes: number,
  weeklySchedule: string,
) {
  const client = await clientsCollection.find(clientId);
  await database.write(async () => {
    await client.update((c) => {
      c.sessionsPerWeek = sessionsPerWeek;
      c.sessionDurationMinutes = sessionDurationMinutes;
      c.weeklySchedule = weeklySchedule;
    });
  });
  await refreshPending();
  syncDatabase('save-weekly-schedule');
}

export async function updateClient(clientId: string, patch: ClientPatch) {
  const client = await clientsCollection.find(clientId);

  await database.write(async () => {
    await client.update((c) => {
      c.name = patch.name.trim();
      c.phone = orNull(patch.phone?.trim() || undefined);
      c.goal = orNull(patch.goal?.trim() || undefined);
      c.status = patch.status;
      c.paymentMode = patch.paymentMode;
      c.deliveryMode = orNull(patch.deliveryMode);
      // A freelance client has no split to record — clear any stale value.
      c.trainerSplitPercent = orNull(
        patch.paymentMode === 'gym_collects' ? patch.trainerSplitPercent : undefined,
      );
      c.heightCm = orNull(patch.heightCm);
      c.activityLevel = orNull(patch.activityLevel);
      if (patch.sessionsPerWeek != null) c.sessionsPerWeek = patch.sessionsPerWeek;
      if (patch.sessionDurationMinutes != null) c.sessionDurationMinutes = patch.sessionDurationMinutes;
      if (patch.weeklySchedule !== undefined) c.weeklySchedule = orNull(patch.weeklySchedule);
    });
  });

  await refreshPending();
  syncDatabase('update-client');
  return client;
}
