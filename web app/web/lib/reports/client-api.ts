import 'server-only';

import { cache } from 'react';

import { api, ApiError } from '@/lib/http/client';
import {
  ClientDetailApiError,
  clientReadings,
  clientSessions,
  dayIso,
  getClientHeader,
} from '@/lib/clients/client-api';
import { fetchSetHistory } from '@/lib/log/set-history';
import { LogApiError } from '@/lib/log/api';
import { DAY_MS, startOfDay } from '@/lib/today/time';
import {
  buildClientReport,
  type ClientReport,
  type ReportSetRow,
  type ReportWeeks,
} from './build';

/**
 * WHAT ONE CLIENT'S PROGRESS REPORT COSTS — api-contract 1.1 Client file, *Report*.
 *
 * | Request | For |
 * | --- | --- |
 * | the file's header (`GET /v1/clients/{id}`) | name, phone, the day they joined |
 * | `GET /v1/me` | who the card is signed by |
 * | `GET /v1/sessions?clientId&from&to` | adherence |
 * | `GET /v1/clients/{id}/set-history` | every set, ever — the strength half |
 * | `GET /v1/clients/{id}/readings` | weight and measurements |
 *
 * Set-history is read WHOLE, not from the window: a personal best is a claim
 * about everything a client has ever lifted, and this card must never hand
 * somebody a "record" they beat two years ago. It names its own exercises, so
 * there is no library read.
 *
 * Readings fall back to empty (a client with no assessments is a card with no
 * body block); the client, the trainer, the sessions and the sets do not — a
 * report that cannot say who it is about or what was done is not a report.
 */

export class ClientReportApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'ClientReportApiError';
  }
}

interface MeWire {
  name: string | null;
  gymName: string | null;
}

/** Local, never `Date.parse` — a bare ISO date parses as UTC and would move a
 *  session across a day boundary west of it. */
function isoDayToMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}

/** Every module's error, as this one's, so the guard can map a 404 to not found. */
async function mapped<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ClientDetailApiError || e instanceof LogApiError || e instanceof ApiError) {
      throw new ClientReportApiError(e.status);
    }
    throw e;
  }
}

export const getClientReport = cache(
  async (clientId: string, weeks: ReportWeeks): Promise<ClientReport | null> => {
    const now = Date.now();
    const from = startOfDay(now - weeks * 7 * DAY_MS);

    const [{ client }, me, sessions, history, readings] = await Promise.all([
      mapped(getClientHeader(clientId)),
      mapped(api<MeWire>('/v1/me')),
      mapped(clientSessions(clientId, dayIso(from), dayIso(now + DAY_MS))),
      mapped(fetchSetHistory(clientId)),
      clientReadings(clientId),
    ]);

    const sets: ReportSetRow[] = history.items.map((s) => ({
      exerciseId: s.exerciseId,
      loadKg: s.loadKind === 'weight' ? s.loadValue : null,
      reps: s.effortKind === 'reps' ? s.effortValue : null,
      at: isoDayToMs(s.date),
    }));

    return buildClientReport(
      {
        clientId: client.id,
        clientName: client.name,
        clientPhone: client.phone,
        clientSince: client.createdAt,
        trainerName: me?.name ?? '',
        gymName: me?.gymName ?? null,
        sessions: sessions.map((s) => ({ scheduledAt: s.scheduledAt, status: s.status })),
        // In v1 the log sits on the session: a training day is a day with a set done.
        workouts: [...new Set(history.items.map((s) => s.date))].map(isoDayToMs),
        sets,
        metrics: readings.map((r) => ({ metricType: r.key, value: r.value, unit: r.unit, recordedAt: r.at })),
        exerciseNames: new Map(Object.entries(history.exercises).map(([id, e]) => [id, e.name])),
        now,
      },
      weeks,
    );
  },
);
