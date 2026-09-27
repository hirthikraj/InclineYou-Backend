import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';
import type { RateSource, WorkWindow } from '@/lib/today/day';
import { clockParts, startOfDay, DAY_MS } from '@/lib/today/time';
import { readMode } from '@/lib/today/mode';
import { rangeFor, type ScheduleView } from './view';
import { bookableClients, DEAD_SESSION, sessionMinutes } from './roster';
import type { ScheduleClient, ScheduleSession } from './session';
import { listAll, type ListEnvelope } from '@/lib/http/client';

/* The shapes live in `./session`, which carries no `server-only`, so the client
   components can import them without pulling this file's fetch layer with them.
   Re-exported here because this is where they are produced. */
export type { ScheduleClient, ScheduleSession };

/**
 * WHAT THE SCHEDULE ASKS THE SERVER FOR, AND WHY IT IS SIX REQUESTS.
 *
 * `lib/today/api.ts` makes seven and explains at length why it is not one
 * `sync/pull`; every word of that applies here and is not repeated. What is
 * different is the WINDOW.
 *
 * Today fetches Monday-to-tomorrow because every consumer of its session list
 * lives inside that range. This screen's whole subject is a range the trainer
 * chooses, so the window is the view's own — one day, one week, or the 42 days a
 * month grid draws. `rangeFor` is the single place that arithmetic lives, and the
 * page hands the same range to the fetch and to the grid, so the thing drawn and
 * the thing fetched cannot disagree.
 *
 * Five of the six are not windowed and each has a reason:
 *
 *   · `/v1/trainers/me`   — one row.
 *   · `/v1/clients`       — the roster, and the booking form needs ALL of it. A
 *                           client with nothing booked this week is exactly who a
 *                           trainer opens this screen to book.
 *   · `/v1/programs`      — the block's plan line ("Full Body B · Week 4/8") and
 *                           the booking form's plan picker.
 *   · `/v1/packages`      — the per-session rate a gap is priced at, and the
 *                           panel's "6 of 12 left". Windowing a package by the
 *                           week it is looked at in is meaningless.
 *   · `/v1/working-hours` — the ground every block is drawn on.
 *
 * Deliberately NOT fetched, and this is the difference from Today that matters
 * most: `/v1/workouts` and `/v1/payments`. Today needs them for the attention
 * queue — *gone quiet* and *still pending* — and both are unwindowed reads over a
 * whole account. This screen has no queue. It draws what is PLANNED, which is
 * `scheduled_session` and nothing else, so a month view costs six bounded reads
 * rather than a full history.
 *
 * The consequence is honest and worth stating: a block here cannot say whether a
 * log was opened against it, because that lives in `workout_session`. So `live`
 * and `late` are computed from the schedule alone — see `toSession`.
 */

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';

/** Same eight seconds, same reason, as `lib/today/api.ts`. A fetch with no
 *  timeout does not fail when a server stops answering — only when it refuses. */
const TIMEOUT_MS = 8_000;

export class ScheduleApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'ScheduleApiError';
  }
}

async function request<T>(
  path: string,
  init?: { method: string; body?: unknown },
): Promise<T> {
  const token = await getToken();
  // Not tidiness: without a token the backend answers 401 and the screen would
  // report a server problem for what is a signed-out browser.
  if (!token) throw new ScheduleApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        ...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      // A schedule is a snapshot of a minute like the deck is, and a cached one
      // is wrong in the way that looks exactly like being right.
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ScheduleApiError(null);
  }
  if (!res.ok) throw new ScheduleApiError(res.status);

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

const get = <T>(path: string) => request<T>(path);
export const post = <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body });
export const put = <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body });
export const del = (path: string) => request<null>(path, { method: 'DELETE' });

/* ------------------------------------------------------------ wire shapes ── */
/* Named after the Java records, so a change there is greppable from here. Every
 * field the screen does not read is left out on purpose. ------------------- */

interface TrainerWire {
  name: string;
  phone: string | null;
  gymName: string | null;
  gymSharePercent: number | null;
  setupComplete: boolean;
}

interface ClientWire {
  id: string;
  name: string;
  status: string;
  /** The roster relationship. See the note on `ScheduleClient.membership`. */
  membershipStatus?: string | null;
  deliveryMode: string | null;
  metadata: Record<string, unknown> | null;
  /** On `ClientResponse` since the create body carried it; the booking form's
   *  default length comes from here rather than from a constant. */
  sessionDurationMinutes?: number | null;
  sessionsPerWeek?: number | null;
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
  notes?: string | null;
  /**
   * V10's `pack_delta` — what this session took off the client's pack, or 0/null
   * when it cost nothing. Appended to `SessionResponse` on 28 Aug 2026.
   *
   * The panel reads it for one sentence: *Marked no-show* and *Marked no-show ·
   * pack −1* are different facts, and until this was on the wire the diary could
   * only ever say the first. The phone's diary has drawn the distinction since
   * V10 because it holds the column in SQLite.
   */
  packDelta?: number | null;
}

interface ProgramWire {
  id: string;
  clientId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
}

interface PackageWire {
  id: string;
  clientId: string;
  type: string;
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  amount: number | string | null;
  status: string;
  createdAt: number;
}

interface WorkingHourWire {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
}

/** Jackson can hand back a string for a `BigDecimal`; `₹NaN` is not a price. */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* ------------------------------------------------------------ the screen ── */

/* The default length and the dead-status set are `./roster`'s — Today's booking form
   reads the same two rules now, and one of them deciding a session is dead while
   the other does not is a clash warning that appears on one screen only. */
const DONE_SESSION = new Set(['done', 'completed']);

export interface ScheduleData {
  view: ScheduleView;
  anchor: number;
  from: number;
  to: number;
  sessions: ScheduleSession[];
  clients: ScheduleClient[];
  hours: WorkWindow[];
  rates: RateSource;
  trainer: {
    name: string;
    phone: string | null;
    gymName: string | null;
    gymSharePercent: number | null;
    setupComplete: boolean;
  };
  /** The instant the server derived this from. The browser ticks on from it. */
  now: number;
}

/**
 * A wire row into the shape the geometry reasons in.
 *
 * `DeckSession` is reused rather than redefined, and that is the point: it is
 * what `findGaps`, `dayMoney` and `findClash` in `lib/today/day.ts` take, so this
 * screen and Today compute a gap and a clash with the SAME function. Two
 * definitions of "is this hour free" is two answers on two screens open at the
 * same minute, which is the disagreement `lib/today/deck.ts` opens by refusing.
 *
 * ── THE TWO FIELDS THIS SCREEN CANNOT KNOW ──────────────────────────────────
 * `live` (a workout log is open against this session) and `late` (it started and
 * nobody opened one) are facts about `workout_session`, and this screen does not
 * fetch that table — see the header. So:
 *
 *   · `live` is always false here. A block never claims a session is running.
 *   · `late` is a session that has STARTED and is not done or dead, which is what
 *     the trainer can see for themselves from the now-line. It earns the warn
 *     ring honestly — "this should have been marked by now" — without asserting
 *     anything about a log.
 *
 * Today's version of `late` is stronger because Today holds the logs. Neither is
 * wrong; they are the same word at two resolutions, and the block's `aria-label`
 * says "not marked" rather than "not started" so the sentence is true at this one.
 */
function toSession(
  s: SessionWire,
  client: ClientWire | undefined,
  program: ProgramWire | undefined,
  now: number,
): ScheduleSession {
  const status = (s.status ?? '').toLowerCase();
  const done = DONE_SESSION.has(status);
  const dead = DEAD_SESSION.has(status);
  const { time, meridiem } = clockParts(s.scheduledAt);

  const minutes = sessionMinutes(s.durationMinutes, client?.sessionDurationMinutes);

  return {
    id: s.id,
    clientId: s.clientId,
    clientName: client?.name?.trim() || 'Client',
    programId: s.programId ?? undefined,
    templateDay: s.templateDay ?? undefined,
    at: s.scheduledAt,
    minutes,
    time,
    meridiem,
    detail: planLine(s, program, s.scheduledAt),
    mode: readMode({
      session: s.deliveryMode,
      client: client?.deliveryMode,
      metadata: client?.metadata,
    }),
    done,
    dead,
    live: false,
    late: !done && !dead && s.scheduledAt + minutes * 60_000 <= now,
    status,
    noShow: status === 'no_show' || status === 'noshow',
    packDelta: s.packDelta ?? 0,
    notes: s.notes ?? null,
    /*
     * `DeckSession.hasNote`, and on this half of the product it is derived from
     * the BOOKING's note only — not from `client.goal` the way Today's is.
     *
     * Not an inconsistency: this file already carries `notes` in full, because
     * the session panel prints it. The chip is Today's affordance for a screen
     * that cannot show the text; here the text is one click away in the panel, so
     * the flag is only ever a redundant restatement of a field this object
     * already has. Kept in the shape so `ScheduleSession` stays assignable
     * wherever a `DeckSession` is expected, which is what caught this.
     */
    hasNote: (s.notes ?? '').trim().length > 0,
    programName: program?.name ?? null,
  };
}

/** "Full Body B · Week 4/8" — the same sentence `deck.ts` composes, same rules. */
function planLine(s: SessionWire, program: ProgramWire | undefined, at: number): string {
  const label = s.dayLabel?.trim() || program?.name?.trim() || 'Session';
  if (!program?.startDate) return label;

  const start = Date.parse(`${program.startDate}T00:00:00`);
  if (!Number.isFinite(start)) return label;

  const week = Math.floor((startOfDay(at) - startOfDay(start)) / (7 * DAY_MS)) + 1;
  if (week < 1) return label;

  const end = program.endDate ? Date.parse(`${program.endDate}T00:00:00`) : NaN;
  if (!Number.isFinite(end)) return `${label} · Week ${week}`;

  const total = Math.max(1, Math.ceil((startOfDay(end) - startOfDay(start)) / (7 * DAY_MS)));
  return `${label} · Week ${Math.min(week, total)}/${total}`;
}

/**
 * `cache()` for the same reason `lib/today/api.ts` uses it: the page and its
 * metadata both want the week, and React's per-request cache makes that one round
 * of requests rather than two. A REQUEST cache — it does not survive the response.
 */
export const getSchedule = cache(
  async (view: ScheduleView, anchor: number): Promise<ScheduleData> => {
    const now = Date.now();
    const { from, to } = rangeFor(view, anchor);

    const [trainer, clients, sessions, programs, packages, hours] = await Promise.all([
      get<TrainerWire>('/v1/trainers/me'),
      get<ClientWire[]>('/v1/clients?view=legacy'),
      // 1.1: lists are `{items}` envelopes; the diary is followed to its last page.
      listAll<SessionWire>(`/v1/sessions?from=${from}&to=${to}`, (p) => get<ListEnvelope<SessionWire>>(p)),
      get<ProgramWire[]>('/v1/programs'),
      listAll<PackageWire>('/v1/packages?scope=current', (p) => get<ListEnvelope<PackageWire>>(p)),
      listAll<WorkingHourWire>('/v1/working-hours', (p) => get<ListEnvelope<WorkingHourWire>>(p)),
    ]);

    const clientById = new Map((clients ?? []).map((c) => [c.id, c]));
    const programById = new Map((programs ?? []).map((p) => [p.id, p]));

    /*
     * The newest package per client answers three questions at once — the rate a
     * gap is priced at, the "6 of 12 left" on the panel, and whether booking one
     * more would run the pack out. The NEWEST regardless of status, which is
     * `lib/today/api.ts`'s rule and its reason: a client whose pack ran out
     * yesterday still has an agreed price, and that price is what an hour with
     * them is worth.
     */
    const newest = new Map<string, PackageWire>();
    for (const p of packages ?? []) {
      const seen = newest.get(p.clientId);
      if (!seen || p.createdAt > seen.createdAt) newest.set(p.clientId, p);
    }

    const perSession = new Map<string, number>();
    for (const [clientId, p] of newest) {
      const amount = num(p.amount);
      const count = p.type === 'single' ? 1 : (p.sessionsTotal ?? 0);
      // A monthly fee has no session count to divide by and yields nothing, which
      // is correct rather than a gap: a month's fee is not attributable to one
      // hour of it. `lib/setup/money.ts` divides the same way.
      if (amount > 0 && count > 0) perSession.set(clientId, Math.round(amount / count));
    }

    return {
      view,
      anchor,
      from,
      to,
      sessions: (sessions ?? []).map((s) =>
        toSession(s, clientById.get(s.clientId), programById.get(s.programId ?? ''), now),
      ),
      clients: bookableClients(clients ?? [], programs ?? [], newest),
      hours: (hours ?? []).map((h) => ({
        weekday: h.weekday,
        startMinute: h.startMinute,
        endMinute: h.endMinute,
      })),
      rates: { perSession, gymSharePercent: trainer?.gymSharePercent ?? null },
      trainer: {
        name: trainer?.name ?? '',
        phone: trainer?.phone ?? null,
        gymName: trainer?.gymName ?? null,
        gymSharePercent: trainer?.gymSharePercent ?? null,
        setupComplete: Boolean(trainer?.setupComplete),
      },
      now,
    };
  },
);
