'use server';

import { revalidatePath } from 'next/cache';

import { ClientDetailApiError, patchClient } from './client-api';

/**
 * THE TWO PER-CLIENT PORTAL SETTINGS — api-contract 1.2, tr-a5.
 *
 * Both ride `PATCH /v1/clients/{id}`, which leaves a field it was not sent alone, so a switch that writes one key can
 * never clobber the other or anything on the contact card. `portalShowMoney` has three answers on the wire and the
 * third is the point: `null` is *follow my setting*, and clears the override rather than choosing a side.
 */
export interface PortalWriteResult {
  ok: boolean;
  message?: string;
}

export async function savePortalPrefs(
  clientId: string,
  version: string,
  input: { remindersExcluded?: boolean; portalShowMoney?: boolean | null },
): Promise<PortalWriteResult> {
  try {
    await patchClient(clientId, input, version);
    revalidatePath(`/clients/${clientId}`, 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof ClientDetailApiError) {
      if (error.code === 'PRECONDITION_FAILED') {
        return { ok: false, message: 'This client was changed somewhere else. Reload the page and try again.' };
      }
      if (error.detail) return { ok: false, message: error.detail };
      if (error.status === null) return { ok: false, message: 'Could not reach the server. Nothing changed.' };
      if (error.status === 401 || error.status === 403) return { ok: false, message: 'Your session expired. Sign in again.' };
    }
    return { ok: false, message: 'It did not save. Nothing changed.' };
  }
}
