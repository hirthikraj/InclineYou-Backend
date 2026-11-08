'use server';

import { ApiError } from '@/lib/http/client';

import { endDevice, endOtherDevices, listDevices, type Device } from './api';

/**
 * The two writes behind the signed-in devices section. Each answers the list as it now is, so the section redraws from the
 * server's truth rather than guessing which rows went.
 *
 * Signing out THIS browser is not here: that is the account menu's *Sign out*, which also clears every cookie of the
 * sitting (`lib/auth/actions.ts`). The section never offers it on the current row.
 */
export type DevicesResult = { ok: true; devices: Device[] | null } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function signOutDevice(id: string): Promise<DevicesResult> {
  if (!UUID.test(id)) return { ok: false, message: 'That device could not be found. Reload the page.' };
  return run(() => endDevice(id));
}

export async function signOutOtherDevices(): Promise<DevicesResult> {
  return run(endOtherDevices);
}

async function run(write: () => Promise<void>): Promise<DevicesResult> {
  try {
    await write();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      // This browser itself was signed out from somewhere else in the meantime.
      return { ok: false, message: 'This browser has been signed out. Sign in again.' };
    }
    return { ok: false, message: 'We couldn’t sign that out just now. Nothing changed — try again.' };
  }
  return { ok: true, devices: await listDevices() };
}
