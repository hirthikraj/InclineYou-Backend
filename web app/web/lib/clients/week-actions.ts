'use server';

import { revalidatePath } from 'next/cache';

import { api, ApiError } from '@/lib/http/client';

import { getNewClientData, type ClientScheduleWire, type WorkingHourWire } from './new-api';

/**
 * The client file's *Their week* editor (22 Nov 2026) — the add flow's Week
 * step, after the fact. Before this the week could only be set while adding a
 * client, or as a side effect of assigning a plan, so a trainer who skipped it
 * had no screen to come back to.
 *
 * The picker's data is read when the panel OPENS rather than with the file:
 * the file's payload is shared by every tab, and the working hours plus
 * everybody's slots are only for this one panel. `getNewClientData` is the add
 * flow's own read, so both doors offer the same hours and the same clashes.
 */
export async function loadWeekPicker(): Promise<
  { ok: true; workingHours: WorkingHourWire[]; clients: ClientScheduleWire[] } | { ok: false }
> {
  try {
    const data = await getNewClientData();
    return { ok: true, workingHours: data.workingHours, clients: data.clients };
  } catch {
    return { ok: false };
  }
}

export interface WeekSlotInput {
  weekday: number;
  start: string;
  programDay: number | null;
  durationMinutes: number | null;
  deliveryMode: string | null;
}

/**
 * `PUT /v1/clients/{id}/schedule` — the whole week, conditional on the version
 * the file loaded. PUT replaces, so the caller sends back the duration and
 * delivery mode it read; anything left out is cleared.
 *
 * Answers a result rather than throwing: a server action's thrown message is
 * not what reaches the browser in a production build.
 */
export async function saveClientWeek(
  clientId: string,
  version: string | null,
  week: {
    sessionsPerWeek: number;
    sessionDurationMinutes: number | null;
    deliveryMode: string | null;
    slots: WeekSlotInput[];
  },
): Promise<{ ok: true; booked: number; cancelled: number } | { ok: false; message: string }> {
  try {
    const res = await api<{ booked: number; cancelled: number }>(
      `/v1/clients/${encodeURIComponent(clientId)}/schedule`,
      {
        method: 'PUT',
        headers: version ? { 'if-match': `"${version}"` } : undefined,
        body: week,
      },
    );
    revalidatePath(`/clients/${clientId}`, 'layout');
    revalidatePath('/clients');
    revalidatePath('/today');
    revalidatePath('/schedule');
    return { ok: true, booked: res.booked ?? 0, cancelled: res.cancelled ?? 0 };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, message: error.problem.detail ?? 'That did not save. Nothing changed.' };
    }
    throw error;
  }
}
