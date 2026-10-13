import 'server-only';

import { cache } from 'react';

import { api, ApiError } from '@/lib/http/client';

/**
 * THE PORTAL'S SESSION READ — api-contract 1.2, p-a1 (`GET /v1/portal/me`).
 *
 * One read draws the shell, the trainer card, the details form and the walls: it is the only portal route that answers for a paused
 * or removed client, and the counts on it are the client's own. `cache()`d per request so the layout's guard and the page's own call
 * are a single round trip.
 */
export interface PortalMeWire {
  phone: string;
  /** `active` opens the portal; `paused` and `removed` are the walls. */
  access: 'active' | 'paused' | 'removed';
  /** A date (`yyyy-MM-dd`), when the trainer set one. */
  pausedUntil?: string;
  removedAt?: number;
  removedBy?: 'trainer' | 'client';
  acknowledgedAt?: number;
  /** A removed client gets the name alone: the person has left, so no bio, links or number. */
  trainer?: {
    name: string;
    headline?: string;
    bio?: string;
    introVideoId?: string;
    certifications?: string[];
    specialities?: string[];
    languages?: string[];
    instagramHandle?: string;
    youtubeHandle?: string;
    /** Carries no text; the page appends the draft for whatever is being asked about. */
    whatsappUrl?: string;
  };
  myDetails?: {
    name: string | null;
    goal: string | null;
    heightCm: number | null;
    timezone: string | null;
    activityLevel: string | null;
    dateOfBirth: string | null;
    phone: string | null;
    version: string;
  };
  moneyVisible: boolean;
  unreadNotices: number;
  openAssessments: number;
  pendingInvites: { inviteId: string; trainerName: string; headline: string | null; expiresAt: number }[];
  policy: { accepted: string | null; current: string };
  push: { vapidPublicKey: string | null };
}

export class PortalMeError extends Error {
  constructor(readonly status: number | null, readonly code: string | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'PortalMeError';
  }
}

export const getPortalMe = cache(async function getPortalMe(): Promise<PortalMeWire> {
  try {
    return await api<PortalMeWire>('/v1/portal/me');
  } catch (e) {
    if (e instanceof ApiError) throw new PortalMeError(e.status, e.problem.code ?? null);
    throw e;
  }
});
