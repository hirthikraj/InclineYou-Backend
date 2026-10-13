import 'server-only';

import { redirect } from 'next/navigation';

import { ApiError, api } from '@/lib/http/client';

/**
 * THE CLIENT'S PLAN AND PROGRESS — the wire of api-contract 1.2 pp-l1 … pp-l4 and pp-l6. Reads only.
 *
 * Counts, never streaks; a weight carries no good-or-bad tone; no body measurement is anywhere in it (a body is measured in an assessment
 * and seen there). Every figure on a page is a field of one of these, so the sentence a page composes can be checked against the logs.
 */
export interface SessionCard {
  id: string;
  scheduledAt: number;
  durationMinutes: number;
  mode?: string;
  place?: string;
  workoutName?: string;
  rescheduleUrl?: string;
}

export interface PlanDayWire {
  workoutId: string;
  week: number | null;
  day: number | null;
  name: string;
  state: 'done' | 'booked' | 'next' | 'todo';
  sessionId: string | null;
}

export interface PlanWire {
  upcoming: SessionCard[];
  program: { id: string; name: string; weeks: number; status: string; startDate: string | null; endDate: string | null; currentWeek: number; days: PlanDayWire[] } | null;
}

export interface PastItemWire {
  id: string;
  name: string;
  weeks: number;
  startDate: string | null;
  endDate: string | null;
  sessionsDone: number;
}

export interface PlanSetWire {
  position: number;
  loadKind: string;
  effortKind: string;
  targetLoad: number | null;
  targetEffort: number | null;
  restSeconds: number | null;
}

export interface ProgramTreeWire {
  id: string;
  name: string;
  weeks: number;
  status: string;
  startDate: string | null;
  endDate: string | null;
  workouts: {
    id: string;
    week: number | null;
    day: number | null;
    name: string;
    exercises: { id: string; exerciseId: string; name: string; target: string | null; section: string | null; cue: string | null; sets: PlanSetWire[] }[];
  }[];
}

export interface PointWire {
  loadValue: number | null;
  effortValue: number | null;
  e1rm: number | null;
}

export interface ProgressWire {
  windowDays: number;
  strength: { tracked: number; improved: number; best: { exerciseId: string; name: string; changePct: number; from: PointWire; to: PointWire } | null };
  consistency: { sessionsDone: number; trainerLed: number; selfRun: number; perWeek: number };
  milestones: { kind: string; label: string; at: number }[];
}

export interface BestSetWire {
  loadValue: number | null;
  effortValue: number | null;
  e1rm: number | null;
  on: string;
}

export interface ExerciseItemWire {
  exerciseId: string;
  name: string;
  target: string | null;
  sessions: number;
  lastOn: string;
  best: BestSetWire;
}

export interface ExerciseSeriesWire {
  exercise: { id: string; name: string; logType: string };
  series: { on: string; loadValue: number | null; effortValue: number | null; e1rm: number | null; volume: number }[];
  bests: { e1rm: BestSetWire | null; load: BestSetWire | null };
}

export interface DoneItemWire {
  id: string;
  loggedBy: 'trainer' | 'client';
  at: number;
  workoutName: string | null;
  setsDone: number;
  volumeKg: number;
  newBests: number;
  recapUnread: boolean;
}

export type Read<T> = { ok: true; data: T } | { ok: false; status: number | null; code: string | null };

export async function portalGet<T>(path: string): Promise<Read<T>> {
  try {
    return { ok: true, data: await api<T>(path) };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, status: e.status, code: e.problem.code ?? null };
    throw e;
  }
}

/**
 * The data, or null when the read failed in a way the page should say in its own words. A client who is paused or removed, or whose
 * session ended, is sent to the screen that tells them so — that is never a page's own error to draw.
 */
export function settle<T>(r: Read<T>): T | null {
  if (r.ok) return r.data;
  if (r.code === 'PORTAL_PAUSED') redirect('/sign-in/paused');
  if (r.code === 'PORTAL_REMOVED') redirect('/sign-in/removed');
  if (r.status === 401) redirect('/sign-in');
  return null;
}
