'use server';

import { revalidatePath } from 'next/cache';

import { asWorkMode } from '@/lib/setup/options';
import {
  PacksApiError,
  patchPack,
  patchTrainerGym,
  postPack,
  type PackWrite,
} from './api';

/**
 * The price list's writes. Four of them, all synchronous, all straight to the
 * server — there is no queue on this half and nothing is held anywhere while a
 * request is in flight.
 *
 * Every one of them answers with a SENTENCE rather than a status, because a
 * refused write on this screen has a cause a trainer can act on ("A pack needs a
 * price") and a status code does not.
 */

export interface PackResult {
  ok: boolean;
  message?: string;
}

function fail(error: unknown, subject: string): PackResult {
  if (error instanceof PacksApiError) {
    if (error.status === null) {
      return { ok: false, message: `${subject} could not reach the server. Nothing changed.` };
    }
    if (error.status === 401 || error.status === 403) {
      return { ok: false, message: 'Your session expired. Sign in again.' };
    }
    if (error.status === 404) {
      return { ok: false, message: 'That price is no longer on your list.' };
    }
    // The server's own 400 is a sentence written for this screen. Preferred over
    // anything invented here, which would be a second opinion about a rule the
    // server owns.
    if (error.detail) return { ok: false, message: error.detail };
    return { ok: false, message: `${subject} did not go through. Nothing changed.` };
  }
  return { ok: false, message: `${subject} did not go through. Nothing changed.` };
}

/**
 * The price list lives on `/business?tab=packages` and the ledger beside it reads
 * packages, not packs — but the roster's "pack running low" moves when a price
 * list does, and *Ending soon* on this screen is the same rows Today's queue is
 * built from.
 *
 * One `revalidatePath` where there were two: `/packages` and `/money` were
 * separate routes and are now two tabs of one, so `'/business', 'layout'` covers
 * both the month segment and every tab under it.
 */
function refresh(): void {
  revalidatePath('/business', 'layout');
  revalidatePath('/today');
}

/** Add a price. `orderIndex` puts it at the end of the list it joins. */
export async function addPack(
  input: PackWrite & { owner: 'trainer' | 'gym'; orderIndex: number },
): Promise<PackResult> {
  if (!(input.amount > 0)) {
    return { ok: false, message: 'A pack needs a price.' };
  }
  if (input.type === 'session_pack' && !(input.sessions && input.sessions > 0)) {
    return { ok: false, message: 'How many sessions is in this pack?' };
  }
  try {
    await postPack(input);
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error, 'That pack');
  }
}

/**
 * Change a price.
 *
 * **This never touches a pack somebody already bought.** `package.amount` is
 * what that client owes and is already net of any discount; editing the list
 * price re-quotes nobody. The copy on the form says so, and it is true because
 * the two rows are different tables.
 */
export async function savePack(packId: string, input: PackWrite): Promise<PackResult> {
  if (!(input.amount > 0)) {
    return { ok: false, message: 'A pack needs a price.' };
  }
  if (input.type === 'session_pack' && !(input.sessions && input.sessions > 0)) {
    return { ok: false, message: 'How many sessions is in this pack?' };
  }
  try {
    await patchPack(packId, input);
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error, 'That change');
  }
}

/**
 * Retire a price, or bring it back.
 *
 * A status, never a delete — and the distinction is the reassurance the
 * confirmation gives: everyone already on it keeps exactly what they bought, it
 * simply stops being offered to anyone new. A delete could not promise that, and
 * `package.pack_id`'s foreign key would refuse it anyway.
 */
export async function setPackStatus(
  packId: string,
  status: 'active' | 'inactive',
): Promise<PackResult> {
  try {
    await patchPack(packId, { status });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error, status === 'inactive' ? 'Retiring that' : 'Bringing that back');
  }
}

/**
 * How you work — which decides which price lists exist.
 *
 * Asked on this screen as well as at setup because this is the screen the answer
 * is *about*, and because `/settings` is not built: without it, a trainer who
 * picked *On my own* at setup and later started at a gym would have no way to
 * reach the second list at all.
 *
 * A gym with no name is refused rather than saved. An unnamed price list belongs
 * to nobody — the group would have nothing to head itself with, and a package
 * added under it could never be attributed.
 */
export async function saveWorkMode(mode: string, gymName: string): Promise<PackResult> {
  const parsed = asWorkMode(mode);
  if (!parsed) return { ok: false, message: 'Pick one — it decides which price lists exist.' };

  const sellsGym = parsed === 'gym' || parsed === 'both';
  const trimmed = gymName.trim();
  if (sellsGym && trimmed.length === 0) {
    return { ok: false, message: 'The gym needs a name before its packages can be attributed to it.' };
  }
  try {
    // "On my own" with a gym on file is the trainer leaving it. An empty string
    // clears the name AND its share percentage together, server-side — which is
    // right: a share of nothing is not zero, it is absent.
    await patchTrainerGym({ workMode: parsed, gymName: sellsGym ? trimmed : '' });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error, 'That change');
  }
}
