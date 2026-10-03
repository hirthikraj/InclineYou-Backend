import 'server-only';

import { cache } from 'react';

import type { ClientNoteWire } from '@/lib/clients/client-api';
import { getExercise } from '@/lib/exercises/api';
import type {
  ExerciseGroup, LastTime, LoggedSet, PlannedRow, PlanView, SessionDetailData, SessionRow,
} from '@/lib/sessions/api';

import { SessionLogApiError, getHistoryWire, getLogWire, send } from './api';
import { guard, type Result } from './finish-guard';
import { EFFORT, LOAD, effortFamily } from './kinds';
import { hasExotic, isPlain, sayOne, topOf } from './kindtext';
import type { ExerciseWire, HistoryItemWire, HistoryWire, LogWire, SetWire } from './wire';

/**
 * THE READ-ONLY RECORD OF A SESSION — `/sessions/:id`, built from the log read.
 *
 * ── WHAT THIS REPLACES ──────────────────────────────────────────────────────
 *
 * `lib/sessions/api.ts`'s `getSessionDetail`: a booking read, then a hunt through
 * every workout the client ever logged for the one that belonged to it (matched
 * by a link, then by the day), the program, the program's exercises, the client's
 * whole set history, their progress PRs and a by-ids exercise read. Here the log
 * IS the session (R2/R40), so one read — `GET /v1/sessions/{id}/log` — answers
 * the booking, the plan and what was done, and the old "is this id a booking or a
 * workout?" resolution is gone: the route's id is always the session's.
 *
 * The OUTPUT is the old `SessionDetailData`, field for field, because the screen
 * (`SessionDetail.tsx`) is not changing: every number it draws has to come out the
 * way it did, which is why `last time` and `the best set` below are the old
 * algorithms run over the new set history rather than the log read's own `last`
 * and `best` — those exclude THIS session but not later ones, so for a session from
 * three weeks ago "last time" would be an outing that had not happened yet.
 *
 * ── THREE THINGS THE NEW WIRE CANNOT SAY, AND WHAT STANDS IN ────────────────
 *
 * 1. **Kinds the screen cannot draw.** A logged set is `kg × reps` here, as it
 *    always was. A set whose load is not kilograms (a level, a % of 1RM, bodyweight)
 *    or whose effort is not a count of repetitions (a time, a distance) carries
 *    `null` for that half, so the card prints a dash rather than a wrong number.
 *    Drawing those kinds on the record is a UI change and is deliberately not made.
 * 2. **Muscle group.** The log names a movement and its equipment, not the group
 *    the screen prints beside it, so each distinct exercise is read once from the
 *    library (`GET /v1/exercises/{id}`). Lenient: without it the group is blank.
 * 3. **One note.** The old model had a booking note and a separate workout note;
 *    there is one `notes` on the session now. A started session shows it once, as
 *    the log view's *Trainer notes*; an unstarted one as *Session notes*.
 */

/* ───────────────────────────────────────────────────────────────── helpers ── */

function isoDay(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Midnight local — the cutoff for "the outing before this one". */
function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A set's load as kilograms, or null when it is not a weight (the old `loadKg`). */
const kgOf = (set: Pick<SetWire, 'loadKind' | 'loadValue'>) =>
  LOAD[set.loadKind].kilograms ? set.loadValue : null;

/** A set's effort as a count of repetitions, or null when it is a time or a distance (the old `reps`). */
const repsOf = (set: Pick<SetWire, 'effortKind' | 'effortValue'>) =>
  EFFORT[set.effortKind].repetitions ? set.effortValue : null;

async function lenient<T>(path: string, fallback: T): Promise<T> {
  try {
    return await send<T>(path);
  } catch {
    return fallback;
  }
}

/** The library's body part for one movement. Lenient, and read once per distinct id. */
const muscleGroupOf = cache(async (exerciseId: string): Promise<string | null> => {
  try {
    return (await getExercise(exerciseId)).muscleGroup ?? null;
  } catch {
    return null;
  }
});

const getHistory = cache(async (clientId: string): Promise<HistoryWire> => {
  try {
    return await getHistoryWire(clientId);
  } catch {
    return { exercises: {}, items: [] };
  }
});

/* ───────────────────────────────────────────── last time, and the best set ── */

/**
 * `lastTimeByExercise`, unchanged, over the new set history. For each movement,
 * the client's most recent outing STRICTLY BEFORE `before`, as its top set (most
 * load, then most reps) and how many sets it had — *105 × 5 · 4 sets*.
 */
function lastTimeByExercise(items: HistoryItemWire[], before: number): Map<string, LastTime> {
  const byExercise = new Map<string, Map<string, HistoryItemWire[]>>();
  for (const s of items) {
    if (s.doneAt >= before) continue;
    const days = byExercise.get(s.exerciseId) ?? new Map<string, HistoryItemWire[]>();
    days.set(s.sessionId, [...(days.get(s.sessionId) ?? []), s]);
    byExercise.set(s.exerciseId, days);
  }

  const out = new Map<string, LastTime>();
  for (const [exerciseId, days] of byExercise) {
    let latest: HistoryItemWire[] | null = null;
    let latestAt = -Infinity;
    for (const sets of days.values()) {
      const at = Math.max(...sets.map((s) => s.doneAt));
      if (at > latestAt) {
        latestAt = at;
        latest = sets;
      }
    }
    if (!latest) continue;

    const top = [...latest].sort(
      (a, b) => (kgOf(b) ?? 0) - (kgOf(a) ?? 0) || (repsOf(b) ?? 0) - (repsOf(a) ?? 0),
    )[0];
    const exotic = hasExotic(latest);
    out.set(exerciseId, {
      loadKg: kgOf(top), reps: repsOf(top), setCount: latest.length, at: latestAt,
      // A hold or a carry has no kg × reps to quote: say its best set in its own words instead of '1 sets'.
      ...(exotic ? { said: sayOne(topOf(latest) as HistoryItemWire) } : {}),
    });
  }
  return out;
}

/** What the client's best ever is, per movement: the heaviest load, and the most reps — the old progress PR. */
function bestsByExercise(items: HistoryItemWire[]): Map<string, { load: number | null; reps: number | null }> {
  const map = new Map<string, { load: number | null; reps: number | null }>();
  for (const s of items) {
    const cur = map.get(s.exerciseId) ?? { load: null, reps: null };
    const load = kgOf(s);
    const reps = repsOf(s);
    if (load != null && (cur.load == null || load > cur.load)) cur.load = load;
    if (reps != null && (cur.reps == null || reps > cur.reps)) cur.reps = reps;
    map.set(s.exerciseId, cur);
  }
  return map;
}

/** `bestSetId`, unchanged: the set of THIS session that holds the client's best — by load, else by reps. */
function bestSetId(
  sets: { id: string | null; loadKg: number | null; reps: number | null }[],
  best: { load: number | null; reps: number | null } | undefined,
): string | null {
  if (!best) return null;

  if (best.load != null) {
    const top = sets
      .filter((s) => s.loadKg != null)
      .sort((a, b) => (b.loadKg as number) - (a.loadKg as number) || (b.reps ?? 0) - (a.reps ?? 0))[0];
    return top && (top.loadKg as number) >= best.load ? top.id : null;
  }

  if (best.reps != null) {
    const top = sets
      .filter((s) => s.reps != null)
      .sort((a, b) => (b.reps as number) - (a.reps as number))[0];
    return top && (top.reps as number) >= best.reps ? top.id : null;
  }

  return null;
}

/**
 * `bestSetId` FOR A HOLD OR A CARRY: the set of THIS session that holds the client's best — the longest
 * time, or the furthest distance (then the heavier load). `bestSetId` ranks by kilograms and reps, so a
 * plank had no best at all and a carry was 'best ever' only by its weight; this is the same question
 * the console's verdict (`judgeEffort`) asks, so the chip and the badge agree. Equal to the best
 * counts, as it does there (`>=`): a set that ties the record holds it.
 */
function effortHolder(
  sets: { id: string | null; set: { effortValue: number | null; loadValue: number | null } }[],
  before: { effortValue: number | null }[],
): string | null {
  const top = [...sets].sort(
    (a, b) => (b.set.effortValue ?? 0) - (a.set.effortValue ?? 0) || (b.set.loadValue ?? 0) - (a.set.loadValue ?? 0),
  )[0];
  if (!top || top.set.effortValue === null) return null;
  const best = before.reduce((max, i) => Math.max(max, i.effortValue ?? 0), 0);
  return top.set.effortValue >= best ? top.id : null;
}

/* ───────────────────────────────────────────────────────── the plan rows ── */

/** The prescription for one movement: how many sets, and what the first one asked for. */
function targetOf(ex: ExerciseWire) {
  const planned = ex.sets.filter((s) => s.planned);
  const first = planned.find((s) => s.target) ?? null;
  // The plan's words for a target in a kind `reps` / `kg` would mislabel ('2 × 45' for a 45-second hold).
  const odd = first !== null && !isPlain(first);
  return {
    sets: planned.length > 0 ? planned.length : null,
    reps: first?.target?.effort ?? null,
    load: first?.target?.load ?? null,
    restSeconds: first?.target?.restSeconds ?? null,
    ...(odd && first
      ? {
          effortSaid: first.target?.effort != null ? EFFORT[first.effortKind].format(first.target.effort) : null,
          loadSaid: first.target?.load != null ? LOAD[first.loadKind].format(first.target.load) : null,
        }
      : {}),
  };
}

const done = (set: SetWire) => set.doneAt !== null;

/* ──────────────────────────────────────────────────────────── the record ── */

export const getSessionDetailData = cache(async (routeId: string): Promise<SessionDetailData | null> => {
  const now = Date.now();
  const log: LogWire | null = await getLogWire(routeId);
  if (!log) return null;

  const session = log.session;
  const clientId = log.client.id;
  const started = session.startedAt !== null;

  const [history, notes] = await Promise.all([
    getHistory(clientId),
    // v1.1 lists are `{items}` envelopes, not bare arrays — read `.items` (a bare array here crashed the whole record page).
    lenient<{ items?: ClientNoteWire[] }>(`/v1/clients/${encodeURIComponent(clientId)}/notes`, { items: [] }).then((r) => r.items ?? []),
  ]);

  /* Removed movements are not on the card, but a PLANNED one that was removed was
     still prescribed — the plan table shows what was asked, whether or not it happened. */
  const live = log.exercises.filter((e) => e.removedAt === null);
  const planned = log.exercises.filter((e) => e.source === 'planned').sort((a, b) => a.position - b.position);

  const groupOf = new Map<string, string | null>();
  await Promise.all(
    [...new Set(log.exercises.map((e) => e.exerciseId))].map(async (id) => {
      groupOf.set(id, await muscleGroupOf(id));
    }),
  );

  /* The cutoff is THIS session's day, not `now`: reading a session from three weeks
     ago, "last time" means the outing before it. */
  const before = startOfDay(session.scheduledAt);
  const lastByExercise = lastTimeByExercise(history.items, before);
  const bests = bestsByExercise(history.items);

  const loggedByExercise = new Map<string, number>();

  /* ── what happened ── */
  let workout: SessionDetailData['workout'] = null;
  if (started) {
    const exercises: ExerciseGroup[] = [];
    let totalSets = 0;
    let totalVolume = 0;

    for (const ex of [...live].sort((a, b) => a.position - b.position)) {
      const sets = ex.sets.filter(done).sort((a, b) => a.position - b.position);
      if (sets.length === 0) continue;

      const asLogged = sets.map((s) => ({ id: s.id, loadKg: kgOf(s), reps: repsOf(s), set: s }));
      const volume = asLogged.reduce((sum, s) => sum + (s.loadKg ?? 0) * (s.reps ?? 0), 0);
      const family = sets.length > 0 && sets.every((x) => effortFamily(x.effortKind) === effortFamily(sets[0].effortKind))
        ? effortFamily(sets[0].effortKind)
        : null;
      const holder = family
        ? effortHolder(asLogged, history.items.filter((i) => i.exerciseId === ex.exerciseId && effortFamily(i.effortKind) === family))
        : bestSetId(asLogged, bests.get(ex.exerciseId));

      totalSets += sets.length;
      totalVolume += volume;
      loggedByExercise.set(ex.exerciseId, sets.length);

      const target = ex.source === 'planned' ? targetOf(ex) : null;
      exercises.push({
        exerciseId: ex.exerciseId,
        exerciseName: ex.name,
        muscleGroup: groupOf.get(ex.exerciseId) ?? null,
        sets: asLogged.map((s, i): LoggedSet => ({
          id: s.id ?? `${ex.exerciseId}:${i}`,
          setNumber: s.set.position ?? i + 1,
          loadKg: s.loadKg,
          reps: s.reps,
          // Said in the set's own kinds when the group has any the table's two columns cannot hold.
          ...(hasExotic(sets) ? { said: sayOne(s.set) } : {}),
          rpe: s.set.rpe,
          notes: s.set.notes,
          bestEver: s.id !== null && s.id === holder,
        })),
        volumeKg: round1(volume),
        lastTime: lastByExercise.get(ex.exerciseId) ?? null,
        target,
        unplanned: ex.source !== 'planned',
      });
    }

    workout = {
      id: session.id,
      sessionDate: isoDay(session.startedAt ?? session.scheduledAt),
      notes: session.notes,
      startedAt: session.startedAt as number,
      endedAt: session.endedAt,
      exercises,
      totalSets,
      totalVolumeKg: round1(totalVolume),
    };
  }

  /* ── what was prescribed ── */
  let plan: PlanView | null = null;
  if (log.program) {
    const rows: PlannedRow[] = planned.map((ex) => {
      const t = targetOf(ex);
      return {
        exerciseId: ex.exerciseId,
        exerciseName: ex.name,
        muscleGroup: groupOf.get(ex.exerciseId) ?? null,
        targetSets: t.sets,
        targetReps: t.reps,
        restSeconds: t.restSeconds,
        targetLoad: t.load,
        ...(t.effortSaid !== undefined ? { targetEffortSaid: t.effortSaid, targetLoadSaid: t.loadSaid } : {}),
        orderIndex: ex.position,
        loggedSets: loggedByExercise.get(ex.exerciseId) ?? 0,
        lastTime: lastByExercise.get(ex.exerciseId) ?? null,
      };
    });
    plan = {
      programId: log.program.id,
      programName: log.program.name?.trim() || 'Program',
      dayLabel: session.workout?.name?.trim() ?? null,
      templateDay: session.workout?.day ?? null,
      week: session.workout?.week ?? null,
      exercises: rows,
      totalSets: rows.reduce((sum, r) => sum + (r.targetSets ?? 0), 0),
    };
  }

  /* Pinned first, then newest — the client file's pinned strip orders the same way. */
  const sortedNotes = [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt - a.createdAt;
  });

  const row: SessionRow = {
    id: routeId,
    bookingId: session.id,
    clientId,
    clientName: log.client.name.trim() || 'Client',
    scheduledAt: session.scheduledAt,
    minutes: session.durationMinutes > 0 ? session.durationMinutes : 60,
    status: (session.status ?? '').toLowerCase(),
    mode: session.deliveryMode?.toLowerCase() === 'remote' ? 'remote' : 'floor',
    programId: log.program?.id ?? session.workout?.programId ?? null,
    programName: log.program?.name?.trim() ?? null,
    dayLabel: session.workout?.name?.trim() ?? null,
    templateDay: session.workout?.day ?? null,
    hasLog: started,
    workoutId: started ? session.id : null,
    /* One note on the session now: shown once, under the log view's own heading. */
    notes: started ? null : session.notes,
  };

  return { routeId, session: row, plan, workout, notes: sortedNotes, now };
});

/** `/sessions/:id` — the same four answers every guard on this half gives. */
export function requireSessionDetail(id: string): Promise<Result<SessionDetailData>> {
  return guard(() => getSessionDetailData(id));
}

export { SessionLogApiError };
