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

/**
 * The lifecycle statuses the roster writes, as opposed to the three the edit
 * form offers. Adding a value here is a code change, not a migration — statuses
 * are strings by contract precisely so this stays cheap.
 */
export type LifecycleStatus = 'active' | 'paused' | 'archived' | 'invited';

/**
 * Pause, resume, archive.
 *
 * The moment of the change is stamped into `metadata` rather than read back off
 * `updated_at`, because any later edit would move `updated_at` and the roster
 * would start claiming a client was paused on a day they weren't. Paused is not
 * archived and the difference is money: paused keeps the pack, archived closes
 * it, so both need a date a trainer can check.
 */
export async function setClientStatus(clientId: string, status: LifecycleStatus) {
  const client = await clientsCollection.find(clientId);
  const stamp = new Date().toISOString();

  await database.write(async () => {
    await client.update((c) => {
      c.status = status;
      const current = c.metadata && typeof c.metadata === 'object' ? c.metadata : {};
      if (status === 'paused') c.metadata = { ...current, pausedAt: stamp };
      else if (status === 'archived') c.metadata = { ...current, archivedAt: stamp };
      else if (status === 'invited') c.metadata = { ...current, invitedAt: stamp };
      else c.metadata = { ...current, resumedAt: stamp };
    });
  });

  await refreshPending();
  syncDatabase('client-status');
  return client;
}

/**
 * Appends a body-metric reading. The only way one is ever written.
 *
 * § 11: **append-only, no edit and no delete.** There is deliberately no
 * `updateBodyMetric` anywhere in the app — the absence is the feature, because a
 * history that can be reshaped after the fact is worth nothing as evidence, and
 * this is the screen a trainer turns their phone around to show.
 *
 * `at` is the moment the sheet was opened rather than the moment the write
 * lands, so a slow tap doesn't move a reading the trainer took a minute ago. It
 * is never a date the trainer picked: back-dating would make the history a thing
 * somebody arranged.
 */
export async function logBodyMetric(
  clientId: string,
  metricType: string,
  value: number,
  unit: string,
  at: number = Date.now(),
): Promise<string> {
  const row = await database.write(() =>
    bodyMetricsCollection.create((m) => {
      m.clientId = clientId;
      m.metricType = metricType;
      m.value = value;
      m.unit = unit;
      m.recordedAt = new Date(at);
    }),
  );
  await refreshPending();
  syncDatabase('log-body-metric');
  return row.id;
}

/**
 * What removing this client would actually destroy.
 *
 * § 10: the dialog counts what will be lost instead of asking "are you sure?".
 * "72 sessions, 9 measurements and 6 payments" is information; the other thing
 * is a speed bump people learn to tap through.
 */
export async function countForRemoval(clientId: string) {
  const [sessions, metrics, payments] = await Promise.all([
    database.get('scheduled_sessions').query(Q.where('client_id', clientId)).fetchCount(),
    bodyMetricsCollection.query(Q.where('client_id', clientId)).fetchCount(),
    database.get('payments').query(Q.where('client_id', clientId)).fetchCount(),
  ]);
  return { sessions, metrics, payments };
}

/**
 * Removes a client and everything that belonged to them.
 *
 * The one real delete in the product, and § 10 is explicit that it **takes
 * effect at once** — there is no grace period on a client the way there is on
 * the trainer's own account, which is exactly why archive sits above it.
 *
 * The cascade is done here rather than left to the server because the app is
 * offline-first: a client removed on a gym floor has to be gone from the roster,
 * the diary and the book before the phone next sees a network. Every table below
 * accepts a delete in `SyncService.push`, so the tombstones reach Postgres
 * intact and nothing resurrects on the next pull.
 *
 * Money already collected is deleted with them. A settled month keeps its total
 * regardless — `gym_settlement` stores its own amount — so closed reports don't
 * move, which is the promise the dialog makes.
 */
export async function removeClient(clientId: string) {
  const workouts = await database
    .get('workout_sessions')
    .query(Q.where('client_id', clientId))
    .fetch();
  const workoutIds = workouts.map((w) => w.id);

  const owned = await Promise.all([
    clientsCollection.query(Q.where('id', clientId)).fetch(),
    database.get('scheduled_sessions').query(Q.where('client_id', clientId)).fetch(),
    database.get('programs').query(Q.where('client_id', clientId)).fetch(),
    database.get('packages').query(Q.where('client_id', clientId)).fetch(),
    database.get('payments').query(Q.where('client_id', clientId)).fetch(),
    database.get('nudge_logs').query(Q.where('client_id', clientId)).fetch(),
    bodyMetricsCollection.query(Q.where('client_id', clientId)).fetch(),
  ]);

  // The log's own rows hang off the workout, not the client, so they are found
  // through it — a set left behind would sync back as an orphan nothing renders.
  const logRows = workoutIds.length
    ? await Promise.all([
        database.get('workout_exercises').query(Q.where('workout_session_id', Q.oneOf(workoutIds))).fetch(),
        database.get('set_logs').query(Q.where('workout_session_id', Q.oneOf(workoutIds))).fetch(),
      ])
    : [[], []];

  await database.write(async () => {
    for (const row of [...logRows.flat(), ...workouts, ...owned.flat()]) {
      await row.markAsDeleted();
    }
  });

  await refreshPending();
  syncDatabase('remove-client');
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
