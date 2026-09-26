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
import { asGender, asWorkMode } from './options';
import { clearSkipped, dropSkipped, markSkipped } from './skipped';
import { destinationAfter, isAnswered, isOptional, type SetupStep } from './steps';

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
 * Step 1 — the name, the gender, and V33's headline.
 *
 * **Three fields, one write.** They are one screen and one Continue, so sending
 * them as three PATCHes would mean a headline that saved while the name did not,
 * on a step whose entire promise is that it is the one thing we keep.
 *
 * **Two of the three are mandatory and one is not**, which is why the signature
 * reads the way it does. `name` and `gender` are both refused when absent — the
 * flow keeps exactly one step and this is all of it. `headline` is optional
 * inside the mandatory step and keeps its empty default; `''` is sent
 * deliberately and clears the column, the correct meaning of emptying the field
 * and saving, and the same rule the list steps follow.
 *
 * **`gender` is validated against the vocabulary rather than passed through.**
 * The column is filtered on, so an id the catalogue does not contain is a
 * trainer who will never appear in a search and will never be told why.
 */
export async function saveName(
  name: string,
  headline = '',
  gender: string | null = null,
): Promise<StepResult> {
  const trimmed = name.trim().slice(0, 60);
  // A client cannot accept an invite from a blank name, and the server ignores a
  // blank `name` rather than clearing it — so an empty value here would look
  // like a successful save and change nothing.
  if (trimmed.length === 0) {
    return { ok: false, error: { status: 400, detail: 'Your name is the one thing we can’t skip.' } };
  }
  const parsedGender = asGender(gender);
  if (!parsedGender) {
    return {
      ok: false,
      error: { status: 400, detail: 'Pick one — “Prefer not to say” is a real answer.' },
    };
  }
  try {
    // 80 is `TrainerService.MAX_HEADLINE`, and over it the server refuses the
    // WHOLE patch — which on this step would take the name down with it. Cut
    // here so a pasted headline can never cost a trainer their name.
    await patchProfile({
      name: trimmed,
      gender: parsedGender,
      headline: headline.trim().slice(0, 80),
    });
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
 * Seven of the eight now, and the one refusal left is step 1. The guard is not
 * defensive — `isOptional` is the same predicate the rail and the foot read, so
 * a Skip that reached here for `name` would mean a button was drawn that should
 * not have been, and answering 400 is how that gets noticed.
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

/**
 * *Skip to home* — leave the flow from wherever you are and open the app.
 *
 * The same write "Finish the rest later" makes on 4b, from the seven steps
 * instead of from the pre-flight, and it lands on `/today` rather than
 * `/setup/done`: a trainer who pressed *Skip to home* asked for the app, and
 * showing them a completion meter first is answering a different request. The
 * meter is still where they arrive from Continue, and the profile card on
 * `/today` carries the remainder from then on.
 *
 * ── THE GUARD IS THE WHOLE FLOW'S ONE RULE, ENFORCED ONCE ────────────────────
 *
 * `completeSetup` is what stops the server asking for setup again, so this is
 * the only door out of the flow — and a trainer who walked through it without a
 * name would have an account that can never send an invite and would never be
 * asked for one again. Every caller already hides the button until step 1 is
 * answered; this is the copy of that rule that cannot be forgotten at a
 * call-site, and it re-reads the state from the server rather than trusting a
 * prop.
 */
export async function skipToHome(): Promise<StepResult> {
  try {
    if (!isAnswered('name', await getSetupState())) {
      return {
        ok: false,
        error: { status: 400, detail: 'Your name and gender first — everything after that can wait.' },
      };
    }
    return await finishSetup('/today');
  } catch (error) {
    return failure(error);
  }
}

/**
 * *Skip to home* from step 1 itself, where the answer is on the screen rather
 * than on the account yet.
 *
 * One action and not two calls from the browser: a `saveName` followed by a
 * `skipToHome` is two round trips with a window between them where the name has
 * landed and the flow has not been stamped, and a tab closed in that window
 * leaves the trainer being asked for setup again on their next sign-in — which
 * is the one thing this flow must not do to somebody who has already answered.
 */
export async function finishFromName(
  name: string,
  headline = '',
  gender: string | null = null,
): Promise<StepResult> {
  const saved = await saveName(name, headline, gender);
  if (!saved.ok) return saved;
  return finishSetup('/today');
}
