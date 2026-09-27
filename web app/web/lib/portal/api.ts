import 'server-only';

import { cache } from 'react';

import { getActiveClient, getToken } from '@/lib/auth/session';

import type { CheckInDetailWire, CheckInWire } from './checkin';

/**
 * Everything the client portal reads, in scoped requests against `/v1/me/*`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NONE OF THESE ROUTES EXIST YET, AND THAT IS THE FIRST THING TO KNOW
 *
 * The backend's entire client-facing API is `GET /v1/client/sync/pull` and
 * `POST /v1/client/sync/push` — the WatermelonDB envelope written for the
 * offline phone. This half is online-only and has no local database to
 * reconcile into, so it cannot use either, and every function below currently
 * 404s. `backendGaps-latest.md` carries the whole ask, route by route.
 *
 * So this file is a SPECIFICATION as much as a client: the shapes below are
 * what the backend is being asked for, not a description of what it sends.
 *
 * The comments throughout this directory point at `mock/portal.ts`,
 * `mock/types.ts`, `mock/router.ts` and `mock/seed.ts`. Those files are NOT in
 * this repo — they are the reference implementation in the sibling mock-UI
 * repo, which served this surface while the screens were built. They are the
 * best available statement of what each route must answer and why, and they
 * are deliberately not copied here: a mock that answers alongside the real
 * backend is a mock somebody eventually ships.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS NOT `lib/clients/client-api.ts`
 *
 * That module is the TRAINER reading a client: `getClientDetail(clientId)`,
 * guarded by "is this person on your roster". This is the client reading
 * themselves, and the two must not share a fetcher — a function that answers
 * both questions needs both guards, and the day those branches sit in one place
 * is the day one of them wins for the wrong caller. `mock/portal.ts`'s header
 * makes the same argument about the URL.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ROSTER ID IS A PARAMETER ON EVERY REQUEST, AND IT IS NOT A PERMISSION
 *
 * A client token's subject is the PHONE — `JwtService`: "the same person can be
 * on two trainers' rosters, which is two client rows and one human being."
 * So the token cannot say which book is open, and `inclineyou_client` does. Every
 * request carries it, and the server re-derives the real answer from the phone
 * and refuses a mismatch: `lib/auth/session.ts` promises that tampering with
 * that cookie "buys nothing", and this is the half of the promise that lives on
 * the request.
 *
 * A MISSING cookie is not an error. `/sign-in/role` deliberately writes nothing
 * and redirects — "resolving an unambiguous roster is the PORTAL's job" — so the
 * common case is no cookie at all, and the server resolves the single roster
 * itself. Every function here therefore treats it as optional.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SCOPED READS, AND THE ONE THAT IS DELIBERATELY A SCREEN ENDPOINT
 *
 * `lib/today/api.ts` refuses `sync/pull` on a built screen and makes nine
 * scoped requests instead. Every read below is that shape — one row set per
 * request, windowed where a window means anything — with one exception:
 * `GET /v1/me/workouts/{id}` returns the movements, their targets, their cues,
 * what is logged and what was logged last time, in one response.
 *
 * That is not the mistake `pull()` is refused for. `pull()` returns the WHOLE
 * ACCOUNT to draw one screen; this returns one workout's own rows. And the
 * caller is a client standing at a rack on a gym's wifi, where five round trips
 * to draw one screen is the difference between logging a set and giving up —
 * §2's "fully offline" is the phone's answer to that; the web's is to ask once.
 */

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';

/** Eight seconds, the same ceiling and the same reasoning as `lib/today/api.ts`. */
const TIMEOUT_MS = 8_000;

/**
 * How far back the portal reads the diary.
 *
 * Ninety days, where Today's is thirty. Two of this half's screens ask about a
 * span rather than a moment: Home's *3 of 4 this week* needs the week, and
 * Progress' consistency figure is stated over three months because a month is
 * too short to be a fact about somebody's habit. It is still a window and not
 * the whole history — the strength curve comes from `me/sets`, which is
 * unwindowed for the reason stated on that function.
 */
export const PORTAL_LOOKBACK_DAYS = 90;

/** Twenty-eight days forward, which is what §4's *next 2–4 weeks* asks for. */
export const PORTAL_LOOKAHEAD_DAYS = 28;

/** Thrown for anything that is not a 2xx, so the guard can tell 401 from 500. */
export class PortalApiError extends Error {
  constructor(
    readonly status: number | null,
    readonly code: string | null = null,
    readonly detail: string | null = null,
  ) {
    super(`inclineyou api ${status ?? 'unreachable'}${code ? ` ${code}` : ''}`);
    this.name = 'PortalApiError';
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  // Not an assertion for tidiness: with no token the backend answers 401 and
  // the screen would report a server problem for what is a signed-out browser.
  if (!token) throw new PortalApiError(401);

  const clientId = await getActiveClient();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${BASE}${path}${clientId ? `${sep}clientId=${encodeURIComponent(clientId)}` : ''}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
      /* Nothing here is cacheable. A portal drawing yesterday's pack balance is
         wrong in the way that looks exactly like being right — the same
         argument `lib/today/api.ts` makes about the deck. */
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Refused, DNS, and a timeout all mean the same thing to the screen:
    // nothing answered. `PortalApiError(null)` reads as `unreachable`.
    throw new PortalApiError(null);
  }

  if (!res.ok) {
    /* The server's own sentence, where it sent one. Three of the portal's
       refusals are things a CLIENT reads — an unapproved swap, a closed log, a
       number that is not ten digits — and every one of them is better said by
       the rule that refused it than by anything this layer could invent.
       `lib/packs/api.ts` reached the same conclusion. */
    let code: string | null = null;
    let detail: string | null = null;
    try {
      const body = (await res.json()) as { code?: unknown; detail?: unknown };
      code = typeof body.code === 'string' ? body.code : null;
      detail = typeof body.detail === 'string' ? body.detail : null;
    } catch {
      /* A proxy that stripped the body. The status still classifies it. */
    }
    throw new PortalApiError(res.status, code, detail);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

const get = <T,>(path: string) => call<T>(path);

/* ─────────────────────────────────────────────────────────── wire shapes ──
 * Named after the projections in `mock/portal.ts`. Every field a screen does
 * not read is left out on purpose: a DTO that mirrors the server is a second
 * place the server's shape is written down.
 * ------------------------------------------------------------------------- */

export interface MeWire {
  client: {
    id: string;
    name: string;
    phone: string | null;
    goal: string | null;
    membershipStatus: string | null;
    deliveryMode: string | null;
    sessionsPerWeek: number | null;
    sessionDurationMinutes: number | null;
    weeklySchedule: { templateDay: number; weekday: number; time: string }[] | null;
    /** When this arrangement started. Progress' *N weeks with Arun* counts from it. */
    startedAt: number;
    /** The client's own health and injury text. §5 — theirs to correct. */
    health: string;
  };
  trainer: {
    id: string;
    name: string;
    phone: string | null;
    gymName: string | null;
    headline: string | null;
    mapLink: string | null;
  };
  rosters: { clientId: string; clientName: string; trainerName: string }[];
  prefs: PrefsWire;
}

export interface PrefsWire {
  clientId: string;
  hideWeight: boolean;
  /**
   * DPDP §14's nominee — one person who may exercise §§11–13 if the client
   * dies or cannot act. `null` where they have not named anybody.
   *
   * On `client_prefs` rather than on the client row, and `mock/types.ts`
   * carries the argument: this is the only table the trainer's half never
   * reads, which is what lets the visibility card promise the trainer cannot
   * see it. Two facts about a third person do not belong in a coaching record.
   */
  nominee: { name: string; phone: string } | null;
}

export interface PortalSessionWire {
  id: string;
  scheduledAt: number;
  durationMinutes: number | null;
  status: string;
  dayLabel: string | null;
  templateDay: number | null;
  deliveryMode: string | null;
  location: string | null;
  workoutId: string | null;
}

export interface PortalExerciseWire {
  id: string;
  name: string;
  muscleGroup: string | null;
  equipment: string | null;
  logType: string | null;
  /**
   * The trainer's own line for this client. `program_exercise.notes`.
   *
   * This field and the two below it are the whole of *how is this done* now.
   * There was a `clip` beside them — a length in seconds, drawn as a poster with
   * a play disc over it — and **the product does not support video**, so it is
   * gone from the wire rather than nulled. Removing it moved the weight onto
   * this line, which is where §"Make the trainer present" says the value is:
   * *"Notes, cues, personal messages — these are what separate you from a free
   * workout app."*
   */
  cue: string | null;
  /** The library's generic imperatives. Read only where there is no `cue`. */
  formCues: string[];
  steps: string | null;
}

export interface PortalProgramWire {
  id: string;
  name: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  weeks: number | null;
  /** `'active'` or `'completed'`. The same route serves both — a finished block
   *  is read whole when a client opens it under *Past plans*. */
  status: string;
  /**
   * Which week of how many, clamped into the block. §4's *Week 5 of 12*.
   *
   * **Null on anything that is not the live block.** Not clamped to its last
   * week: *Week 8 of 8* on a plan somebody finished in June is a sentence in the
   * wrong tense, and that plan's own dates say when it ran instead.
   */
  week: number | null;
  dayLabels: Record<string, string>;
  trainingDays: number[];
  days: {
    templateDay: number;
    label: string;
    exercises: {
      exercise: PortalExerciseWire | null;
      sets: number | null;
      reps: number | null;
      targetLoad: number | null;
      restSeconds: number | null;
    }[];
  }[];
}

export interface PortalWorkoutSummaryWire {
  id: string;
  sessionDate: string;
  startedAt: number;
  endedAt: number | null;
  setCount: number;
  volumeKg: number;
  exerciseCount: number;
  effort: 'easy' | 'right' | 'hard' | null;
}

export interface PortalSetWire {
  id: string;
  setNumber: number;
  loadKg: number | null;
  reps: number | null;
  rpe: number | null;
}

export interface PortalWorkoutExerciseWire {
  exercise: PortalExerciseWire | null;
  targetSets: number | null;
  targetReps: number | null;
  targetLoad: number | null;
  restSeconds: number | null;
  swappedFromExerciseId: string | null;
  /** The trainer-approved substitute, or null where they named none. */
  alternative: PortalExerciseWire | null;
  sets: PortalSetWire[];
  lastTime: {
    sessionDate: string;
    sets: { setNumber: number; loadKg: number | null; reps: number | null }[];
    bestLoadKg: number;
    bestReps: number;
  } | null;
}

export interface PortalWorkoutWire {
  id: string;
  sessionDate: string;
  startedAt: number;
  endedAt: number | null;
  dayLabel: string | null;
  programName: string | null;
  deliveryMode: string | null;
  scheduledAt: number | null;
  notes: string | null;
  feedback: { effort: 'easy' | 'right' | 'hard'; note: string | null; at: number } | null;
  exercises: PortalWorkoutExerciseWire[];
}

export interface PortalMetricWire {
  id: string;
  metricType: string;
  value: number;
  unit: string;
  recordedAt: number;
}

export interface PortalPackageWire {
  id: string;
  name: string;
  type: string;
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  amount: number;
  amountPaid: number;
  amountDue: number;
  status: string;
  startDate: string | null;
  endDate: string | null;
}

export interface PortalPaymentWire {
  id: string;
  amount: number;
  method: string | null;
  status: string;
  paidAt: number | null;
  createdAt: number;
}

export interface PortalMessageWire {
  id: string;
  body: string;
  kind: 'note' | 'program' | 'report';
  at: number;
  readAt: number | null;
  trainerName: string;
}

export interface PortalMilestoneWire {
  id: string;
  kind: string;
  label: string;
  value: number | null;
  at: number;
}

export interface PortalSetHistoryWire {
  exerciseId: string;
  setNumber: number;
  loadKg: number | null;
  reps: number | null;
  sessionDate: string;
  createdAt: number;
}

/* ─────────────────────────────────────────────────────────────── the reads ── */

/**
 * `cache()`d per request, because four of the five screens read it: the shell
 * needs the client's name for the rail's foot, the trainer's name for the
 * account menu, and `prefs.hideWeight` before Progress can decide what to draw.
 * Without this, one navigation costs three identical round trips.
 */
export const getMe = cache((): Promise<MeWire> => get<MeWire>('/v1/me'));

export function getPortalSessions(from: number, to: number): Promise<PortalSessionWire[]> {
  return get<PortalSessionWire[]>(`/v1/me/sessions?from=${Math.round(from)}&to=${Math.round(to)}`);
}

/** Null where the trainer has not assigned one. A real state, and drawn as one. */
export const getPortalProgram = cache(
  (): Promise<PortalProgramWire | null> => get<PortalProgramWire | null>('/v1/me/program'),
);

/**
 * A finished block, as the *Past plans* list reads it.
 *
 * Deliberately NOT `PortalProgramWire`. That shape carries every day and every
 * movement in it, each with the trainer's cue, a paragraph of steps and a list
 * of form pointers — three of those is a large response for a list whose whole
 * job is to say *there are two, and here is what they were called*. The full
 * object arrives from `getPortalProgramById` when a client opens one.
 *
 * `workoutCount` is **nullable and the null means "not knowable"**, not zero.
 * The mock's own handler carries the argument: the book holds workouts for the
 * last sixty days, so a block that finished before that has no sessions on
 * record — and printing `0 workouts` against a plan somebody actually trained
 * is the screen accusing them of a gap in its own data, which is what §1
 * forbids. Draw the figure where it exists and say nothing where it does not.
 */
export interface PortalProgramSummaryWire {
  id: string;
  name: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  weeks: number | null;
  status: string;
  trainingDays: number[];
  dayCount: number;
  exerciseCount: number;
  workoutCount: number | null;
}

/**
 * Every block behind the current one, newest first. The active one is NOT here —
 * it is the subject of the tab beside this one.
 *
 * `cache()`d because two callers read it in one render: the Plan layout, for the
 * count on the *Past plans* tab, and that tab's own page. Without it the strip
 * would cost a second identical round trip on the one route that also needs the
 * rows.
 */
export const getPortalPrograms = cache(
  (): Promise<PortalProgramSummaryWire[]> =>
    get<PortalProgramSummaryWire[]>('/v1/me/programs'),
);

/**
 * One block in full, live or finished. 404 where the id is not this client's —
 * the mock answers a 404 rather than a 403 deliberately, so asking about
 * somebody else's plan does not confirm that it exists.
 */
export function getPortalProgramById(id: string): Promise<PortalProgramWire> {
  return get<PortalProgramWire>(`/v1/me/programs/${encodeURIComponent(id)}`);
}

export function getPortalWorkouts(limit?: number): Promise<PortalWorkoutSummaryWire[]> {
  return get<PortalWorkoutSummaryWire[]>(
    `/v1/me/workouts${limit ? `?limit=${limit}` : ''}`,
  );
}

export function getPortalWorkout(workoutId: string): Promise<PortalWorkoutWire> {
  return get<PortalWorkoutWire>(`/v1/me/workouts/${encodeURIComponent(workoutId)}`);
}

/**
 * Every set this client has ever logged, and it is UNWINDOWED on purpose.
 *
 * `lib/reports/build.ts` already made this call and its reason holds twice over
 * here: a personal best is a claim about the whole history, so "a window is
 * what produced the wrong answer." Progress' headline is *Squat 40kg → 62.5kg*
 * over twelve weeks with the trainer, which is a statement about a beginning —
 * and the beginning is older than any window a screen would pick.
 *
 * One row per set, so it grows with tenure: fourteen months of three sessions a
 * week is ~430 rows here. If it ever bites, the fix is a per-exercise
 * projection on the backend rather than a window on this call.
 */
export const getPortalSets = cache(
  (): Promise<PortalSetHistoryWire[]> => get<PortalSetHistoryWire[]>('/v1/me/sets'),
);

export const getPortalMetrics = cache(
  (): Promise<PortalMetricWire[]> => get<PortalMetricWire[]>('/v1/me/metrics'),
);

/**
 * Names for movement ids the client has logged — one request, not one per row.
 *
 * ── AND IT IS ONLY WORTH ASKING FOR WHAT THE PROGRAM CANNOT ANSWER ──────────
 *
 * The program already carries a hydrated `exercise` on every row it holds, so
 * the caller resolves from there first and asks this only for the remainder.
 * On a client whose plan has not changed that remainder is empty and this is
 * never called at all; on one who has been training a year it is the handful of
 * lifts that have since come off the plan, which is exactly the "real request
 * for a rare row" the gap's own note priced.
 *
 * Not `cache()`d, because the argument is a list: two callers asking for
 * different id sets would miss anyway, and there is one caller.
 */
export function getPortalExerciseNames(ids: string[]): Promise<PortalExerciseWire[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return get<PortalExerciseWire[]>(
    `/v1/me/exercises?ids=${encodeURIComponent(ids.join(','))}`,
  );
}

export const getPortalPackages = cache(
  (): Promise<PortalPackageWire[]> => get<PortalPackageWire[]>('/v1/me/packages'),
);

export const getPortalPayments = cache(
  (): Promise<PortalPaymentWire[]> => get<PortalPaymentWire[]>('/v1/me/payments'),
);

export const getPortalMessages = cache(
  (): Promise<PortalMessageWire[]> => get<PortalMessageWire[]>('/v1/me/messages'),
);

export const getPortalMilestones = cache(
  (): Promise<PortalMilestoneWire[]> => get<PortalMilestoneWire[]>('/v1/me/milestones'),
);

/* ── §"assessments" · the check-ins addressed to me ────────────────────────

   Two reads and they are deliberately not one. The LIST is what Home draws —
   one row per check-in, two count pairs and a date — and the DETAIL carries
   every question and every tape the template asks for, which on the seeded
   block template is twenty-six objects. `assessmentView` on the trainer's side
   strips the same weight off its own list for the same reason.

   Neither is `cache()`d, and that is the difference from every read above it.
   The flow saves one ask at a time and then re-reads the check-in to redraw
   from what the server holds rather than from an optimistic splice — the same
   call `Flow.tsx` makes about a set — and a request memoised across the render
   would hand it back what was true before the save.                          */
export function getPortalCheckIns(): Promise<CheckInWire[]> {
  return get<CheckInWire[]>('/v1/me/assessments');
}

export function getPortalCheckIn(id: string): Promise<CheckInDetailWire> {
  return get<CheckInDetailWire>(`/v1/me/assessments/${encodeURIComponent(id)}`);
}

/**
 * One ask, saved or cleared.
 *
 * The body is the wire's own discriminated union — `{kind:'measurement', key,
 * value}` or `{kind:'question', questionId, …}` — and `clear` takes an answer
 * back out, which is what a SKIP has to do on a step somebody had already
 * answered. The whole check-in comes back, so the caller redraws from the
 * server's copy of what it holds rather than from its own idea of it.
 */
export function postCheckInAnswer(
  id: string,
  body: Record<string, unknown>,
): Promise<CheckInDetailWire> {
  return call<CheckInDetailWire>(`/v1/me/assessments/${encodeURIComponent(id)}/answers`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Send it back. `completedAt` and nothing else — see the mock's handler. */
export function postCheckInSubmit(id: string): Promise<CheckInDetailWire> {
  return call<CheckInDetailWire>(`/v1/me/assessments/${encodeURIComponent(id)}/submit`, {
    method: 'POST',
  });
}
/** §5 · everything this book holds about them, as one document. */
export function getPortalExport(): Promise<Record<string, unknown>> {
  return get<Record<string, unknown>>('/v1/me/export');
}

/* ────────────────────────────────────────────────────────────── the writes ── */

/**
 * Start today's workout, or return the one already open.
 *
 * The mock resolves those two to one response deliberately — see its handler —
 * so this is safe to call from a *Start* button a client presses twice.
 */
export function postWorkout(sessionId?: string | null) {
  return call<PortalWorkoutWire>('/v1/me/workouts', {
    method: 'POST',
    body: JSON.stringify(sessionId ? { sessionId } : {}),
  });
}

export function postSet(
  workoutId: string,
  set: { exerciseId: string; setNumber: number; loadKg: number | null; reps: number | null },
) {
  return call<PortalSetWire>(`/v1/me/workouts/${encodeURIComponent(workoutId)}/sets`, {
    method: 'POST',
    body: JSON.stringify(set),
  });
}

export function postSwap(workoutId: string, exerciseId: string, toExerciseId: string) {
  return call<PortalWorkoutWire>(`/v1/me/workouts/${encodeURIComponent(workoutId)}/swap`, {
    method: 'POST',
    body: JSON.stringify({ exerciseId, toExerciseId }),
  });
}

export function postFinish(
  workoutId: string,
  feedback?: { effort: 'easy' | 'right' | 'hard'; note?: string | null },
) {
  return call<PortalWorkoutWire>(`/v1/me/workouts/${encodeURIComponent(workoutId)}/finish`, {
    method: 'POST',
    body: JSON.stringify(feedback ?? {}),
  });
}

export function patchMe(fields: { phone?: string; health?: string }) {
  return call<{ id: string; phone: string | null; health: string }>('/v1/me', {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

export function patchPrefs(fields: {
  hideWeight?: boolean;
  /** `null` withdraws the nomination. Absent leaves it alone. */
  nominee?: { name: string; phone: string } | null;
}) {
  return call<PrefsWire>('/v1/me/prefs', { method: 'PATCH', body: JSON.stringify(fields) });
}

/* ── §5 · moving the number they sign in with · four steps, two codes ──────
 *
 * The client's own ladder, and it is `/v1/me/phone/*` rather than the trainer's
 * `/v1/trainers/me/phone/*` — same four steps, a different subject. `mock/
 * portal.ts` carries why a client needs it MORE than a trainer does: there is
 * no email and no password behind it, so the number is not a contact detail
 * that can be wrong, it is the account.
 *
 * The ticket never reaches the browser — `lib/portal/actions.ts` puts it in an
 * httpOnly cookie, which is the rule `lib/account/actions.ts` states at length
 * and the reason it states: a second factor easier to steal than the first is
 * not a second factor.
 */

/** 1 · a code to the number they are signed in with. */
export function challengeMyPhone(): Promise<null> {
  return call<null>('/v1/me/phone/challenge', { method: 'POST' });
}

/** 2 · that code back, for the ten-minute proof steps 3 and 4 present. */
export async function verifyMyPhone(otp: string): Promise<string> {
  const res = await call<{ ticket: string }>('/v1/me/phone/verify', {
    method: 'POST',
    body: JSON.stringify({ otp }),
  });
  return res.ticket;
}

/** 3 · the new number. Refused here — taken, or the trainer's — before an SMS. */
export function requestMyNewPhone(ticket: string, phone: string): Promise<null> {
  return call<null>('/v1/me/phone/request', {
    method: 'POST',
    body: JSON.stringify({ ticket, phone }),
  });
}

/**
 * 4 · the code from the new number, and the swap.
 *
 * Answers a fresh token, and the caller MUST write it: the old one carries the
 * old number in its `phone` claim and `resolve()` in `mock/portal.ts` finds the
 * client by matching it. A portal holding the stale token 403s as
 * `NOT_A_CLIENT` on its very next read — the number is no longer on any roster.
 */
export function confirmMyNewPhone(
  ticket: string,
  phone: string,
  otp: string,
): Promise<{ phone: string; token: string }> {
  return call<{ phone: string; token: string }>('/v1/me/phone/confirm', {
    method: 'POST',
    body: JSON.stringify({ ticket, phone, otp }),
  });
}

export function postMessageRead(messageId: string) {
  return call<{ id: string; readAt: number }>(
    `/v1/me/messages/${encodeURIComponent(messageId)}/read`,
    { method: 'POST' },
  );
}

/** §5 · and it really deletes. `mock/portal.ts` states what survives and why. */
export function deleteMe() {
  return call<null>('/v1/me', { method: 'DELETE' });
}
