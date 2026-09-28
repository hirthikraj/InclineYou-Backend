import 'server-only';

import { cache } from 'react';

import { api, ApiError, listAll, type ListEnvelope } from '@/lib/http/client';

/**
 * The roster's reads on the v1.1 wire — api-contract *Clients · Roster load*.
 *
 * Four, in parallel (the page adds L9, the nudges). The pre-v1 screen made seven,
 * two of them unbounded (every payment, every workout log) and one a 12-week
 * session window that was only there to guess each client's batch and missed
 * streak. The batch now comes from the client's weekly slots and the streak and
 * last-attended from `stats`, both on the summary row; what is owed is
 * `amountDue` on the package.
 */
export class ClientsApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'ClientsApiError';
  }
}

async function get<T>(path: string): Promise<T> {
  try {
    return await api<T>(path);
  } catch (error) {
    if (error instanceof ApiError) throw new ClientsApiError(error.status);
    throw error;
  }
}

/** Money arrives as a decimal string; coerce once, here. */
export function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* -------------------------------------------------------- wire shapes ── */

/** L1 · `MeService.MeResponse`, the fields the roster and the add flow read. */
export interface MeWire {
  id: string;
  name: string | null;
  phone: string | null;
  setupCompletedAt: number | null;
  gymName: string | null;
}

/** L3 · `ClientSummaryService.ClientSummary`. */
export interface ClientWire {
  id: string;
  name: string | null;
  phone: string | null;
  status: string;
  pausedAt: number | null;
  pausedUntil: string | null;
  archivedAt: number | null;
  archiveReason: string | null;
  archiveNote: string | null;
  membershipStatus: string;
  clientType: string;
  hasPinnedNote: boolean;
  schedule: { sessionsPerWeek: number | null; sessionDurationMinutes: number | null; deliveryMode: string | null; version: string };
  slots: { id: string; weekday: number; start: string; programDay: number | null; durationMinutes: number | null; deliveryMode: string | null }[];
  program: { id: string; name: string; weeks: number; days: number; startDate: string | null; endDate: string | null } | null;
  stats: { sessionsDone: number; lastDoneAt: number | null; nextSessionAt: number | null; missedStreak: number };
  createdAt: number;
  version: string;
}

/** L5 · `PackageReadService.CurrentPackage`, the fields the roster reads. Money is a decimal string. */
export interface PackageWire {
  id: string;
  clientId: string;
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  status: string;
  endDate: string | null;
  dueDate: string | null;
  /** Set while the pack's clock is stopped: a paused pack raises no band. */
  pausedAt: number | null;
  amountDue: string;
  createdAt: number;
}

/* ----------------------------------------------------------- output ── */

export interface RosterData {
  /** Every client, archived included (`status=all`) — the archived list reads them. */
  clients: ClientWire[];
  packages: PackageWire[];
  setupComplete: boolean;
  trainerName: string;
  trainerPhone: string | null;
}

/*
 * L1 and L3, cached per request and shared with the add-client drawer
 * (`new-api.ts`), which the contract says reuses them: /clients renders both,
 * and without the shared read each fetched its own copy.
 */
export const getMe = cache(() => get<MeWire>('/v1/me'));
export const getClients = cache(async () =>
  (await get<ListEnvelope<ClientWire>>('/v1/clients?status=all'))?.items ?? []);

export const getRosterData = cache(async (): Promise<RosterData> => {
  const [me, clients, packages] = await Promise.all([
    getMe(),
    getClients(),
    listAll<PackageWire>('/v1/packages?scope=current', (p) => get<ListEnvelope<PackageWire>>(p)),
  ]);
  return {
    clients,
    packages: packages ?? [],
    setupComplete: me.setupCompletedAt !== null,
    trainerName: me.name ?? '',
    trainerPhone: me.phone,
  };
});
