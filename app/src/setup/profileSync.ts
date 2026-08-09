/**
 * Getting the finished setup draft to the server — and coping when it can't go.
 *
 * The flow's opening promise is "nothing here needs internet, it all saves on
 * your phone and syncs when you're back on". That makes the upload a background
 * concern, not a gate: finishing setup must land the trainer in the app whether
 * or not the request succeeded, and the push has to survive being retried.
 *
 * So there is no spinner and no error dialog at the end of setup. A failed push
 * sets a flag, and the next launch / foreground / reconnect tries again.
 */

import * as SecureStore from 'expo-secure-store';
import { getTrainer, updateTrainer, type TrainerUpdate } from '../api/trainer';
import { EMPTY_DRAFT, loadDraft, saveDraft, type SetupDraft } from './draft';

/** Set when a push failed and the server is still behind the phone. */
const PENDING_KEY = 'trainx_profile_pending';

/**
 * The whole profile in one PATCH.
 *
 * Empty strings are sent deliberately for the two skippable typed fields: on
 * this endpoint an empty value CLEARS, which is the correct meaning of "I
 * skipped the UPI step" — it must not leave a stale ID from an earlier attempt
 * sitting on the profile.
 */
export function draftToUpdate(draft: SetupDraft): TrainerUpdate {
  return {
    name: draft.name.trim(),
    upiVpa: draft.upiId.trim(),
    experienceBand: draft.experience ?? '',
    specialities: draft.specialities,
    certifications: draft.certifications,
    languages: draft.languages,
    completeSetup: true,
  };
}

/** True if the server now has it. Never throws — the caller is mid-navigation. */
export async function pushProfile(draft: SetupDraft): Promise<boolean> {
  try {
    await updateTrainer(draftToUpdate(draft));
    await SecureStore.deleteItemAsync(PENDING_KEY);
    return true;
  } catch {
    // Includes a 4xx, not just a dead network. A retry that keeps failing is
    // harmless — the profile is on the phone either way — and it beats losing
    // the answers to a one-off server error.
    await SecureStore.setItemAsync(PENDING_KEY, '1');
    return false;
  }
}

export async function hasPendingProfile(): Promise<boolean> {
  return (await SecureStore.getItemAsync(PENDING_KEY)) === '1';
}

/** No-op unless a push is actually owed. Safe to call on every trigger. */
export async function flushPendingProfile(): Promise<boolean> {
  if (!(await hasPendingProfile())) return true;
  return pushProfile(await loadDraft());
}

export async function clearPendingProfile(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_KEY);
  } catch {
    /* already gone */
  }
}

/**
 * Seeds the local draft from the server for a phone that has no copy — a
 * reinstall, or a second device. Without this, a trainer who finished setup
 * last month lands on a deck that doesn't know their name and a completion
 * meter reading 0%.
 *
 * Pull only, and only into a genuinely empty draft: anything already on this
 * phone is either newer than the server or waiting to be pushed to it, and
 * overwriting that would throw away the answers the trainer just gave.
 */
export async function hydrateProfile(): Promise<boolean> {
  if (await hasPendingProfile()) return false;

  const local = await loadDraft();
  if (local.name.trim().length > 0) return false;

  try {
    const { data } = await getTrainer();
    if (!data.setupComplete) return false;
    await saveDraft({
      ...EMPTY_DRAFT,
      // The placeholder the server writes at first verify is the phone number,
      // and pulling that in would put a 10-digit "name" on every invite.
      name: data.name === data.phone ? '' : data.name,
      experience: data.experienceBand ?? null,
      specialities: data.specialities ?? [],
      certifications: data.certifications ?? [],
      languages: data.languages ?? [],
      upiId: data.upiVpa ?? '',
    });
    return true;
  } catch {
    // Offline, or an older backend with no such endpoint. Try again next tick.
    return false;
  }
}
