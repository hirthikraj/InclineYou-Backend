/**
 * Preferences — the nine notification switches, the appearance choice, the
 * language, the chase window, the reminder tone, and which book the trainer is
 * looking at.
 *
 * ── Where these live, and why it is two places ────────────────────────────
 *
 * **The phone is the source of truth for the UI.** Every read on every settings
 * screen comes from SecureStore, so a trainer flipping a switch in a basement
 * sees it flip and sees it still flipped tomorrow. Nothing here blocks on the
 * network, and nothing here fails because of it.
 *
 * **The server gets a copy anyway**, opportunistically, into
 * `trainer.metadata.prefs`. Not for redundancy: push decisions are made
 * server-side by `PushService`, so a notification switch that only exists on the
 * device it was flipped on is a switch that does nothing. The mirror is
 * best-effort and its failure is swallowed — the local write already succeeded,
 * and the next successful write carries the whole set.
 *
 * The two are reconciled on a fresh install by `hydratePrefs`, which reads the
 * server's copy and fills in only the keys the phone has never had an opinion
 * about. Server-wins would silently undo a switch flipped offline; phone-wins
 * would mean a new phone starts from defaults.
 *
 * ── The floors nobody can turn off ────────────────────────────────────────
 *
 * `QUIET_FROM_HOUR` / `QUIET_TO_HOUR` — notifications are muted 10pm to 7am
 * whatever is set here. A trainer's phone at 11pm is not a work phone. It is a
 * constant and not a preference, and the Notifications screen says so.
 */

import * as SecureStore from 'expo-secure-store';
import { getTrainer, updateTrainer } from '../api/trainer';

const KEY = 'inclineyou_prefs';

/** 10pm. Nothing reaches the phone after this, whatever the switches say. */
export const QUIET_FROM_HOUR = 22;
/** 7am. */
export const QUIET_TO_HOUR = 7;

/* ------------------------------------------------------------------ shapes */

/** Which book. `self` is the trainer's own training, `coaching` is the business. */
export type Mode = 'coaching' | 'self';

/**
 * Self-training (2b) is switched off.
 *
 * Off, not deleted — the same treatment batches got. The sheet, the screen and
 * this preference are all built and correct; what is missing is the decision
 * behind them, which is whether a trainer's own training is a client record of
 * themselves or a separate kind of record entirely. Until that is designed,
 * every way in is hidden, because a mode whose contents are "not built yet" is
 * a door onto an empty room and every trainer who opens it learns the app is
 * unfinished.
 *
 * Flipping this to `true` restores the feature exactly as it was: the drawer
 * row, the mode sheet, the log's "for yourself" path and the `SelfTraining`
 * route are all still wired and still gated on this one constant.
 */
export const SELF_TRAINING_ENABLED = false;

/** `system` follows the phone. The default, and what most people want. */
export type Appearance = 'system' | 'dark' | 'light';

export type Tone = 'polite' | 'firm' | 'own';

/**
 * The nine switches from 5c, grouped as the screen groups them.
 *
 * Each key is a notification the app can decide to send. They are stored flat
 * rather than nested so a single flip is one key in a patch, which is what the
 * server's merge expects.
 */
export interface NotifyPrefs {
  paymentIn: boolean;
  overdue: boolean;
  nextSession: boolean;
  cancelled: boolean;
  tomorrow: boolean;
  personalRecord: boolean;
  goneQuiet: boolean;
  inviteAccepted: boolean;
}

export interface Prefs {
  mode: Mode;
  appearance: Appearance;
  /** An ISO 639-1 code. Also used in nudges, which is why it isn't display-only. */
  language: string;
  /** Days past due before a debt shows in "needs chasing". */
  chaseAfterDays: number;
  tone: Tone;
  /** Whether a UPI QR is attached to every reminder. */
  attachQr: boolean;
  /**
   * The smallest plate in the room, in kg.
   *
   * A per-gym fact rather than a taste: some gyms in Chennai stock 1.25s and
   * some do not go below 2.5, and it is what the load stepper moves by and what
   * the workout log calls "beating the old number by one plate". A 1 kg
   * improvement in a 2.5 kg gym is a typo, not a personal record.
   */
  plateStepKg: number;
  notify: NotifyPrefs;
}

/** What a gym actually has on the rack. */
export const PLATE_STEPS = [1.25, 2.5, 5] as const;

/**
 * The defaults, which are opinions.
 *
 * Six notifications on and three off. InclineYou only pings for things that **need
 * a decision**; everything else waits for the app to be opened, which is why the
 * list is short and why "tomorrow's list" and "client accepted an invite" start
 * off — neither of them needs anything from the trainer at the moment it happens.
 */
export const DEFAULT_PREFS: Prefs = {
  mode: 'coaching',
  appearance: 'system',
  language: 'en',
  chaseAfterDays: 3,
  tone: 'polite',
  attachQr: true,
  // The commonest smallest plate, and the safer default of the two: a gym that
  // stocks 1.25s will see a real record called quiet until somebody says so,
  // which is a better failure than gold handed out for a rounding error.
  plateStepKg: 2.5,
  notify: {
    paymentIn: true,
    overdue: true,
    nextSession: true,
    cancelled: true,
    tomorrow: false,
    personalRecord: true,
    goneQuiet: true,
    inviteAccepted: false,
  },
};

export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'Tamil' },
  { code: 'hi', label: 'Hindi' },
  { code: 'te', label: 'Telugu' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'kn', label: 'Kannada' },
];

export const TONES: { key: Tone; label: string; meta: string }[] = [
  { key: 'polite', label: 'Polite', meta: 'A gentle reminder' },
  { key: 'firm', label: 'Firm', meta: 'Direct, still courteous' },
  { key: 'own', label: 'Your own', meta: 'You write each one' },
];

export const APPEARANCES: { key: Appearance; label: string }[] = [
  { key: 'system', label: 'Follow the phone' },
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
];

/** The nine switches, with the copy the screen shows. Order is the screen's order. */
export const NOTIFY_ROWS: {
  key: keyof NotifyPrefs;
  group: 'Money' | 'Sessions' | 'Clients';
  label: string;
  /** When it fires, on the row rather than in a sub-screen. */
  meta: string;
}[] = [
  { key: 'paymentIn', group: 'Money', label: 'A payment came in', meta: 'Only when you record it elsewhere' },
  { key: 'overdue', group: 'Money', label: "Something's gone overdue", meta: 'Once, at 9am' },
  { key: 'nextSession', group: 'Sessions', label: 'Next session', meta: '15 minutes before' },
  { key: 'cancelled', group: 'Sessions', label: 'A client cancelled', meta: 'Straight away' },
  { key: 'tomorrow', group: 'Sessions', label: "Tomorrow's list", meta: '8pm the night before' },
  { key: 'personalRecord', group: 'Clients', label: 'New personal record', meta: 'Straight away' },
  { key: 'goneQuiet', group: 'Clients', label: 'Gone quiet', meta: 'Batched, once a day' },
  { key: 'inviteAccepted', group: 'Clients', label: 'Client accepted an invite', meta: 'Straight away' },
];

/* ---------------------------------------------------------------- the store
 *
 * A module-level cache with subscribers, not a context. Preferences are read by
 * five screens and the drawer, they change rarely, and the alternative — a
 * provider high in the tree — re-renders every tab when a notification switch
 * moves. `usePrefs` subscribes to this.
 * -------------------------------------------------------------------------- */

let current: Prefs = DEFAULT_PREFS;
let loaded = false;
const listeners = new Set<() => void>();

export function getPrefs(): Prefs {
  return current;
}

export function prefsLoaded(): boolean {
  return loaded;
}

export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce() {
  listeners.forEach((l) => l());
}

/**
 * Reads the phone's copy. Safe to call repeatedly — after the first success it
 * returns what is already in memory.
 */
export async function loadPrefs(): Promise<Prefs> {
  if (loaded) return current;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw) current = merge(DEFAULT_PREFS, JSON.parse(raw) as unknown);
  } catch {
    // A corrupt or unreadable store falls back to the defaults rather than
    // leaving the settings screens with nothing to draw.
  }
  loaded = true;
  announce();
  return current;
}

/**
 * Writes one or more preferences.
 *
 * Local first and synchronously in memory, so the switch that was just tapped is
 * already on when the screen re-renders. The disk write and the server mirror
 * both happen after, and neither is awaited by the caller.
 */
export async function setPrefs(patch: DeepPartial<Prefs>): Promise<void> {
  current = merge(current, patch);
  loaded = true;
  announce();

  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(current));
  } catch {
    // The in-memory value stands for this session. Losing a preference on the
    // next launch is a smaller failure than refusing the tap.
  }

  void mirror(current);
}

/**
 * Sends the whole set to the server, best effort.
 *
 * The whole set rather than the patch: it is under a kilobyte, and a phone that
 * was offline for three switches should not need three successful requests to
 * catch up.
 */
async function mirror(prefs: Prefs): Promise<void> {
  try {
    await updateTrainer({ preferences: flatten(prefs) });
  } catch {
    // Offline, or a server older than this build. Neither is worth telling the
    // trainer about — the setting took effect on the phone, which is where they
    // just looked.
  }
}

/**
 * Fills in from the server's copy on a phone that has never had one.
 *
 * Only the keys the phone has no opinion about. Server-wins would undo a switch
 * flipped offline before the mirror got through, and that is exactly the switch
 * the trainer will remember flipping.
 */
export async function hydratePrefs(): Promise<void> {
  await loadPrefs();
  let stored: string | null = null;
  try {
    stored = await SecureStore.getItemAsync(KEY);
  } catch {
    return;
  }
  // The phone already has its own answers. Leave them alone.
  if (stored) return;

  try {
    const { data } = await getTrainer();
    const remote = (data as { preferences?: Record<string, unknown> }).preferences;
    if (!remote || typeof remote !== 'object') return;
    current = merge(current, unflatten(remote));
    announce();
    await SecureStore.setItemAsync(KEY, JSON.stringify(current));
  } catch {
    // Nothing to hydrate from. The defaults are already in place.
  }
}

/** Called on sign-out, so the next trainer on this device starts from the defaults. */
export async function resetPrefs(): Promise<void> {
  current = DEFAULT_PREFS;
  loaded = false;
  announce();
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* Nothing to delete. */
  }
}

/* ------------------------------------------------------------------ shaping */

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };

/**
 * Merges a patch over a base, one level into `notify`.
 *
 * Hand-written rather than a generic deep merge because the shape is known and
 * fixed, and because a generic merge over untrusted JSON is how a string ends up
 * where a boolean belongs. Every field is checked for its own type; anything of
 * the wrong type is ignored rather than coerced.
 */
function merge(base: Prefs, patch: unknown): Prefs {
  if (!patch || typeof patch !== 'object') return base;
  const p = patch as DeepPartial<Prefs>;

  const notify = { ...base.notify };
  if (p.notify && typeof p.notify === 'object') {
    (Object.keys(base.notify) as (keyof NotifyPrefs)[]).forEach((key) => {
      const value = (p.notify as Partial<NotifyPrefs>)[key];
      if (typeof value === 'boolean') notify[key] = value;
    });
  }

  return {
    // Coerced rather than merged while the feature is off. A phone that had
    // already switched to self before this build would otherwise come back in a
    // mode with no sheet to leave it by — stranded in the one place the app no
    // longer has a door out of.
    mode: !SELF_TRAINING_ENABLED
      ? 'coaching'
      : p.mode === 'coaching' || p.mode === 'self'
        ? p.mode
        : base.mode,
    appearance:
      p.appearance === 'system' || p.appearance === 'dark' || p.appearance === 'light'
        ? p.appearance
        : base.appearance,
    language: typeof p.language === 'string' && p.language.trim() ? p.language : base.language,
    chaseAfterDays:
      typeof p.chaseAfterDays === 'number' && p.chaseAfterDays >= 0 && p.chaseAfterDays <= 90
        ? Math.round(p.chaseAfterDays)
        : base.chaseAfterDays,
    tone:
      p.tone === 'polite' || p.tone === 'firm' || p.tone === 'own' ? p.tone : base.tone,
    attachQr: typeof p.attachQr === 'boolean' ? p.attachQr : base.attachQr,
    plateStepKg:
      typeof p.plateStepKg === 'number' && p.plateStepKg > 0 && p.plateStepKg <= 25
        ? p.plateStepKg
        : base.plateStepKg,
    notify,
  };
}

/**
 * Flattens for the wire: `notify.overdue` becomes `notify_overdue`.
 *
 * The server merges preferences key by key, so a nested object would be replaced
 * wholesale — flipping one notification switch would blank the other seven.
 * Flat keys are what make the merge granular.
 */
function flatten(prefs: Prefs): Record<string, unknown> {
  const out: Record<string, unknown> = {
    mode: prefs.mode,
    appearance: prefs.appearance,
    language: prefs.language,
    chaseAfterDays: prefs.chaseAfterDays,
    tone: prefs.tone,
    attachQr: prefs.attachQr,
    plateStepKg: prefs.plateStepKg,
  };
  (Object.keys(prefs.notify) as (keyof NotifyPrefs)[]).forEach((key) => {
    out[`notify_${key}`] = prefs.notify[key];
  });
  return out;
}

function unflatten(raw: Record<string, unknown>): DeepPartial<Prefs> {
  const notify: Partial<NotifyPrefs> = {};
  (Object.keys(DEFAULT_PREFS.notify) as (keyof NotifyPrefs)[]).forEach((key) => {
    const value = raw[`notify_${key}`];
    if (typeof value === 'boolean') notify[key] = value;
  });

  return {
    mode: raw.mode as Mode,
    appearance: raw.appearance as Appearance,
    language: typeof raw.language === 'string' ? raw.language : undefined,
    chaseAfterDays: typeof raw.chaseAfterDays === 'number' ? raw.chaseAfterDays : undefined,
    tone: raw.tone as Tone,
    attachQr: typeof raw.attachQr === 'boolean' ? raw.attachQr : undefined,
    plateStepKg: typeof raw.plateStepKg === 'number' ? raw.plateStepKg : undefined,
    notify,
  };
}

/** How many of the nine are on. The Settings row shows this as "6 on". */
export function notifyOnCount(prefs: Prefs): number {
  return Object.values(prefs.notify).filter(Boolean).length;
}

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code.toUpperCase();
}
