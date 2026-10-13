'use server';

import { revalidatePath } from 'next/cache';

import { api, ApiError } from '@/lib/http/client';
import type { BulkInviteWire, InviteCreatedWire, InviteWire } from './invite-types';

/**
 * INVITE ONE, INVITE MANY — api-contract 1.2 tr-a1 and tr-a2 (and, further down, tr-a4 withdraw).
 *
 * Nothing here sends anything. Both answer a link, a drafted message and a `wa.me` URL, and the trainer reads the draft
 * and presses send from their own WhatsApp. The link is the raw token's only appearance anywhere (the server stores a
 * hash), so these results are returned to the one component that asked and are not cached, revalidated into a page or
 * logged: `revalidatePath` below refreshes what the screens DRAW (a state changed to *Invited*), never the link.
 *
 * A call is a resend as much as a first invite — the server replaces any pending link — so pressing *Invite* on someone
 * already waiting is how a trainer gets a fresh link, and the old one stops working.
 */

export type InviteResult =
  | { ok: true; invite: InviteCreatedWire }
  | { ok: false; message: string };

export type RevokeResult = { ok: true; invite: InviteWire } | { ok: false; message: string };

export type BulkInviteResult =
  | { ok: true; result: BulkInviteWire }
  | { ok: false; message: string };

function fail(error: unknown, subject: string): { ok: false; message: string } {
  if (error instanceof ApiError) {
    if (error.problem.detail) return { ok: false, message: error.problem.detail };
    if (error.status === null) return { ok: false, message: `${subject} could not reach the server. Nothing changed.` };
    if (error.status === 401 || error.status === 403) return { ok: false, message: 'Your session expired. Sign in again.' };
    if (error.status === 404) return { ok: false, message: `${subject}: that client is no longer there.` };
  }
  return { ok: false, message: `${subject} did not go through. Nothing changed.` };
}

function refresh(clientId?: string): void {
  revalidatePath('/clients');
  revalidatePath('/clients/invitations');
  if (clientId) revalidatePath(`/clients/${clientId}`, 'layout');
}

export async function inviteClient(clientId: string): Promise<InviteResult> {
  try {
    const invite = await api<InviteCreatedWire>(`/v1/clients/${encodeURIComponent(clientId)}/invites`, { method: 'POST' });
    refresh(clientId);
    return { ok: true, invite };
  } catch (error) {
    return fail(error, 'The invitation');
  }
}

export async function inviteClients(clientIds: string[]): Promise<BulkInviteResult> {
  try {
    const result = await api<BulkInviteWire>('/v1/client-invites', { method: 'POST', body: { clientIds } });
    refresh();
    return { ok: true, result };
  } catch (error) {
    return fail(error, 'The invitations');
  }
}

/**
 * Withdraw an invitation (tr-a4). Safe to repeat — the server answers 200 for one already withdrawn or declined — and
 * undone by inviting again, so the screen asks nothing first. A 409 means the client joined in the meantime; the server's
 * sentence says to archive them, which is the right thing to show.
 */
export async function revokeInvite(inviteId: string, clientId: string): Promise<RevokeResult> {
  try {
    const invite = await api<InviteWire>(`/v1/client-invites/${encodeURIComponent(inviteId)}/revoke`, { method: 'POST' });
    refresh(clientId);
    return { ok: true, invite };
  } catch (error) {
    return fail(error, 'Withdrawing the invitation');
  }
}
