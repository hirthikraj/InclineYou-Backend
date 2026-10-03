import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';
/* Thrown here, rebuilt in the browser — which is why it is its own module and
   not one behind `server-only`. See `lib/setup/errors.ts`. */
import { SetupApiError } from './errors';
import { type HourWindow } from './hours';
import { daysToWire, hoursFromWire, type StoredWindow, type WorkingHourWire } from './hours-wire';
import { asGender } from './options';
import type { Pack, PackType } from './money';
import { termsFromType, typeFromTerms } from '@/lib/packs/vocab';
import type { SetupState, SetupStep } from './steps';
import { readSkipped } from './skipped';

/**
 * The authenticated half of the backend, reached from the Next server and never
 * from the browser — the same posture as `lib/auth/api.ts`, and for the same
 * two reasons: the backend has no CORS configuration and needs none, and the
 * JWT is in an httpOnly cookie that browser JavaScript cannot read.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ONE FAMILY OF REST ROUTES, NO SYNC ENVELOPE
 *
 * Six of the eight setup answers are columns on `/v1/trainers/me`, and they
 * PATCH there one step at a time. Step 1 sends TWO of those columns — `name`
 * and V33's `headline` — because they are one screen and one save; the other
 * two identity fields (`bio`, `introVideoUrl`) are not in this flow at all and
 * live on Settings. See `lib/profile/api.ts`.
 *
 * The working week is `GET` / `PATCH /v1/working-hours` and the price list is
 * `GET/POST/PATCH/DELETE /v1/packs`; finishing is its own call,
 * `POST /v1/trainers/me/setup/complete`, and no longer a flag on the PATCH. This
 * file used to push the first two through the WatermelonDB envelope and read them
 * back out of a full `/v1/sync/pull`, because they had no REST route. They have
 * one now, so there is no envelope here, no `rejected` list to read and — the
 * point of the change — no full pull on a screen a trainer opens on a new account.
 * ───────────────────────────────────────────────────────────────────────────
 */
const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';

/** The wire shape of `TrainerService.TrainerResponse`. */
interface TrainerProfile {
  id: string;
  phone: string;
  name: string;
  upiVpa: string | null;
  experienceBand: string | null;
  specialities: string[] | null;
  certifications: string[] | null;
  languages: string[] | null;
  setupComplete: boolean;
  /** Epoch ms, stamped once by `POST …/setup/complete`. */
  setupCompletedAt: number | null;
  /** The other half of step 1. See `GENDERS` in `options.ts`. */
  gender?: string | null;
  gymName?: string | null;
  trainingModes?: string[] | null;
  preferences?: Record<string, unknown>;
  /* ---- identity, V33. Absent on a backend older than this. ---- */
  headline?: string | null;
  bio?: string | null;
  introVideoUrl?: string | null;
  /** Derived server-side from `introVideoUrl`. Never sent back up. */
  introVideoId?: string | null;
}

/**
 * `TrainerService.UpdateRequest`. Every field is optional and omitting one
 * leaves it alone; an empty string or an empty array is NOT the same as omitting
 * — it CLEARS that field, which is the correct meaning of un-answering a step.
 *
 * One asymmetry the server owns and this must not fight: a blank `name` is
 * ignored rather than clearing, because a nameless trainer cannot send an
 * invite. See `TrainerService.update`.
 */
export interface TrainerUpdate {
  name?: string;
  upiVpa?: string;
  experienceBand?: string;
  specialities?: string[];
  certifications?: string[];
  languages?: string[];
  /**
   * `'woman' | 'man' | 'nonbinary' | 'undisclosed'`. An empty string clears it,
   * the same rule the rest of this interface follows — but nothing in the flow
   * sends one: step 1 refuses to save without a value, and `'undisclosed'` is
   * the way to decline, so clearing is a Settings action rather than a setup one.
   */
  gender?: string;
  /**
   * An empty string means "left the gym". **Send this OR `gymPlace`, never both**
   * — the server refuses the pair with a 400, because a picked gym names itself
   * and the two would disagree about who wins.
   */
  gymName?: string;
  /** A picked place, or `null` to unlink (the name goes with it). Omitted leaves the gym alone. */
  gymPlace?: import('@/lib/places/types').PlaceHit | null;
  /** Sent only with a gym: the server needs `gym_floor` among them. */
  trainingModes?: string[];
  /**
   * V33 identity. Same null/empty rule as the rest — omitting leaves the field
   * alone, `''` clears it — with one difference from the lists above: the server
   * REFUSES an over-long `headline` or `bio` (400) rather than truncating,
   * because a bio is prose and a silently dropped last sentence answering 200 is
   * worse than being told. Both fields are capped in the UI, so a screen never
   * meets it.
   */
  headline?: string;
  bio?: string;
  /** Any YouTube shape; the server stores it canonical. `''` clears. */
  introVideoUrl?: string;
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const token = await getToken();
  // Not an assertion for tidiness: without a token the backend answers 401 and
  // the screen would report a server problem for what is actually a signed-out
  // browser. Every caller here runs behind the layout's token check.
  if (!token) throw new SetupApiError(401, null);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        ...init.headers,
      },
      // A profile mid-setup changes on every step. Nothing here is cacheable.
      cache: 'no-store',
    });
  } catch {
    throw new SetupApiError(null, null);
  }

  if (!res.ok) {
    let detail: string | null = null;
    try {
      const body: unknown = await res.json();
      if (body && typeof body === 'object' && 'detail' in body) {
        const raw = (body as { detail?: unknown }).detail;
        // Spring prefixes the field name onto bean-validation details
        // ("upiVpa: must be…", and for the working week "days[0].windows[1]: …"),
        // which is not something to show anyone.
        if (typeof raw === 'string') detail = raw.replace(/^[A-Za-z_][\w.]*(\[\d+\][\w.]*)*:\s*/, '').trim();
      }
    } catch {
      // A proxy that stripped the body. The status is all we get.
    }
    throw new SetupApiError(res.status, detail || null);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/* ───────────────────────────────────────────────────────── the profile ──── */

/**
 * Deduped per render pass with React's `cache`, so a page and the rail it draws
 * share one request rather than making two.
 */
const fetchProfile = cache(async (): Promise<TrainerProfile> => {
  return call<TrainerProfile>('/v1/trainers/me', { method: 'GET' });
});

/**
 * The training modes on file with `gym_floor` among them — what a save that names
 * a gym must send, because the server refuses a gym without the floor
 * (`GYM_NEEDS_FLOOR`). Read fresh rather than from the per-render memo: this runs
 * inside a write, where a stale list would drop a mode the trainer ticked.
 */
export async function modesWithGymFloor(): Promise<string[]> {
  const profile = await call<TrainerProfile>('/v1/trainers/me', { method: 'GET' });
  const modes = profile.trainingModes ?? [];
  return modes.includes('gym_floor') ? modes : [...modes, 'gym_floor'];
}

export async function patchProfile(patch: TrainerUpdate): Promise<void> {
  await call<TrainerProfile>('/v1/trainers/me', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/**
 * Stamps setup finished — `POST /v1/trainers/me/setup/complete`, no body.
 *
 * Its own call since v1.1 (it was `completeSetup: true` on the PATCH, which is
 * now a 400 for an unknown key). Idempotent: a second call answers the first
 * instant, so a retry after a dropped response cannot move the stamp.
 */
export async function completeSetup(): Promise<void> {
  await call<unknown>('/v1/trainers/me/setup/complete', { method: 'POST', body: '{}' });
}

/* ──────────────────────────────────────────────────── the working week ──── */

/** A stored window, in this half's model — weekday 0–6, minutes. See `hours-wire.ts`. */
export type StoredHour = StoredWindow;

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

/**
 * The working week, from `GET /v1/working-hours`. Deduped per render like the
 * profile, because the page and the rail both ask.
 */
const fetchHours = cache(async (): Promise<StoredHour[]> => {
  const res = await call<{ items?: WorkingHourWire[] }>('/v1/working-hours', { method: 'GET' });
  return hoursFromWire(res?.items);
});

export async function getHours(): Promise<StoredHour[]> {
  return fetchHours();
}

/**
 * Replaces the windows on the listed weekdays — one `PATCH /v1/working-hours`.
 *
 * Each listed day is replaced wholesale and `windows: []` closes it; days not
 * listed are untouched, so the caller sends only the days whose answer changed.
 * It is one transaction server-side with every rule checked before the first
 * write, which makes a refusal (an overlap, a window that runs backwards) leave
 * the whole week as it was — a half-written week is not a state this can reach.
 */
export async function patchWorkingHours(
  changes: { weekday: number; windows: HourWindow[] }[],
): Promise<void> {
  if (changes.length === 0) return;
  await call<unknown>('/v1/working-hours', {
    method: 'PATCH',
    body: JSON.stringify(daysToWire(changes)),
  });
}

/**
 * The price list, from `GET /v1/packs` — the v1.1 route, replacing the sync
 * envelope the backend no longer carries `packs` in. Active only: a retired pack
 * is not on the list a trainer is setting up. Translated to the setup flow's own
 * three-way `type` at the edge (R24); `lib/packs/vocab.ts` holds both directions.
 */
export async function getPacks(): Promise<Pack[]> {
  const res = await call<{ items?: PackWire[] }>('/v1/packs?status=active', { method: 'GET' });
  return (res?.items ?? []).map((p) => ({
    id: p.id,
    name: p.name || 'Pack',
    type: typeFromTerms({ basis: p.basis, sessions: p.sessions }),
    sessions: typeof p.sessions === 'number' ? p.sessions : null,
    amount: num(p.amount),
    validityDays: typeof p.validityDays === 'number' ? p.validityDays : null,
    owner: p.owner === 'gym' ? ('gym' as const) : ('trainer' as const),
    orderIndex: num(p.orderIndex),
  }));
}

interface PackWire {
  id: string;
  name: string;
  basis: 'sessions' | 'period';
  sessions: number | null;
  validityDays: number | null;
  amount: string | number;
  owner: string;
  orderIndex: number;
}

export interface PackInput {
  name: string;
  type: PackType;
  sessions: number | null;
  amount: number;
  validityDays: number | null;
  owner: 'trainer' | 'gym';
  orderIndex: number;
  /** A gym's package only — the trainer's part as a percentage of the price. */
  trainerSharePercent?: number | null;
}

/**
 * `POST /v1/packs`, in the v1 vocabulary. The id is minted here, and `type` is
 * translated to `service` + `basis` at this edge only (R24): the route refuses the
 * old `type` outright. Setup has no *where it is delivered* question, so a pack
 * is in-person; the Packages page asks it.
 */
export async function createPack(input: PackInput): Promise<void> {
  const terms = termsFromType(input.type, input.sessions, input.validityDays);
  await call('/v1/packs', {
    method: 'POST',
    body: JSON.stringify({
      id: crypto.randomUUID(),
      name: input.name,
      ...terms,
      amount: input.amount,
      owner: input.owner,
      orderIndex: input.orderIndex,
      ...(input.owner === 'gym' ? { trainerSharePercent: input.trainerSharePercent ?? null } : {}),
    }),
  });
}

/**
 * Takes a price off the list while setting up. Nothing has been sold yet, so the
 * contract's DELETE (a pack never sold) is the honest verb; a 409 means a package
 * points at it after all, and it is retired by status instead.
 */
export async function retirePack(pack: Pack): Promise<void> {
  try {
    await call(`/v1/packs/${pack.id}`, { method: 'DELETE' });
  } catch (error) {
    if (error instanceof SetupApiError && error.status === 409) {
      await call(`/v1/packs/${pack.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'inactive' }) });
      return;
    }
    throw error;
  }
}

/* ────────────────────────────────────────────────── the assembled state ── */

/**
 * Everything the flow knows, in one object, from two requests.
 *
 * The name guard is the subtle one: at first verify the backend writes the
 * PHONE NUMBER into `trainer.name` as a placeholder, so a profile whose name
 * equals its phone has an unanswered step 1 — and a ten-digit "name" must never
 * reach an invite. `app/src/setup/profileSync.ts` applies the identical guard in
 * both directions; this is the web's half of it.
 */
export async function getSetupState(): Promise<SetupState> {
  const [profile, hours, packs, skipped] = await Promise.all([
    fetchProfile(),
    fetchHours(),
    getPacks(),
    readSkipped(),
  ]);

  return {
    phone: profile.phone,
    name: profile.name === profile.phone ? '' : profile.name,
    experience: profile.experienceBand ?? null,
    headline: profile.headline ?? '',
    gender: asGender(profile.gender),
    specialities: profile.specialities ?? [],
    certifications: profile.certifications ?? [],
    languages: profile.languages ?? [],
    upiId: profile.upiVpa ?? '',
    // `workMode` is not on the v1.1 wire — it was a defaults hint nothing
    // branched on, and the gym on the profile is what the price lists key off. So
    // the step always asks, and `PacksForm` reads a gym on file as "both".
    workMode: null,
    gymName: profile.gymName ?? null,
    hoursCount: hours.length,
    packCount: packs.length,
    skipped,
    setupComplete: profile.setupComplete,
  };
}

/** Re-exported so a step page can widen a `SetupStep` without a second import. */
export type { SetupStep };
export { SetupApiError };
