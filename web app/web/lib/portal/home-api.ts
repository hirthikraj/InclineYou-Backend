import 'server-only';

import { cache } from 'react';

import { api, ApiError } from '@/lib/http/client';

/**
 * THE PORTAL'S HOME — api-contract 1.2, p-a2 (`GET /v1/portal/home`).
 *
 * One read: the hero (exactly one of a booked session, a self-run day, a rest day, or the first-run state) and the quiet cards under it.
 * Anything the client does not have is ABSENT — no message, no package, no recap — so a missing card is a missing card, never a zero.
 * Nothing on it is a price.
 */
export interface SessionCardWire {
  id: string;
  scheduledAt: number;
  durationMinutes: number;
  mode?: string;
  place?: string;
  workoutName?: string;
  /** A WhatsApp draft naming the session. There is no endpoint: a trainer's diary is the trainer's to move. */
  rescheduleUrl?: string;
}

export interface PortalHomeWire {
  access: 'active';
  trainer: { name: string };
  now: number;
  timezone: string;
  hero: {
    kind: 'session' | 'selfRun' | 'rest' | 'empty';
    session?: SessionCardWire;
    workout?: { id: string; name: string; week?: number; day?: number; exerciseCount: number; estimatedMinutes: number };
    resume?: { sessionId: string };
    nextSession?: SessionCardWire;
  };
  message?: { id: string; kind: 'note' | 'weekly'; body: string; at: number; readAt?: number; trainerName: string };
  package?: { sessionsLeft: number; sessionsTotal: number; expiresOn?: string; paused: boolean };
  lastRecap?: {
    sessionId: string;
    at: number;
    setsDone: number;
    volumeKg: number;
    newBests: { exerciseId: string; name: string; loadValue: number; effortValue?: number }[];
    message?: { id: string; body: string; readAt?: number };
  };
  recentMilestone?: { kind: string; label: string; at: number };
  assessments?: { open: number; late: number; next: { id: string; name: string; dueOn: string } };
  unreadNotices: number;
  installEligible: boolean;
}

export class PortalHomeError extends Error {
  constructor(readonly status: number | null, readonly code: string | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'PortalHomeError';
  }
}

export const getPortalHome = cache(async function getPortalHome(): Promise<PortalHomeWire> {
  try {
    return await api<PortalHomeWire>('/v1/portal/home');
  } catch (e) {
    if (e instanceof ApiError) throw new PortalHomeError(e.status, e.problem.code ?? null);
    throw e;
  }
});
