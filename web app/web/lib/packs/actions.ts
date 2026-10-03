'use server';

import { revalidatePath } from 'next/cache';

import type { PlaceHit } from '@/lib/places/types';
import {
  PacksApiError,
  deletePackRow,
  patchPack,
  patchTrainerGym,
  postPack,
  type PackWrite,
} from './api';

/**
 * The price list's writes, on the v1.1 routes. All synchronous, all straight to
 * the server — there is no queue on this half and nothing is held anywhere while
 * a request is in flight.
 *
 * Every one answers with a SENTENCE rather than a status, because a refused write
 * on this screen has a cause a trainer can act on ("You already have a pack called
 * that") and a status code does not. The server's own `detail` wins wherever it
 * wrote one for a 400, because a second opinion about a rule the server owns is
 * how the two ever disagree; the sentences below are only for the CODES, which are
 * the cases where the right words depend on what this screen can offer next.
 */
export interface PackResult {
  ok: boolean;
  message?: string;
  /**
   * The server's code, kept so the screen can offer the next move: `PACK_SOLD`
   * on a delete is the cue to offer *Retire* instead, `GYM_PACK_NEEDS_GYM` the
   * cue to point at the gym field.
   */
  code?: string;
}

const BY_CODE: Record<string, string> = {
  PACK_NAME_TAKEN: 'You already have a pack with that name. Give this one another.',
  PACK_SOLD:
    'Clients have bought this pack, so it cannot be deleted. Retire it instead — everyone on it keeps what they bought.',
  GYM_PACK_NEEDS_GYM: 'A gym pack needs a gym to belong to. Add your gym first, then add the pack.',
  GYM_NEEDS_FLOOR: 'A gym is a place you train on the floor — add “On a gym floor” to how you train, then pick the gym.',
  PACK_OWNER_IMMUTABLE: 'A pack cannot move between your list and the gym’s. Add it again on the right list.',
  PACK_NOT_FOUND: 'That price is no longer on your list.',
};

function fail(error: unknown, subject: string): PackResult {
  if (error instanceof PacksApiError) {
    if (error.status === null) {
      return { ok: false, message: `${subject} could not reach the server. Nothing changed.` };
    }
    if (error.status === 401 || error.status === 403) {
      return { ok: false, message: 'Your session expired. Sign in again.' };
    }
    if (error.code && BY_CODE[error.code]) {
      return { ok: false, message: BY_CODE[error.code], code: error.code };
    }
    if (error.status === 404) return { ok: false, message: BY_CODE.PACK_NOT_FOUND, code: 'PACK_NOT_FOUND' };
    if (error.status === 412) {
      return { ok: false, message: 'That pack changed somewhere else. Reload and try again.', code: 'PRECONDITION_FAILED' };
    }
    // The server's own 400 is a sentence written for this screen.
    if (error.detail) return { ok: false, message: error.detail, code: error.code ?? undefined };
  }
  return { ok: false, message: `${subject} did not go through. Nothing changed.` };
}

/**
 * The price list lives on `/business/packages`; the roster's "pack running low"
 * and Today's queue read the same rows, so a price list moving is worth a refresh
 * of both. `'/business', 'layout'` covers every page under it.
 */
function refresh(): void {
  revalidatePath('/business', 'layout');
  revalidatePath('/today');
}

/**
 * Add a price. `id` is minted when the form opens, so a retried request replays
 * the same create (the server answers 200 with the pack it already made) rather
 * than adding a second.
 */
export async function addPack(
  input: PackWrite & { id: string; owner: 'trainer' | 'gym'; orderIndex?: number },
): Promise<PackResult> {
  if (!(input.amount > 0)) return { ok: false, message: 'A pack needs a price.' };
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
 * price re-quotes nobody — the two rows are different tables.
 */
export async function savePack(packId: string, input: PackWrite): Promise<PackResult> {
  if (!(input.amount > 0)) return { ok: false, message: 'A pack needs a price.' };
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
 * A status, and the reassurance in the confirmation is that everyone already on
 * it keeps exactly what they bought; it simply stops being offered to anyone new.
 */
export async function setPackStatus(packId: string, status: 'active' | 'inactive'): Promise<PackResult> {
  try {
    await patchPack(packId, { status });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error, status === 'inactive' ? 'Retiring that' : 'Bringing that back');
  }
}

/**
 * Delete a pack nothing was ever sold from. A pack that was sold answers
 * `PACK_SOLD`, and the screen turns that into an offer to retire it instead —
 * so the refusal is a fork in the road rather than a dead end.
 */
export async function deletePack(packId: string): Promise<PackResult> {
  try {
    await deletePackRow(packId);
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error, 'That delete');
  }
}

/**
 * Swap two packs' places on the list: two `orderIndex` writes. Sent one after the
 * other because a pack cannot be in two places, and a failure of the second is
 * reported as such rather than left half-done silently.
 */
export async function swapPackOrder(
  a: { id: string; orderIndex: number },
  b: { id: string; orderIndex: number },
): Promise<PackResult> {
  try {
    await patchPack(a.id, { orderIndex: b.orderIndex });
  } catch (error) {
    return fail(error, 'That move');
  }
  try {
    await patchPack(b.id, { orderIndex: a.orderIndex });
  } catch (error) {
    refresh();
    return { ok: false, message: 'Only half of that move went through. Reload to see the order as it stands.', code: fail(error, '').code };
  }
  refresh();
  return { ok: true };
}

/**
 * The gym, on the profile — asked on this screen because this is the screen the
 * answer is *about*: a gym's list cannot exist without one (`GYM_PACK_NEEDS_GYM`).
 *
 * A picked place links the gym (and snapshots its name); a typed name is a gym
 * with no place behind it; clearing it sends `gymPlace: null`, which clears the
 * name with it. Choosing a gym adds `gym_floor` to the training modes in the same
 * save — the profile's own rule — so a trainer who never ticked it is not refused
 * for it. Dropping a gym leaves the modes alone.
 */
export async function saveGym(
  gymName: string,
  gymPlace: PlaceHit | null | undefined,
  trainingModes: string[],
): Promise<PackResult> {
  const name = gymName.trim();
  try {
    if (name === '' && gymPlace !== undefined && gymPlace !== null) {
      return { ok: false, message: 'The gym needs a name.' };
    }
    const modes = trainingModes.includes('gym_floor') ? trainingModes : [...trainingModes, 'gym_floor'];
    if (name === '') {
      await patchTrainerGym({ gymPlace: null });
    } else if (gymPlace) {
      await patchTrainerGym({ gymPlace, trainingModes: modes });
    } else {
      await patchTrainerGym({ gymName: name, trainingModes: modes });
    }
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error, 'That change');
  }
}
