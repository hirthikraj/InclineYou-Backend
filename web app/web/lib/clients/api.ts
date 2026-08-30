import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';

export class ClientsApiError extends Error {
  constructor(readonly status: number | null) {
    super(`xrep api ${status ?? 'unreachable'}`);
    this.name = 'ClientsApiError';
  }
}

const BASE = process.env.XREP_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

async function get<T>(path: string): Promise<T> {
  const token = await getToken();
  if (!token) throw new ClientsApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ClientsApiError(null);
  }
  if (!res.ok) throw new ClientsApiError(res.status);

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/**
 * Spring serialises `NUMERIC` as a JSON number, but Jackson can hand back a
 * string for a `BigDecimal` — coerce once here.
 */
export function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* -------------------------------------------------------- wire shapes ── */

interface TrainerWire {
  name: string;
  phone: string | null;
  setupComplete: boolean;
}

export interface ClientWire {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  /**
   * V18's `membership_status` — 'accepted' | 'invited' | 'declined' | 'removed'
   * | 'unavailable'. The state of the INVITATION, where `status` above is the
   * state of the coaching; the two are separate because they answer to two
   * people who can disagree.
   *
   * On `ClientResponse` since the REST pass of 28 Aug 2026. Nullable on the type
   * only because a response from an older backend will not carry it — the column
   * itself is NOT NULL and defaults to 'accepted'.
   */
  membershipStatus: string | null;
  deliveryMode: string | null;
  metadata: Record<string, unknown> | null;
  weeklySchedule: Array<{ templateDay: number; weekday: number; time: string }> | null;
  createdAt: number;
  updatedAt: number;
}

export interface PackageWire {
  id: string;
  clientId: string;
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  status: string;
  /**
   * ISO `yyyy-MM-dd`, nullable — a pack sold with no expiry, which is most of
   * them. On `PackageResponse` since V1; this screen counted a pack in SESSIONS
   * and never read the date, so a monthly pack with fourteen left and four days
   * to run carried no tag. Read, not added: no backend change.
   */
  endDate: string | null;
  /**
   * V30 · set while the pack's clock is stopped, null while it is running.
   *
   * READ HERE FOR ONE REASON: a paused pack must not raise an attention row.
   * Its `endDate` is frozen — that is what a pause IS — but the days-left
   * arithmetic is `endDate` against TODAY, and today keeps moving. So a client
   * three weeks in Kerala would slide from "expires in 9 days" to "expires
   * today" and then sit there nagging every morning about a pack whose expiry
   * is not actually running, on behalf of somebody who cannot train anyway.
   */
  pausedAt: number | null;
}

export interface PaymentWire {
  id: string;
  clientId: string;
  amount: number | string | null;
  status: string;
  createdAt: number;
}

export interface WorkoutWire {
  id: string;
  clientId: string;
  createdAt: number;
}

export interface ProgramWire {
  id: string;
  clientId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
}

export interface SessionWire {
  id: string;
  clientId: string;
  scheduledAt: number;
  status: string;
}

/* ----------------------------------------------------------- output ── */

export interface RosterData {
  clients: ClientWire[];
  packages: PackageWire[];
  payments: PaymentWire[];
  workouts: WorkoutWire[];
  programs: ProgramWire[];
  sessions: SessionWire[];
  setupComplete: boolean;
  trainerName: string;
  trainerPhone: string | null;
}

/**
 * Everything the roster needs, in six parallel requests.
 *
 * Sessions are windowed: 8 weeks back to 4 weeks ahead — enough for batch
 * detection (which batch a client trains in, from where their sessions sit)
 * without pulling the full history.
 *
 * Payments and workouts are deliberately unwindowed: an unpaid invoice from
 * two months ago is still owed today, and the last-logged date for "gone quiet"
 * needs the whole history. Both stay small: one row per invoice and one per
 * delivered session.
 */
export const getRosterData = cache(async (): Promise<RosterData> => {
  const now = Date.now();
  const eightWeeksAgo = now - 8 * 7 * 24 * 60 * 60 * 1000;
  const fourWeeksAhead = now + 4 * 7 * 24 * 60 * 60 * 1000;

  const [trainer, clients, packages, payments, workouts, programs, sessions] = await Promise.all([
    get<TrainerWire>('/v1/trainers/me'),
    get<ClientWire[]>('/v1/clients'),
    get<PackageWire[]>('/v1/packages'),
    get<PaymentWire[]>('/v1/payments'),
    get<WorkoutWire[]>('/v1/workouts'),
    get<ProgramWire[]>('/v1/programs'),
    get<SessionWire[]>(`/v1/sessions?from=${eightWeeksAgo}&to=${fourWeeksAhead}`),
  ]);

  return {
    clients: clients ?? [],
    packages: packages ?? [],
    payments: payments ?? [],
    workouts: workouts ?? [],
    programs: programs ?? [],
    sessions: sessions ?? [],
    setupComplete: trainer.setupComplete,
    trainerName: trainer.name,
    trainerPhone: trainer.phone,
  };
});
