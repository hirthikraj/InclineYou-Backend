import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';
import type { PlaceHit, StoredGymPlace } from '@/lib/places/types';
import { hoursFromWire, type StoredWindow, type WorkingHourWire } from '@/lib/setup/hours-wire';

/**
 * THE IDENTITY DATA LAYER — `/settings/profile`, and nothing else.
 *
 * `server-only`, like every other `api.ts` here: the JWT is in an httpOnly
 * cookie and never reaches browser JS, so a client component fetching this
 * directly would break the moment it left localhost and the fix would be a
 * backend CORS change.
 *
 * ── WHY THIS IS NOT `lib/setup/api.ts` ──────────────────────────────────────
 *
 * Both PATCH `/v1/trainers/me`, and folding this into that file would have been
 * two fewer modules. It stays separate because `getSetupState` assembles the
 * whole setup flow's state — profile, working week, price list and the skipped
 * steps, four requests — and importing it to reach four columns would make a
 * profile tab pay for a flow it is not in. So this file makes the one request
 * the screen needs, and the two modules share a wire shape rather than a
 * function.
 *
 * ── AND WHY IT CARRIES EVERY FIELD THE PROFILE SHOWS ────────────────────────
 *
 * Setup collects the name, the headline, the experience band, the specialities,
 * the certifications and the languages; the bio and the intro video are only
 * ever asked for here. This screen edits **all of them**, because `AGENTS.md`
 * records the rule this screen is the first to actually implement: *a finished
 * profile is Settings' to edit*, which is why `/setup` redirects a
 * `setupComplete` trainer to `/today`. A Settings screen that could edit two of
 * the eight fields and sent the trainer back to a redirecting flow for the rest
 * would be a dead end wearing a link.
 *
 * One request draws every tab. Each tab uses one slice of it and PATCHes only
 * that slice back — `lib/profile/actions.ts` explains why the write is narrow
 * even though the read is whole.
 */

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

export class ProfileApiError extends Error {
  constructor(
    readonly status: number | null,
    /** The server's own sentence, where it wrote one. */
    readonly detail: string | null = null,
  ) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'ProfileApiError';
  }
}

/** The identity half of `TrainerService.TrainerResponse`. */
export interface Identity {
  name: string;
  /** The trainer's own number. Shown, never edited here — it is the login. */
  phone: string;
  headline: string;
  bio: string;
  introVideoUrl: string;
  /**
   * Derived server-side from `introVideoUrl` — the 11 characters between
   * `watch?v=` and the end. On the wire so this half never re-implements the
   * six YouTube paste shapes `YouTubeLink.java` already reduces.
   */
  introVideoId: string | null;
  /**
   * Catalogue ids from `lib/setup/options.ts`, plus anything the trainer typed
   * carrying a `custom:` prefix. A V8 column, unlike the four above — which has
   * one consequence worth knowing: **the phone reads this back.** Drawer 2a
   * edits the same list over the same endpoint and `mergeProfileIntoDraft`
   * folds the server's copy into the local setup draft, so a certificate added
   * here shows up on the trainer's phone.
   *
   * The same is true of the three below and of nothing else on this screen: the
   * identity four are V33 columns `app/` has never heard of, these four are V8
   * columns it has been editing since setup existed.
   */
  certifications: string[];
  /**
   * One of the five ids in `EXPERIENCE_BANDS`, or `''` for never answered. A
   * band and not a number: nothing changes visibly as you drag a slider, a free
   * field invites `0.5` and `50`, and stored as a band it stays true next year
   * without anybody editing it.
   */
  experienceBand: string;
  /** Catalogue ids plus `custom:` entries, same as certifications. V8, so the
   *  phone reads these back too — drawer 2a edits the same three columns. */
  specialities: string[];
  languages: string[];

  /* ---- where and how. V23, V11 and V34 — see `lib/profile/work.ts`. ---- */

  /**
   * `'independent' | 'gym' | 'both'` — **derived, not stored.**
   *
   * `workMode` is not a field on the v1.1 trainer: the gym on the profile is what
   * the money book keys off, so the answer is read back from it. No gym is
   * `independent`; a gym is `both`, because the wire cannot say whether the
   * trainer also coaches clients of their own — `gym` is a choice this screen
   * holds only until the next load (`saveWorkPlace` hands the saved one back).
   * See `workModeOf`.
   */
  workMode: string;
  /** Free text, and free text on purpose: most gyms in India are not on InclineYou. */
  gymName: string;
  /**
   * The gym as a place on the map, when the trainer picked one from the search —
   * `null` for a typed, unlinked gym. `gymName` stays the display text either
   * way; this is what lets the platform tell two spellings of one gym apart.
   */
  gymPlace: StoredGymPlace | null;
  /** Verbatim, as pasted. The server does not canonicalise it — see V34. */
  mapLink: string;
  /**
   * V34, and NOT derivable from `workMode` in either direction: a trainer on a
   * gym floor may still take home visits. Ids from `TRAINING_MODES`, plus
   * anything `custom:`-prefixed.
   */
  trainingModes: string[];
  /** Free-text localities. There is no catalogue — see V34. */
  serviceAreas: string[];

  /* ---- where to look. V35 — see `lib/profile/social.ts`. ---- */

  /**
   * Canonical `https://www.instagram.com/<handle>`, or `''`.
   *
   * Canonicalised by the server on write, unlike `mapLink` above and like
   * `introVideoUrl`: a profile reduces to a handle the way a video reduces to
   * an id, while a place reduces to nothing. So what a trainer pasted and what
   * is stored are different strings, and the field has to show the second.
   */
  instagramUrl: string;
  /** Canonical channel URL, or `''`. A CHANNEL — `introVideoUrl` is the one video. */
  youtubeUrl: string;
  /**
   * `@handle` out of each, derived server-side — on the wire for the same
   * reason `introVideoId` is. Null for a `/channel/UC…` URL, which genuinely
   * has no handle: an honest null rather than an invented one.
   */
  instagramHandle: string | null;
  youtubeHandle: string | null;
}

export interface IdentityPatch {
  name?: string;
  headline?: string;
  bio?: string;
  introVideoUrl?: string;
  /** Sent whole. An empty array CLEARS the list; omitting the key leaves it. */
  certifications?: string[];
  /** A band id. `''` clears the column; omitting the key leaves it. */
  experienceBand?: string;
  specialities?: string[];
  languages?: string[];
  /**
   * A typed, unlinked gym; `''` clears it. **Send this OR `gymPlace`, never
   * both** — the server answers 400, because a picked place names itself.
   */
  gymName?: string;
  /** A picked place, or `null` to unlink (the name goes with it). Omitted leaves the gym alone. */
  gymPlace?: PlaceHit | null;
  mapLink?: string;
  trainingModes?: string[];
  serviceAreas?: string[];
  /** A profile URL or a bare `@handle`. `''` clears it; omitting leaves it. */
  instagramUrl?: string;
  /** A channel URL or a bare `@handle`. `''` clears it; omitting leaves it. */
  youtubeUrl?: string;
}

interface TrainerWire {
  name: string;
  phone: string | null;
  headline?: string | null;
  bio?: string | null;
  introVideoUrl?: string | null;
  introVideoId?: string | null;
  certifications?: string[] | null;
  experienceBand?: string | null;
  specialities?: string[] | null;
  languages?: string[] | null;
  gymName?: string | null;
  gymPlace?: StoredGymPlace | null;
  mapLink?: string | null;
  trainingModes?: string[] | null;
  serviceAreas?: string[] | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  instagramHandle?: string | null;
  youtubeHandle?: string | null;
}

/**
 * A `working_hours` window, from `GET /v1/working-hours`, in this half's model:
 * weekday 0 = Monday … 6 = Sunday and minutes since midnight. The wire's 1–7 and
 * `"HH:mm"` are converted once, in `hoursFromWire`.
 */
export type StoredHour = StoredWindow;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  // Not tidiness: without a token the backend answers 401 and the screen would
  // report a server problem for what is actually a signed-out browser.
  if (!token) throw new ProfileApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ProfileApiError(null);
  }

  if (!res.ok) {
    let detail: string | null = null;
    try {
      const body = (await res.json()) as { detail?: unknown };
      // Spring prefixes the field name onto the detail ("bio: at most 1200
      // characters"), which is not something to show anyone. Same strip as
      // `lib/setup/api.ts`.
      if (typeof body?.detail === 'string') {
        // Brackets too, for the working week's "days[0].windows[1]: …".
        detail = body.detail.replace(/^[A-Za-z_][\w.]*(\[\d+\][\w.]*)*:\s*/, '').trim() || null;
      }
    } catch {
      // A proxy that stripped the body. The status is all we get.
    }
    throw new ProfileApiError(res.status, detail);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/**
 * The work mode this screen shows, read off the gym. See `Identity.workMode`.
 * Exported for the one caller that has to hand a different answer back.
 */
export function workModeOf(gymName: string | null | undefined): 'independent' | 'both' {
  return gymName ? 'both' : 'independent';
}

/**
 * The wire, as this screen's shape.
 *
 * One function rather than the same object literal at the end of both requests.
 * That was survivable at four fields and stopped being so at seven: a mapper
 * per verb is a list of fields to forget one in, and the field it forgets is
 * the one a PATCH would then show stale until the next reload.
 */
function toIdentity(t: TrainerWire): Identity {
  return {
    // At first verify the backend writes the PHONE NUMBER into `trainer.name`
    // as a placeholder, so a name equal to its phone is an absence, not an
    // answer — and a ten-digit "name" must never reach an invite. The same
    // guard `lib/setup/api.ts` and the phone's `profileSync.ts` both apply.
    name: t.name === t.phone ? '' : t.name,
    phone: t.phone ?? '',
    headline: t.headline ?? '',
    bio: t.bio ?? '',
    introVideoUrl: t.introVideoUrl ?? '',
    introVideoId: t.introVideoId ?? null,
    certifications: t.certifications ?? [],
    experienceBand: t.experienceBand ?? '',
    specialities: t.specialities ?? [],
    languages: t.languages ?? [],
    workMode: workModeOf(t.gymName),
    gymName: t.gymName ?? '',
    gymPlace: t.gymPlace ?? null,
    mapLink: t.mapLink ?? '',
    trainingModes: t.trainingModes ?? [],
    serviceAreas: t.serviceAreas ?? [],
    instagramUrl: t.instagramUrl ?? '',
    youtubeUrl: t.youtubeUrl ?? '',
    instagramHandle: t.instagramHandle ?? null,
    youtubeHandle: t.youtubeHandle ?? null,
  };
}

/**
 * The whole trainer, for whichever profile tab is open.
 *
 * `cache()`d, and that is not a performance nicety — it is what makes the
 * preview card affordable. `/settings/profile/layout.tsx` draws the card on all
 * seven tabs and therefore needs the profile, and the page under it needs the
 * same profile to draw its panel. React's per-render memo means those are one
 * `/v1/trainers/me` and not two; without it, moving the card up into the layout
 * would have doubled every profile page's wire cost to fetch something the page
 * already had in hand.
 *
 * It is a memo for ONE render pass and nothing more: `request` still sends
 * `cache:'no-store'`, so a second navigation reads the server again and a save
 * on one tab is visible on the next.
 */
export const getIdentity = cache(async function getIdentity(): Promise<Identity> {
  return toIdentity(await request<TrainerWire>('/v1/trainers/me'));
});

/**
 * The trainer's working week — `GET /v1/working-hours`.
 *
 * An empty list is the honest answer for a trainer who skipped the hours step,
 * and the route refuses to invent a default week for exactly the reason the
 * panel then does invent one *in the form only*: a suggestion a trainer can see
 * and press Save on is not the same as a week the server claims they work.
 */
export async function getWorkingWeek(): Promise<StoredHour[]> {
  return hoursFromWire((await request<{ items?: WorkingHourWire[] }>('/v1/working-hours'))?.items);
}

export async function patchIdentity(patch: IdentityPatch): Promise<Identity> {
  return toIdentity(
    await request<TrainerWire>('/v1/trainers/me', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  );
}
