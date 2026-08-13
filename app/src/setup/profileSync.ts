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
import {
  getTrainer,
  updateTrainer,
  type TrainerProfile,
  type TrainerUpdate,
} from '../api/trainer';
import { EMPTY_DRAFT, loadDraft, saveDraft, type SetupDraft } from './draft';

/** Set when a push failed and the server is still behind the phone. */
const PENDING_KEY = 'xrep_profile_pending';

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
 * Folds the server's copy of the profile back into the local draft.
 *
 * The completion meter on the deck reads the draft. But **certifications are
 * edited on 2a and the UPI ID on 5b**, and both of those PATCH
 * `/v1/trainers/me` without touching SecureStore — so adding the two things the
 * meter asks for used to leave the meter exactly where it was. A checklist that
 * doesn't tick when you do the thing reads as the app ignoring the answer.
 *
 * Named fields rather than a spread, because the draft carries two things the
 * server has no opinion about — `packCount` and `skipped` — and they have to
 * survive this.
 *
 * Returns the merged draft when something actually changed, so a caller can
 * update its own state without a second read, and null when it didn't.
 */
export async function mergeProfileIntoDraft(
  profile: TrainerProfile,
): Promise<SetupDraft | null> {
  // The phone is ahead of the server in this state, and writing the server's
  // stale copy over the draft would delete answers that haven't gone up yet.
  if (await hasPendingProfile()) return null;

  const local = await loadDraft();
  const next: SetupDraft = {
    ...local,
    // Same guard as `hydrateProfile`: the server's placeholder name is the
    // phone number, and a 10-digit "name" must not end up on invites.
    name: profile.name === profile.phone ? local.name : profile.name,
    experience: profile.experienceBand ?? null,
    specialities: profile.specialities ?? [],
    certifications: profile.certifications ?? [],
    languages: profile.languages ?? [],
    upiId: profile.upiVpa ?? '',
  };

  // Both of these screens re-read on focus, so without this the draft would be
  // rewritten to SecureStore every time the trainer looks at their profile.
  if (JSON.stringify(local) === JSON.stringify(next)) return null;

  await saveDraft(next);
  return next;
}

/**
 * Seeds the local draft from the server for a phone that has no copy — a
 * reinstall, or a second device. Without this, a trainer who finished setup
 * last month lands on a deck that doesn't know their name and a completion
 * meter reading 0%.
 *
 * Pull only, and never over a draft with a push owed: that draft is newer than
 * the server, and overwriting it would throw away the answers the trainer just
 * gave. Where a draft already exists this reconciles it instead of replacing it,
 * so a profile edited on another phone — or on a screen that writes straight to
 * `/v1/trainers/me` — reaches the completion meter without being asked twice.
 */
export async function hydrateProfile(): Promise<boolean> {
  if (await hasPendingProfile()) return false;

  const local = await loadDraft();

  try {
    const { data } = await getTrainer();
    if (local.name.trim().length > 0) return (await mergeProfileIntoDraft(data)) !== null;
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
