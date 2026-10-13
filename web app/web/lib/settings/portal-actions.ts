'use server';

import { revalidatePath } from 'next/cache';

import { PortalApiError, patchPortalSettings, type PortalPatch, type PortalSettings } from './portal-api';

/**
 * Save one of the trainer's portal decisions. Each control saves on its own, because each is one decision made once: a Save
 * button under a switch is a way to leave it half-set. The profile PATCH leaves every field it was not sent alone, so a switch
 * that writes one key cannot clobber the other, or anything on the profile.
 */
export type PortalSaveResult = { ok: true; settings: PortalSettings } | { ok: false; message: string };

export async function savePortalSettings(patch: PortalPatch, version: string): Promise<PortalSaveResult> {
  try {
    const settings = await patchPortalSettings(patch, version);
    revalidatePath('/settings/portal');
    return { ok: true, settings };
  } catch (error) {
    if (error instanceof PortalApiError) {
      if (error.code === 'PRECONDITION_FAILED') {
        return { ok: false, message: 'Your profile changed somewhere else. Reload the page and try again.' };
      }
      if (error.detail) return { ok: false, message: error.detail };
      if (error.status === null) return { ok: false, message: 'Could not reach the server. Nothing changed.' };
      if (error.status === 401 || error.status === 403) return { ok: false, message: 'Your session expired. Sign in again.' };
    }
    return { ok: false, message: 'That did not save. Nothing changed.' };
  }
}
