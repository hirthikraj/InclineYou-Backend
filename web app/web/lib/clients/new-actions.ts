'use server';

import { revalidatePath } from 'next/cache';

import { getToken } from '@/lib/auth/session';

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';

async function authed(path: string, method: string, body?: unknown) {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let code: string | undefined;
    try {
      code = (JSON.parse(text) as { code?: string }).code;
    } catch {
      // ignore
    }
    throw Object.assign(new Error(`API ${res.status}`), { status: res.status, code });
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export interface PhoneCheckResult {
  available: boolean;
  code?: string;
  message?: string;
}

export async function checkPhone(phone: string): Promise<PhoneCheckResult> {
  const result = await authed('/v1/clients/phone-availability', 'POST', { phone });
  return result as PhoneCheckResult;
}

export interface CreateClientInput {
  name: string;
  phone: string;
  deliveryMode: 'floor' | 'remote';
  trainerSplitPercent?: number;
}

export interface CreatedClient {
  id: string;
  name: string;
}

export async function createClient(input: CreateClientInput): Promise<CreatedClient> {
  const result = await authed('/v1/clients', 'POST', {
    name: input.name,
    phone: input.phone,
    deliveryMode: input.deliveryMode,
    trainerSplitPercent: input.trainerSplitPercent,
  });
  revalidatePath('/clients');
  return result as CreatedClient;
}

export interface WeeklySlot {
  templateDay: number;
  weekday: number;
  time: string;
}

export async function updateClientSchedule(
  clientId: string,
  weeklySchedule: WeeklySlot[],
): Promise<void> {
  await authed(`/v1/clients/${clientId}`, 'PUT', { weeklySchedule });
  revalidatePath('/clients');
}

export interface ApplyTemplateInput {
  clientId: string;
  startDate?: string;
}

export async function applyTemplate(templateId: string, input: ApplyTemplateInput): Promise<void> {
  await authed(`/v1/templates/${templateId}/apply`, 'POST', input);
  revalidatePath('/clients');
  revalidatePath(`/clients/${input.clientId}`);
}
