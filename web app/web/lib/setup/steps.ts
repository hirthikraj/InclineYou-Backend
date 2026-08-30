/**
 * The eight steps, and what counts as having answered one.
 *
 * This is the web's `app/src/setup/draft.ts` — the same flow order, the same
 * labels, the same "only `name` is mandatory" rule — with the one structural
 * difference the two halves cannot share.
 *
 * **There is no draft here.** The phone keeps its answers in
 * `expo-secure-store` and pushes the whole profile once at the end, because the
 * flow's promise there is that it works with no signal. The web is online-only
 * (`AGENTS.md`), so every step writes to the server as it is answered and the
 * profile IS the record of where the trainer got to. Three consequences worth
 * stating, because they change copy on two screens:
 *
 *   · resume is free and exact. Frame 4b's rail reads from `/v1/trainers/me`
 *     rather than from a local blob, so a refresh, a new browser, a different
 *     machine and the trainer's own phone all show the same half-finished flow;
 *   · §16's *two drafts, one flow* does not arise on this half. There is one
 *     record and both halves write to it, so "whichever finishes first wins" —
 *     the rule frame 4b states and nothing enforced — is not needed here;
 *   · the frames' offline promises are dropped. 4a's "it saves on this browser
 *     and syncs when you are back on" and 4b's "your answers live on this
 *     browser, not on the server" are both false on this half, and saying them
 *     would be the same defect `AGENTS.md` records for the dashboard's offline
 *     banner. The copy in `copy.ts` says what is actually true instead.
 */

import type { WorkMode } from './options';

/** Flow order. The rail, `nextStep` and every step page read this one array. */
export const SETUP_STEPS = [
  'name',
  'experience',
  'specialities',
  'certifications',
  'languages',
  // When you work, before what you sell — the physical facts of the week come
  // before the commercial ones, and adding a client later offers their slots
  // from these hours.
  'hours',
  // What you sell, before how you get paid — the price comes before the pipe.
  'packs',
  'payment',
] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

export function isSetupStep(value: string): value is SetupStep {
  return (SETUP_STEPS as readonly string[]).includes(value);
}

/** What the rail calls each step. Shorter than the screen headlines. */
export const STEP_LABELS: Record<SetupStep, string> = {
  name: 'Your name',   // and, optionally, the line under it
  experience: 'Experience',
  specialities: 'Specialities',
  certifications: 'Certifications',
  languages: 'Languages',
  hours: 'When you work',
  packs: 'What you sell',
  payment: 'Getting paid',
};

/**
 * The rail's second line on a step not yet reached — frame 4a.
 *
 * This is the whole argument of the pre-flight screen carried into the rail:
 * the most-named onboarding complaint across every platform in the teardown was
 * not form length, it was SURPRISE. So what a step costs is stated *before* the
 * trainer reaches it, not on arrival.
 */
export const STEP_HINTS: Record<SetupStep, string> = {
  name: "the only answer we can't skip",
  experience: 'one tap',
  specialities: 'up to 5',
  certifications: 'skippable',
  languages: 'nobody else asks',
  hours: 'the week the diary reads',
  packs: 'the price before the pipe',
  payment: 'one typed field',
};

/** Only `name` is mandatory — a client can't accept an invite from a blank name. */
export const OPTIONAL_STEPS: readonly SetupStep[] = [
  'certifications',
  'hours',
  'packs',
  'payment',
];

export function isOptional(step: SetupStep): boolean {
  return OPTIONAL_STEPS.includes(step);
}

/** `/setup/name` … `/setup/payment`. A rail row is a link, so this is its href. */
export function stepHref(step: SetupStep): string {
  return `/setup/${step}`;
}

/**
 * Everything the flow knows, as one object.
 *
 * Assembled from `/v1/trainers/me` plus the two tables that are not on it —
 * `working_hours` and `packs` live only in the sync envelope, so their counts
 * are read from a pull. See `lib/setup/api.ts`.
 */
export interface SetupState {
  /** The trainer's own number, verified. The UPI local part defaults to it. */
  phone: string;
  /**
   * Empty when unanswered — which includes the case where the server holds its
   * own placeholder. At first verify the backend writes the PHONE NUMBER into
   * `trainer.name`, so a name equal to the phone is an absence, not an answer;
   * `api.ts` applies that guard and this field is already past it.
   */
  name: string;
  /**
   * V33. One line under the name — "Strength & fat-loss coach · Indiranagar".
   * It rides on step 1 rather than having a step of its own, and it is
   * **optional inside a mandatory step**: `isAnswered('name')` deliberately
   * ignores it, so a trainer who types only a name has still answered step 1
   * and the flow stays eight steps and about a minute. Empty when unanswered.
   *
   * The other two identity fields — the bio and the intro video — are not in
   * this flow. A 200-word bio inside a flow that promises a minute is the
   * surprise the pre-flight screen exists to prevent, so they are Settings'
   * (`/settings/profile`), which is where a finished profile is edited anyway.
   */
  headline: string;
  experience: string | null;
  specialities: string[];
  certifications: string[];
  languages: string[];
  upiId: string;
  workMode: WorkMode | null;
  gymName: string | null;
  /** How many working-hour windows exist across the week. Count only. */
  hoursCount: number;
  /** How many active packs are on the price list, both lists counted. */
  packCount: number;
  /** Steps the trainer explicitly passed on. Distinct from "not reached yet". */
  skipped: readonly SetupStep[];
  /** The server's own answer to "is setup still owed". */
  setupComplete: boolean;
}

/** Has this step been given a real answer? Skipping is not answering. */
export function isAnswered(step: SetupStep, state: SetupState): boolean {
  switch (step) {
    case 'name':
      return state.name.trim().length > 0;
    case 'experience':
      return state.experience !== null;
    case 'specialities':
      return state.specialities.length > 0;
    case 'certifications':
      return state.certifications.length > 0;
    case 'languages':
      return state.languages.length > 0;
    case 'hours':
      return state.hoursCount > 0;
    case 'packs':
      return state.packCount > 0;
    case 'payment':
      return state.upiId.trim().length > 0;
  }
}

/** Answered or deliberately skipped — either way, we're not asking again. */
export function isSettled(step: SetupStep, state: SetupState): boolean {
  return isAnswered(step, state) || state.skipped.includes(step);
}

/** The first step still owed, or null when the flow is finished. */
export function nextStep(state: SetupState): SetupStep | null {
  return SETUP_STEPS.find((step) => !isSettled(step, state)) ?? null;
}

/** True once anything at all has been answered — frame 4b's trigger. */
export function hasProgress(state: SetupState): boolean {
  return SETUP_STEPS.some((step) => isSettled(step, state));
}

/** The step after this one, or null at the end of the flow. */
export function stepAfter(step: SetupStep): SetupStep | null {
  const i = SETUP_STEPS.indexOf(step);
  return i >= 0 && i < SETUP_STEPS.length - 1 ? SETUP_STEPS[i + 1] : null;
}

/** The step before this one, or null on the first. `Back` and the browser agree. */
export function stepBefore(step: SetupStep): SetupStep | null {
  const i = SETUP_STEPS.indexOf(step);
  return i > 0 ? SETUP_STEPS[i - 1] : null;
}

/**
 * Where `Continue` goes from `step`. The next unsettled step, not simply the
 * next one — a trainer resuming at step 4 who already answered 5 and 6 should
 * land on 7. Nothing in this product asks twice.
 *
 * It inspects only the steps AFTER `step`, which is what makes it safe to call
 * with a state read before the current step's own write landed — and the actions
 * do exactly that, because `getSetupState` is memoised per request.
 */
export function destinationAfter(step: SetupStep, state: SetupState): string {
  const from = SETUP_STEPS.indexOf(step) + 1;
  const owed = SETUP_STEPS.slice(from).find((s) => !isSettled(s, state));
  return owed ? stepHref(owed) : '/setup/done';
}

/**
 * Roughly how long the rest will take, in seconds.
 *
 * The whole flow is "about a minute" over eight steps, and every remaining step
 * but `name` and `payment` is a click. Rounded to ten seconds, because a precise
 * number here would be a fiction. Same arithmetic as the phone's
 * `secondsLeft`, so 4b's subtitle and the phone's resume screen agree.
 */
export function secondsLeft(state: SetupState): number {
  const left = SETUP_STEPS.filter((step) => !isSettled(step, state)).length;
  return Math.max(10, Math.round((left * 13) / 10) * 10);
}

/** How many of the eight are settled — 4b's "three steps done". */
export function settledCount(state: SetupState): number {
  return SETUP_STEPS.filter((step) => isSettled(step, state)).length;
}
