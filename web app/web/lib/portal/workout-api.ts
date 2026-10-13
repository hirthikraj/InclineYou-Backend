import 'server-only';

import { cache } from 'react';

import { ApiError, api } from '@/lib/http/client';

/**
 * THE CLIENT'S WORKOUT — the wire of api-contract 1.2 pw-l1 · pw-l2 · pp-l6 and what the player's writes answer.
 *
 * Text only: an exercise has no picture, by licence. A client's own numbers are never hidden by `hideWeight` (that switch is the
 * body-weight metric's alone). The server owns every sentence a refusal needs.
 */
export interface LastWire {
  date: string;
  sets: { loadValue: number | null; effortValue: number | null; loadKind: string; effortKind: string }[];
}

export interface AltWire {
  exerciseId: string;
  name: string;
  source: 'approved' | 'library';
  equipment?: string | null;
  target?: string | null;
}

export interface PreviewExerciseWire {
  id: string;
  exerciseId: string;
  name: string;
  equipment: string | null;
  target: string | null;
  position: number;
  section: string | null;
  groupId: string | null;
  cue: string | null;
  steps: string[];
  sets: { position: number; loadKind: string; effortKind: string; targetLoad: number | null; targetEffort: number | null; restSeconds: number | null }[];
  alternatives: AltWire[];
  last: LastWire | null;
}

export interface PreviewWire {
  workout: { id: string; name: string; week: number | null; day: number | null; estimatedMinutes: number };
  program: { id: string; name: string; weeks: number };
  startable: boolean;
  inProgress: { sessionId: string } | null;
  exercises: PreviewExerciseWire[];
}

export interface SetWire {
  id: string;
  position: number;
  planned: boolean;
  loadKind: string;
  effortKind: string;
  target: { load: number | null; effort: number | null; restSeconds: number | null; tempo: string | null } | null;
  loadValue: number | null;
  effortValue: number | null;
  rpe: number | null;
  notes: string | null;
  doneAt: number | null;
  enteredBy: string | null;
}

export interface TotalsWire {
  setsDone: number;
  setsPlanned: number;
  volumeKg: number;
}

export interface LogExerciseWire {
  id: string;
  exerciseId: string;
  name: string;
  position: number;
  section: string | null;
  groupId: string | null;
  source: string;
  swappedFrom: { exerciseId: string; name: string } | null;
  swapSource: 'approved' | 'library' | null;
  swapReason: string | null;
  removedAt: number | null;
  cue: string | null;
  steps: string[];
  sets: SetWire[];
  alternatives: AltWire[];
  last: LastWire | null;
}

export interface FeedbackWire {
  effort: 'easy' | 'right' | 'hard' | null;
  note: string | null;
  at: number;
}

export interface LogWire {
  session: {
    id: string;
    loggedBy: 'client' | 'trainer';
    status: 'scheduled' | 'done';
    startedAt: number | null;
    endedAt: number | null;
    pausedSeconds: number;
    workout: { id: string; name: string; week: number | null; day: number | null } | null;
    version: string;
  };
  readOnly: boolean;
  exercises: LogExerciseWire[];
  totals: TotalsWire;
  autoRestTimer: boolean;
  feedback: FeedbackWire | null;
  recap: { id: string; body: string; readAt: number | null } | null;
}

export interface SummaryWire {
  durationSeconds: number;
  setsDone: number;
  setsPlanned: number;
  volumeKg: number;
  newBests: { exerciseId: string; name: string; loadValue: number; effortValue: number; e1rm: number; previousE1rm: number }[];
  milestones: { kind: string; label: string }[];
}

export interface FinishedWire {
  session: { id: string; status: 'done'; endedAt: number; version: string };
  summary: SummaryWire;
  feedback: FeedbackWire | null;
}

export class WorkoutError extends Error {
  constructor(readonly status: number | null, readonly code: string | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'WorkoutError';
  }
}

async function read<T>(path: string): Promise<T> {
  try {
    return await api<T>(path);
  } catch (e) {
    if (e instanceof ApiError) throw new WorkoutError(e.status, e.problem.code ?? null);
    throw e;
  }
}

export const getPreview = cache((workoutId: string) => read<PreviewWire>(`/v1/portal/workouts/${encodeURIComponent(workoutId)}`));

export const getLog = cache((sessionId: string) => read<LogWire>(`/v1/portal/sessions/${encodeURIComponent(sessionId)}/log`));
