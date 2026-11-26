import 'server-only';

import { cache } from 'react';

import { api, ApiError } from '@/lib/http/client';
import {
  ClientDetailApiError,
  clientSessions,
  dayIso,
  getClientHeader,
} from '@/lib/clients/client-api';
import { fetchSetHistory, KG_KINDS, REP_KINDS, TIME_KINDS } from '@/lib/log/set-history';
import { getAssessment, getClientAssessments } from '@/lib/assessments/api';
import type { AssessmentDetailWire } from '@/lib/assessments/detail';
import { HEALTH_MEASUREMENT_KEYS } from '@/lib/assessments/vocab';
import { LogApiError } from '@/lib/log/api';
import { DAY_MS, startOfDay } from '@/lib/today/time';
import {
  buildClientReport,
  type ClientReport,
  type ReportMetricRow,
  type ReportRatingRow,
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
 *
 * Set-history is read WHOLE, not from the window: a personal best is a claim
 * about everything a client has ever lifted, and this card must never hand
 * somebody a "record" they beat two years ago. It names its own exercises, so
 * there is no library read.
 *
 * | `GET /v1/assessments?clientId` + each returned one's detail | the body, fitness tests, self-ratings |
 *
 * THE BODY COMES FROM ASSESSMENTS (26 Nov 2026). A body is measured in an assessment
 * and nowhere else, and there is no measurement history read — so the report reads
 * the returned assessments themselves: the window's, plus the last one before it (the
 * baseline). Each detail carries every reading of its own measurements across the
 * client's history, so their union is the whole record. Health keys (`visceral`,
 * `resting_hr`, `bp`) are dropped here and never reach the builder: this report is
 * the one screen built to leave the building.
 *
 * That half is OPTIONAL. A failed assessment read leaves the body blank rather than
 * failing the report — the sessions and the sets are still true. The client, the
 * trainer, the sessions and the sets are required.
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

/** At most this many returned assessments are read in detail — a weekly check-in
 *  over 24 weeks is 24 requests, and the newest ones carry the whole history anyway. */
const DETAIL_CAP = 12;

async function assessmentHalf(
  clientId: string,
  from: number,
): Promise<{ metrics: ReportMetricRow[]; ratings: ReportRatingRow[] }> {
  try {
    const done = (await getClientAssessments(clientId))
      .filter((a) => a.state === 'done' && a.completedAt !== null)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    const inside = done.filter((a) => (a.completedAt ?? 0) >= from);
    const baseline = done.find((a) => (a.completedAt ?? 0) < from);
    const picked = [...inside.slice(0, DETAIL_CAP - 1), ...(baseline ? [baseline] : [])];
    if (picked.length === 0) return { metrics: [], ratings: [] };

    const details = (
      await Promise.all(picked.map((a) => getAssessment(a.id).catch(() => null)))
    ).filter((d): d is AssessmentDetailWire => d !== null);

    /* One reading per (measurement, assessment): every detail repeats the history. */
    const metrics = new Map<string, ReportMetricRow>();
    const ratings: ReportRatingRow[] = [];
    for (const d of details) {
      const meta = new Map(
        [...d.asked.measurements, ...d.readings].map((m) => [m.key, m] as const),
      );
      for (const h of d.history) {
        if (HEALTH_MEASUREMENT_KEYS.has(h.key)) continue;
        const m = meta.get(h.key);
        for (const p of h.points) {
          metrics.set(`${h.key}·${p.assessmentId}`, {
            metricType: h.key,
            value: p.value,
            unit: m?.unit ?? '',
            recordedAt: p.at,
            label: m?.label,
            group: m?.group,
          });
        }
      }
      for (const a of d.answers) {
        if (a.kind !== 'rating' || a.rating == null || d.completedAt === null) continue;
        ratings.push({
          questionId: a.questionId,
          text: a.text,
          scale: a.scale ?? 10,
          value: a.rating,
          at: d.completedAt,
        });
      }
    }
    return { metrics: [...metrics.values()], ratings };
  } catch {
    return { metrics: [], ratings: [] };
  }
}

export const getClientReport = cache(
  async (clientId: string, weeks: ReportWeeks): Promise<ClientReport | null> => {
    const now = Date.now();
    const from = startOfDay(now - weeks * 7 * DAY_MS);

    const [{ client }, me, sessions, history, assessed] = await Promise.all([
      mapped(getClientHeader(clientId)),
      mapped(api<MeWire>('/v1/me')),
      mapped(clientSessions(clientId, dayIso(from), dayIso(now + DAY_MS))),
      mapped(fetchSetHistory(clientId)),
      assessmentHalf(clientId, from),
    ]);

    const sets: ReportSetRow[] = history.items.map((s) => ({
      exerciseId: s.exerciseId,
      loadKg: KG_KINDS.has(s.loadKind) ? s.loadValue : null,
      reps: REP_KINDS.has(s.effortKind) ? s.effortValue : null,
      seconds: TIME_KINDS.has(s.effortKind) ? s.effortValue : null,
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
        metrics: assessed.metrics,
        ratings: assessed.ratings,
        exerciseNames: new Map(Object.entries(history.exercises).map(([id, e]) => [id, e.name])),
        now,
      },
      weeks,
    );
  },
);
