import { Q } from '@nozbe/watermelondb';
import { database } from './index';
import SetLog from './models/SetLog';
import WorkoutSession from './models/WorkoutSession';
import Exercise from './models/Exercise';

const setLogsCollection = database.get<SetLog>('set_logs');
const workoutSessionsCollection = database.get<WorkoutSession>('workout_sessions');
const exercisesCollection = database.get<Exercise>('exercises');

export interface PrRecord {
  exerciseId: string;
  exerciseName: string;
  maxLoadKg: number;
  maxReps: number | null;
  sessionDate: string;
}

export interface VolumePoint {
  weekStart: string;   // "YYYY-MM-DD" Monday
  volume: number;      // sum(load_kg * reps)
}

/** Computes personal records per exercise from local set_log data. */
export async function computePRs(clientId: string): Promise<PrRecord[]> {
  const sessions = await workoutSessionsCollection
    .query(Q.where('client_id', clientId))
    .fetch();
  if (!sessions.length) return [];

  const sessionIds = sessions.map((s) => s.id);
  const sessionDateMap: Record<string, string> = {};
  sessions.forEach((s) => { sessionDateMap[s.id] = s.sessionDate; });

  const logs = await setLogsCollection
    .query(Q.where('workout_session_id', Q.oneOf(sessionIds)))
    .fetch();

  // Group by exercise: track max loadKg and associated date/reps
  const prMap: Record<string, { loadKg: number; reps: number | null; sessionDate: string }> = {};
  for (const log of logs) {
    if (!log.loadKg) continue;
    const existing = prMap[log.exerciseId];
    if (!existing || log.loadKg > existing.loadKg) {
      prMap[log.exerciseId] = {
        loadKg: log.loadKg,
        reps: log.reps ?? null,
        sessionDate: sessionDateMap[log.workoutSessionId] ?? '',
      };
    }
  }

  if (!Object.keys(prMap).length) return [];

  const exercises = await exercisesCollection
    .query(Q.where('id', Q.oneOf(Object.keys(prMap))))
    .fetch();
  const exerciseNames: Record<string, string> = {};
  exercises.forEach((e) => { exerciseNames[e.id] = e.name; });

  return Object.entries(prMap)
    .map(([exerciseId, pr]) => ({
      exerciseId,
      exerciseName: exerciseNames[exerciseId] ?? exerciseId,
      maxLoadKg: pr.loadKg,
      maxReps: pr.reps,
      sessionDate: pr.sessionDate,
    }))
    .sort((a, b) => b.maxLoadKg - a.maxLoadKg);
}

/** Returns weekly training volume (kg × reps) for the last 16 weeks. */
export async function computeVolumeByWeek(clientId: string): Promise<VolumePoint[]> {
  const sessions = await workoutSessionsCollection
    .query(Q.where('client_id', clientId))
    .fetch();
  if (!sessions.length) return [];

  const sessionIds = sessions.map((s) => s.id);
  const sessionDateMap: Record<string, string> = {};
  sessions.forEach((s) => { sessionDateMap[s.id] = s.sessionDate; });

  const logs = await setLogsCollection
    .query(Q.where('workout_session_id', Q.oneOf(sessionIds)))
    .fetch();

  const weekMap: Record<string, number> = {};
  for (const log of logs) {
    if (!log.loadKg || !log.reps) continue;
    const date = sessionDateMap[log.workoutSessionId];
    if (!date) continue;
    const weekStart = getMonday(date);
    weekMap[weekStart] = (weekMap[weekStart] ?? 0) + log.loadKg * log.reps;
  }

  return Object.entries(weekMap)
    .map(([weekStart, volume]) => ({ weekStart, volume }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .slice(-16);
}

/** Returns the ISO date of the Monday for a given "YYYY-MM-DD" date string. */
function getMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1 - day); // Monday = 1
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
