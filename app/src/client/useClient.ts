/**
 * Subscribes the client's four tabs to local storage.
 *
 * Built on top of `useLog` rather than beside it: the log's nine subscriptions
 * are exactly the rows a client's screens need for anything to do with training,
 * and running a second copy of them would double the work to produce identical
 * numbers. This adds the four the log has no use for — the coach, the plan's own
 * rows, the money, and Sunday's report.
 *
 * No `InteractionManager` defer and no skeleton, for the same reason the log has
 * neither: every figure here is already on the phone. A client seeing a shimmer
 * for a workout they logged themselves means the offline architecture has failed,
 * and the next thing they do is check their signal.
 */

import { useEffect, useMemo, useState } from 'react';
import { combineLatest, map } from 'rxjs';
import { Q } from '@nozbe/watermelondb';
import { database } from '../db';
import type CoachModel from '../db/models/Coach';
import type ClientModel from '../db/models/Client';
import type ProgramExerciseModel from '../db/models/ProgramExercise';
import type PackageModel from '../db/models/Package';
import type PaymentModel from '../db/models/Payment';
import type WeeklyReportModel from '../db/models/WeeklyReport';
import { liveCache } from '../db/live';
import { useLog } from '../log/useLog';
import type {
  ClientCoach,
  ClientInput,
  ClientPlanRow,
  ClientRecord,
  ClientReport,
} from './client';
import type { MoneyPackage, MoneyPayment } from '../money/money';

const coaches = database.get<CoachModel>('coaches');
const clients = database.get<ClientModel>('clients');
const planRows = database.get<ProgramExerciseModel>('program_exercises');
const packages = database.get<PackageModel>('packages');
const payments = database.get<PaymentModel>('payments');
const reports = database.get<WeeklyReportModel>('weekly_reports');

interface Extra {
  coach: ClientCoach | null;
  me: ClientRecord | null;
  programExercises: ClientPlanRow[];
  packages: MoneyPackage[];
  payments: MoneyPayment[];
  reports: ClientReport[];
}

const EMPTY: Extra = {
  coach: null,
  me: null,
  programExercises: [],
  packages: [],
  payments: [],
  reports: [],
};

const cache = liveCache<Extra>(EMPTY);

function observeExtra(clientId: string) {
  return combineLatest([
    coaches.query().observeWithColumns(['name', 'gym_name', 'phone', 'upi_vpa']),
    clients
      .query(Q.where('id', clientId))
      .observeWithColumns(['name', 'delivery_mode']),
    planRows
      .query(Q.sortBy('order_index', Q.asc))
      .observeWithColumns(['sets', 'reps', 'target_load', 'day_of_week', 'order_index']),
    packages
      .query()
      .observeWithColumns([
        'sessions_total', 'sessions_remaining', 'amount', 'status', 'due_date',
        'written_off_at', 'written_off_amount', 'type',
      ]),
    payments
      .query()
      .observeWithColumns([
        'amount', 'method', 'collected_by', 'status', 'upi_reference', 'paid_at',
        'receipt_no', 'note',
      ]),
    reports.query().observeWithColumns(['sent_at', 'new_bests', 'volume_kg']),
  ]).pipe(
    map(([co, me, pe, pkg, pay, rep]): Extra => ({
      // One row, always. More than one would mean this phone has synced two
      // trainers' records, which the client endpoint cannot produce.
      coach: co[0]
        ? {
            id: co[0].id,
            name: co[0].name,
            gymName: co[0].gymName,
            phone: co[0].phone,
            upiVpa: co[0].upiVpa,
          }
        : null,
      me: me[0]
        ? {
            id: me[0].id,
            name: me[0].name,
            createdAt: me[0].createdAt.getTime(),
            deliveryMode: me[0].deliveryMode ?? null,
          }
        : null,
      programExercises: pe.map((r) => ({
        id: r.id,
        programId: r.programId,
        exerciseId: r.exerciseId,
        sets: r.sets,
        reps: r.reps,
        targetLoad: r.targetLoad,
        dayOfWeek: r.dayOfWeek,
        orderIndex: r.orderIndex,
      })),
      packages: pkg.map((p) => ({
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
      })),
      payments: pay.map((p) => ({
        id: p.id,
        clientId: p.clientId,
        packageId: p.packageId,
        amount: p.amount,
        method: p.method,
        collectedBy: p.collectedBy,
        status: p.status,
        upiReference: p.upiReference,
        paidAt: p.paidAt,
        gymShareAmount: p.gymShareAmount,
        sharePercent: p.sharePercent,
        receiptNo: p.receiptNo,
        note: p.note,
        createdAt: p.createdAt,
      })),
      reports: rep.map((r) => ({
        id: r.id,
        clientId: r.clientId,
        weekStart: r.weekStart,
        weekEnd: r.weekEnd,
        sessionsKept: r.sessionsKept,
        sessionsPlanned: r.sessionsPlanned,
        trainedDays: r.trainedDays,
        volumeKg: r.volumeKg,
        setsDone: r.setsDone,
        newBests: r.newBests,
        bestLine: r.bestLine,
        bestPrevious: r.bestPrevious,
        sentAt: r.sentAt ? r.sentAt.getTime() : null,
      })),
    })),
  );
}

export interface Client {
  input: ClientInput;
  /** False only until the first emission of the app's life. Never drives a skeleton. */
  ready: boolean;
}

export function useClient(clientId: string | null): Client {
  const { input: log, ready: logReady } = useLog();
  const [extra, setExtra] = useState(cache.value);
  const [ready, setReady] = useState(cache.ready);

  useEffect(() => {
    if (!clientId) return;
    const sub = observeExtra(clientId).subscribe((next) => {
      cache.set(next);
      setExtra(next);
      setReady(true);
    });
    return () => sub.unsubscribe();
  }, [clientId]);

  return useMemo(
    () => ({ input: { ...log, ...extra }, ready: ready && logReady }),
    [log, extra, ready, logReady],
  );
}
