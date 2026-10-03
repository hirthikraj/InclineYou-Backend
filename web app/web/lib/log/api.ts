import 'server-only';
import { ClientDetailApiError, clientReadings, dayIso, getClientHeader } from '@/lib/clients/client-api';
import { fetchSetHistory, toLogInput } from './set-history';

import { cache } from 'react';

import {
  buildHistory, buildProgress, PLATE_STEP_KG,
  type FinishView, type HistorySession, type HistoryView, type LogInput,
  type LogView, type ProgressRange, type ProgressView,
} from './log';

export class LogApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'LogApiError';
  }
}

/* ────────────────────────────────────────────────────────── wire shapes ── */

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
  notes: string | null;
}

/* ──────────────────────────────────────────── the client's whole history ── */

/* ──────────────────────────────────────────────────────────── the console ── */

export interface ConsoleData {
  /** What the URL said, which is what every link back has to keep saying. */
  routeId: string;
  view: LogView;
  /** The booking behind the log, when there is one. */
  session: SessionWire | null;
  /** Everything the add panel offers, already ranked. */
  library: { id: string; name: string; muscleGroup: string | null; isCustom: boolean }[];
  /** exerciseId → "last: 45 kg × 10 · 3 Aug", for the recents list. */
  recents: { exerciseId: string; name: string; meta: string; isCustom: boolean }[];
  /** Frame 3b's third scope: how many clients are on this program's template. */
  templateReach: number | null;
  /** Frame 3b's second scope: how much of the plan is left to change. */
  programWeeksLeft: number | null;
  /**
   * The fourth figure in the strip, and the one it is hardest to remember to
   * show: **the pack, unchanged.** Status about something that did NOT happen.
   * Finishing the log does not move it — a pack moves on done or no-show, never
   * on booked — so the console prints what it is now and frame 5b prints what
   * marking it done will do to it.
   */
  pack: { remaining: number; total: number } | null;
  /** Frame 6b's offer: the last whole session they did, as a place to go. */
  repeatHref: string | null;
  templateId: string | null;
  programId: string | null;
  /**
   * exerciseId → the last few sessions on it, judged at the time.
   *
   * The right column of frame 1a, and the half a 390px phone cannot do: **the
   * reason to look at history is to decide today's load, so it sits beside the
   * entry.** Built with `buildHistory`, which walks forward and judges each
   * session against everything before it — so the line that reads *record,
   * quietly* is the same computation the console's own badge is, and the two
   * cannot disagree.
   */
  timelines: Record<string, HistorySession[]>;
  now: number;
}

/* ───────────────────────────────────────────── 5b · the finish, and the pack ── */

/**
 * Frame 5b's data. The READ moved to `lib/sessionlog/api.ts` (`getFinishData`, from the
 * session's own log); this shape stays because that read answers in it, plus the
 * new log's extras (`FinishDataX`).
 */
export interface FinishData {
  routeId: string;
  view: LogView;
  finish: FinishView;
  session: SessionWire | null;
  now: number;
}

/** An empty `LogInput`, for the reads that fill in only the part they need (the lift's history, Progress). */
const EMPTY: LogInput = {
  workouts: [], logExercises: [], sets: [], exercises: [], clients: [], sessions: [],
  programs: [], plateStepKg: PLATE_STEP_KG,
};

/* ───────────────────────────────────── 4a · one exercise, every session ── */

/**
 * Set-history narrowed to one movement: this page is about one lift, and asking
 * for one is what makes "every session" affordable enough to mean it — the walk
 * reaches the client's real first session, so the `first` tag lands on it.
 */
export const getExerciseHistory = cache(
  async (clientId: string, exerciseId: string): Promise<HistoryView | null> => {
    const [{ client }, history] = await Promise.all([
      header(clientId),
      fetchSetHistory(clientId, { exerciseId }),
    ]);
    return buildHistory(
      { ...EMPTY, ...toLogInput(clientId, history), clients: [{ id: client.id, name: client.name }] },
      clientId,
      exerciseId,
      Date.now(),
    );
  },
);

/* ──────────────────────────────────────────────────────────── 4b · progress ── */

const RANGE_FROM_DAYS: Record<ProgressRange, number | null> = { '8w': 56, '6m': 183, all: null };

/**
 * Progress on two reads beside the header: set-history from the range's start
 * (nothing for all time) and the readings, whose weight is the bodyweight line.
 */
export const getProgress = cache(
  async (clientId: string, range: ProgressRange, focus: string | null): Promise<ProgressView | null> => {
    const now = Date.now();
    const days = RANGE_FROM_DAYS[range];
    const [{ client }, history, readings] = await Promise.all([
      header(clientId),
      fetchSetHistory(clientId, days == null ? {} : { from: dayIso(now - days * 86_400_000) }),
      clientReadings(clientId),
    ]);

    const weights = readings.filter((r) => r.key === 'weight');
    const latest = weights[weights.length - 1];
    const earlier = weights.find((r) => r.at >= now - (days ?? 3650) * 86_400_000);

    return buildProgress(
      { ...EMPTY, ...toLogInput(clientId, history), clients: [{ id: client.id, name: client.name }] },
      clientId,
      range,
      now,
      focus,
      latest ? { value: latest.value, earlier: earlier && earlier !== latest ? earlier.value : null } : null,
    );
  },
);

/** The file's header read, re-thrown as this module's error so `guard` maps a 404 to not found. */
async function header(clientId: string) {
  try {
    return await getClientHeader(clientId);
  } catch (e) {
    if (e instanceof ClientDetailApiError) throw new LogApiError(e.status);
    throw e;
  }
}

/* ──────────────────────────────────── starting a log, which is not marking done ── */
