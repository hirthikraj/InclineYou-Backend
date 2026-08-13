/**
 * Subscribes one client's file to local storage.
 *
 * Eight tables, one `combineLatest`, and no network on the critical path — § 14's
 * first rule is that **the file paints from local storage, all four tabs, before
 * any network call**, because a file that spins is a file a trainer stops opening
 * mid-session.
 *
 * The gym profile is the one exception and it is deliberately not awaited: it
 * lives on `/v1/trainers/me` with no local mirror, and only the Package tab's
 * "gym's cut" row needs it. Until it lands, that row is absent rather than zero
 * — a 0% cut is a claim about an arrangement, and guessing it wrong is worse
 * than saying nothing.
 *
 * Warm-started from `liveCache` for the same reason every other derived screen
 * is: a client file that renders "Nothing yet" for one frame, on a client with
 * 72 sessions, has told the trainer something false.
 */

import { useEffect, useMemo, useState } from 'react';
import { combineLatest, map } from 'rxjs';
import { Q } from '@nozbe/watermelondb';

import { database } from '../db';
import { liveCache } from '../db/live';
import { getTrainer } from '../api/trainer';
import { EMPTY_GYM, type GymProfile, type MoneyPackage, type MoneyPayment } from '../money/money';
import type ClientModel from '../db/models/Client';
import type ProgramModel from '../db/models/Program';
import type PackageModel from '../db/models/Package';
import type PaymentModel from '../db/models/Payment';
import type ScheduledSessionModel from '../db/models/ScheduledSession';
import type WorkoutSessionModel from '../db/models/WorkoutSession';
import type WorkoutExerciseModel from '../db/models/WorkoutExercise';
import type BodyMetricModel from '../db/models/BodyMetric';
import {
  EMPTY_FILE,
  type FileClient,
  type FileInput,
  type FileMetric,
  type FileProgram,
  type FileSession,
  type FileWorkout,
} from './file';

const clients = database.get<ClientModel>('clients');
const programs = database.get<ProgramModel>('programs');
const packages = database.get<PackageModel>('packages');
const payments = database.get<PaymentModel>('payments');
const sessions = database.get<ScheduledSessionModel>('scheduled_sessions');
const workouts = database.get<WorkoutSessionModel>('workout_sessions');
const workoutExercises = database.get<WorkoutExerciseModel>('workout_exercises');
const metrics = database.get<BodyMetricModel>('body_metrics');

type Rows = Omit<FileInput, 'gym'>;

const EMPTY_ROWS: Rows = {
  client: EMPTY_FILE.client,
  programs: [],
  packages: [],
  payments: [],
  sessions: [],
  workouts: [],
  exerciseCounts: {},
  metrics: [],
};

// Keyed by client, because a trainer walking their roster opens several files in
// a row and the previous client's numbers must never warm-start the next one's.
const caches = new Map<string, ReturnType<typeof liveCache<Rows>>>();

function cacheFor(clientId: string) {
  let cache = caches.get(clientId);
  if (!cache) {
    cache = liveCache<Rows>(EMPTY_ROWS);
    caches.set(clientId, cache);
  }
  return cache;
}

const gymCache = liveCache<GymProfile>(EMPTY_GYM);

function observe(clientId: string) {
  return combineLatest([
    clients.query(Q.where('id', clientId)).observeWithColumns([
      'name', 'phone', 'status', 'delivery_mode', 'payment_mode',
      'trainer_split_percent', 'metadata',
    ]),
    programs
      .query(Q.where('client_id', clientId))
      .observeWithColumns(['name', 'status', 'start_date', 'end_date']),
    packages
      .query(Q.where('client_id', clientId))
      .observeWithColumns([
        'sessions_total', 'sessions_remaining', 'amount', 'status',
        'due_date', 'end_date', 'written_off_at', 'written_off_amount', 'type',
      ]),
    payments
      .query(Q.where('client_id', clientId))
      .observeWithColumns(['amount', 'status', 'method', 'paid_at', 'gym_share_amount', 'share_percent']),
    sessions
      .query(Q.where('client_id', clientId))
      .observeWithColumns([
        'scheduled_at', 'status', 'day_label', 'delivery_mode',
        'cancelled_by', 'pack_delta', 'duration_minutes',
      ]),
    workouts
      .query(Q.where('client_id', clientId))
      .observeWithColumns(['session_date', 'ended_at', 'scheduled_session_id']),
    // Not scoped to the client: `workout_exercises` has no client column, and a
    // join per workout would be N queries for a count. Filtered below instead.
    workoutExercises.query().observe(),
    metrics
      .query(Q.where('client_id', clientId))
      .observeWithColumns(['metric_type', 'value', 'unit', 'recorded_at']),
  ]).pipe(
    map(([cl, pr, pk, pa, se, wo, we, me]): Rows => {
      const mine = new Set(wo.map((w) => w.id));
      const exerciseCounts: Record<string, number> = {};
      we.forEach((row) => {
        if (!mine.has(row.workoutSessionId)) return;
        exerciseCounts[row.workoutSessionId] = (exerciseCounts[row.workoutSessionId] ?? 0) + 1;
      });

      return {
        client: cl[0] ? (toClient(cl[0]) as FileClient) : null,
        programs: pr.map(toProgram),
        packages: pk.map(toPackage),
        payments: pa.map(toPayment),
        sessions: se.map(toSession),
        workouts: wo.map(toWorkout),
        exerciseCounts,
        metrics: me.map(toMetric),
      };
    }),
  );
}

export interface LiveClientFile {
  input: FileInput;
  now: number;
  /** False only until the first emission. "No data yet" is not "no data". */
  ready: boolean;
}

export function useClientFile(clientId: string | null, active: boolean = true): LiveClientFile {
  const cache = clientId ? cacheFor(clientId) : null;
  const [rows, setRows] = useState<Rows>(cache?.value ?? EMPTY_ROWS);
  const [ready, setReady] = useState(cache?.ready ?? false);
  const [gym, setGym] = useState<GymProfile>(gymCache.value);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!clientId) return;
    const store = cacheFor(clientId);
    setRows(store.value);
    setReady(store.ready);

    const sub = observe(clientId).subscribe((next) => {
      store.set(next);
      setRows(next);
      setReady(true);
    });
    return () => sub.unsubscribe();
  }, [clientId]);

  // Re-stamped on focus, not on a timer: "Tomorrow 07:00" and "11 days late" are
  // both wrong the moment the date rolls over, and a file left open overnight is
  // a real thing a trainer does.
  useEffect(() => {
    if (active) setNow(Date.now());
  }, [active, clientId]);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    getTrainer()
      .then(({ data }) => {
        if (!alive) return;
        const next: GymProfile = {
          name: data.gymName ?? null,
          percent: data.gymSharePercent ?? null,
          upiVpa: data.upiVpa ?? null,
          trainerName: data.name ?? '',
        };
        gymCache.set(next);
        setGym(next);
      })
      .catch(() => {
        /* Offline. The file is complete without it — only the cut row goes. */
      });
    return () => {
      alive = false;
    };
  }, [active]);

  const input = useMemo<FileInput>(() => ({ ...rows, gym }), [rows, gym]);
  return useMemo(() => ({ input, now, ready }), [input, now, ready]);
}

/* ------------------------------------------------------------------ mapping */

function toClient(c: ClientModel) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    status: c.status,
    deliveryMode: c.deliveryMode,
    paymentMode: c.paymentMode,
    trainerSplitPercent: c.trainerSplitPercent,
    metadata: c.metadata,
    createdAt: c.createdAt,
  };
}

function toProgram(p: ProgramModel): FileProgram {
  return {
    id: p.id,
    clientId: p.clientId,
    name: p.name,
    status: p.status,
    startDate: p.startDate,
    endDate: p.endDate,
    createdAt: p.createdAt,
  };
}

function toPackage(p: PackageModel): MoneyPackage {
  return {
    id: p.id,
    clientId: p.clientId,
    type: p.type,
    sessionsTotal: p.sessionsTotal,
    sessionsRemaining: p.sessionsRemaining,
    amount: p.amount,
    status: p.status,
    startDate: p.startDate,
    endDate: p.endDate,
    packId: p.packId,
    dueDate: p.dueDate,
    writtenOffAt: p.writtenOffAt,
    writtenOffAmount: p.writtenOffAmount,
    createdAt: p.createdAt,
  };
}

function toPayment(p: PaymentModel): MoneyPayment {
  return {
    id: p.id,
    clientId: p.clientId,
    packageId: p.packageId,
    amount: p.amount,
    method: p.method,
    collectedBy: p.collectedBy,
    status: p.status,
    paidAt: p.paidAt,
    gymShareAmount: p.gymShareAmount,
    sharePercent: p.sharePercent,
    receiptNo: p.receiptNo,
    note: p.note,
    createdAt: p.createdAt,
  };
}

function toSession(s: ScheduledSessionModel): FileSession {
  return {
    id: s.id,
    clientId: s.clientId,
    scheduledAt: s.scheduledAt,
    durationMinutes: s.durationMinutes,
    status: s.status,
    dayLabel: s.dayLabel,
    deliveryMode: s.deliveryMode,
    cancelledBy: s.cancelledBy,
    packDelta: s.packDelta,
  };
}

function toWorkout(w: WorkoutSessionModel): FileWorkout {
  return {
    id: w.id,
    clientId: w.clientId,
    scheduledSessionId: w.scheduledSessionId,
    sessionDate: w.sessionDate,
    endedAt: w.endedAt,
    createdAt: w.createdAt,
  };
}

function toMetric(m: BodyMetricModel): FileMetric {
  return {
    id: m.id,
    clientId: m.clientId,
    metricType: m.metricType,
    value: m.value,
    unit: m.unit,
    recordedAt: m.recordedAt,
  };
}
