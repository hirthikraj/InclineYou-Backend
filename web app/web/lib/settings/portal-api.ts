import 'server-only';

import { cache } from 'react';

import { api, ApiError } from '@/lib/http/client';

/**
 * THE TRAINER'S TWO DECISIONS ABOUT THE CLIENT PORTAL — api-contract 1.2, tr-a10.
 *
 * They ride `GET` and `PATCH /v1/trainers/me`, in the `clientPortal` block the profile gained: whether clients are sent session
 * reminders (off until the trainer turns it on) and when, and whether clients can see what they owe (on). `reminderReach` is the
 * server's honest answer to *who would get one*; this half never works it out.
 */
export interface PortalSettings {
  sessionReminders: boolean;
  reminderTiming: 'evening_before' | 'two_hours_before';
  clientsSeeMoney: boolean;
  /** The one approved utility template. Read-only: nothing on this wire changes it. */
  reminderText: string;
  reminderReach: { onPortal: number; optedIn: number; excluded: number };
  /** The profile's version, the `If-Match` for a write. */
  version: string;
}

export type PortalPatch = Partial<Pick<PortalSettings, 'sessionReminders' | 'reminderTiming' | 'clientsSeeMoney'>>;

interface TrainerWire {
  version: string;
  clientPortal?: Omit<PortalSettings, 'version'> | null;
}

export class PortalApiError extends Error {
  constructor(
    readonly status: number | null,
    readonly detail: string | null = null,
    readonly code: string | null = null,
  ) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'PortalApiError';
  }
}

function settingsOf(wire: TrainerWire): PortalSettings {
  const p = wire.clientPortal;
  // A backend from before 1.2 has no block: show the defaults the product ships, never a broken page.
  return {
    sessionReminders: p?.sessionReminders ?? false,
    reminderTiming: p?.reminderTiming ?? 'evening_before',
    clientsSeeMoney: p?.clientsSeeMoney ?? true,
    reminderText: p?.reminderText ?? 'Reminder: {session} with {trainer} {when}.',
    reminderReach: p?.reminderReach ?? { onPortal: 0, optedIn: 0, excluded: 0 },
    version: wire.version,
  };
}

async function call(options: { method?: 'GET' | 'PATCH'; body?: unknown; headers?: Record<string, string> }): Promise<TrainerWire> {
  try {
    return await api<TrainerWire>('/v1/trainers/me', options);
  } catch (e) {
    if (e instanceof ApiError) throw new PortalApiError(e.status, e.problem.detail ?? null, e.problem.code ?? null);
    throw e;
  }
}

export const getPortalSettings = cache(async function getPortalSettings(): Promise<PortalSettings> {
  return settingsOf(await call({}));
});

export async function patchPortalSettings(patch: PortalPatch, version: string): Promise<PortalSettings> {
  return settingsOf(await call({ method: 'PATCH', body: patch, headers: { 'if-match': `"${version}"` } }));
}
