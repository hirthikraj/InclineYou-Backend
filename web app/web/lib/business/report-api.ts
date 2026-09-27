import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';
import type { ReportClient, ReportSession, ReportWorkout } from './report';
import { REPORT_MONTHS } from './report';
import { listAll, type ListEnvelope } from '@/lib/http/client';

/**
 * WHAT THE REPORTS TAB ASKS THE SERVER FOR, AND WHAT IT DELIBERATELY DOES NOT.
 *
 * Three requests, and they are the three `getMoney()` cannot answer:
 *
 * - **`GET /v1/clients`** — the full roster wire, for `createdAt` and
 *   `membershipStatus`. `MoneyData.clients` carries `{id, name, status}` and
 *   nothing else, which is right for a ledger and cannot say when a client
 *   joined. Acquisition is the whole of one chart.
 * - **`GET /v1/sessions?from&to`** — thirteen months of the diary, for
 *   attendance and for sessions delivered per month.
 * - **`GET /v1/workouts`** — unwindowed, because the route has no window. See
 *   below.
 *
 * Payments and packages are **not** fetched here: the page already holds them
 * from `requireMoney()`, and asking twice for a couple of hundred rows to draw
 * one more chart from them is the mistake `GET /v1/packages` was added to fix.
 *
 * ── THE COST, STATED ────────────────────────────────────────────────────────
 *
 * A year of sessions is the largest read on this half after the exercise
 * library — a busy trainer at twenty a week is ~1,000 rows. That is the price of
 * the screen and it is worth paying **because this tab is opened at a month end,
 * not every morning.** `/today` is the screen that cannot afford a read like
 * this, which is why it windows its own sessions to thirty days.
 *
 * Thirteen months rather than twelve: the oldest bar must be a WHOLE month, and
 * a window that starts twelve months back to the day starts partway through it.
 *
 * `GET /v1/workouts` is unwindowed for the reason `lib/today/api.ts` gives for
 * its own copy of this call — the route takes no `from`/`to` at all. It is one
 * row per session rather than one per set, so a year of coaching is hundreds of
 * rows, not thousands.
 *
 * ── AND WHY A LOG IS FETCHED AT ALL ─────────────────────────────────────────
 *
 * A delivered session is a marked booking **or** a workout log, which is the
 * roster's own rule for *Last attended*. Counting only bookings would show a
 * trainer who logs without booking an empty year. `buildPracticeReport` folds
 * the two on `(client, day)` so nothing is counted twice.
 */

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 12_000;

export class ReportApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'ReportApiError';
  }
}

async function get<T>(path: string): Promise<T> {
  const token = await getToken();
  if (!token) throw new ReportApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ReportApiError(null);
  }
  if (!res.ok) throw new ReportApiError(res.status);

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/* ------------------------------------------------------------- wire shapes */

interface ClientWire {
  id: string;
  name: string;
  status: string;
  membershipStatus?: string | null;
  createdAt: number;
}

interface SessionWire {
  id: string;
  clientId: string;
  scheduledAt: number;
  status: string;
}

interface WorkoutWire {
  id: string;
  clientId: string;
  /** ISO `yyyy-MM-dd`. A session's date is the day it was TRAINED, never the
   *  day it was typed up — the same rule `GET /v1/workouts/sets` states. */
  sessionDate: string;
  createdAt: number;
}

/* ------------------------------------------------------------------ output */

export interface ReportsData {
  clients: ReportClient[];
  sessions: ReportSession[];
  workouts: ReportWorkout[];
  now: number;
}

/**
 * `2026-08-14` → the local start of that day in epoch ms.
 *
 * Deliberately NOT `Date.parse`, which reads a bare ISO date as **UTC** — that
 * lands an Indian session at 05:30 the same morning, which is harmless, and a
 * session on the 1st of a month at 05:30 IST on the 1st, which is also harmless
 * — until a trainer west of UTC reads their August as starting on 31 July.
 * The month buckets on this screen are local months, so the parse is local too.
 */
function isoDayToMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}

/**
 * Three parallel reads. `cache()` so a page and its metadata pay once, which is
 * the same per-request memo `lib/money/api.ts` and `lib/today/api.ts` use.
 */
export const getReportsData = cache(async (): Promise<ReportsData> => {
  const now = Date.now();

  /* The first day of the month, REPORT_MONTHS ago — so the oldest bar is whole. */
  const anchor = new Date(now);
  const from = new Date(anchor.getFullYear(), anchor.getMonth() - (REPORT_MONTHS - 1), 1).getTime();

  const [clients, sessions, workouts] = await Promise.all([
    get<ClientWire[]>('/v1/clients?view=legacy'),
    listAll<SessionWire>(`/v1/sessions?from=${from}&to=${now}`, (p) => get<ListEnvelope<SessionWire>>(p)),
    /* A backend without this route should cost the trainer the delivery bars,
       not the whole screen — every other figure here stands without it. */
    get<WorkoutWire[]>('/v1/workouts').catch(() => [] as WorkoutWire[]),
  ]);

  return {
    clients: (clients ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      membershipStatus: c.membershipStatus ?? null,
      createdAt: c.createdAt,
    })),
    sessions: (sessions ?? []).map((s) => ({
      id: s.id,
      clientId: s.clientId,
      scheduledAt: s.scheduledAt,
      status: s.status,
    })),
    workouts: (workouts ?? []).map((w) => ({
      id: w.id,
      clientId: w.clientId,
      at: isoDayToMs(w.sessionDate),
    })),
    now,
  };
});
