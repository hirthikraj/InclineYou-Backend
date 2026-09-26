import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';
import type { Pack, PackType } from '@/lib/setup/money';

export class NewClientApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'NewClientApiError';
  }
}

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

async function get<T>(path: string): Promise<T> {
  const token = await getToken();
  if (!token) throw new NewClientApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new NewClientApiError(null);
  }
  if (!res.ok) throw new NewClientApiError(res.status);

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/* -------------------------------------------------------- wire shapes ── */

interface TrainerWire {
  id: string;
  name: string;
  phone: string | null;
  workMode: string | null;
  gymName: string | null;
  gymSharePercent: number | null;
  setupComplete: boolean;
}

export interface WorkingHourWire {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface ClientScheduleWire {
  id: string;
  name: string;
  status: string;
  sessionDurationMinutes: number | null;
  weeklySchedule: Array<{ templateDay: number; weekday: number; time: string }> | null;
}

/**
 * A row of the `pack` table, as the server sends it.
 *
 * Deliberately the same coercion `lib/packs/api.ts` applies — `amount` arrives
 * as a string from a DECIMAL column on some builds, `owner` is absent on every
 * row written before V19 and an absent owner is the trainer's own, and an
 * unrecognised `type` degrades to the commonest kind rather than failing the
 * read. Two screens disagreeing about what a price list SAYS is the one bug a
 * price list cannot have.
 */
interface PackWire {
  id: string;
  name: string;
  type: string;
  sessions: number | null;
  amount: number | string | null;
  validityDays: number | null;
  status: string;
  owner: string | null;
  orderIndex: number | null;
}

export interface TemplateWire {
  id: string;
  name: string;
  goal: string | null;
  description: string | null;
  dayLabels: string[] | null;
}

/* ----------------------------------------------------------- output ── */

export interface NewClientData {
  trainer: {
    id: string;
    name: string;
    workMode: 'independent' | 'gym' | 'both' | null;
    gymName: string | null;
    gymSharePercent: number | null;
  };
  workingHours: WorkingHourWire[];
  clients: ClientScheduleWire[];
  /**
   * The ACTIVE price list, both owners on one array — step 2 asks whose packs
   * this client buys from and then draws them, so the flow needs the lists in
   * the browser rather than a link to the screen that holds them.
   *
   * Retired packs are filtered out here: *Packages* shows them because
   * restoring one is a decision made there, and nobody sells from a retired
   * pack, so a client being added should never see one.
   */
  packs: Pack[];
  templates: TemplateWire[];
  setupComplete: boolean;
  trainerName: string;
  trainerPhone: string | null;
}

function asPackType(value: string): PackType {
  return value === 'monthly' || value === 'single' ? value : 'session_pack';
}

function packAmount(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asWorkMode(raw: string | null | undefined): 'independent' | 'gym' | 'both' | null {
  if (raw === 'independent' || raw === 'gym' || raw === 'both') return raw;
  return null;
}

export const getNewClientData = cache(async (): Promise<NewClientData> => {
  const [trainer, workingHours, clients, templates, packs] = await Promise.all([
    get<TrainerWire>('/v1/trainers/me'),
    get<WorkingHourWire[]>('/v1/working-hours'),
    get<ClientScheduleWire[]>('/v1/clients'),
    get<TemplateWire[]>('/v1/templates'),
    /* The ONLY call here allowed to fail quietly. The other four decide whether
       a client can be added at all; the price list decides what step 2 can
       DRAW, and a build whose `/v1/packs` is missing or refused should cost the
       trainer a price list and an empty state, not the whole flow. */
    get<PackWire[]>('/v1/packs').catch((): PackWire[] => []),
  ]);

  return {
    trainer: {
      id: trainer.id,
      name: trainer.name,
      workMode: asWorkMode(trainer.workMode),
      gymName: trainer.gymName,
      gymSharePercent: trainer.gymSharePercent,
    },
    workingHours: workingHours ?? [],
    clients: clients ?? [],
    packs: (packs ?? [])
      .filter(p => p.status !== 'inactive')
      .map(p => ({
        id: p.id,
        name: p.name || 'Pack',
        type: asPackType(p.type),
        sessions: typeof p.sessions === 'number' ? p.sessions : null,
        amount: packAmount(p.amount),
        validityDays: typeof p.validityDays === 'number' ? p.validityDays : null,
        owner: p.owner === 'gym' ? ('gym' as const) : ('trainer' as const),
        orderIndex: p.orderIndex ?? 0,
      }))
      .sort((a, b) => a.orderIndex - b.orderIndex),
    templates: templates ?? [],
    setupComplete: trainer.setupComplete,
    trainerName: trainer.name,
    trainerPhone: trainer.phone,
  };
});
