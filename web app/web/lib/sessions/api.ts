import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';
import { programWeek, rowsForDay, type ProgramExerciseWire } from '@/lib/log/plan';
import type { ClientNoteWire } from '@/lib/clients/client-api';

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

export class SessionsApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'SessionsApiError';
  }
}

async function request<T>(path: string): Promise<T> {
  const token = await getToken();
  if (!token) throw new SessionsApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SessionsApiError(null);
  }
  if (!res.ok) throw new SessionsApiError(res.status);

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** A 404 that is an answer rather than a failure — "there is no such row". */
async function optional<T>(path: string): Promise<T | null> {
  try {
    return await request<T>(path);
  } catch (error) {
    if (error instanceof SessionsApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * The same, plus 400.
 *
 * Only `resolve` gets this, and only because the id it is testing came out of
 * the URL bar. Spring has no handler for a `UUID` path variable that will not
 * parse, so `/sessions/nonsense` is a `MethodArgumentTypeMismatchException` and
 * a **400**, not a 404 — and a typo in a URL should draw the not-found page
 * rather than "the server refused this". Nowhere else may swallow a 400: every
 * other 400 on this half is a request the code built wrong.
 */
async function addressed<T>(path: string): Promise<T | null> {
  try {
    return await request<T>(path);
  } catch (error) {
    if (error instanceof SessionsApiError && (error.status === 404 || error.status === 400)) {
      return null;
    }
    throw error;
  }
}

/**
 * A read this page can do without.
 *
 * Notes and the PR floor are both context, not content: a backend that has not
 * run V29 answers 404 on notes, and `/progress` can fail for its own reasons. A
 * session detail that will not open because a *badge* could not be computed is a
 * worse outcome than one that opens without the badge. `client-api.ts` swallows
 * the same two the same way, for the same reason.
 *
 * **The content reads are NOT lenient, and the line is where a silent failure
 * would lie.** A set list that failed would draw a session with no sets in it,
 * and a workout list that failed would tell a trainer a logged session was never
 * logged — both are the page confidently saying the wrong thing, which is worse
 * than the page not opening. Those throw and the guard draws the unreachable
 * screen. The plan is the middle case and goes lenient on purpose: the view has
 * a written answer for "no program attached", so a missing plan degrades into a
 * state the screen already knows how to say.
 */
async function lenient<T>(path: string, fallback: T): Promise<T> {
  try {
    return (await request<T>(path)) ?? fallback;
  } catch {
    return fallback;
  }
}

/* ─────────────────────────────────────────────────── wire shapes (minimal) ── */

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
  notes?: string | null;
}

interface ClientWire {
  id: string;
  name: string;
  status: string;
  sessionDurationMinutes?: number | null;
}

interface WorkoutWire {
  id: string;
  clientId: string;
  programId?: string | null;
  scheduledSessionId: string | null;
  sessionDate: string;
  notes: string | null;
  endedAt: number | null;
  createdAt: number;
}

interface SetLogWire {
  id: string;
  exerciseId: string;
  setNumber: number | null;
  loadKg: number | null;
  reps: number | null;
  rpe: number | null;
  notes: string | null;
}

interface ProgramWire {
  id: string;
  clientId: string;
  name: string;
  status: string;
  startDate: string | null;
}

interface ExerciseWire {
  id: string;
  name: string;
  muscleGroup: string | null;
}

interface PrWire {
  exerciseId: string;
  maxLoadKg: number | string | null;
  maxReps: number | null;
}

/* ──────────────────────────────────────────────────────── public shapes ── */

export interface SessionRow {
  /** The id the URL used. A booking id wherever there is a booking. */
  id: string;
  /** Null when this is a log nobody booked — frame 5a's third group. */
  bookingId: string | null;
  clientId: string;
  clientName: string;
  scheduledAt: number;
  minutes: number;
  status: string;
  mode: 'floor' | 'remote';
  programId: string | null;
  programName: string | null;
  dayLabel: string | null;
  templateDay: number | null;
  hasLog: boolean;
  workoutId: string | null;
  notes: string | null;
}

/** One row of the prescription — what the program said to do. */
export interface PlannedRow {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string | null;
  targetSets: number | null;
  targetReps: number | null;
  restSeconds: number | null;
  /** `BigDecimal` on the wire — see `bestsFor` for why it is coerced. */
  targetLoad: number | null;
  orderIndex: number;
  /** Only meaningful once a log exists: did any set land against it? */
  loggedSets: number;
}

export interface PlanView {
  programId: string;
  programName: string;
  /** The booking's own name for the day — "Push A". */
  dayLabel: string | null;
  /**
   * Which ordinal slot of the program this session is, or null when the booking
   * pinned none and the whole program stands in.
   */
  templateDay: number | null;
  /**
   * Which week of the block this session falls in, or null when the program has
   * no start date — in which case there is no week to count and the view says
   * nothing rather than printing a confident "Week 1".
   */
  week: number | null;
  exercises: PlannedRow[];
  /** Every prescribed set across the day. */
  totalSets: number;
}

export interface LoggedSet {
  id: string;
  setNumber: number;
  loadKg: number | null;
  reps: number | null;
  rpe: number | null;
  notes: string | null;
  /**
   * THIS IS STILL THE HEAVIEST THEY HAVE EVER PUT ON IT.
   *
   * Not "a record set that day". That is a different claim — it needs every
   * session *before* this one — and it is now buildable, because
   * `GET /v1/workouts/sets?clientId=` landed on 28 Aug 2026 and the console uses
   * it for exactly that. **This page deliberately still asks the smaller
   * question**, for two reasons: on a page read weeks later "still their best"
   * is the more useful sentence than "was a record that Tuesday", and
   * `/progress` answers it in SQL rather than shipping a client's whole set
   * history here to compute one maximum per exercise.
   *
   * The cost of that choice is `/progress`'s own `LIMIT 30` exercises, so a
   * client with more than thirty movements can have a best outside it. The
   * failure is under-reporting — a missing badge, never a false one — and the
   * bulk read is the way out if it ever matters.
   */
  bestEver: boolean;
}

export interface ExerciseGroup {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string | null;
  sets: LoggedSet[];
  /** Total volume for this exercise in kg. */
  volumeKg: number;
  /** What the program asked for, when the program asked for this movement. */
  target: {
    sets: number | null;
    reps: number | null;
    load: number | null;
    restSeconds: number | null;
  } | null;
  /** Nobody planned it. The trainer added it on the floor. */
  unplanned: boolean;
}

export interface SessionDetailData {
  /** What the URL said, which is what every link back out must use. */
  routeId: string;
  session: SessionRow;
  /** What was prescribed, whether or not it was done. */
  plan: PlanView | null;
  workout: {
    id: string;
    sessionDate: string;
    notes: string | null;
    startedAt: number;
    endedAt: number | null;
    exercises: ExerciseGroup[];
    totalSets: number;
    totalVolumeKg: number;
  } | null;
  /**
   * The trainer's own notes on this client, pinned first. Free text, and the
   * product reads none of it — `client-api.ts` carries the DPDP argument.
   */
  notes: ClientNoteWire[];
  now: number;
}

export interface SessionsData {
  upcoming: SessionRow[];
  past: SessionRow[];
  now: number;
}

/* ──────────────────────────────────────────────────────────── helpers ── */

const DEFAULT_DURATION = 60;
const DEAD_PROGRAM = ['cancelled', 'canceled', 'completed', 'archived'];
const DEAD = new Set(['cancelled', 'canceled', 'no_show', 'noshow', 'skipped']);

function resolveMode(raw: string | null): 'floor' | 'remote' {
  return raw?.toLowerCase() === 'remote' ? 'remote' : 'floor';
}

function isoDay(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toRow(
  s: SessionWire,
  client: ClientWire | undefined,
  program: { name: string } | undefined,
  workout: WorkoutWire | null,
): SessionRow {
  const minutes =
    s.durationMinutes && s.durationMinutes > 0
      ? s.durationMinutes
      : client?.sessionDurationMinutes && client.sessionDurationMinutes > 0
        ? client.sessionDurationMinutes
        : DEFAULT_DURATION;

  return {
    id: s.id,
    bookingId: s.id,
    clientId: s.clientId,
    clientName: client?.name?.trim() || 'Client',
    scheduledAt: s.scheduledAt,
    minutes,
    status: (s.status ?? '').toLowerCase(),
    mode: resolveMode(s.deliveryMode),
    programId: s.programId,
    programName: program?.name?.trim() ?? null,
    dayLabel: s.dayLabel?.trim() ?? null,
    templateDay: s.templateDay ?? null,
    hasLog: workout !== null,
    workoutId: workout?.id ?? null,
    notes: s.notes ?? null,
  };
}

/* ──────────────────────────────────────────────────────── sessions list ── */

/**
 * Fetches the sessions list: 90 days back + 30 days ahead.
 *
 * This is the trainer's diary history, not the schedule grid — it shows what
 * has been logged and what is planned, in a simple list. The wide reads are
 * right *here*: a list of every client's sessions needs every client, and one
 * `/v1/clients` beats ninety `/v1/clients/{id}`. The detail page below is the
 * opposite case and reads the opposite way.
 */
export const getSessions = cache(async (): Promise<SessionsData> => {
  const now = Date.now();
  const from = now - 90 * 24 * 60 * 60 * 1000;
  const to = now + 30 * 24 * 60 * 60 * 1000;

  const [sessions, clients, workouts, programs] = await Promise.all([
    request<SessionWire[]>(`/v1/sessions?from=${from}&to=${to}`),
    request<ClientWire[]>('/v1/clients'),
    request<WorkoutWire[]>('/v1/workouts'),
    request<ProgramWire[]>('/v1/programs'),
  ]);

  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));
  const programById = new Map((programs ?? []).map((p) => [p.id, p]));

  /* Index workouts by the scheduled session they were created from, so we know
     which sessions have been logged without per-session fetches. */
  const workoutBySid = new Map<string, WorkoutWire>();
  for (const w of workouts ?? []) {
    if (w.scheduledSessionId) workoutBySid.set(w.scheduledSessionId, w);
  }

  const rows = (sessions ?? [])
    .filter((s) => !DEAD.has((s.status ?? '').toLowerCase()))
    .map((s) =>
      toRow(
        s,
        clientById.get(s.clientId),
        programById.get(s.programId ?? ''),
        workoutBySid.get(s.id) ?? null,
      ),
    );

  /* Upcoming: future scheduled sessions, ascending (next session first). */
  const upcoming = rows
    .filter((r) => r.status === 'scheduled' && r.scheduledAt >= now)
    .sort((a, b) => a.scheduledAt - b.scheduledAt);

  /* Past: sessions that already happened (done, or still scheduled but in the
     past), descending (most recent first). */
  const past = rows
    .filter((r) => r.scheduledAt < now && r.status !== 'scheduled')
    .sort((a, b) => b.scheduledAt - a.scheduledAt);

  return { upcoming, past, now };
});

/* ────────────────────────────────────────────────────── session detail ── */

/**
 * NAMES FOR EXACTLY THE MOVEMENTS ON THIS PAGE.
 *
 * This used to be the whole library — `?size=2000`, 1,324 rows — because
 * `GET /v1/exercises` had no id filter and there was no `/v1/exercises/{id}`,
 * so putting a name on ten set logs cost the same request as putting one on a
 * thousand. It was affordable only because the library is text-only since V22.
 * `?ids=` landed on 28 Aug 2026 and this asks for the ten.
 *
 * **Keyed on a sorted CSV, not on the array**, and that is not tidiness:
 * `cache()` memoises on argument identity, and a fresh array literal is a fresh
 * identity every call — so an array parameter would turn the cache off silently
 * and this page would ask twice per render. Sorting makes two callers holding
 * the same set share the one entry.
 *
 * The endpoint refuses more than 600 ids rather than truncating. A session's
 * movements plus its plan is tens, so nothing here is near it — and if anything
 * ever is, it fails loudly instead of drawing a page with blanks in it.
 */
const exercisesByCsv = cache(async (csv: string): Promise<Map<string, ExerciseWire>> => {
  const page = await request<{ exercises: ExerciseWire[] }>(`/v1/exercises?ids=${csv}`);
  return new Map((page?.exercises ?? []).map((e) => [e.id, e]));
});

function exercisesByIds(ids: (string | null | undefined)[]): Promise<Map<string, ExerciseWire>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))].sort();
  // No ids is not a request. Asking with an empty `ids` would be refused rather
  // than answered with the library, but there is nothing to ask about either.
  if (unique.length === 0) return Promise.resolve(new Map());
  return exercisesByCsv(unique.join(','));
}

/**
 * The client's all-time best per exercise, as the badge floor.
 *
 * `maxLoadKg` is a `BigDecimal` on the Java side. Jackson writes one as a JSON
 * number by default, so it arrives as a number today — `Number()` costs nothing
 * and means a mapper setting cannot turn a comparison into a string compare, in
 * which case `"9" >= "10"` and the badge lands on the wrong set.
 */
const bestsFor = cache(async (clientId: string) => {
  const res = await lenient<{ prs: PrWire[] }>(`/v1/clients/${clientId}/progress`, { prs: [] });
  const map = new Map<string, { load: number | null; reps: number | null }>();
  for (const pr of res.prs ?? []) {
    map.set(pr.exerciseId, {
      load: pr.maxLoadKg == null ? null : Number(pr.maxLoadKg),
      reps: pr.maxReps ?? null,
    });
  }
  return map;
});

/**
 * WHICH SET, IF ANY, WEARS THE BADGE.
 *
 * The TOP set and only the top set. A client who worked up to her best and then
 * did four more at the same weight did one remarkable thing, not five, and a
 * column of five identical badges says nothing — the same reason `judge` in
 * `lib/log/log.ts` reduces a session to one top set before comparing anything.
 *
 * A loaded movement is judged on load and a reps-only one on reps: `maxLoadKg`
 * is null for the second, which is exactly how `/progress` says "this one has
 * never carried a weight". Ties count, because `/progress` includes this very
 * session in its maximum — the badge claims the set still *stands* as the best,
 * not that it beat something.
 */
function bestSetId(
  sets: SetLogWire[],
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
 * THE ROUTE'S `:id` IS WHATEVER IDENTIFIES THE SESSION — THE SAME RULE THE
 * CONSOLE FOLLOWS.
 *
 * `/sessions/:id` is a booking, and most logs have one, so most of the time the
 * two ids are the same id. The exception is frame 5a's third group —
 * *everybody else · no booking needed* — where a log has no booking to be named
 * after and is named after itself. `lib/log/api.ts` already resolves both, and a
 * detail page that 404s on an id its own console opens is a page that disagrees
 * with the link that reached it.
 *
 * Two requests at worst, and the common case is one: a booking id hits
 * `/v1/sessions/{id}` on the first try.
 */
async function resolve(
  routeId: string,
): Promise<{ session: SessionWire | null; workout: WorkoutWire | null }> {
  const session = await addressed<SessionWire>(`/v1/sessions/${routeId}`);
  if (session) return { session, workout: null };

  const workout = await addressed<WorkoutWire>(`/v1/workouts/${routeId}`);
  if (!workout) return { session: null, workout: null };

  const booking = workout.scheduledSessionId
    ? await addressed<SessionWire>(`/v1/sessions/${workout.scheduledSessionId}`)
    : null;
  return { session: booking, workout };
}

/**
 * ONE SESSION, AND EVERYTHING THAT WAS TRUE ABOUT IT.
 *
 * Three things a trainer opening a session wants, and the page owes all three
 * whichever side of *now* the session sits on:
 *
 *   · **What was prescribed** — the program's rows for this day, with the sets,
 *     reps, rest and target load on them. Before the session that is the whole
 *     point of the screen; after it, it is what says the trainer covered four of
 *     five and skipped the fifth.
 *   · **What happened** — the set logs, grouped by movement, with the plan's
 *     numbers beside them and a badge on anything that still stands as the
 *     client's best.
 *   · **Who this is** — the trainer's own notes on the client, pinned first,
 *     because "left knee, no deep squats" is worth as much reading a session
 *     back as it is standing in front of one.
 *
 * ── AND IT READS NARROW ─────────────────────────────────────────────────────
 *
 * This page used to pull `/v1/clients`, `/v1/programs` and every workout the
 * trainer has ever written to find one of each. One session belongs to exactly
 * one client and at most one program, both of which have a by-id route, so it
 * now asks for those. The exercise library was the last wide read and is not one
 * any more: `exercisesByIds` names the movements this session actually has.
 *
 * **That moved the exercise fetch later in the function**, which is the whole
 * cost of the change: the ids come from the plan's rows and the set logs, so
 * neither can be waited on in the same `Promise.all` as the client. The set read
 * is hoisted out of the `if (workout)` block for the same reason. One wide read
 * remains and has no narrow form — the client's own workout list, which is how a
 * booking finds the log written against it.
 */
export const getSessionDetail = cache(
  async (routeId: string): Promise<SessionDetailData | null> => {
    const now = Date.now();

    const resolved = await resolve(routeId);
    const { session } = resolved;
    let { workout } = resolved;
    if (!session && !workout) return null;

    const clientId = session?.clientId ?? (workout as WorkoutWire).clientId;

    /* The workout list is only needed when a booking has to find its log; when
       the route id WAS the log there is nothing to look up. */
    const [client, workouts, notes, bests] = await Promise.all([
      optional<ClientWire>(`/v1/clients/${clientId}`),
      workout
        ? Promise.resolve<WorkoutWire[]>([])
        : request<WorkoutWire[]>(`/v1/workouts?clientId=${clientId}`),
      lenient<ClientNoteWire[]>(`/v1/clients/${clientId}/notes`, []),
      bestsFor(clientId),
    ]);

    if (!workout && session) {
      /* Matched by the link first. A log created straight from `POST
         /v1/workouts` carries no `scheduledSessionId`, so the day is the
         fallback — the same two-step the console's resolve does. */
      const sessionDate = isoDay(session.scheduledAt);
      workout =
        workouts.find((w) => w.scheduledSessionId === session.id) ??
        workouts.find((w) => w.clientId === session.clientId && w.sessionDate === sessionDate) ??
        null;
    }

    /* ── the prescription ─────────────────────────────────────────────────── */

    /* The log's own `programId` wins OUTRIGHT, then the booking's; only when
       neither names one does the client's live program stand in, which is what
       a trainer means by "her program" when nobody chose. Two steps rather than
       one `find` with an `||` in it — that version would take whichever program
       came first and satisfied either half, so a session explicitly attached to
       an old block would silently draw the new one's exercises. */
    const namedId = workout?.programId ?? session?.programId ?? null;
    let program = namedId ? await optional<ProgramWire>(`/v1/programs/${namedId}`) : null;
    if (!program) {
      const mine = await lenient<ProgramWire[]>(`/v1/programs?clientId=${clientId}`, []);
      program =
        mine.find((p) => !DEAD_PROGRAM.includes((p.status ?? '').toLowerCase())) ?? null;
    }

    const sessionDate =
      workout?.sessionDate ?? (session ? isoDay(session.scheduledAt) : isoDay(now));

    let plan: PlanView | null = null;
    let planRows: ProgramExerciseWire[] = [];
    if (program) {
      const rows = await lenient<ProgramExerciseWire[]>(
        `/v1/programs/${program.id}/exercises`,
        [],
      );
      const week = programWeek(program.startDate, sessionDate);
      planRows = rowsForDay(rows, session?.templateDay ?? null, week);
      plan = {
        programId: program.id,
        programName: program.name?.trim() || 'Program',
        dayLabel: session?.dayLabel?.trim() ?? null,
        templateDay: session?.templateDay ?? null,
        week: program.startDate ? week : null,
        exercises: [],
        totalSets: 0,
      };
    }

    /* ── what happened ────────────────────────────────────────────────────── */

    let workoutData: SessionDetailData['workout'] = null;
    const loggedByExercise = new Map<string, number>();

    /* Hoisted out of the block below: this page names two sets of movements —
       what was prescribed and what was done — and the ids of the second are in
       here. Fetching the names needs both. */
    const sets = workout
      ? (await request<SetLogWire[]>(`/v1/workouts/${workout.id}/sets`)) ?? []
      : [];

    /* The plan's exercises plus the logged ones. A session has both and they
       overlap heavily, which is why one deduplicated request answers for the
       whole page rather than one per section. */
    const exerciseById = await exercisesByIds([
      ...planRows.map((r) => r.exerciseId),
      ...sets.map((s) => s.exerciseId),
    ]);

    if (workout) {
      const groupMap = new Map<string, SetLogWire[]>();
      for (const s of sets) {
        const arr = groupMap.get(s.exerciseId) ?? [];
        arr.push(s);
        groupMap.set(s.exerciseId, arr);
      }

      /* The plan's own order, then anything the trainer added on the floor —
         which is the order the console drew them in, so a session reads back the
         way it was written. */
      const planOrder = new Map(planRows.map((r, i) => [r.exerciseId, i]));
      const ordered = [...groupMap.entries()].sort(([a], [b]) => {
        const ai = planOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
        const bi = planOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
        return ai - bi;
      });

      const exercises: ExerciseGroup[] = [];
      let totalSets = 0;
      let totalVolume = 0;

      for (const [exerciseId, exSets] of ordered) {
        const ex = exerciseById.get(exerciseId);
        const best = bests.get(exerciseId);
        const planRow = planRows.find((r) => r.exerciseId === exerciseId) ?? null;
        const sorted = [...exSets].sort((a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0));
        const volume = sorted.reduce((sum, s) => sum + (s.loadKg ?? 0) * (s.reps ?? 0), 0);

        totalSets += sorted.length;
        totalVolume += volume;
        loggedByExercise.set(exerciseId, sorted.length);

        exercises.push({
          exerciseId,
          exerciseName: ex?.name ?? 'Exercise',
          muscleGroup: ex?.muscleGroup ?? null,
          sets: sorted.map((s, i) => ({
            id: s.id,
            setNumber: s.setNumber ?? i + 1,
            loadKg: s.loadKg,
            reps: s.reps,
            rpe: s.rpe,
            notes: s.notes,
            bestEver: s.id === bestSetId(sorted, best),
          })),
          volumeKg: Math.round(volume * 10) / 10,
          target: planRow
            ? {
                sets: planRow.sets,
                reps: planRow.reps,
                load: planRow.targetLoad == null ? null : Number(planRow.targetLoad),
                restSeconds: planRow.restSeconds,
              }
            : null,
          unplanned: planRow === null,
        });
      }

      workoutData = {
        id: workout.id,
        sessionDate: workout.sessionDate,
        notes: workout.notes,
        startedAt: workout.createdAt,
        endedAt: workout.endedAt,
        exercises,
        totalSets,
        totalVolumeKg: Math.round(totalVolume * 10) / 10,
      };
    }

    if (plan) {
      plan.exercises = planRows.map((r) => {
        const ex = exerciseById.get(r.exerciseId);
        return {
          exerciseId: r.exerciseId,
          exerciseName: ex?.name ?? 'Exercise',
          muscleGroup: ex?.muscleGroup ?? null,
          targetSets: r.sets,
          targetReps: r.reps,
          restSeconds: r.restSeconds,
          targetLoad: r.targetLoad == null ? null : Number(r.targetLoad),
          orderIndex: r.orderIndex,
          loggedSets: loggedByExercise.get(r.exerciseId) ?? 0,
        };
      });
      plan.totalSets = plan.exercises.reduce((sum, e) => sum + (e.targetSets ?? 0), 0);
    }

    /* Pinned first, then newest. The pinned strip on the client file orders the
       same way and for the same reason: a pin is the trainer saying "before
       every session", and this is one. */
    const sortedNotes = [...notes].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt - a.createdAt;
    });

    const row: SessionRow = session
      ? {
          ...toRow(session, client ?? undefined, program ?? undefined, workout),
          id: routeId,
        }
      : {
          /* A log with no booking. Every field the page reads still has an
             honest value; the ones only a booking can answer are null, and the
             view says so rather than inventing a scheduled time. */
          id: routeId,
          bookingId: null,
          clientId,
          clientName: client?.name?.trim() || 'Client',
          scheduledAt: Date.parse(`${(workout as WorkoutWire).sessionDate}T00:00:00`),
          minutes:
            client?.sessionDurationMinutes && client.sessionDurationMinutes > 0
              ? client.sessionDurationMinutes
              : DEFAULT_DURATION,
          status: 'logged',
          mode: 'floor',
          programId: program?.id ?? null,
          programName: program?.name?.trim() ?? null,
          dayLabel: null,
          templateDay: null,
          hasLog: true,
          workoutId: (workout as WorkoutWire).id,
          notes: null,
        };

    return { routeId, session: row, plan, workout: workoutData, notes: sortedNotes, now };
  },
);
