import 'server-only';

import { api, ApiError } from '@/lib/http/client';
import { getClients, getMe, type ClientWire } from './api';
import type { InviteListWire } from './invite-types';

/**
 * The Invitations screen's reads — api-contract 1.2 Trainer side, tr-a3 (`GET /v1/client-invites`), beside the roster
 * the "not invited yet" list is cut from. The writes are `invite-actions.ts`.
 */
export class InviteApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'InviteApiError';
  }
}

export interface InvitationsData {
  list: InviteListWire;
  /** Clients the trainer could invite now: a number, not archived, not already on the portal or waiting. */
  candidates: ClientWire[];
  /** Active clients with no number, which cannot be invited: said once, so a missing row is explained. */
  withoutNumber: number;
  trainerName: string;
  setupComplete: boolean;
}

/** Who is worth offering an invitation to. A pending invite is already out there (resend it from the list). */
const INVITABLE = new Set(['not_invited', 'declined']);

export async function getInvitationsData(states: string): Promise<InvitationsData> {
  try {
    const [list, clients, me] = await Promise.all([
      api<InviteListWire>(`/v1/client-invites?state=${encodeURIComponent(states)}&include=counts&limit=100`),
      getClients(),
      getMe(),
    ]);
    const live = clients.filter((c) => c.status !== 'archived' && c.membershipStatus !== 'removed' && INVITABLE.has(c.membershipStatus));
    return {
      list,
      candidates: live.filter((c) => c.phone),
      withoutNumber: live.filter((c) => !c.phone).length,
      trainerName: me.name ?? '',
      setupComplete: me.setupCompletedAt !== null,
    };
  } catch (error) {
    if (error instanceof ApiError) throw new InviteApiError(error.status);
    throw error;
  }
}
