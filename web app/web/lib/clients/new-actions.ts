'use server';

import { revalidatePath } from 'next/cache';

import { api, ApiError } from '@/lib/http/client';

/**
 * The add-client flow's writes on api-contract 1.1 *Clients*: A4 phone check,
 * A5 create, A6 PATCH, A7 sell, A8 PUT schedule, and Programs A5 apply.
 *
 * Every create carries an id the flow minted when it opened, so a retried
 * Continue makes no duplicates (the server answers 200 with the first row).
 * Failures are thrown with the server's `code` and sentence, which the flow
 * prints as they are.
 */

/** A refusal the flow can print: the server's sentence, and its code to branch on. */
function rethrow(error: unknown): never {
  if (error instanceof ApiError) {
    throw Object.assign(new Error(error.problem.detail ?? 'That did not save. Nothing changed.'), {
      status: error.status, code: error.problem.code,
    });
  }
  throw error;
}

/** Ten digits typed → E.164, the only shape the wire takes (client_phone_format). */
function e164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
}

export interface PhoneCheckResult {
  available: boolean;
  code?: string;
  message?: string;
  clientId?: string;
  clientName?: string;
  clientStatus?: string;
}

export async function checkPhone(phone: string): Promise<PhoneCheckResult> {
  try {
    return await api<PhoneCheckResult>('/v1/clients/phone-check', { method: 'POST', body: { phone: e164(phone) } });
  } catch (error) {
    rethrow(error);
  }
}

export interface CreateClientInput {
  id: string;
  name: string;
  phone: string;
  clientType: 'independent' | 'gym';
  /** Omitted = active, the server's own default. The add flow's Type step
   *  sends `prospect` explicitly; nothing else creates a client any other
   *  status. */
  status?: 'active' | 'prospect';
  deliveryMode: 'floor' | 'remote';
  /** `YYYY-MM-DD`. The flow asks for it so the 18+ rule is checked before a client
   *  exists (`lib/clients/adult.ts`); the server refuses `CLIENT_UNDER_18` as well. */
  dateOfBirth: string;
}

export interface CreatedClient {
  id: string;
  name: string;
  /** `schedule.version` — the If-Match step 3 sends. */
  scheduleVersion: string;
}

export async function createClient(input: CreateClientInput): Promise<CreatedClient> {
  try {
    const row = await api<{ id: string; name: string; schedule: { version: string } }>('/v1/clients', {
      method: 'POST',
      body: {
        id: input.id,
        name: input.name,
        phone: e164(input.phone),
        dateOfBirth: input.dateOfBirth,
        clientType: input.clientType,
        status: input.status,
        schedule: { deliveryMode: input.deliveryMode },
      },
    });
    revalidatePath('/clients');
    return { id: row.id, name: row.name, scheduleVersion: row.schedule.version };
  } catch (error) {
    rethrow(error);
  }
}

/** Back-then-Continue on steps 1–2: only the fields that changed. */
export interface ClientDetailsPatch {
  name?: string;
  phone?: string;
  dateOfBirth?: string;
  clientType?: 'independent' | 'gym';
}

export async function updateClientDetails(clientId: string, patch: ClientDetailsPatch): Promise<void> {
  try {
    await api(`/v1/clients/${encodeURIComponent(clientId)}`, {
      method: 'PATCH',
      body: patch.phone === undefined ? patch : { ...patch, phone: e164(patch.phone) },
    });
    revalidatePath('/clients');
    revalidatePath(`/clients/${clientId}`);
  } catch (error) {
    rethrow(error);
  }
}

/**
 * Sell off the price list. `trainerSharePercent` only for a gym client's pack
 * (R3): the split rides on the sale, not on the client.
 */
export async function sellPack(
  clientId: string,
  input: { id: string; packId: string; trainerSharePercent?: number },
): Promise<{ ok: boolean; message?: string }> {
  try {
    await api(`/v1/clients/${encodeURIComponent(clientId)}/packages`, { method: 'POST', body: input });
    revalidatePath('/clients');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof ApiError ? error.problem.detail : undefined };
  }
}

export interface WeeklySlot {
  weekday: number;
  start: string;
  /** The program day this slot books (R45); step 3 numbers them in week order. */
  programDay: number | null;
}

/** The whole week, conditional on the version the flow last saw. Returns the new version. */
export async function saveSchedule(
  clientId: string,
  version: string,
  week: { deliveryMode: 'floor' | 'remote'; slots: WeeklySlot[] },
): Promise<{ version: string; booked: number }> {
  try {
    const res = await api<{ schedule: { version: string }; booked: number }>(
      `/v1/clients/${encodeURIComponent(clientId)}/schedule`,
      {
        method: 'PUT',
        headers: { 'if-match': `"${version}"` },
        body: { deliveryMode: week.deliveryMode, sessionsPerWeek: week.slots.length, slots: week.slots },
      },
    );
    revalidatePath('/clients');
    return { version: res.schedule.version, booked: res.booked };
  } catch (error) {
    rethrow(error);
  }
}

/** Programs A5 — the plan's id minted when step 4 opens, so a retried Apply makes one plan. */
export async function applyTemplate(templateId: string, input: { id: string; clientId: string }): Promise<void> {
  try {
    await api(`/v1/programs/${encodeURIComponent(templateId)}/apply`, { method: 'POST', body: input });
    revalidatePath('/clients');
    revalidatePath(`/clients/${input.clientId}`);
  } catch (error) {
    rethrow(error);
  }
}
