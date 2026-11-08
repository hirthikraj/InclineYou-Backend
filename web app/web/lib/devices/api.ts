import 'server-only';

import { ApiError, api } from '@/lib/http/client';

/**
 * Signed-in devices — `GET` / `DELETE /v1/auth/sessions…` (api-contract, Settings: Signed-in devices; UC-AUTH-10, UC-CP-38).
 *
 * The same three routes for a trainer and a client: the list is `web_session` filtered by the caller's own account, so
 * nobody can see or end anybody else's browser. Only browsers are listed — the phone app's sign-in is a token the server
 * keeps no record of, so it can be neither shown nor ended (see the note the section draws).
 */
export interface Device {
  id: string;
  userAgent: string | null;
  issuedAt: number;
  lastSeenAt: number;
  /** The browser making this request. */
  current: boolean;
}

/** The list, newest use first; null when it could not be read (the section says so rather than taking the page down). */
export async function listDevices(): Promise<Device[] | null> {
  try {
    const res = await api<{ items: Device[] }>('/v1/auth/sessions');
    return res.items;
  } catch (e) {
    if (e instanceof ApiError) return null;
    throw e;
  }
}

/** End one browser. Idempotent on the server. */
export async function endDevice(id: string): Promise<void> {
  await api<void>(`/v1/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** End every browser but this one. */
export async function endOtherDevices(): Promise<void> {
  await api<void>('/v1/auth/sessions?scope=others', { method: 'DELETE' });
}
