'use server';

import { revalidatePath } from 'next/cache';

import { getToken } from '@/lib/auth/session';

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';

async function authedFetch(
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, body: null };

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        ...((init.headers as Record<string, string>) ?? {}),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, status: 0, body: null };
  }

  const text = await res.text().catch(() => '');
  const body = text ? JSON.parse(text) : null;
  return { ok: res.ok, status: res.status, body };
}

function revalidate() {
  revalidatePath('/team', 'page');
}

/* ────────────────────────────────────────── team management ── */

export async function createTeam(
  _: unknown,
  form: FormData,
): Promise<{ error?: string }> {
  const name = form.get('name')?.toString().trim();
  if (!name) return { error: 'Team name is required.' };

  const r = await authedFetch('/v1/team', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

  if (!r.ok) {
    const code = (r.body as { code?: string } | null)?.code;
    if (code === 'ALREADY_IN_TEAM') return { error: 'You are already in a team.' };
    return { error: 'Could not create team. Please try again.' };
  }

  revalidate();
  return {};
}

export async function updateTeam(
  _: unknown,
  form: FormData,
): Promise<{ error?: string }> {
  const name = form.get('name')?.toString().trim() || undefined;
  const logoUrl = form.get('logoUrl')?.toString().trim() || undefined;

  const r = await authedFetch('/v1/team', {
    method: 'PATCH',
    body: JSON.stringify({ name: name ?? null, logoUrl: logoUrl ?? null }),
  });

  if (!r.ok) return { error: 'Could not update team.' };
  revalidate();
  return {};
}

export async function deleteTeam(): Promise<{ error?: string }> {
  const r = await authedFetch('/v1/team', { method: 'DELETE' });
  if (!r.ok) return { error: 'Could not delete team.' };
  revalidate();
  return {};
}

/* ────────────────────────────────────────── members & invites ── */

export async function inviteMember(
  _: unknown,
  form: FormData,
): Promise<{ error?: string; whatsappUrl?: string; message?: string }> {
  const phone = form.get('phone')?.toString().trim();
  if (!phone) return { error: 'Phone number is required.' };

  const r = await authedFetch('/v1/team/invites', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });

  if (!r.ok) {
    const code = (r.body as { code?: string } | null)?.code;
    if (code === 'PHONE_ALREADY_IN_TEAM') return { error: 'This number is already in a team.' };
    if (code === 'PHONE_ALREADY_INVITED') return { error: 'An invite is already pending for this number.' };
    if (code === 'SEAT_LIMIT_REACHED') return { error: 'Seat limit reached. Remove a member or increase the limit first.' };
    return { error: 'Could not send invite. Please try again.' };
  }

  revalidate();
  const data = r.body as { whatsappUrl?: string; message?: string } | null;
  return { whatsappUrl: data?.whatsappUrl ?? undefined, message: data?.message ?? undefined };
}

export async function revokeInvite(memberId: string): Promise<{ error?: string }> {
  const r = await authedFetch(`/v1/team/invites/${memberId}`, { method: 'DELETE' });
  if (!r.ok) return { error: 'Could not revoke invite.' };
  revalidate();
  return {};
}

export async function changeMemberRole(
  memberId: string,
  role: string,
): Promise<{ error?: string }> {
  const r = await authedFetch(`/v1/team/members/${memberId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });

  if (!r.ok) {
    const code = (r.body as { code?: string } | null)?.code;
    if (code === 'MEMBER_NOT_IN_TEAM') return { error: 'Member not found.' };
    return { error: 'Could not change role.' };
  }

  revalidate();
  return {};
}

export async function removeMember(memberId: string): Promise<{ error?: string }> {
  const r = await authedFetch(`/v1/team/members/${memberId}`, { method: 'DELETE' });
  if (!r.ok) return { error: 'Could not remove member.' };
  revalidate();
  return {};
}

export async function leaveTeam(): Promise<{ error?: string }> {
  const r = await authedFetch('/v1/team/members/me', { method: 'DELETE' });
  if (!r.ok) return { error: 'Could not leave team.' };
  revalidate();
  return {};
}

/* ──────────────────────────────────────── incoming invitations ── */

export async function acceptInvitation(inviteId: string): Promise<{ error?: string }> {
  const r = await authedFetch(`/v1/team/invitations/${inviteId}/accept`, {
    method: 'POST',
    body: '{}',
  });

  if (!r.ok) {
    const code = (r.body as { code?: string } | null)?.code;
    if (code === 'TEAM_INVITE_EXPIRED') return { error: 'This invitation has expired.' };
    if (code === 'ALREADY_IN_TEAM') return { error: 'You are already in a team.' };
    return { error: 'Could not accept invitation.' };
  }

  revalidate();
  return {};
}

export async function declineInvitation(inviteId: string): Promise<{ error?: string }> {
  const r = await authedFetch(`/v1/team/invitations/${inviteId}/decline`, {
    method: 'POST',
    body: '{}',
  });

  if (!r.ok) return { error: 'Could not decline invitation.' };
  revalidate();
  return {};
}

/* ──────────────────────────────────────────── client reassign ── */

export async function reassignClient(
  clientId: string,
  toTrainerId: string,
  reason: string,
): Promise<{ error?: string }> {
  const r = await authedFetch(`/v1/team/clients/${clientId}/reassign`, {
    method: 'POST',
    body: JSON.stringify({ toTrainerId, reason }),
  });

  if (!r.ok) {
    const code = (r.body as { code?: string } | null)?.code;
    if (code === 'CLIENT_NOT_IN_TEAM') return { error: 'Client not found in team.' };
    if (code === 'MEMBER_NOT_IN_TEAM') return { error: 'Target coach not in team.' };
    return { error: 'Could not reassign client.' };
  }

  revalidate();
  return {};
}

/* ────────────────────────────────────────── template library ── */

export async function copyTemplate(templateId: string): Promise<{ error?: string }> {
  const r = await authedFetch(`/v1/team/templates/${templateId}/copy`, {
    method: 'POST',
    body: '{}',
  });

  if (!r.ok) return { error: 'Could not copy template.' };
  revalidate();
  return {};
}

/* ───────────────────────────────────────────── revenue query ── */

export interface CoachRevenue {
  trainerId: string;
  coachName: string;
  role: string;
  collected: number;
  gymShare: number;
  payments: number;
  payingClients: number;
}

export interface RevenueResult {
  from: string;
  to: string;
  teamCollected: number;
  teamGymShare: number;
  coaches: CoachRevenue[];
}

export async function loadRevenue(
  _: { data?: RevenueResult; error?: string },
  form: FormData,
): Promise<{ data?: RevenueResult; error?: string }> {
  const from = form.get('from')?.toString() ?? '';
  const to = form.get('to')?.toString() ?? '';

  if (!from || !to) return { error: 'Select a date range.' };

  const r = await authedFetch(`/v1/team/revenue?from=${from}&to=${to}`, {
    method: 'GET',
  });

  if (!r.ok) {
    const code = (r.body as { code?: string } | null)?.code;
    if (code === 'NOT_TEAM_OWNER') return { error: 'Only the team owner can view revenue.' };
    return { error: 'Could not load revenue data.' };
  }

  const body = r.body as RevenueResult;
  return { data: body };
}
