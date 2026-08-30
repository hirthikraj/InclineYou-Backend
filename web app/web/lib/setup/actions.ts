'use server';

import {
  createPack,
  getHours,
  getPacks,
  getSetupState,
  patchProfile,
  retirePack,
  saveWorkingHours,
  SetupApiError,
  type PackInput,
} from './api';
import { type HourWindow, mergeWindows, sameWindows } from './hours';
import { asWorkMode } from './options';
import { clearSkipped, dropSkipped, markSkipped } from './skipped';
import { destinationAfter, isOptional, type SetupStep } from './steps';

/**
 * One action per step, and every one of them writes before it returns a
 * destination.
 *
 * This is the shape the online-only decision forces, and it is better than the
 * phone's for one reason worth naming: **a step that says it saved has saved.**
 * The phone holds eight answers in `expo-secure-store` and PATCHes them in one
 * call at the end, which is correct there — the flow has to work with no signal
 * — but it means the server learns nothing until `finish()`, and a trainer who
 * abandons at step 6 has told the server nothing at all. Here each step is its
 * own committed write, so abandoning at step 6 leaves five answers on the
 * account and the rail reads them back on any device.
 *
 * Every action returns `{ ok, next }` rather than redirecting. The client
 * component owns the navigation because it also owns the message slot: a
 * `redirect()` thrown from in here on success and an error returned on failure
 * would be two different control flows for one button.
 */
export type StepResult =
  | { ok: true; next: string }
  | { ok: false; error: SerializedError };

/**
 * `SetupApiError` crossing the action boundary.
 *
 * A class instance does not survive serialisation, so the three fields
 * `writeMessage` branches on are sent as data and rebuilt on the other side.
 */
export interface SerializedError {
  status: number | null;
  detail: string | null;
}

function failure(error: unknown): { ok: false; error: SerializedError } {
  if (error instanceof SetupApiError) {
    return { ok: false, error: { status: error.status, detail: error.detail } };
  }
  return { ok: false, error: { status: 0, detail: null } };
}

/** Answering a step retires any record that it was skipped. They are exclusive. */
async function answered(step: SetupStep): Promise<void> {
  await clearSkipped(step);
}

/* ───────────────────────────────────────────────────────────── the steps ── */

/**
 * Step 1 — the name, and V33's headline beside it.
 *
 * **Two fields, one write.** They are one screen and one Continue, so sending
 * them as two PATCHes would mean a headline that saved while the name did not,
 * on a step whose entire promise is that it is the one thing we keep.
 *
 * **The headline is optional inside the mandatory step**, which is why it is a
 * separate argument with an empty default rather than a required one: a trainer
 * who types a name and presses Continue has answered step 1. `''` is sent
 * deliberately and clears the column — the correct meaning of emptying the field
 * and saving, and the same rule the list steps follow.
 */
export async function saveName(name: string, headline = ''): Promise<StepResult> {
  const trimmed = name.trim().slice(0, 60);
  // A client cannot accept an invite from a blank name, and the server ignores a
  // blank `name` rather than clearing it — so an empty value here would look
  // like a successful save and change nothing.
  if (trimmed.length === 0) {
    return { ok: false, error: { status: 400, detail: 'Your name is the one thing we can’t skip.' } };
  }
  try {
    // 80 is `TrainerService.MAX_HEADLINE`, and over it the server refuses the
    // WHOLE patch — which on this step would take the name down with it. Cut
    // here so a pasted headline can never cost a trainer their name.
    await patchProfile({ name: trimmed, headline: headline.trim().slice(0, 80) });
    await answered('name');
    return { ok: true, next: destinationAfter('name', await getSetupState()) };
  } catch (error) {
    return failure(error);
  }
}

/** Step 2. A band id, never a number of years. */
export async function saveExperience(band: string): Promise<StepResult> {
  try {
    await patchProfile({ experienceBand: band });
    await answered('experience');
    return { ok: true, next: destinationAfter('experience', await getSetupState()) };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Steps 3, 4 and 5 — the three list answers.
 *
 * One action rather than three: the write is identical and the only difference
 * is which column it lands in, so three copies of it would be three places for
 * the `clearSkipped` call to be forgotten in.
 *
 * An EMPTY list is sent deliberately and clears the column. That is the correct
 * meaning of un-picking every chip and pressing Continue, and it is why the
 * caller must not silently drop an empty array.
 */
export async function saveList(
  step: 'specialities' | 'certifications' | 'languages',
  ids: string[],
): Promise<StepResult> {
  // 25 is `TrainerService.MAX_LIST`; over it the server answers 400 for the
  // whole PATCH. Trimmed here so a paste-happy custom entry cannot lose the
  // other twenty-five answers with it.
  const clean = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean))).slice(0, 25);
  try {
    await patchProfile({ [step]: clean });
    if (clean.length > 0) await answered(step);
    return { ok: true, next: destinationAfter(step, await getSetupState()) };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Step 6. The working week.
 *
 * Written weekday by weekday, and only the days whose answer changed — a trainer
 * who resumes this step and edits nothing writes nothing. Each day is replaced
 * wholesale: its existing rows are named in `deleted` and the new windows are
 * created, which is what `saveWorkingHours` on the phone does and what
 * `pushWorkingHours` on the server is shaped for.
 */
export async function saveHours(days: number[], windows: HourWindow[]): Promise<StepResult> {
  const merged = mergeWindows(windows);
  // No days or no windows is a skip spelled out. Writing an empty week here
  // would close all seven days, which is a different and much louder answer
  // than "I did not answer this" — and `seedDefaultWorkingHours` would then
  // refuse to seed, because it stands down the moment any row exists.
  if (days.length === 0 || merged.length === 0) {
    return {
      ok: false,
      error: { status: 400, detail: 'Pick at least one day and one window, or skip the step.' },
    };
  }

  try {
    const stored = await getHours();
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const before = mergeWindows(stored.filter((h) => h.weekday === weekday));
      const after = days.includes(weekday) ? merged : [];
      if (sameWindows(before, after)) continue;
      await saveWorkingHours(
        weekday,
        after,
        stored.filter((h) => h.weekday === weekday).map((h) => h.id),
      );
    }
    await answered('hours');
    return { ok: true, next: destinationAfter('hours', await getSetupState()) };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Step 7 · how you work. Asked first on that screen, because it decides which
 * price lists exist.
 *
 * A defaults hint, never a gate: who actually collects, and the gym's share, are
 * still decided per client at add-client time. Saved on its own rather than with
 * the packs, because a gym package added before the gym has a name is a price
 * nobody can attribute — the Money screen would have nothing to head the group
 * with.
 */
export async function saveWorkMode(mode: string, gymName: string): Promise<StepResult> {
  const parsed = asWorkMode(mode);
  if (!parsed) {
    return { ok: false, error: { status: 400, detail: 'Pick one — it decides which price lists to set up.' } };
  }
  const sellsGym = parsed === 'gym' || parsed === 'both';
  const trimmed = gymName.trim();
  if (sellsGym && trimmed.length === 0) {
    return {
      ok: false,
      error: { status: 400, detail: 'The gym needs a name before its packages can be attributed to it.' },
    };
  }
  try {
    // "On my own" with a gym on file is the trainer leaving it. An empty string
    // clears the name AND its share percentage together, server-side — which is
    // right: a share of nothing is not zero, it is absent.
    await patchProfile({ workMode: parsed, gymName: sellsGym ? trimmed : '' });
    return { ok: true, next: '' };
  } catch (error) {
    return failure(error);
  }
}

/** Step 7 · one entry on a price list. Written as it is added, not at the end. */
export async function addPack(input: PackInput): Promise<StepResult> {
  if (!(input.amount > 0)) {
    return { ok: false, error: { status: 400, detail: 'A pack needs a price.' } };
  }
  if (input.type !== 'monthly' && !((input.sessions ?? 0) > 0)) {
    return { ok: false, error: { status: 400, detail: 'How many sessions is in this pack?' } };
  }
  try {
    await createPack(input);
    await answered('packs');
    return { ok: true, next: '' };
  } catch (error) {
    return failure(error);
  }
}

/** Takes a price off the list — by status, never by delete. */
export async function removePack(packId: string): Promise<StepResult> {
  try {
    const pack = (await getPacks()).find((p) => p.id === packId);
    if (!pack) return { ok: true, next: '' };
    await retirePack(pack);
    return { ok: true, next: '' };
  } catch (error) {
    return failure(error);
  }
}

/** Step 7 · Continue. Nothing to write that the two actions above have not. */
export async function leavePacks(): Promise<StepResult> {
  try {
    return { ok: true, next: destinationAfter('packs', await getSetupState()) };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Step 8. The UPI ID, and the end of the flow.
 *
 * `completeSetup: true` goes with it, in the same PATCH: the two facts are one
 * event, and a profile stamped complete by a second request that failed would
 * put a trainer on `/setup/done` with the server still asking for setup on the
 * next sign-in.
 */
export async function finishWithUpi(upiId: string): Promise<StepResult> {
  try {
    await patchProfile({ upiVpa: upiId.trim(), completeSetup: true });
    await answered('payment');
    await dropSkipped();
    return { ok: true, next: '/setup/done' };
  } catch (error) {
    return failure(error);
  }
}

/* ────────────────────────────────────────────── skipping, and finishing ── */

/**
 * Passing on a step.
 *
 * Only the four the rail marks optional, and the guard is not defensive: a
 * `Skip` on `languages` would be a control the design deliberately does not
 * draw — that step has no Skip precisely because it is the one field no
 * competitor has.
 */
export async function skipStep(step: SetupStep): Promise<StepResult> {
  if (!isOptional(step)) {
    return { ok: false, error: { status: 400, detail: 'That step cannot be skipped.' } };
  }
  try {
    await markSkipped(step);
    const state = await getSetupState();
    // The last optional step is `payment`, so skipping it ends the flow — and
    // ending the flow means stamping it complete, exactly as the phone's
    // `onSkip` calls `finish()` before navigating to Done.
    if (step === 'payment') return finishSetup('/setup/done');
    return { ok: true, next: destinationAfter(step, state) };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Stamps the flow finished.
 *
 * "Finish the rest later" IS finishing setup — the remainder moves to the
 * completion meter, which is the whole argument of frame 6a. Without the stamp
 * the partial profile would sit here and the server would ask for setup again on
 * every fresh sign-in, which is the one thing the flow must not do to somebody
 * who has already given it their name.
 */
export async function finishSetup(next = '/setup/done'): Promise<StepResult> {
  try {
    await patchProfile({ completeSetup: true });
    await dropSkipped();
    return { ok: true, next };
  } catch (error) {
    return failure(error);
  }
}
