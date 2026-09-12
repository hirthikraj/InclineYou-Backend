import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';

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
  templates: TemplateWire[];
  setupComplete: boolean;
  trainerName: string;
  trainerPhone: string | null;
}

function asWorkMode(raw: string | null | undefined): 'independent' | 'gym' | 'both' | null {
  if (raw === 'independent' || raw === 'gym' || raw === 'both') return raw;
  return null;
}

export const getNewClientData = cache(async (): Promise<NewClientData> => {
  const [trainer, workingHours, clients, templates] = await Promise.all([
    get<TrainerWire>('/v1/trainers/me'),
    get<WorkingHourWire[]>('/v1/working-hours'),
    get<ClientScheduleWire[]>('/v1/clients'),
    get<TemplateWire[]>('/v1/templates'),
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
    templates: templates ?? [],
    setupComplete: trainer.setupComplete,
    trainerName: trainer.name,
    trainerPhone: trainer.phone,
  };
});
