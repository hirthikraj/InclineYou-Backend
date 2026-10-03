import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';
import type { ClientNoteWire } from '@/lib/clients/client-api';
import { listAll, type ListEnvelope } from '@/lib/http/client';

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

/* ─────────────────────────────────────────────────── wire shapes (minimal) ── */

/** L4 · `SessionReadService.SessionRow` — the booking and, once started, its log (the log IS the session). */
interface SessionWire {
  id: string;
  clientId: string;
  scheduledAt: number;
  durationMinutes: number | null;
  status: string;
  deliveryMode: string | null;
  notes?: string | null;
  workout: { id: string; name: string; programId: string | null; week: number | null; day: number | null } | null;
  startedAt: number | null;
}

/** `GET /v1/clients?view=summary` — only what a row's length needs. */
interface ClientWire {
  id: string;
  name: string | null;
  status: string;
  schedule?: { sessionDurationMinutes: number | null } | null;
}

interface ProgramWire {
  id: string;
  name: string;
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

/**
 * WHAT THEY DID THE LAST TIME THIS MOVEMENT CAME UP.
 *
 * The question a trainer opens an upcoming session to answer, and the one the
 * page could not answer until now: the `Target` column is a program field that
 * almost no program fills in, so it drew a dash in every row while the number
 * the trainer actually wanted sat one request away.
 *
 * The TOP set of that session and not the whole thing — heaviest, then most
 * reps at that weight. Five rows per movement is the console's job; one line
 * that says *105 × 5, three weeks ago* is what you read walking in.
 *
 * `at` is kept beside the date because the view says "3 weeks ago" and the
 * distance is what carries the meaning: the same 105 kg is a starting point
 * this week and a question mark after two months.
 */
export interface LastTime {
  loadKg: number | null;
  reps: number | null;
  /** The top set in words, for a movement last logged in a kind the two numbers cannot say. Absent otherwise. */
  said?: string;
  /** How many sets landed on it that day, for "· 4 sets". */
  setCount: number;
  at: number;
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
  /** The target in words when the plan's kinds are not kg × reps. Absent otherwise. */
  targetEffortSaid?: string | null;
  targetLoadSaid?: string | null;
  orderIndex: number;
  /** Only meaningful once a log exists: did any set land against it? */
  loggedSets: number;
  /**
   * The last session BEFORE this one that touched this movement, or null when
   * there isn't one — which is itself worth drawing, because a movement the
   * client has never done is the one to watch on the floor.
   */
  lastTime: LastTime | null;
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
  /** The set in words when it is in a kind `loadKg`/`reps` cannot carry (a hold, a carry, a %): `50 s`, `24 kg × 40 m`. Absent otherwise. */
  said?: string;
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
    /** What the plan asked, in words, when its kinds are not kg × reps (`45 s`, `40 m` / `70% 1RM`). Absent otherwise. */
    effortSaid?: string | null;
    loadSaid?: string | null;
  } | null;
  /** Nobody planned it. The trainer added it on the floor. */
  unplanned: boolean;
  /**
   * THE SAME MOVEMENT, THE LAST TIME IT CAME UP — ON THE CARD THAT DRAWS IT.
   *
   * This is the same `LastTime` the plan table has carried since the pass that
   * added it, and until now the log side could not see it. The consequence on a
   * finished session was that the two halves of every comparison were drawn
   * ~900px apart: the card said *85 × 9* and the table at the foot of the page
   * said *82.5 × 9, 7 days ago*, and the trainer did the subtraction in their
   * head, five times, scrolling between two different table shapes to do it.
   *
   * A comparison whose two operands are not on screen together is not a
   * comparison. It costs NOTHING to fix — `lastTimeByExercise` was already
   * being computed off history that was already being fetched — and it is the
   * single number this page exists to show.
   *
   * Null for a movement the client has never done before, which reads as *first
   * time* rather than as a dash: the two are different instructions to somebody
   * deciding what to load.
   */
  lastTime: LastTime | null;
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

/**
 * THE WORKOUTS SCREEN'S THREE BUCKETS — `/programs/workouts`.
 *
 * It was two — `upcoming` and `past` — while this data drew `/sessions`, a list
 * with two tabs reading *Upcoming* and *Past sessions*. The third arrives with
 * the screen: Fitness' *Workouts* page asks *what happened, what is booked, and
 * what fell through*, and the last of those three had no bucket.
 *
 * ── AND THE THIRD ONE WAS NOT A RENAME. IT WAS TWO KINDS OF ROW NOBODY DREW ──
 *
 * A missed workout arrives in this product two ways, and the old split lost
 * both:
 *
 * 1. **Marked `no_show`.** `DEAD` dropped it with `cancelled` and `skipped`
 *    before the rows were bucketed at all. A cancelled session is one that never
 *    happened and nobody expected to; a no-show is one that WAS expected, and a
 *    trainer deciding whether to charge for it needs to find it. Only the first
 *    two are dropped now — see `CANCELLED` below.
 * 2. **Still `scheduled`, with its time in the past.** The old `past` filter read
 *    `scheduledAt < now && status !== 'scheduled'`, so these matched neither
 *    bucket and fell off the screen — while the comment directly above it
 *    claimed they were in `past` ("done, or still scheduled but in the past").
 *    **The comment described the intent and the code did the opposite**, which is
 *    why it went unnoticed: every reader of the file was told the rows were
 *    handled. They are the unmarked ones, which is the set a trainer most needs,
 *    because the fix is a click rather than a conversation.
 *
 * `completed` is therefore narrower than `past` was and deliberately so: it is
 * what DID happen, not what is no longer ahead.
 */
export interface SessionsData {
  /** Booked and still ahead, soonest first. */
  scheduled: SessionRow[];
  /** Done, most recent first. */
  completed: SessionRow[];
  /** No-showed, or past its slot and never marked. Most recent first. */
  missed: SessionRow[];
  now: number;
}

/* ──────────────────────────────────────────────────────────── helpers ── */

const DEFAULT_DURATION = 60;
/* Was `DEAD`, and it was one set too wide. `no_show`/`noshow` left it when
   *Missed* got a tab — see `SessionsData`. What remains is the two statuses that
   mean the session is not part of anybody's history: a cancelled slot and a
   skipped one were both called off in advance, so there is nothing to report,
   charge for or follow up on. */
const CANCELLED = new Set(['cancelled', 'canceled', 'skipped']);
const NO_SHOW = new Set(['no_show', 'noshow']);

function resolveMode(raw: string | null): 'floor' | 'remote' {
  return raw?.toLowerCase() === 'remote' ? 'remote' : 'floor';
}

function toRow(
  s: SessionWire,
  client: ClientWire | undefined,
  program: { name: string } | undefined,
): SessionRow {
  const clientMinutes = client?.schedule?.sessionDurationMinutes;
  const minutes =
    s.durationMinutes && s.durationMinutes > 0
      ? s.durationMinutes
      : clientMinutes && clientMinutes > 0
        ? clientMinutes
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
    programId: s.workout?.programId ?? null,
    programName: program?.name?.trim() ?? null,
    dayLabel: s.workout?.name?.trim() ?? null,
    templateDay: s.workout?.day ?? null,
    // The log is the session (R2/R40): started_at is the whole answer, and the log's id is the session's.
    hasLog: s.startedAt != null,
    workoutId: s.startedAt != null ? s.id : null,
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
  /* The window goes out as DATES, read by the server in the workspace's timezone. This runs on a Next
     server whose zone may not be the trainer's, so each end is widened a day; the buckets below
     compare instants, so the extra day only ever lands in a bucket by its real time. */
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const from = day(now - 91 * 24 * 60 * 60 * 1000);
  const to = day(now + 32 * 24 * 60 * 60 * 1000);

  const [sessions, clients, programs] = await Promise.all([
    listAll<SessionWire>(`/v1/sessions?from=${from}&to=${to}`, (p) => request<ListEnvelope<SessionWire>>(p)),
    listAll<ClientWire>('/v1/clients?view=summary', (p) => request<ListEnvelope<ClientWire>>(p)),
    // Every plan a session could belong to, finished ones included: the default is active,paused.
    request<{ items: ProgramWire[] }>('/v1/programs?kind=client&status=active,paused,completed'),
  ]);

  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));
  const programById = new Map((programs?.items ?? []).map((p) => [p.id, p]));

  const rows = (sessions ?? [])
    .filter((s) => !CANCELLED.has((s.status ?? '').toLowerCase()))
    .map((s) =>
      toRow(
        s,
        clientById.get(s.clientId),
        programById.get(s.workout?.programId ?? ''),
      ),
    );

  /* Scheduled: booked and still ahead, ascending (next one first). The only
     bucket read forwards, because it is the only one about what is coming. */
  const scheduled = rows
    .filter((r) => r.status === 'scheduled' && r.scheduledAt >= now)
    .sort((a, b) => a.scheduledAt - b.scheduledAt);

  /* Completed: it happened. Descending, most recent first, which is the order
     every history in this product is read in. */
  const completed = rows
    .filter((r) => !NO_SHOW.has(r.status.toLowerCase()) && r.scheduledAt < now
      && r.status !== 'scheduled')
    .sort((a, b) => b.scheduledAt - a.scheduledAt);

  /* Missed: the two kinds, in one list. `SessionsData` says why they belong
     together — both are a slot the client did not train in, and the difference
     between them is whether the trainer has got round to saying so. The status
     tag on the row is what tells them apart, so nothing is lost by merging. */
  const missed = rows
    .filter((r) => NO_SHOW.has(r.status.toLowerCase())
      || (r.status === 'scheduled' && r.scheduledAt < now))
    .sort((a, b) => b.scheduledAt - a.scheduledAt);

  return { scheduled, completed, missed, now };
});

