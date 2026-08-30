import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';
import { DAY_MS, startOfDay } from '@/lib/today/time';
import {
  buildClientReport,
  type ClientReport,
  type ReportMetricRow,
  type ReportSetRow,
  type ReportWeeks,
} from './build';

/**
 * WHAT ONE CLIENT'S PROGRESS REPORT COSTS.
 *
 * Six requests, five of them parallel and the sixth derived from one of the
 * five. This is a screen a trainer opens deliberately, one client at a time, and
 * it is the one place on this half where paying for the whole history is right:
 * a personal best is a claim about everything a client has ever lifted, and the
 * one thing this card must never do is hand somebody a "record" they beat two
 * years ago.
 *
 * | Request | For |
 * | --- | --- |
 * | `GET /v1/clients/{id}` | name, phone, and the day they joined |
 * | `GET /v1/trainers/me` | who the card is signed by |
 * | `GET /v1/sessions?clientId&from&to` | adherence, and what was booked |
 * | `GET /v1/workouts?clientId` | sessions that were logged without a booking |
 * | `GET /v1/workouts/sets?clientId` | every set, ever — the strength half |
 * | `GET /v1/clients/{id}/body-metrics` | weight and measurements |
 * | `GET /v1/exercises?ids=` | names for the movements that moved |
 *
 * `GET /v1/workouts/sets?clientId=` is the request this screen would be
 * unaffordable without: `API.md` describes it as turning ~150 per-session reads
 * into one, and it is deliberately unbounded there for exactly the reason it is
 * used here — *"a window is what produced the wrong answer"*.
 *
 * ── THREE OF THE SIX SWALLOW THEIR OWN FAILURES ─────────────────────────────
 *
 * Sets, metrics and exercise names each fall back to empty. A backend that has
 * not shipped the bulk set route, or a client with no measurements, should cost
 * the trainer that BLOCK of the card and not the card — `buildClientReport`
 * draws only the blocks it has data for, so a report with sessions and weight
 * and no lifts is a complete report, not a broken one.
 *
 * The client, the trainer and the sessions do not swallow anything: a report
 * that cannot name who it is about, or cannot say how many sessions were done,
 * is not a report.
 */

const BASE = process.env.XREP_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 12_000;

export class ClientReportApiError extends Error {
  constructor(readonly status: number | null) {
    super(`xrep api ${status ?? 'unreachable'}`);
    this.name = 'ClientReportApiError';
  }
}

async function get<T>(path: string): Promise<T> {
  const token = await getToken();
  if (!token) throw new ClientReportApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ClientReportApiError(null);
  }
  if (!res.ok) throw new ClientReportApiError(res.status);

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/* ------------------------------------------------------------- wire shapes */

interface ClientWire {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  createdAt: number;
}

interface TrainerWire {
  name: string;
  gymName: string | null;
}

interface SessionWire {
  scheduledAt: number;
  status: string;
}

interface WorkoutWire {
  id: string;
  clientId: string;
  sessionDate: string;
}

interface SetWire {
  exerciseId: string;
  loadKg: number | null;
  reps: number | null;
  /** ISO `yyyy-MM-dd` — the owning log's date, appended to both set routes. */
  sessionDate: string | null;
}

interface MetricWire {
  metricType: string;
  value: number | string;
  unit: string | null;
  recordedAt: number;
}

/** Local, never `Date.parse` — a bare ISO date parses as UTC and would move a
 *  session across a day boundary west of it. Same rule as `report-api.ts`. */
function isoDayToMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/* --------------------------------------------------------------- the fetch */

export const getClientReport = cache(
  async (clientId: string, weeks: ReportWeeks): Promise<ClientReport | null> => {
    const now = Date.now();
    const from = startOfDay(now - weeks * 7 * DAY_MS);

    const [client, trainer, sessions, workouts, sets, metrics] = await Promise.all([
      get<ClientWire>(`/v1/clients/${clientId}`),
      get<TrainerWire>('/v1/trainers/me'),
      get<SessionWire[]>(`/v1/sessions?clientId=${clientId}&from=${from}&to=${now}`),
      get<WorkoutWire[]>(`/v1/workouts?clientId=${clientId}`).catch(() => [] as WorkoutWire[]),
      get<SetWire[]>(`/v1/workouts/sets?clientId=${clientId}`).catch(() => [] as SetWire[]),
      get<MetricWire[]>(`/v1/clients/${clientId}/body-metrics`).catch(() => [] as MetricWire[]),
    ]);

    if (!client) return null;

    const setRows: ReportSetRow[] = (sets ?? [])
      .filter((s) => s.sessionDate !== null)
      .map((s) => ({
        exerciseId: s.exerciseId,
        loadKg: num(s.loadKg),
        reps: num(s.reps),
        at: isoDayToMs(s.sessionDate!),
      }));

    /* Names for the movements INSIDE the window only. Every set ever logged is
       what the record test needs; the names are only ever printed for the lifts
       that moved, and `?ids=` is capped at 600 by the route — a cap a window of
       one client's training cannot plausibly reach, sliced anyway rather than
       trading a `400` for the whole card. */
    const windowIds = [...new Set(setRows.filter((s) => s.at >= from).map((s) => s.exerciseId))]
      .slice(0, 600);

    const exerciseNames = new Map<string, string>();
    if (windowIds.length > 0) {
      const page = await get<{ exercises: Array<{ id: string; name: string }> }>(
        `/v1/exercises?ids=${windowIds.join(',')}`,
      ).catch(() => null);
      for (const e of page?.exercises ?? []) exerciseNames.set(e.id, e.name);
    }

    const metricRows: ReportMetricRow[] = (metrics ?? []).map((m) => ({
      metricType: m.metricType,
      value: num(m.value) ?? 0,
      unit: m.unit ?? '',
      recordedAt: m.recordedAt,
    }));

    return buildClientReport(
      {
        clientId: client.id,
        clientName: client.name,
        clientPhone: client.phone,
        clientSince: client.createdAt,
        trainerName: trainer?.name ?? '',
        gymName: trainer?.gymName ?? null,
        sessions: (sessions ?? []).map((s) => ({
          scheduledAt: s.scheduledAt,
          status: s.status,
        })),
        workouts: (workouts ?? []).map((w) => isoDayToMs(w.sessionDate)),
        sets: setRows,
        metrics: metricRows,
        exerciseNames,
        now,
      },
      weeks,
    );
  },
);
