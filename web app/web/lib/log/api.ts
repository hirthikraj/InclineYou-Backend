import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';
import { programWeek, rowsForDay, type ProgramExerciseWire } from './plan';
import {
  buildFinish, buildHistory, buildLog, buildPicker, buildProgress, buildRows,
  isoDay, PLATE_STEP_KG,
  type FinishView, type HistorySession, type HistoryView, type LogInput, type LogSet,
  type LogView, type PickView, type ProgressRange, type ProgressView,
} from './log';

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

export class LogApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'LogApiError';
  }
}

async function get<T>(path: string): Promise<T> {
  const token = await getToken();
  if (!token) throw new LogApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new LogApiError(null);
  }
  if (!res.ok) throw new LogApiError(res.status);

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/* ────────────────────────────────────────────────────────── wire shapes ── */

interface WorkoutWire {
  id: string;
  clientId: string;
  programId: string | null;
  scheduledSessionId: string | null;
  sessionDate: string;
  notes: string | null;
  createdAt: number;
  endedAt: number | null;
}

interface SetWire {
  id: string;
  workoutSessionId: string;
  exerciseId: string;
  setNumber: number;
  loadKg: number | null;
  reps: number | null;
  rpe: number | null;
  notes: string | null;
  createdAt: number;
  /**
   * The owning log's `session_date`, ISO `yyyy-MM-dd`. Appended to
   * `SetLogResponse` on 28 Aug 2026.
   *
   * Not read here, because this page holds the client's whole workout list and
   * already joins on it — but it is what makes the bulk read below answerable
   * on its own, so it is typed rather than left off as a surprise for whoever
   * next needs a set's date without the workout beside it. Never `createdAt`: a
   * Tuesday session typed up on Thursday is a Tuesday session.
   */
  sessionDate: string | null;
}

/** V13's `workout_exercise`, on REST since 28 Aug 2026. */
interface WorkoutExerciseWire {
  id: string;
  exerciseId: string;
  orderIndex: number;
  source: string;
  swappedFromExerciseId: string | null;
  targetSets: number | null;
  targetReps: number | null;
  restSeconds: number | null;
  removedAt: number | null;
}

interface SessionWire {
  id: string;
  clientId: string;
  programId: string | null;
  scheduledAt: number;
  durationMinutes: number | null;
  status: string;
  dayLabel: string | null;
  templateDay: number | null;
  deliveryMode: string | null;
  notes: string | null;
}

interface ClientWire {
  id: string;
  name: string;
  status: string;
}

interface ProgramWire {
  id: string;
  clientId: string;
  templateId: string | null;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
}

interface ExerciseWire {
  id: string;
  name: string;
  muscleGroup: string | null;
  equipment: string | null;
  isCustom: boolean;
  /**
   * V12's `log_type` — 'weight_reps' | 'reps', and **null on every seeded row**,
   * which is what all 873 of them are. On `ExerciseResponse` since 28 Aug 2026.
   *
   * Nullable twice over, then: null because the column is, and null because a
   * response from an older backend does not carry the field. `readLogType`
   * treats both the same and falls back to inference, which is right — the
   * inference was never wrong, it just had nothing to go on for an exercise
   * nobody has logged yet.
   */
  logType: string | null;
}

interface PackageWire {
  id: string;
  type: string;
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  status: string;
  createdAt: number;
}

interface MetricWire {
  metricType: string;
  value: number;
  unit: string;
  recordedAt: number;
}

/* ──────────────────────────────────────────── the client's whole history ── */

/**
 * EVERY SET THIS CLIENT HAS EVER LOGGED, IN ONE REQUEST.
 *
 * This used to be a WINDOW and a patch, and both are gone.
 *
 * `GET /v1/workouts/{id}/sets` is per-session, so a client's full history cost
 * one HTTP request per logged session — a client at three sessions a week for a
 * year is ~150 against a 120/min ceiling, on one page load. So this page read
 * the 40 most recent sessions through a six-at-a-time pool, and because a
 * bounded window understates an old best and would hand out gold for beating a
 * number that was never the best, it took the all-time maximum load per
 * exercise from `GET /v1/clients/{id}/progress` and gave `judge` that as a
 * floor.
 *
 * The patch had two holes of its own, both narrow and both real: `/progress` is
 * `LIMIT 30` exercises, and it counts only sets that carry a load. A client with
 * more than thirty movements, or a reps-only exercise logged more than forty
 * times, could have an old best outside the window AND outside the floor.
 *
 * `GET /v1/workouts/sets?clientId=` closes all of it. One request, the whole
 * history, so `judge` compares today against everything that actually happened
 * and there is no second opinion to disagree with. `HISTORY_SESSIONS`,
 * `HISTORY_SESSIONS_DEEP`, the pool and the floor are deleted rather than
 * loosened — a window with a bigger number is still a window.
 *
 * `exerciseId` narrows it where the page only asks about one movement, which is
 * frames 4a and 7a. Everything else wants the lot.
 */
async function setsForClient(clientId: string, exerciseId?: string): Promise<LogSet[]> {
  const qs = exerciseId ? `&exerciseId=${exerciseId}` : '';
  const rows = await get<SetWire[]>(`/v1/workouts/sets?clientId=${clientId}${qs}`).catch(
    () => [] as SetWire[],
  );
  return (rows ?? []).map((s) => ({
    id: s.id,
    workoutSessionId: s.workoutSessionId,
    exerciseId: s.exerciseId,
    setNumber: s.setNumber ?? 1,
    loadKg: s.loadKg,
    reps: s.reps,
    rpe: s.rpe,
    notes: s.notes,
    createdAt: s.createdAt,
  }));
}

/**
 * Sets for a handful of NAMED logs, six at a time.
 *
 * The one read the bulk route above cannot do, and it survives for that reason
 * alone: frame 5a's picker wants the open logs across **every** client, and
 * `?clientId=` is per client. There are rarely more than two — "two logs open at
 * once is a supported state, not a warning" — and the list is capped at eight,
 * so this is a handful of requests and not a fan-out.
 *
 * `Promise.all` over eight would open eight sockets at once and one at a time
 * would make the page wait eight round trips; six is the undo-nothing middle.
 */
async function pool<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      out[i] = await run(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function setsFor(workoutIds: string[]): Promise<LogSet[]> {
  const pages = await pool(workoutIds, 6, (id) =>
    get<SetWire[]>(`/v1/workouts/${id}/sets`).catch(() => [] as SetWire[]),
  );
  return pages.flat().map((s) => ({
    id: s.id,
    workoutSessionId: s.workoutSessionId,
    exerciseId: s.exerciseId,
    setNumber: s.setNumber ?? 1,
    loadKg: s.loadKg,
    reps: s.reps,
    rpe: s.rpe,
    notes: s.notes,
    createdAt: s.createdAt,
  }));
}

/**
 * The whole library, once per render.
 *
 * 1,324 rows and no by-id route, so there is no cheaper way to put a name on a
 * set log. It is text-only since V22 — the artwork was © Gym visual and
 * unlicensed — which is what makes one page of it small enough to do this.
 */
const allExercises = cache(async (): Promise<ExerciseWire[]> => {
  const page = await get<{ exercises: ExerciseWire[] }>('/v1/exercises?size=2000');
  return page?.exercises ?? [];
});

const allClients = cache(async () => get<ClientWire[]>('/v1/clients'));
const allWorkouts = cache(async () => get<WorkoutWire[]>('/v1/workouts'));

function toWorkout(w: WorkoutWire) {
  return {
    id: w.id,
    clientId: w.clientId,
    programId: w.programId,
    scheduledSessionId: w.scheduledSessionId,
    sessionDate: w.sessionDate,
    startedAt: w.createdAt,
    endedAt: w.endedAt,
  };
}

/* ──────────────────────────────────────────────────────────── the console ── */

export interface ConsoleData {
  /** What the URL said, which is what every link back has to keep saying. */
  routeId: string;
  view: LogView;
  /** The booking behind the log, when there is one. */
  session: SessionWire | null;
  /** Everything the add panel offers, already ranked. */
  library: { id: string; name: string; muscleGroup: string | null; isCustom: boolean }[];
  /** exerciseId → "last: 45 kg × 10 · 3 Aug", for the recents list. */
  recents: { exerciseId: string; name: string; meta: string; isCustom: boolean }[];
  /** Frame 3b's third scope: how many clients are on this program's template. */
  templateReach: number | null;
  /** Frame 3b's second scope: how much of the plan is left to change. */
  programWeeksLeft: number | null;
  /**
   * The fourth figure in the strip, and the one it is hardest to remember to
   * show: **the pack, unchanged.** Status about something that did NOT happen.
   * Finishing the log does not move it — a pack moves on done or no-show, never
   * on booked — so the console prints what it is now and frame 5b prints what
   * marking it done will do to it.
   */
  pack: { remaining: number; total: number } | null;
  /** Frame 6b's offer: the last whole session they did, as a place to go. */
  repeatHref: string | null;
  templateId: string | null;
  programId: string | null;
  /**
   * exerciseId → the last few sessions on it, judged at the time.
   *
   * The right column of frame 1a, and the half a 390px phone cannot do: **the
   * reason to look at history is to decide today's load, so it sits beside the
   * entry.** Built with `buildHistory`, which walks forward and judges each
   * session against everything before it — so the line that reads *record,
   * quietly* is the same computation the console's own badge is, and the two
   * cannot disagree.
   */
  timelines: Record<string, HistorySession[]>;
  now: number;
}

/**
 * THE ROUTE'S `:id` IS WHATEVER IDENTIFIES THE SESSION.
 *
 * The design gives the console `/sessions/:id/log`, and `/sessions/:id` in this
 * app is already a BOOKING. Most logs have one, so most of the time those two
 * ids are the same id and a trainer can move between the two screens without the
 * URL changing shape.
 *
 * Frame 5a's third group is the exception: *everybody else · no booking needed*.
 * A log started from there has no booking to be named after, so it is named
 * after itself. One list is fetched either way, so resolving both costs one map
 * lookup rather than a second request — and the alternative, a second route for
 * unbooked logs, would put the same screen at two URLs and make every link into
 * it a branch.
 */
async function resolve(routeId: string): Promise<{ workout: WorkoutWire | null; sessionId: string | null }> {
  const workouts = await allWorkouts();
  const bySession = (workouts ?? []).find((w) => w.scheduledSessionId === routeId);
  if (bySession) return { workout: bySession, sessionId: routeId };
  const byId = (workouts ?? []).find((w) => w.id === routeId);
  if (byId) return { workout: byId, sessionId: byId.scheduledSessionId };
  return { workout: null, sessionId: routeId };
}

export const getConsole = cache(
  async (routeId: string): Promise<ConsoleData | null> => {
    const now = Date.now();
    const { workout, sessionId } = await resolve(routeId);
    if (!workout) return null;

    const [clients, exercises, programs, sessionsAll, packages, liveRows] = await Promise.all([
      allClients(),
      allExercises(),
      get<ProgramWire[]>(`/v1/programs?clientId=${workout.clientId}`),
      get<SessionWire[]>(`/v1/sessions?clientId=${workout.clientId}`),
      get<PackageWire[]>(`/v1/clients/${workout.clientId}/packages`).catch(() => [] as PackageWire[]),
      /* Today's card list. Lenient: a log opened by `/done`, or by a build older
         than the route, simply has none — and `buildRows` reconstructs the grid
         from the plan and the sets for exactly that case. An empty list and a
         failed read are the same thing to it. */
      get<WorkoutExerciseWire[]>(`/v1/workouts/${workout.id}/exercises`).catch(
        () => [] as WorkoutExerciseWire[],
      ),
    ]);

    /* The pack a session would come off is the oldest ACTIVE session pack with
       something left in it — the row `markDone` decrements, chosen by the rule
       `markDone` chooses it with, so this screen cannot promise a number the
       server will not move. */
    const packRow = (packages ?? [])
      .filter(
        (p) =>
          p.type === 'session_pack' && p.status === 'active' &&
          (p.sessionsRemaining ?? 0) > 0 && (p.sessionsTotal ?? 0) > 0,
      )
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    const pack = packRow
      ? { remaining: packRow.sessionsRemaining as number, total: packRow.sessionsTotal as number }
      : null;

    const session = sessionId ? (sessionsAll ?? []).find((s) => s.id === sessionId) ?? null : null;

    /* The client's own sessions, newest first — all of them, not a window. The
       open log is forced in whatever its date, because the screen is about that
       log and a log created ahead of its own session date would otherwise sort
       itself out of the list it is the subject of. */
    const workouts = await allWorkouts();
    const mine = (workouts ?? [])
      .filter((w) => w.clientId === workout.clientId)
      .sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : a.sessionDate > b.sessionDate ? -1 : 0));
    if (!mine.some((w) => w.id === workout.id)) mine.push(workout);

    const sets = await setsForClient(workout.clientId);

    /* The plan. The log's own `programId` wins OUTRIGHT; only when it has none
       does the client's live program stand in, which is what a trainer means by
       "their program" when nobody chose. Two steps rather than one `find` with an
       `||` in it — that version would take whichever program came first in the
       list and satisfied either half, so a log explicitly attached to an old
       block would silently draw the new one's exercises. */
    const DEAD = ['cancelled', 'canceled', 'completed', 'archived'];
    const live =
      (workout.programId ? (programs ?? []).find((p) => p.id === workout.programId) : undefined) ??
      (programs ?? []).find((p) => !DEAD.includes(p.status.toLowerCase())) ??
      null;

    let planRows: ProgramExerciseWire[] = [];
    if (live) {
      const all = await get<ProgramExerciseWire[]>(`/v1/programs/${live.id}/exercises`).catch(() => []);
      const week = programWeek(live.startDate, workout.sessionDate);
      /* Ordinal day slots, not weekdays: `templateDay` on the booking says which
         of the program's days this session is. A booking without one gets the
         whole program, because a one-day plan is the common shape and hiding it
         would draw an empty grid. */
      planRows = rowsForDay(all ?? [], session?.templateDay ?? null, week);
    }

    const todaySets = sets.filter((s) => s.workoutSessionId === workout.id);

    const input: LogInput = {
      workouts: mine.map(toWorkout),
      logExercises: buildRows(
        planRows.map((r) => ({
          exerciseId: r.exerciseId,
          sets: r.sets,
          reps: r.reps,
          restSeconds: r.restSeconds,
          orderIndex: r.orderIndex,
        })),
        todaySets,
        liveRows ?? [],
      ),
      sets,
      exercises: (exercises ?? []).map((e) => ({
        id: e.id,
        name: e.name,
        equipment: e.equipment,
        isCustom: e.isCustom,
        logType: e.logType,
      })),
      clients: (clients ?? []).map((c) => ({ id: c.id, name: c.name })),
      sessions: (sessionsAll ?? []).map((s) => ({
        id: s.id,
        clientId: s.clientId,
        programId: s.programId,
        status: s.status,
        dayLabel: s.dayLabel,
        templateDay: s.templateDay,
        scheduledAt: s.scheduledAt,
        durationMinutes: s.durationMinutes,
        deliveryMode: s.deliveryMode,
      })),
      programs: (programs ?? []).map((p) => ({
        id: p.id,
        clientId: p.clientId,
        templateId: p.templateId,
        name: p.name,
        status: p.status,
        startDate: p.startDate,
      })),
      plateStepKg: PLATE_STEP_KG,
    };

    const view = buildLog(input, workout.id, now);
    if (!view) return null;

    /* Recents, for frame 3a. The answer to a busy rack is nearly always
       something already done, and every row carries what was last
       lifted on it — so the choice is made on numbers rather than on a name.
       That is the difference between this and a search box over 1,324 rows. */
    const nameOf = new Map((exercises ?? []).map((e) => [e.id, e] as const));
    const dateOf = new Map(mine.map((w) => [w.id, w.sessionDate] as const));
    const lastByExercise = new Map<string, { date: string; set: LogSet }>();
    for (const set of sets) {
      if (set.workoutSessionId === workout.id) continue;
      const date = dateOf.get(set.workoutSessionId) ?? '';
      const held = lastByExercise.get(set.exerciseId);
      if (!held || date > held.date || (date === held.date && set.setNumber >= held.set.setNumber)) {
        lastByExercise.set(set.exerciseId, { date, set });
      }
    }
    const planned = new Set(view.exercises.map((e) => e.exerciseId));
    const recents = [...lastByExercise]
      .filter(([exerciseId]) => !planned.has(exerciseId))
      .sort((a, b) => (a[1].date < b[1].date ? 1 : -1))
      .slice(0, 8)
      .map(([exerciseId, { date, set }]) => {
        const ex = nameOf.get(exerciseId);
        const said = set.loadKg ? `${set.loadKg} kg × ${set.reps ?? 0}` : `${set.reps ?? 0} reps`;
        return {
          exerciseId,
          name: ex?.name ?? 'Exercise',
          meta: `last: ${said} · ${isoDay(Date.parse(`${date}T00:00:00`))
            .split('-')
            .slice(1)
            .reverse()
            .join('/')}`,
          isCustom: ex?.isCustom ?? false,
        };
      });

    /* Frame 3b's third scope counts the clients a template edit would reach. */
    let templateReach: number | null = null;
    if (live?.templateId) {
      const everyProgram = await get<ProgramWire[]>('/v1/programs').catch(() => []);
      templateReach = new Set(
        (everyProgram ?? [])
          .filter((p) => p.templateId === live.templateId && !DEAD.includes(p.status.toLowerCase()))
          .map((p) => p.clientId),
      ).size;
    }

    /* Frame 3b's second scope says how much of the plan the change would carry
       through. `endDate` is the only thing on the wire that bounds a program, so
       a plan without one says "from now on" and does not invent a number. */
    const programWeeksLeft = live?.endDate
      ? Math.max(0, Math.ceil((Date.parse(`${live.endDate}T00:00:00`) - now) / 604_800_000))
      : null;

    /* The timeline beside the grid. `buildHistory` over the same input, once per
       card — pure, and cheap enough to do four times. Using it rather than a
       second computation is what stops the timeline's "record, quietly" from
       ever disagreeing with the badge on the card it sits next to. */
    const timelines: Record<string, HistorySession[]> = {};
    for (const e of view.exercises) {
      timelines[e.exerciseId] = buildHistory(input, workout.clientId, e.exerciseId, now)
        .sessions.slice(0, 4);
    }

    return {
      routeId,
      view,
      session,
      programId: live?.id ?? null,
      templateId: live?.templateId ?? null,
      programWeeksLeft,
      pack,
      repeatHref: view.repeat ? `/sessions/${view.repeat.workoutId}/log` : null,
      timelines,
      library: (exercises ?? []).map((e) => ({
        id: e.id,
        name: e.name,
        muscleGroup: e.muscleGroup,
        isCustom: e.isCustom,
      })),
      recents,
      templateReach,
      now,
    };
  },
);

/* ───────────────────────────────────────────── 5b · the finish, and the pack ── */

export interface FinishData {
  routeId: string;
  view: LogView;
  finish: FinishView;
  session: SessionWire | null;
  now: number;
}

export const getFinish = cache(async (routeId: string): Promise<FinishData | null> => {
  const data = await getConsole(routeId);
  if (!data) return null;

  const packages = await get<PackageWire[]>(`/v1/clients/${data.view.clientId}/packages`).catch(() => []);
  /* The pack a session comes off is the oldest ACTIVE session pack with
     something left in it — the same row `markDone` decrements, chosen by the
     same rule, so this screen cannot promise a different number from the one
     the server will move. */
  const pack = (packages ?? [])
    .filter(
      (p) =>
        p.type === 'session_pack' &&
        p.status === 'active' &&
        (p.sessionsRemaining ?? 0) > 0 &&
        (p.sessionsTotal ?? 0) > 0,
    )
    .sort((a, b) => a.createdAt - b.createdAt)[0];

  return {
    routeId,
    view: data.view,
    finish: buildFinish(
      {
        ...EMPTY,
        sessions: data.session
          ? [
              {
                id: data.session.id,
                clientId: data.session.clientId,
                programId: data.session.programId,
                status: data.session.status,
                dayLabel: data.session.dayLabel,
                templateDay: data.session.templateDay,
                scheduledAt: data.session.scheduledAt,
                durationMinutes: data.session.durationMinutes,
                deliveryMode: data.session.deliveryMode,
              },
            ]
          : [],
      },
      data.view,
      pack ? { remaining: pack.sessionsRemaining as number, total: pack.sessionsTotal as number } : null,
    ),
    session: data.session,
    now: data.now,
  };
});

/** `buildFinish` reads only `input.sessions`; the rest is threaded for the type. */
const EMPTY: LogInput = {
  workouts: [], logExercises: [], sets: [], exercises: [], clients: [], sessions: [],
  programs: [], plateStepKg: PLATE_STEP_KG,
};

/* ────────────────────────────────────────────────── 5a · who is this for ── */

export const getPicker = cache(async (): Promise<PickView> => {
  const now = Date.now();
  const todayIso = isoDay(now);
  const from = now - 2 * 86_400_000;
  const to = now + 2 * 86_400_000;

  const [clients, workouts, sessions] = await Promise.all([
    allClients(),
    allWorkouts(),
    get<SessionWire[]>(`/v1/sessions?from=${from}&to=${to}`),
  ]);

  /* Only the open logs need their sets, and there are rarely more than two —
     "two logs open at once is a supported state, not a warning". */
  const open = (workouts ?? []).filter((w) => w.endedAt == null).slice(0, 8);
  const sets = await setsFor(open.map((w) => w.id));

  return buildPicker(
    {
      ...EMPTY,
      workouts: (workouts ?? []).map(toWorkout),
      sets,
      clients: (clients ?? [])
        .filter((c) => c.status !== 'archived' && c.status !== 'inactive')
        .map((c) => ({ id: c.id, name: c.name })),
      sessions: (sessions ?? [])
        .filter((s) => isoDay(s.scheduledAt) === todayIso)
        .map((s) => ({
          id: s.id,
          clientId: s.clientId,
          programId: s.programId,
          status: s.status,
          dayLabel: s.dayLabel,
          templateDay: s.templateDay,
          scheduledAt: s.scheduledAt,
          durationMinutes: s.durationMinutes,
          deliveryMode: s.deliveryMode,
        })),
    },
    now,
  );
});

/* ───────────────────────────────────── 4a · one exercise, every session ── */

export const getExerciseHistory = cache(
  async (clientId: string, exerciseId: string): Promise<HistoryView | null> => {
    const now = Date.now();
    const [clients, exercises, workouts] = await Promise.all([
      allClients(),
      allExercises(),
      allWorkouts(),
    ]);

    const client = (clients ?? []).find((c) => c.id === clientId);
    if (!client) return null;

    const mine = (workouts ?? [])
      .filter((w) => w.clientId === clientId)
      .sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : -1));

    /* Narrowed on the wire: this page is about one movement, and asking for one
       is what makes "every session" affordable enough to mean it. The walk
       forward now reaches the client's real first session, so the `first` tag
       lands on it rather than on the oldest one a window happened to hold. */
    const sets = await setsForClient(clientId, exerciseId);

    return buildHistory(
      {
        ...EMPTY,
        workouts: mine.map(toWorkout),
        sets,
        clients: [{ id: client.id, name: client.name }],
        exercises: (exercises ?? []).map((e) => ({
          id: e.id, name: e.name, equipment: e.equipment, isCustom: e.isCustom,
          logType: e.logType,
        })),
      },
      clientId,
      exerciseId,
      now,
    );
  },
);

/* ──────────────────────────────────────────────────────────── 4b · progress ── */

export const getProgress = cache(
  async (clientId: string, range: ProgressRange, focus: string | null): Promise<ProgressView | null> => {
    const now = Date.now();
    const [clients, exercises, workouts] = await Promise.all([
      allClients(),
      allExercises(),
      allWorkouts(),
    ]);

    const client = (clients ?? []).find((c) => c.id === clientId);
    if (!client) return null;

    const mine = (workouts ?? [])
      .filter((w) => w.clientId === clientId)
      .sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : -1));

    const [sets, metrics] = await Promise.all([
      setsForClient(clientId),
      get<MetricWire[]>(`/v1/clients/${clientId}/body-metrics`).catch(() => [] as MetricWire[]),
    ]);

    const weights = (metrics ?? [])
      .filter((m) => m.metricType === 'weight')
      .sort((a, b) => a.recordedAt - b.recordedAt);
    const latest = weights[weights.length - 1];
    const days = range === '8w' ? 56 : range === '6m' ? 183 : 3650;
    const earlier = weights.find((m) => m.recordedAt >= now - days * 86_400_000);

    return buildProgress(
      {
        ...EMPTY,
        workouts: mine.map(toWorkout),
        sets,
        clients: [{ id: client.id, name: client.name }],
        exercises: (exercises ?? []).map((e) => ({
          id: e.id, name: e.name, equipment: e.equipment, isCustom: e.isCustom,
          logType: e.logType,
        })),
      },
      clientId,
      range,
      now,
      focus,
      latest
        ? {
            value: Number(latest.value),
            earlier: earlier && earlier !== latest ? Number(earlier.value) : null,
          }
        : null,
    );
  },
);

/* ──────────────────────────────────── starting a log, which is not marking done ── */

/**
 * The booking behind a route id that has no log yet, so the console can offer to
 * start one instead of 404ing.
 */
export const getUnstarted = cache(async (routeId: string) => {
  const [session, clients, programs] = await Promise.all([
    get<SessionWire>(`/v1/sessions/${routeId}`),
    allClients(),
    get<ProgramWire[]>('/v1/programs').catch(() => [] as ProgramWire[]),
  ]);
  const client = (clients ?? []).find((c) => c.id === session.clientId);
  return {
    session,
    clientName: client?.name?.trim() || 'Client',
    programId:
      session.programId ??
      (programs ?? []).find(
        (p) => p.clientId === session.clientId && !['cancelled', 'canceled', 'completed', 'archived'].includes(p.status.toLowerCase()),
      )?.id ??
      null,
  };
});
