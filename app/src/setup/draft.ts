/**
 * The trainer-setup draft — what has been answered so far, and where that lives
 * between launches.
 *
 * The flow promises "nothing here needs internet, it all saves on your phone",
 * and the resume screen (1b) shows the answers back. Both of those are lies
 * unless the draft survives the app being killed mid-flow, so it is persisted
 * on every change rather than held in memory.
 *
 * Storage is `expo-secure-store`, which is the only key-value store this app
 * already depends on. The draft is a few hundred bytes — well under the ~2KB
 * above which SecureStore starts warning on Android — and it holds a UPI ID,
 * which is not a secret but is not something to leave in plain preferences
 * either.
 */

import * as SecureStore from 'expo-secure-store';

const DRAFT_KEY = 'trainx_setup_draft';

/** Flow order. The step bar, the timeline and `nextStep` all read this one array. */
export const SETUP_STEPS = [
  'name',
  'experience',
  'specialities',
  'certifications',
  'languages',
  'payment',
] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

/** What the timeline calls each step. Shorter than the screen headlines. */
export const STEP_LABELS: Record<SetupStep, string> = {
  name: 'Your name',
  experience: 'Experience',
  specialities: 'Specialities',
  certifications: 'Certifications',
  languages: 'Languages',
  payment: 'Getting paid',
};

/** Only `name` is mandatory — a client can't accept an invite from a blank name. */
export const OPTIONAL_STEPS: SetupStep[] = ['certifications', 'payment'];

export interface SetupDraft {
  name: string;
  /** An `EXPERIENCE_BANDS` id, never a number of years. */
  experience: string | null;
  specialities: string[];
  certifications: string[];
  languages: string[];
  upiId: string;
  /** Steps the trainer explicitly passed on. Distinct from "not reached yet". */
  skipped: SetupStep[];
}

export const EMPTY_DRAFT: SetupDraft = {
  name: '',
  experience: null,
  specialities: [],
  certifications: [],
  languages: [],
  upiId: '',
  skipped: [],
};

/** Has this step been given a real answer? Skipping is not answering. */
export function isAnswered(step: SetupStep, draft: SetupDraft): boolean {
  switch (step) {
    case 'name':
      return draft.name.trim().length > 0;
    case 'experience':
      return draft.experience !== null;
    case 'specialities':
      return draft.specialities.length > 0;
    case 'certifications':
      return draft.certifications.length > 0;
    case 'languages':
      return draft.languages.length > 0;
    case 'payment':
      return draft.upiId.trim().length > 0;
  }
}

/** Answered or deliberately skipped — either way, we're not asking again. */
export function isSettled(step: SetupStep, draft: SetupDraft): boolean {
  return isAnswered(step, draft) || draft.skipped.includes(step);
}

/** The first step still owed, or null when the flow is finished. */
export function nextStep(draft: SetupDraft): SetupStep | null {
  return SETUP_STEPS.find((step) => !isSettled(step, draft)) ?? null;
}

/** True once anything at all has been answered — the resume screen's trigger. */
export function hasProgress(draft: SetupDraft): boolean {
  return SETUP_STEPS.some((step) => isSettled(step, draft));
}

/**
 * Roughly how long the rest will take. The whole flow is "about a minute" over
 * six steps, and every remaining step but `name` and `payment` is a tap.
 * Rounded to ten seconds, because a precise number here would be a fiction.
 */
export function secondsLeft(draft: SetupDraft): number {
  const left = SETUP_STEPS.filter((step) => !isSettled(step, draft)).length;
  return Math.max(10, Math.round((left * 13) / 10) * 10);
}

/* ---------------------------------------------------------------- storage */

export async function loadDraft(): Promise<SetupDraft> {
  try {
    const raw = await SecureStore.getItemAsync(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    // Merged onto the empty draft, so a stored draft written by an older build
    // that lacked a field reads as unanswered rather than undefined.
    return { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<SetupDraft>) };
  } catch {
    // A corrupt or unreadable draft must never block sign-in. Start clean.
    return EMPTY_DRAFT;
  }
}

export async function saveDraft(draft: SetupDraft): Promise<void> {
  try {
    await SecureStore.setItemAsync(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Losing the draft costs a minute of retyping; crashing costs the account.
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(DRAFT_KEY);
  } catch {
    /* already gone */
  }
}
