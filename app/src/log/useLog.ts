/**
 * Subscribes the workout log to local storage.
 *
 * ── Why this one does not defer, and has no skeleton ──────────────────────
 *
 * Every other derived screen in this app waits for the running interaction
 * before it subscribes, and shows a skeleton in the gap. This one does neither,
 * because §09 of screen 17 forbids it:
 *
 *     No skeleton anywhere in a session. Every number on this screen is
 *     already on the phone; a shimmer for local data is a lie about where
 *     the data is.
 *
 * That rule is the whole offline promise made visible. A trainer in a basement
 * who sees a loading state has been told, wrongly, that the app is waiting for
 * something — and the next thing they do is check their bars.
 *
 * So the subscription starts on mount, and the cost is paid for with a narrow
 * projection rather than a delay: five columns of the exercise library instead
 * of the row, and no `buildExercises` pass over 1,324 of them. `liveCache` makes
 * the second and later opens of a session start from the last emission, which is
 * the normal case — a trainer opens the same log a dozen times in an hour.
 *
 * `sets` is unwindowed on purpose, as it is in `useTraining`. A record is
 * "heaviest ever", not "heaviest this quarter", and a bounded query would make
 * the gold quietly wrong the moment a personal best aged out of the window.
 */

import { useEffect, useMemo, useState } from 'react';
import { combineLatest, map } from 'rxjs';
import { Q } from '@nozbe/watermelondb';
import { database } from '../db';
import type ExerciseModel from '../db/models/Exercise';
import type SetLogModel from '../db/models/SetLog';
import type WorkoutSessionModel from '../db/models/WorkoutSession';
import type WorkoutExerciseModel from '../db/models/WorkoutExercise';
import type ScheduledSessionModel from '../db/models/ScheduledSession';
import type ProgramModel from '../db/models/Program';
import type TemplateModel from '../db/models/Template';
import type ClientModel from '../db/models/Client';
import type BodyMetricModel from '../db/models/BodyMetric';
import { liveCache } from '../db/live';
import { usePrefs } from '../settings/usePrefs';
import { EMPTY_LOG_INPUT, type LogInput } from './log';

const exercises = database.get<ExerciseModel>('exercises');
const setLogs = database.get<SetLogModel>('set_logs');
const workouts = database.get<WorkoutSessionModel>('workout_sessions');
const logExercises = database.get<WorkoutExerciseModel>('workout_exercises');
const sessions = database.get<ScheduledSessionModel>('scheduled_sessions');
const programs = database.get<ProgramModel>('programs');
const templates = database.get<TemplateModel>('templates');
const clients = database.get<ClientModel>('clients');
const metrics = database.get<BodyMetricModel>('body_metrics');

/** Everything except the plate step, which comes from preferences rather than SQLite. */
type Rows = Omit<LogInput, 'plateStepKg'>;

const EMPTY_ROWS: Rows = {
  workouts: [],
  logExercises: [],
  sets: [],
  exercises: [],
  clients: [],
  sessions: [],
  programs: [],
  templates: [],
  metrics: [],
};

const cache = liveCache<Rows>(EMPTY_ROWS);

const ms = (d: Date | null | undefined): number | null => (d ? d.getTime() : null);

function observeLog() {
  return combineLatest([
    exercises.query().observeWithColumns(['name', 'log_type', 'is_custom']),
    setLogs.query().observeWithColumns(['load_kg', 'reps', 'rpe', 'set_number', 'notes']),
    workouts.query().observeWithColumns(['session_date', 'client_id', 'ended_at', 'notes']),
    logExercises
      .query(Q.sortBy('order_index', Q.asc))
      .observeWithColumns([
        'order_index', 'source', 'target_sets', 'target_reps', 'rest_seconds',
        'removed_at', 'swapped_from_exercise_id',
      ]),
    sessions
      .query()
      .observeWithColumns([
        'status', 'day_label', 'template_day', 'scheduled_at',
        // FR-11 · the client's own screens read these: the length and the place
        // are said out loud on their Today, and the move needs both halves.
        'duration_minutes', 'delivery_mode', 'moved_from_at', 'client_confirmed_at',
      ]),
    programs.query().observeWithColumns(['status', 'template_id', 'name', 'start_date']),
    templates.query().observeWithColumns(['name', 'weeks']),
    clients.query().observeWithColumns(['name']),
    metrics.query().observeWithColumns(['value', 'metric_type', 'recorded_at']),
  ]).pipe(
    map(([ex, sets, wk, lx, sch, prog, tpl, cl, bm]): Rows => ({
      exercises: ex.map((e) => ({
        id: e.id,
        name: e.name,
        logType: e.logType,
        isCustom: e.isCustom,
      })),
      sets: sets.map((s) => ({
        id: s.id,
        workoutSessionId: s.workoutSessionId,
        exerciseId: s.exerciseId,
        setNumber: s.setNumber,
        loadKg: s.loadKg,
        reps: s.reps,
        rpe: s.rpe,
        notes: s.notes,
        createdAt: s.createdAt.getTime(),
        // The amber ring, and the only thing sync gets to say on this screen.
        // Read from WatermelonDB's own bookkeeping rather than a column of ours:
        // a second copy of "has this been pushed" is a second thing to get wrong.
        pending: s.syncStatus !== 'synced',
      })),
      workouts: wk.map((w) => ({
        id: w.id,
        clientId: w.clientId,
        programId: w.programId,
        scheduledSessionId: w.scheduledSessionId,
        sessionDate: w.sessionDate,
        startedAt: w.createdAt.getTime(),
        endedAt: ms(w.endedAt),
      })),
      logExercises: lx.map((r) => ({
        id: r.id,
        workoutSessionId: r.workoutSessionId,
        exerciseId: r.exerciseId,
        orderIndex: r.orderIndex,
        source: r.source,
        swappedFromExerciseId: r.swappedFromExerciseId,
        targetSets: r.targetSets,
        targetReps: r.targetReps,
        restSeconds: r.restSeconds,
        removedAt: ms(r.removedAt),
      })),
      sessions: sch.map((s) => ({
        id: s.id,
        clientId: s.clientId,
        programId: s.programId,
        status: s.status,
        dayLabel: s.dayLabel,
        templateDay: s.templateDay,
        scheduledAt: s.scheduledAt.getTime(),
        durationMinutes: s.durationMinutes,
        deliveryMode: s.deliveryMode,
        movedFromAt: ms(s.movedFromAt),
        clientConfirmedAt: ms(s.clientConfirmedAt),
      })),
      programs: prog.map((p) => ({
        id: p.id,
        clientId: p.clientId,
        templateId: p.templateId,
        name: p.name,
        status: p.status,
        startDate: p.startDate,
      })),
      templates: tpl.map((t) => ({ id: t.id, name: t.name, weeks: t.weeks })),
      clients: cl.map((c) => ({ id: c.id, name: c.name })),
      metrics: bm.map((m) => ({
        clientId: m.clientId,
        metricType: m.metricType,
        value: m.value,
        unit: m.unit,
        recordedAt: m.recordedAt.getTime(),
      })),
    })),
  );
}

export interface Log {
  input: LogInput;
  /** False only until the first emission of the app's life. Never drives a skeleton. */
  ready: boolean;
}

export function useLog(): Log {
  const [rows, setRows] = useState(cache.value);
  const [ready, setReady] = useState(cache.ready);
  const { prefs } = usePrefs();

  useEffect(() => {
    const sub = observeLog().subscribe((next) => {
      cache.set(next);
      setRows(next);
      setReady(true);
    });
    return () => sub.unsubscribe();
  }, []);

  return useMemo(
    () => ({
      input: { ...EMPTY_LOG_INPUT, ...rows, plateStepKg: prefs.plateStepKg },
      ready,
    }),
    [rows, ready, prefs.plateStepKg],
  );
}
