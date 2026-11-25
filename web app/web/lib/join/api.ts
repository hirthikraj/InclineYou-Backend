import 'server-only';

import { api, ApiError } from '@/lib/http/client';
import { getPacksData } from '@/lib/packs/api';
import { getTemplates } from '@/lib/assessments/api';
import type { JoinCardWire, JoinLinkWire, JoinRequestListWire, JoinRequestStatus } from './types';

/**
 * The join link's reads (api-contract 1.2, jl-a1, jl-a3, jn-a1). The writes are `actions.ts`.
 */
export class JoinApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'JoinApiError';
  }
}

export interface JoinPackOption {
  id: string;
  name: string;
  amount: number;
  service: 'floor' | 'home_visit' | 'remote' | 'programming';
  basis: 'sessions' | 'period';
  sessions: number | null;
  validityDays: number | null;
}

export interface JoinLinkData {
  link: JoinLinkWire;
  /** The trainer's own active packs — what can go on the page. A gym's packs cannot: a join is an independent client. */
  packs: JoinPackOption[];
  /** Assessment templates, for the check-in, with what each one asks. `null` when the shelf could not be read. */
  templates: { id: string; name: string; measurements: number; questions: number }[] | null;
  pending: number;
  trainerName: string;
  setupComplete: boolean;
}

export async function getJoinLinkData(): Promise<JoinLinkData> {
  try {
    const [link, packs, templates, requests] = await Promise.all([
      api<JoinLinkWire>('/v1/join-link'),
      getPacksData(),
      getTemplates().catch(() => null),
      api<JoinRequestListWire>('/v1/join-requests?state=pending'),
    ]);
    return {
      link,
      packs: packs.packs
        .filter((p) => p.status === 'active' && p.owner === 'trainer')
        .map((p) => ({
          id: p.id, name: p.name, amount: p.amount, service: p.service, basis: p.basis, sessions: p.sessions,
          validityDays: p.validityDays,
        })),
      templates: templates
        ? templates.map((t) => ({
            id: t.id,
            name: t.name,
            measurements: t.measurements.on ? t.measurements.keys.length : 0,
            questions: t.questions.on ? t.questions.items.length : 0,
          }))
        : null,
      pending: requests.counts.pending,
      trainerName: packs.trainer.name,
      setupComplete: packs.trainer.setupComplete,
    };
  } catch (error) {
    if (error instanceof ApiError) throw new JoinApiError(error.status);
    throw error;
  }
}

export interface JoinRequestsData {
  list: JoinRequestListWire;
  link: Pick<JoinLinkWire, 'exists' | 'takingJoins' | 'url'>;
}

export async function getJoinRequestsData(states: JoinRequestStatus[]): Promise<JoinRequestsData> {
  try {
    const [list, link] = await Promise.all([
      api<JoinRequestListWire>(`/v1/join-requests?state=${encodeURIComponent(states.join(','))}`),
      api<JoinLinkWire>('/v1/join-link'),
    ]);
    return { list, link: { exists: link.exists, takingJoins: link.takingJoins, url: link.url } };
  } catch (error) {
    if (error instanceof ApiError) throw new JoinApiError(error.status);
    throw error;
  }
}

/** jn-a1, no session. `null` when the server could not be reached — the page says so rather than "closed". */
export async function getJoinCard(slug: string): Promise<JoinCardWire | null> {
  try {
    return await api<JoinCardWire>(`/v1/join/${encodeURIComponent(slug)}`, { auth: false });
  } catch (error) {
    if (error instanceof ApiError) return error.status === null || error.status >= 500 ? null : { state: 'closed' };
    throw error;
  }
}

/** How many join requests wait on the trainer's answer — the Clients → Joining badge. Null when it could not be read. */
export async function pendingJoinRequests(): Promise<number | null> {
  try {
    return (await api<JoinRequestListWire>('/v1/join-requests?state=pending')).counts.pending;
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }
}
