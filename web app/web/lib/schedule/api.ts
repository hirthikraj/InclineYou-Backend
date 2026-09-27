import 'server-only';

import { cache } from 'react';

import type { RateSource, WorkWindow } from '@/lib/today/day';
import { DAY_MS } from '@/lib/today/time';
import { api, ApiError, listAll, type ListEnvelope } from '@/lib/http/client';
import { rangeFor, type ScheduleView } from './view';
import { bookableClients } from './roster';
import { inWindow, toSession, type ClientBrief, type SessionWire } from './rows';
import type { ScheduleClient, ScheduleSession } from './session';

/* The shapes live in `./session`, which carries no `server-only`, so the client
   components can import them without pulling this file's fetch layer with them.
   Re-exported here because this is where they are produced. */
export type { ScheduleClient, ScheduleSession };

/**
 * WHAT THE SCHEDULE ASKS THE SERVER FOR — FIVE READS, ALL OF THEM TODAY'S.
 *
 * api-contract *Schedule* (1.1): L1–L5 are the same requests Today makes, so a
 * response shape is defined once and the two screens cannot draw one session
 * two ways. `/v1/programs` folded into the client summary (each client carries
 * its active plan), and `/v1/trainers/me` became `/v1/me`.
 *
 *   · `/v1/me`                      — timezone, and the setup redirect.
 *   · `/v1/working-hours`           — the ground every block is drawn on.
 *   · `/v1/clients?view=summary`    — the booking picker, the client week, each
 *                                     client's usual length and mode and plan.
 *   · `/v1/sessions?from=&to=`      — every block, windowed by the view.
 *   · `/v1/packages?scope=current`  — "6 of 12 left" and the per-session rate.
 *
 * Only the diary is windowed, and by the view's own range (`rangeFor`), so the
 * thing drawn and the thing fetched cannot disagree. A view switch asks for the
 * diary alone (`loadWindow` in `./actions`, through `fetchWindow` below): the
 * other four don't change with the view, so they come only with the page. The window goes out as
 * DATES, which the server reads in the workspace's timezone (R8); since the
 * dates are picked on a Next server whose zone may not be the trainer's, each
 * end is widened by a day and the rows are trimmed back to the grid's instants.
 *
 * `startedAt` is on the session row in v1 (the log IS the session), so a block
 * can now say a session is running — the old schedule could not see
 * `workout_session` and drew `live` as always false.
 */

/**
 * Kept as this screen's error type so `guard.ts` can tell *unreachable* from
 * *refused*; every request goes through the shared `api()`, which adds the
 * token and `X-InclineYou-Client: web` (the private fetch this file used to
 * have sent neither header).
 */
export class ScheduleApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'ScheduleApiError';
  }
}

async function get<T>(path: string): Promise<T> {
  try {
    return await api<T>(path);
  } catch (error) {
    if (error instanceof ApiError) throw new ScheduleApiError(error.status);
    throw error;
  }
}

function items<T>(path: string): Promise<T[]> {
  return listAll<T>(path, (p) => get<ListEnvelope<T>>(p));
}

/* ------------------------------------------------------------ wire shapes ── */
/* Named after the Java records, so a change there is greppable from here. Every
 * field the screen does not read is left out on purpose. ------------------- */

/** L1 · `MeService.MeResponse`. */
interface MeWire {
  name: string | null;
  phone: string | null;
  setupCompletedAt: number | null;
  gymName: string | null;
}

/** L2 · `WorkingHoursService.WorkingHourResponse` — weekday 1 = Monday, times "HH:mm". */
interface WorkingHourWire {
  weekday: number;
  start: string;
  end: string;
}

/** L3 · `ClientSummaryService.ClientSummary`. */
interface ClientWire {
  id: string;
  name: string | null;
  status: string;
  membershipStatus: string;
  schedule: { sessionsPerWeek: number | null; sessionDurationMinutes: number | null; deliveryMode: string | null } | null;
  program: { id: string; name: string; weeks: number } | null;
}

/** L5 · `PackageReadService.CurrentPackage`. Money is a decimal string. */
interface PackageWire {
  clientId: string;
  basis: 'sessions' | 'period';
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  amount: string;
  trainerSharePercent: string | null;
  trainerShareAmount: string | null;
  createdAt: number;
}

/** Money arrives as a decimal string; `₹NaN` is not a price. */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** `"06:30"` → 390. */
function minuteOf(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** `yyyy-MM-dd` for a local-calendar instant on the Next server. */
function isoDate(at: number): string {
  const d = new Date(at);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/* ------------------------------------------------------------ the screen ── */

export interface ScheduleData {
  view: ScheduleView;
  anchor: number;
  from: number;
  to: number;
  sessions: ScheduleSession[];
  /**
   * Every client on L3, by id — what a session row needs to draw (name, usual
   * length and mode, plan). Held by the page so a view switch can map a new
   * window of L4 in the browser without asking for the roster again.
   */
  people: Record<string, ClientBrief>;
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
 * L4 for one view's window: the dates widened a day each side (the Next
 * server's zone may not be the trainer's, R8), then trimmed back to the grid's
 * own instants. The page's first render and the view-switch action both call it.
 */
export async function fetchWindow(view: ScheduleView, anchor: number): Promise<{ from: number; to: number; rows: SessionWire[] }> {
  const { from, to } = rangeFor(view, anchor);
  const rows = await items<SessionWire>(`/v1/sessions?from=${isoDate(from - DAY_MS)}&to=${isoDate(to + DAY_MS)}`);
  return { from, to, rows: inWindow(rows, from, to) };
}

/**
 * `cache()`, so the page and its metadata make one round of requests, not two.
 * A REQUEST cache — it does not survive the response.
 */
export const getSchedule = cache(
  async (view: ScheduleView, anchor: number): Promise<ScheduleData> => {
    const now = Date.now();

    const [me, hours, clients, diary, packages] = await Promise.all([
      get<MeWire>('/v1/me'),
      items<WorkingHourWire>('/v1/working-hours'),
      items<ClientWire>('/v1/clients?view=summary'),
      fetchWindow(view, anchor),
      items<PackageWire>('/v1/packages?scope=current'),
    ]);
    const { from, to } = diary;

    const people: Record<string, ClientBrief> = Object.fromEntries(clients.map((c) => [c.id, {
      name: c.name ?? '',
      minutes: c.schedule?.sessionDurationMinutes ?? null,
      mode: c.schedule?.deliveryMode ?? null,
      programId: c.program?.id ?? null,
      programName: c.program?.name ?? null,
      programWeeks: c.program?.weeks ?? null,
    }]));

    /*
     * The newest package per client answers three questions at once — the rate a
     * gap is priced at, the "6 of 12 left" on the panel, and whether booking one
     * more would run the pack out. Newest regardless of status: a client whose
     * pack ran out yesterday still has an agreed price. The trainer's share is
     * the package's own (R3), and a period pack has no per-session rate.
     */
    const newest = new Map<string, PackageWire>();
    for (const p of packages) {
      const seen = newest.get(p.clientId);
      if (!seen || p.createdAt > seen.createdAt) newest.set(p.clientId, p);
    }
    const perSession = new Map<string, number>();
    for (const [clientId, p] of newest) {
      const amount = num(p.amount);
      const count = p.basis === 'sessions' ? p.sessionsTotal ?? 0 : 0;
      if (amount > 0 && count > 0) {
        const rate = p.trainerSharePercent !== null
          ? (amount / count) * (num(p.trainerSharePercent) / 100)
          : p.trainerShareAmount !== null
            ? num(p.trainerShareAmount) / count
            : amount / count;
        perSession.set(clientId, Math.round(rate));
      }
    }

    const roster = clients.map((c) => ({
      id: c.id,
      name: c.name ?? '',
      status: c.status,
      membershipStatus: c.membershipStatus,
      deliveryMode: c.schedule?.deliveryMode ?? null,
      metadata: null,
      sessionDurationMinutes: c.schedule?.sessionDurationMinutes ?? null,
      sessionsPerWeek: c.schedule?.sessionsPerWeek ?? null,
    }));
    const programs = clients
      .filter((c) => c.program !== null)
      .map((c) => ({ id: c.program!.id, clientId: c.id, name: c.program!.name, status: 'active' }));
    const packs = new Map(
      [...newest].map(([clientId, p]) => [clientId, {
        sessionsTotal: p.sessionsTotal, sessionsRemaining: p.sessionsRemaining,
      }]),
    );

    return {
      view,
      anchor,
      from,
      to,
      sessions: diary.rows.map((s) => toSession(s, people[s.clientId], now)),
      people,
      clients: bookableClients(roster, programs, packs),
      // The wire's weekday is 1 = Monday; `WorkWindow` is 0 = Monday.
      hours: hours.map((h) => ({
        weekday: h.weekday - 1,
        startMinute: minuteOf(h.start),
        endMinute: minuteOf(h.end),
      })),
      rates: { perSession, gymSharePercent: null },
      trainer: {
        name: me?.name ?? '',
        phone: me?.phone ?? null,
        gymName: me?.gymName ?? null,
        gymSharePercent: null,
        setupComplete: me?.setupCompletedAt != null,
      },
      now,
    };
  },
);
