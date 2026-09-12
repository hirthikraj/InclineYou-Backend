import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';

export class TeamApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou team api ${status ?? 'unreachable'}`);
    this.name = 'TeamApiError';
  }
}

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

async function get<T>(path: string): Promise<T | null> {
  const token = await getToken();
  if (!token) throw new TeamApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new TeamApiError(null);
  }
  if (res.status === 204) return null;
  if (!res.ok) throw new TeamApiError(res.status);

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/* ──────────────────────────────────────────────── wire shapes ── */

export interface TeamResponse {
  id: string;
  name: string;
  logoUrl: string | null;
  seatLimit: number;
  activeMembers: number;
  pendingInvites: number;
  ownerTrainerId: string;
  myRole: string;
  createdAt: number;
  updatedAt: number;
}

export interface MemberResponse {
  id: string;
  trainerId: string | null;
  name: string;
  phone: string;
  role: string;
  status: string;
  clientCount: number;
  invitedAt: number | null;
  joinedAt: number | null;
}

export interface InvitationResponse {
  id: string;
  teamId: string;
  teamName: string;
  invitedByName: string;
  invitedAt: number;
  expiresAt: number;
}

export interface TeamClientRow {
  id: string;
  name: string;
  phone: string | null;
  goal: string | null;
  status: string;
  deliveryMode: string | null;
  coachTrainerId: string;
  coachName: string;
  lastSessionAt: number | null;
  upcomingSessions: number;
  hasActiveProgram: boolean;
  createdAt: number;
}

export interface CoachClients {
  trainerId: string;
  coachName: string;
  role: string;
  clients: TeamClientRow[];
}

export interface TeamTemplateRow {
  id: string;
  name: string;
  goal: string | null;
  dayCount: number;
  ownerName: string | null;
  ownerTrainerId: string;
  mine: boolean;
}

export interface CoachRevenue {
  trainerId: string;
  coachName: string;
  role: string;
  collected: number | string;
  gymShare: number | string;
  payments: number;
  payingClients: number;
}

export interface TeamRevenue {
  from: string;
  to: string;
  teamCollected: number | string;
  teamGymShare: number | string;
  coaches: CoachRevenue[];
}

export interface ActivityRow {
  id: string;
  clientId: string;
  clientName: string;
  coachName: string;
  adminName: string;
  action: string;
  detail: string;
  at: number;
}

export interface TeamData {
  /* The request's clock. A page component is subject to React's purity rule, so
   * `Date.now()` cannot be read in one — the same argument `app/(main)/schedule/
   * page.tsx` spells out: the clock belongs to the request, and the guard IS the
   * request. Read here, threaded down as a prop, never re-read below. */
  now: number;
  team: TeamResponse | null;
  members: MemberResponse[];
  invitations: InvitationResponse[];
  clients: CoachClients[];
  templates: TeamTemplateRow[];
  revenue: TeamRevenue | null;
  activity: ActivityRow[];
}

/* 204 → null means no team, which is normal for most trainers */
export const getTeam = cache((): Promise<TeamResponse | null> =>
  get<TeamResponse>('/v1/team'),
);

export const getMembers = cache((): Promise<MemberResponse[]> =>
  get<MemberResponse[]>('/v1/team/members').then((r) => r ?? []),
);

export const getInvitations = cache((): Promise<InvitationResponse[]> =>
  get<InvitationResponse[]>('/v1/team/invitations').then((r) => r ?? []),
);

export const getTeamClients = cache((): Promise<CoachClients[]> =>
  get<CoachClients[]>('/v1/team/clients').then((r) => r ?? []),
);

export const getTeamTemplates = cache((): Promise<TeamTemplateRow[]> =>
  get<TeamTemplateRow[]>('/v1/team/templates').then((r) => r ?? []),
);

export function getTeamRevenue(from: string, to: string): Promise<TeamRevenue | null> {
  return get<TeamRevenue>(`/v1/team/revenue?from=${from}&to=${to}`);
}

export const getTeamActivity = cache((): Promise<ActivityRow[]> =>
  get<ActivityRow[]>('/v1/team/activity').then((r) => r ?? []),
);
