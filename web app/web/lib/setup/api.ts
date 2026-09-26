import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';
/* Thrown here, rebuilt in the browser — which is why it is its own module and
   not one behind `server-only`. See `lib/setup/errors.ts`. */
import { SetupApiError } from './errors';
import { type HourWindow } from './hours';
import { asGender, asWorkMode } from './options';
import type { Pack, PackType } from './money';
import type { SetupState, SetupStep } from './steps';
import { readSkipped } from './skipped';

/**
 * The authenticated half of the backend, reached from the Next server and never
 * from the browser — the same posture as `lib/auth/api.ts`, and for the same
 * two reasons: the backend has no CORS configuration and needs none, and the
 * JWT is in an httpOnly cookie that browser JavaScript cannot read.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TWO ENDPOINTS, AND WHY THE SECOND ONE IS THE SYNC ROUTE
 *
 * Six of the eight setup answers are columns on `/v1/trainers/me`, and they
 * PATCH there one step at a time. Step 1 sends TWO of those columns — `name`
 * and V33's `headline` — because they are one screen and one save; the other
 * two identity fields (`bio`, `introVideoUrl`) are not in this flow at all and
 * live on Settings. See `lib/profile/api.ts`.
 *
 * The other two — **the working week and the price list** — had no REST endpoint
 * at all when this file was written. `working_hours` and `packs` existed on the
 * wire only inside the WatermelonDB envelope that `/v1/sync/push` accepts and
 * `/v1/sync/pull` returns; `grep`ping the controllers for either table found
 * `SyncController` and nothing else. So the choice on this half was: ask those
 * two questions and write them through the sync route, or drop two steps from a
 * flow the design set draws in full.
 *
 * **`packs` now HAS one** — `GET/POST/PATCH /v1/packs`, added for `/packages`,
 * the built screen that could not pay for a full pull. This file was left on the
 * sync route rather than migrated, and that is a decision and not neglect: it
 * already reads `working_hours` from the same single pull, so moving the packs
 * half would buy a second request and remove nothing. **A new screen should use
 * `lib/packs/api.ts`.** `working_hours` is still sync-only.
 *
 * This file takes the first. The envelope is a WIRE FORMAT, not a commitment to
 * offline-first: there is no local database here, no cursor kept between
 * sessions and no queue — one request per answer, synchronous, and the trainer
 * is told if it fails. `pushWorkingHours` and `pushPacks` in `SyncService` are
 * trainer-scoped (`WHERE trainer_id = :tid`) and idempotent on the row id, which
 * is exactly what a single online write needs.
 *
 * It does mean the reads are a full pull, because there is no narrower one.
 * That is affordable precisely here and nowhere else: setup is only reachable
 * while `setupComplete` is false, so the account is new and the envelope is
 * close to empty. **Do not reach for `pull()` on a built screen** — a dashboard
 * that pulled the whole account on every render is the shape of bug this
 * comment exists to prevent.
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
  setupCompletedAt: string | null;
  /** The other half of step 1. See `GENDERS` in `options.ts`. */
  gender?: string | null;
  workMode?: string | null;
  gymName?: string | null;
  gymSharePercent?: number | null;
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
  /** Stamps `setupCompletedAt`. The server never un-stamps it. */
  completeSetup?: boolean;
  /** 'independent' | 'gym' | 'both'. An empty string clears the answer. */
  workMode?: string;
  /** An empty string means "left the gym" — it clears the percentage too. */
  gymName?: string;
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
        // ("gymSharePercent: must be…"), which is not something to show anyone.
        if (typeof raw === 'string') detail = raw.replace(/^[A-Za-z_][\w.]*:\s*/, '').trim();
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

export async function patchProfile(patch: TrainerUpdate): Promise<void> {
  await call<TrainerProfile>('/v1/trainers/me', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/* ─────────────────────────────────────────── the two sync-only tables ──── */

interface TableChanges {
  created?: Record<string, unknown>[];
  updated?: Record<string, unknown>[];
  deleted?: string[];
}

interface PullResponse {
  timestamp: number;
  changes: Record<string, TableChanges | undefined>;
}

/** A `working_hours` row as the pull returns it — `SELECT *`, so snake_case. */
export interface StoredHour extends HourWindow {
  id: string;
  weekday: number;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function text(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asPackType(value: string): PackType {
  return value === 'monthly' || value === 'single' ? value : 'session_pack';
}

/**
 * The working week and the price list, from one full pull.
 *
 * `lastPulledAt` is deliberately absent rather than 0-and-stored: this is a
 * read, not a cursor. Nothing on this half remembers where the last one got to,
 * because nothing on this half holds rows between requests.
 */
const fetchSyncTables = cache(
  async (): Promise<{ hours: StoredHour[]; packs: Pack[] }> => {
    const res = await call<PullResponse>('/v1/sync/pull', { method: 'GET' });

    const rows = (table: string): Record<string, unknown>[] => {
      const changes = res.changes?.[table];
      return [...(changes?.created ?? []), ...(changes?.updated ?? [])];
    };

    const hours: StoredHour[] = rows('working_hours')
      .map((r) => ({
        id: text(r.id),
        weekday: num(r.weekday, -1),
        startMinute: num(r.start_minute),
        endMinute: num(r.end_minute),
      }))
      .filter((h) => h.id !== '' && h.weekday >= 0 && h.endMinute > h.startMinute);

    const packs: Pack[] = rows('packs')
      // `status` retires a price without deleting it — a pack a package points
      // at can never be deleted, so `inactive` is how the app removes one.
      .filter((r) => text(r.status, 'active') === 'active')
      .map((r) => ({
        id: text(r.id),
        name: text(r.name, 'Pack'),
        // Unrecognised degrades to the commonest kind rather than failing the
        // read: a newer build's pack type should cost one label, not the list.
        type: asPackType(text(r.type, 'session_pack')),
        sessions: typeof r.sessions === 'number' ? r.sessions : null,
        amount: num(r.amount),
        validityDays: typeof r.validity_days === 'number' ? r.validity_days : null,
        // Absent reads as the trainer's own — the same default the server
        // applies, and the pre-V19 rows that predate the gym list.
        owner: text(r.owner, 'trainer') === 'gym' ? ('gym' as const) : ('trainer' as const),
        orderIndex: num(r.order_index),
      }))
      .filter((p) => p.id !== '')
      .sort((a, b) => a.orderIndex - b.orderIndex);

    return { hours, packs };
  },
);

export async function getHours(): Promise<StoredHour[]> {
  return (await fetchSyncTables()).hours;
}

export async function getPacks(): Promise<Pack[]> {
  return (await fetchSyncTables()).packs;
}

/**
 * One push. `rejected` is read rather than ignored: the endpoint answers 200
 * with a per-record refusal list, and a row named there sits nowhere at all —
 * a silent drop is the worst outcome the push protocol has, so it becomes an
 * error the screen can say out loud.
 */
async function push(changes: Record<string, TableChanges>): Promise<void> {
  const res = await call<{ rejected?: { table: string; message?: string }[] }>(
    '/v1/sync/push',
    { method: 'POST', body: JSON.stringify({ changes }) },
  );
  const rejected = res?.rejected ?? [];
  if (rejected.length > 0) {
    throw new SetupApiError(200, rejected[0]?.message ?? 'The server would not take that.');
  }
}

/**
 * Replaces the windows on one weekday.
 *
 * Wholesale, not diffed — a day's hours are one idea, and the phone's
 * `saveWorkingHours` does the same thing for the same reason: diffing two lists
 * of intervals to save one delete is not worth the bug. Ids are client-generated
 * UUID v4 so an insert has a key the server accepts as-is, which is the same
 * contract the phone writes under.
 */
export async function saveWorkingHours(
  weekday: number,
  windows: HourWindow[],
  existingIds: string[],
): Promise<void> {
  const now = Date.now();
  await push({
    working_hours: {
      created: windows.map((w) => ({
        id: crypto.randomUUID(),
        weekday,
        start_minute: w.startMinute,
        end_minute: w.endMinute,
        created_at: now,
        updated_at: now,
      })),
      deleted: existingIds,
    },
  });
}

export interface PackInput {
  name: string;
  type: PackType;
  sessions: number | null;
  amount: number;
  validityDays: number | null;
  owner: 'trainer' | 'gym';
  orderIndex: number;
}

export async function createPack(input: PackInput): Promise<void> {
  const now = Date.now();
  await push({
    packs: {
      created: [
        {
          id: crypto.randomUUID(),
          name: input.name,
          type: input.type,
          sessions: input.sessions,
          amount: input.amount,
          currency: 'INR',
          validity_days: input.validityDays,
          status: 'active',
          owner: input.owner,
          order_index: input.orderIndex,
          created_at: now,
          updated_at: now,
        },
      ],
    },
  });
}

/**
 * Takes a price off the list.
 *
 * `status: 'inactive'`, never a delete — retiring a price must not rewrite what
 * was sold, and the FK from `package.pack_id` would refuse anyway. Sent as an
 * `updated` row because the push is an upsert on the id.
 */
export async function retirePack(pack: Pack): Promise<void> {
  await push({
    packs: {
      updated: [
        {
          id: pack.id,
          name: pack.name,
          type: pack.type,
          sessions: pack.sessions,
          amount: pack.amount,
          currency: 'INR',
          validity_days: pack.validityDays,
          status: 'inactive',
          owner: pack.owner,
          order_index: pack.orderIndex,
          updated_at: Date.now(),
        },
      ],
    },
  });
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
  const [profile, tables, skipped] = await Promise.all([
    fetchProfile(),
    fetchSyncTables(),
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
    workMode: asWorkMode(profile.workMode),
    gymName: profile.gymName ?? null,
    hoursCount: tables.hours.length,
    packCount: tables.packs.length,
    skipped,
    setupComplete: profile.setupComplete,
  };
}

/** Re-exported so a step page can widen a `SetupStep` without a second import. */
export type { SetupStep };
export { SetupApiError };
