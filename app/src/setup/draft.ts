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

const DRAFT_KEY = 'inclineyou_setup_draft';

/** Flow order. The step bar, the timeline and `nextStep` all read this one array. */
export const SETUP_STEPS = [
  'name',
  'experience',
  'specialities',
  'certifications',
  'languages',
  // When you work, before what you sell — the physical facts of the week come
  // before the commercial ones, and adding a client later offers their slots
  // from these hours. The windows live in the synced `working_hours` table,
  // not in this draft; only the count is here (same deal as packs below).
  'hours',
  // What you sell, before how you get paid — the price comes before the pipe.
  // Packs themselves live in the synced database, not in this draft; only the
  // count is here, so the flow knows whether the step has been answered.
  'packs',
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
  hours: 'When you work',
  packs: 'What you sell',
  payment: 'Getting paid',
};

/** Only `name` is mandatory — a client can't accept an invite from a blank name. */
export const OPTIONAL_STEPS: SetupStep[] = ['certifications', 'hours', 'packs', 'payment'];

export interface SetupDraft {
  name: string;
  /** An `EXPERIENCE_BANDS` id, never a number of years. */
  experience: string | null;
  specialities: string[];
  certifications: string[];
  languages: string[];
  upiId: string;
  /**
   * How many working-hour windows were saved, across the week.
   *
   * The windows themselves are rows in the synced `working_hours` table — the
   * same table the diary and Settings edit. This count exists only so the
   * resume screen and `nextStep` can tell answered from unanswered.
   */
  hoursCount: number;
  /**
   * How many packs are on the price list.
   *
   * The packs themselves are rows in the synced `packs` table — they are real
   * business data, not an onboarding answer, and putting them in SecureStore
   * would mean writing them twice. This count exists only so the resume screen
   * and `nextStep` can tell answered from unanswered.
   */
  packCount: number;
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
  hoursCount: 0,
  packCount: 0,
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
    case 'hours':
      return draft.hoursCount > 0;
    case 'packs':
      return draft.packCount > 0;
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
  // Announced even if the write failed: the draft is what the app now believes,
  // and a meter that disagrees with the screen the trainer just used is worse
  // than one that outlives a failed write.
  listeners.forEach((listener) => listener(draft));
}

type DraftListener = (draft: SetupDraft) => void;
const listeners = new Set<DraftListener>();

/**
 * Fires on every write, and returns its own unsubscribe.
 *
 * The deck's completion meter listens. Without this it re-read the draft on
 * focus only, so a profile reconciled against the server in the background —
 * which is where a certification added on another phone arrives — left the meter
 * a navigation event behind the truth.
 */
export function onDraftChange(listener: DraftListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function clearDraft(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(DRAFT_KEY);
  } catch {
    /* already gone */
  }
}
