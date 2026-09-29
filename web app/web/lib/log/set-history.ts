import 'server-only';

import { api, ApiError } from '@/lib/http/client';
import type { LogExercise, LogSet, LogWorkout } from './log';
import { LogApiError } from './api';

/**
 * `GET /v1/clients/{id}/set-history` — every completed set for one client,
 * oldest first, each exercise named once per page (api-contract 1.1 Client
 * file). It replaces what Progress, the lift's history and the report used to
 * download to draw one client: every client, the whole library and every
 * workout on the account.
 */
export interface SetHistoryItem {
  sessionId: string;
  /** `yyyy-MM-dd`, the session's day in the workspace calendar. */
  date: string;
  exerciseId: string;
  position: number;
  loadKind: string;
  effortKind: string;
  loadValue: number | null;
  effortValue: number | null;
  rpe: number | null;
  doneAt: number;
}

export interface SetHistory {
  exercises: Record<string, { name: string; equipment: string | null; custom: boolean }>;
  items: SetHistoryItem[];
}

/** Every page, followed to `nextCursor: null` — a year of four sessions a week is well inside one. */
export async function fetchSetHistory(
  clientId: string,
  opts: { from?: string; exerciseId?: string } = {},
): Promise<SetHistory> {
  const q = new URLSearchParams();
  if (opts.from) q.set('from', opts.from);
  if (opts.exerciseId) q.set('exerciseId', opts.exerciseId);
  const out: SetHistory = { exercises: {}, items: [] };
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    if (cursor) q.set('cursor', cursor);
    let res: SetHistory & { nextCursor: string | null };
    try {
      res = await api(`/v1/clients/${encodeURIComponent(clientId)}/set-history?${q}`);
    } catch (e) {
      if (e instanceof ApiError) throw new LogApiError(e.status);
      throw e;
    }
    Object.assign(out.exercises, res.exercises);
    out.items.push(...res.items);
    cursor = res.nextCursor;
    if (!cursor) break;
  }
  return out;
}

/** A weight in kilograms, when the set carried one. `percent_1rm`, `level` and the RPE kinds are not kilograms. */
const KG_KINDS = new Set(['weight', 'weight_range', 'rpe_weight']);
/** A count of reps. Time and distance are not reps, so those sets carry no reps here. */
const REP_KINDS = new Set(['reps', 'rep_interval', 'max_reps']);

/**
 * The same history in `LogInput`'s shape, so `buildProgress` and `buildHistory`
 * keep owning personal bests and weekly volume. A session is a "workout" (the
 * log sits on the session in v1); a set keeps its load only when it is kilograms
 * and its effort only when it is reps. A timed or distance set therefore counts
 * as done without adding volume, and a bodyweight set is reps with no load.
 */
export function toLogInput(clientId: string, history: SetHistory): {
  workouts: LogWorkout[];
  sets: LogSet[];
  exercises: LogExercise[];
} {
  const workouts = new Map<string, LogWorkout>();
  const weighted = new Set<string>();
  const sets: LogSet[] = history.items.map((s) => {
    if (!workouts.has(s.sessionId)) {
      workouts.set(s.sessionId, {
        id: s.sessionId, clientId, scheduledSessionId: s.sessionId,
        sessionDate: s.date, startedAt: s.doneAt, endedAt: s.doneAt,
      });
    }
    const loadKg = KG_KINDS.has(s.loadKind) ? s.loadValue : null;
    if (loadKg != null) weighted.add(s.exerciseId);
    return {
      id: `${s.sessionId}:${s.exerciseId}:${s.position}:${s.doneAt}`,
      workoutSessionId: s.sessionId,
      exerciseId: s.exerciseId,
      setNumber: s.position,
      loadKg,
      reps: REP_KINDS.has(s.effortKind) ? s.effortValue : null,
      rpe: s.rpe,
      createdAt: s.doneAt,
    };
  });
  const exercises: LogExercise[] = Object.entries(history.exercises).map(([id, e]) => ({
    id, name: e.name, equipment: e.equipment, isCustom: e.custom,
    logType: weighted.has(id) ? 'weight_reps' : 'reps',
  }));
  // Newest first, the order the old reader handed buildProgress.
  return { workouts: [...workouts.values()].reverse(), sets, exercises };
}
