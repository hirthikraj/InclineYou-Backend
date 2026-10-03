import 'server-only';

import { cache } from 'react';

import { getExercises } from '@/lib/exercises/api';
import { api, ApiError } from '@/lib/http/client';
import type { ConsoleData, FinishData } from '@/lib/log/api';
import type { PickView } from '@/lib/log/log';

import {
  buildConsoleView,
  buildFinishView,
  buildPickView,
  buildRecents,
  buildTimelines,
  historyParts,
  lastSessionId,
  packFor,
  type HistoryParts,
  type LogViewX,
  type ViewContext,
} from './select';
import type { HistoryWire, LogWire, PickWire, SessionRowWire } from './wire';

/**
 * EVERYTHING THE LOG SCREENS READ — api-contract v1.1 *Log session*.
 *
 * ── WHAT THIS REPLACES ──────────────────────────────────────────────────────
 *
 * `lib/log/api.ts`'s `getConsole`: about nine reads — every workout, every set,
 * every client, every program and session, the whole exercise library (`size=2000`)
 * and the program's exercises — assembled in the Next server so the old model
 * could be built there. Here the console is one read of the session's own log
 * (`GET /v1/sessions/{id}/log`, which carries the plan, last time and best) plus
 * three small ones that fill in what the screen shows beside it: the client's set
 * history, their pack and their program. None of them is the library.
 *
 * `lib/log/api.ts` is NOT deleted: Progress, the lift's history and the portal
 * still read through it, and they move in their own pass.
 *
 * ── THE FAILURE RULE ────────────────────────────────────────────────────────
 *
 * Same as Today's and Business's: anything that is not a 2xx becomes a
 * {@link SessionLogApiError} carrying the status and the server's `code` and
 * sentence, so a guard can tell a signed-out browser (401) from an unreachable
 * server (null) from a refusal, and a write can say WHY (`SET_NEEDS_VALUE`).
 * Three reads are allowed to fail without failing the screen — the pack, the
 * program row and the repeat label — because each only decorates one line.
 * The history is NOT one of them: without it every verdict would read *first*,
 * which is a lie, so its failure fails the page.
 */
export class SessionLogApiError extends Error {
  constructor(
    readonly status: number | null,
    readonly code: string | null = null,
    readonly detail: string | null = null,
  ) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'SessionLogApiError';
  }
}

export async function send<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; ifMatch?: string } = {},
): Promise<T> {
  try {
    return await api<T>(path, {
      method: options.method,
      body: options.body,
      // A conditional write names the version it was read at; the server's 412 is the answer to a stale one.
      headers: options.ifMatch ? { 'if-match': `"${options.ifMatch}"` } : undefined,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw new SessionLogApiError(error.status, error.problem.code ?? null, error.problem.detail ?? null);
    }
    throw error;
  }
}

const get = <T>(path: string) => send<T>(path);

/** A read where a missing or malformed id is "no such log", not an error. */
async function orNull<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof SessionLogApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}

/* ─────────────────────────────────────────────────────────── the two reads ── */

/** `GET /v1/sessions/{id}/log` — one request. Null: not a session of yours. */
export const getLogWire = cache(async (sessionId: string): Promise<LogWire | null> =>
  orNull(() => get<LogWire>(`/v1/sessions/${encodeURIComponent(sessionId)}/log`)));

/** `GET /v1/sessions/pick` — one request, three bounded groups. */
export const getPickWire = cache(async (): Promise<PickWire> => get<PickWire>('/v1/sessions/pick'));

/* ───────────────────────────────────────────────────── the small companions ── */

/**
 * `GET /v1/clients/{id}/set-history`, every page. Every completed set the client
 * has ever logged, oldest first — what gives the console its history column, its
 * verdicts and its recents. A year of four sessions a week is well inside one page;
 * the loop is bounded so a runaway cursor cannot spin the server.
 */
export const getHistoryWire = cache(async (clientId: string): Promise<HistoryWire> => {
  const out: HistoryWire = { exercises: {}, items: [], sessions: {} };
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams();
    if (cursor) q.set('cursor', cursor);
    const res: HistoryWire & { nextCursor: string | null } = await get(
      `/v1/clients/${encodeURIComponent(clientId)}/set-history?${q}`,
    );
    Object.assign(out.exercises, res.exercises);
    Object.assign(out.sessions!, res.sessions ?? {});
    out.items.push(...res.items);
    cursor = res.nextCursor;
    if (!cursor) break;
  }
  return out;
});

interface PackageWire {
  basis: string;
  status: string;
  sessionsRemaining: number | null;
  sessionsTotal: number | null;
  createdAt: number;
}

/** The client's live packs (`scope=current`), for the pack sentence. Lenient: no pack is a valid answer. */
const getPacks = cache(async (clientId: string): Promise<PackageWire[]> => {
  try {
    const res = await get<{ items: PackageWire[] }>(
      `/v1/packages?clientId=${encodeURIComponent(clientId)}&scope=current`,
    );
    return res.items ?? [];
  } catch {
    return [];
  }
});

interface ProgramRowWire {
  id: string;
  status: string | null;
  endDate: string | null;
  copiedFromProgramId: string | null;
}

/** The program the log is on — for the template it was copied from and how much of it is left. Lenient. */
const getProgramRow = cache(async (programId: string): Promise<ProgramRowWire | null> => {
  try {
    return await get<ProgramRowWire>(`/v1/programs/${encodeURIComponent(programId)}`);
  } catch {
    return null;
  }
});

/** Frame 3b's third scope counts the clients a template edit would reach: those on a live copy of it. */
const DEAD = new Set(['cancelled', 'canceled', 'completed', 'archived']);
const getTemplateReach = cache(async (templateId: string): Promise<number | null> => {
  try {
    const res = await get<{ items: { clientId: string; status: string | null }[] }>(
      `/v1/programs/${encodeURIComponent(templateId)}/assignments`,
    );
    return new Set(
      (res.items ?? []).filter((a) => !DEAD.has((a.status ?? 'active').toLowerCase())).map((a) => a.clientId),
    ).size;
  } catch {
    return null;
  }
});

/**
 * The add panel's starting list — the first page of the library by name, in the
 * shape the panel already searches. The panel's real answer is `exerciseSearch`
 * (typed-ahead, per keystroke); this is only what is on screen before a letter is
 * typed, and it is one request of 200 rows, never the whole library.
 */
const getLibrary = cache(async (): Promise<ConsoleData['library']> => {
  try {
    const page = await getExercises({ size: 200 });
    return page.exercises.map((e) => ({ id: e.id, name: e.name, muscleGroup: e.muscleGroup, isCustom: e.isCustom }));
  } catch {
    return [];
  }
});

/* ──────────────────────────────────────────────────────── the console ── */

/** What the console needs to rebuild its view in the browser after every write, without asking again. */
export interface ConsoleState {
  log: LogWire;
  history: HistoryParts;
  ctx: ViewContext;
}

export type ConsoleDataX = Omit<ConsoleData, 'view'> & { view: LogViewX; state: ConsoleState };

function sessionWire(s: SessionRowWire, programId: string | null): NonNullable<ConsoleData['session']> {
  return {
    id: s.id,
    clientId: s.clientId,
    programId,
    scheduledAt: s.scheduledAt,
    durationMinutes: s.durationMinutes,
    status: s.status,
    dayLabel: s.workout?.name ?? null,
    templateDay: s.workout?.day ?? null,
    deliveryMode: s.deliveryMode,
    notes: s.notes,
  };
}

/**
 * Frame 1a: everything the console draws, in `ConsoleData`'s old shape plus the
 * state it rebuilds from. Null: no such session.
 *
 * Requests: the log (1), then in parallel the history (1+), the pack (1), the
 * program (1) and the library's first page (1); a template's reach and the repeat
 * label add one each, only when there is a template or a repeat to describe.
 */
export const getConsoleData = cache(async (routeId: string): Promise<ConsoleDataX | null> => {
  const now = Date.now();
  const log = await getLogWire(routeId);
  if (!log) return null;
  const clientId = log.client.id;
  const programId = log.program?.id ?? null;

  const [history, packs, program, library] = await Promise.all([
    getHistoryWire(clientId),
    getPacks(clientId),
    programId ? getProgramRow(programId) : Promise.resolve(null),
    getLibrary(),
  ]);
  const repeatId = lastSessionId(history, log.session.id);
  /* The repeat offer's label is the workout's name, which the history now carries per session
     (`sessions`), so it no longer costs a read of that session's row. */
  const repeatName = repeatId ? history.sessions?.[repeatId]?.workoutName ?? null : null;
  const templateReach = program?.copiedFromProgramId ? await getTemplateReach(program.copiedFromProgramId) : null;

  const ctx: ViewContext = {
    now,
    repeatLabel: repeatId && repeatName ? { sessionId: repeatId, name: repeatName } : null,
  };
  const parts = historyParts(history, clientId, log.session.id);
  const view = buildConsoleView(log, parts, ctx);
  if (!view) return null;

  const onCard = new Set(view.exercises.map((e) => e.exerciseId));
  /* `endDate` is the only thing on the wire that bounds a program, so a plan
     without one says "from now on" and does not invent a number. */
  const programWeeksLeft = program?.endDate
    ? Math.max(0, Math.ceil((Date.parse(`${program.endDate}T00:00:00`) - now) / 604_800_000))
    : null;

  return {
    routeId,
    view,
    session: sessionWire(log.session, programId),
    programId,
    templateId: program?.copiedFromProgramId ?? null,
    programWeeksLeft,
    pack: packFor(packs),
    repeatHref: view.repeat ? `/sessions/${view.repeat.workoutId}/log` : null,
    timelines: buildTimelines(log, parts, ctx),
    library,
    recents: buildRecents(history, onCard, log.session.id),
    templateReach,
    now,
    state: { log, history: parts, ctx },
  };
});

/* ──────────────────────────────────────────────────────────── the finish ── */

export type FinishDataX = Omit<FinishData, 'view'> & { view: LogViewX };

/** Frame 5b: the console's own view plus the pack sentence — the log read and the client's live packs. */
export const getFinishData = cache(async (routeId: string): Promise<FinishDataX | null> => {
  const data = await getConsoleData(routeId);
  if (!data) return null;
  const finish = buildFinishView(data.view, data.state.log.session, data.pack);
  return { routeId, view: data.view, finish, session: data.session, now: data.now };
});

/* ───────────────────────────────────────────────────────────── the picker ── */

/**
 * Frame 5a. One read, and it is all: the three groups come back together and each
 * open log says how far along it is, so *Carry on* needs nothing else.
 */
export const getPickerView = cache(async (): Promise<PickView> => buildPickView(await getPickWire()));

/* ───────────────────────────────────────────────── before the log is started ── */

/**
 * What *Start the log* needs — the same three facts the old `getUnstarted`
 * returned (the booking, the client's name, the program it would use), from the
 * one read: before start, the log read is the plan preview.
 */
export const getStartPreview = cache(async (routeId: string) => {
  const log = await getLogWire(routeId);
  if (!log) return null;
  return {
    session: sessionWire(log.session, log.program?.id ?? null),
    clientName: log.client.name.trim() || 'Client',
    programId: log.program?.id ?? null,
    started: log.session.startedAt !== null,
  };
});

/** Typed-ahead search for the add and swap panels — `GET /v1/exercises?q=&limit=20`, in the library's row shape. */
export async function searchLibrary(q: string): Promise<ConsoleData['library']> {
  const page = await getExercises({ q, size: 20 });
  return page.exercises.map((e) => ({ id: e.id, name: e.name, muscleGroup: e.muscleGroup, isCustom: e.isCustom }));
}

/**
 * The whole library, in the add and swap panels' row shape — fetched by the browser
 * once the console is up (a server action), not by every render of the console, so
 * the page itself still reads no library. The panels' chips (muscle groups, *Yours*,
 * *All*) and their count are computed over this list, which is why a first page of
 * 200 is not enough for them.
 */
export async function fullLibrary(): Promise<ConsoleData['library']> {
  const page = await getExercises({ size: 2000 });
  return page.exercises.map((e) => ({ id: e.id, name: e.name, muscleGroup: e.muscleGroup, isCustom: e.isCustom }));
}
