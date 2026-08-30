import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';
import type { PackType } from '@/lib/setup/money';
import { asWorkMode, type WorkMode } from '@/lib/setup/options';
/* The shapes live in `compute.ts`, which is client-safe. This module is
   `server-only`, and a client component that imported a VALUE from it — not a
   type, which is erased — would fail the build. `modeOf` is a value. */
import type { LivePackage, PacksData, PacksTrainer, PriceListPack } from './compute';

/**
 * THE PRICE LIST'S DATA LAYER — `pack`, not `package`.
 *
 * One letter, two different things, and the whole screen turns on it. A **pack**
 * is what the trainer offers (a 12-session block at ₹9,000); a **package** is
 * what one client bought. `lib/money/api.ts` reads the second and the Money
 * book's Packages tab derives fake price points by grouping sold rows — this
 * reads the actual list.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FOUR REQUESTS, AND NOT A `sync/pull`
 *
 * `lib/setup/api.ts` says packs have "no REST endpoint at all" and reaches them
 * through the sync envelope. **That is no longer true** — `GET /v1/packs`,
 * `POST /v1/packs` and `PATCH /v1/packs/{id}` were added for this screen, for
 * the reason that file's own comment gives: the pull is affordable during setup
 * "precisely here and nowhere else", because the account is new and the envelope
 * close to empty. A price list a trainer opens with a year of set logs behind it
 * is the built screen that comment forbids.
 *
 * So: `/v1/trainers/me` for whose lists exist, `/v1/packs` for the lists,
 * `/v1/packages?status=active` and `/v1/clients` for *Ending soon* — the one
 * group on this screen that is about sales rather than prices, and the reason
 * renewing lives here at all: it is a money decision, and this is where the
 * prices are.
 *
 * `activeClients` is NOT computed here. It comes down on each pack because
 * `PackService` counts it in SQL, which is what keeps every sold package off a
 * screen that has no other use for them.
 *
 * The shapes this returns are declared in `compute.ts` rather than here, so the
 * client component can import them without pulling `server-only` into the
 * browser bundle.
 * ───────────────────────────────────────────────────────────────────────────
 */

const BASE = process.env.XREP_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

export class PacksApiError extends Error {
  constructor(readonly status: number | null, readonly detail: string | null = null) {
    super(`xrep api ${status ?? 'unreachable'}`);
    this.name = 'PacksApiError';
  }
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const token = await getToken();
  if (!token) throw new PacksApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        ...init.headers,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PacksApiError(null);
  }

  if (!res.ok) {
    // The 400s this endpoint raises are sentences a trainer can act on — "A pack
    // needs a price." — so the body is read rather than flattened into a status.
    let detail: string | null = null;
    try {
      const body: unknown = await res.json();
      if (body && typeof body === 'object') {
        const d = (body as Record<string, unknown>).detail ?? (body as Record<string, unknown>).message;
        if (typeof d === 'string') detail = d;
      }
    } catch {
      /* a body that is not JSON tells us nothing the status has not */
    }
    throw new PacksApiError(res.status, detail);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/* ---------------------------------------------------------------- wire shapes */

interface TrainerWire {
  id: string;
  name: string;
  workMode?: string | null;
  gymName?: string | null;
  gymSharePercent?: number | null;
  setupComplete: boolean;
}

interface PackWire {
  id: string;
  name: string;
  type: string;
  sessions: number | null;
  amount: number | string | null;
  currency: string | null;
  validityDays: number | null;
  status: string;
  owner: string;
  orderIndex: number;
  activeClients: number;
  createdAt: number;
  updatedAt: number;
}

interface PackageWire {
  id: string;
  clientId: string;
  type: string;
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  amount: number | string | null;
  status: string;
}

interface ClientWire {
  id: string;
  name: string;
  status: string;
}

/* ----------------------------------------------------------------- coercion */

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Unrecognised degrades to the commonest kind rather than failing the read —
 *  a newer build's pack type should cost one label, not the list. The identical
 *  rule in `lib/setup/api.ts`. */
function asPackType(value: string): PackType {
  return value === 'monthly' || value === 'single' ? value : 'session_pack';
}

export const getPacksData = cache(async (): Promise<PacksData> => {
  const now = Date.now();

  const [trainer, packs, live, clients] = await Promise.all([
    call<TrainerWire>('/v1/trainers/me', { method: 'GET' }),
    call<PackWire[]>('/v1/packs', { method: 'GET' }),
    call<PackageWire[]>('/v1/packages?status=active', { method: 'GET' }),
    call<ClientWire[]>('/v1/clients', { method: 'GET' }),
  ]);

  return {
    trainer: {
      name: trainer?.name ?? '',
      workMode: asWorkMode(trainer?.workMode),
      gymName: trainer?.gymName?.trim() ? trainer.gymName.trim() : null,
      gymSharePercent:
        typeof trainer?.gymSharePercent === 'number' ? trainer.gymSharePercent : null,
      setupComplete: trainer?.setupComplete !== false,
    },
    packs: (packs ?? []).map((p) => ({
      id: p.id,
      name: p.name || 'Pack',
      type: asPackType(p.type),
      sessions: typeof p.sessions === 'number' ? p.sessions : null,
      amount: num(p.amount),
      validityDays: typeof p.validityDays === 'number' ? p.validityDays : null,
      status: p.status === 'inactive' ? ('inactive' as const) : ('active' as const),
      // Absent reads as the trainer's own — the server's default and the meaning
      // of every row written before V19.
      owner: p.owner === 'gym' ? ('gym' as const) : ('trainer' as const),
      orderIndex: p.orderIndex ?? 0,
      activeClients: p.activeClients ?? 0,
    })),
    live: (live ?? []).map((p) => ({
      id: p.id,
      clientId: p.clientId,
      sessionsRemaining: p.sessionsRemaining ?? null,
      sessionsTotal: p.sessionsTotal ?? null,
    })),
    clientNames: new Map((clients ?? []).map((c) => [c.id, c.name])),
    now,
  };
});

/* Types only. `modeOf` is NOT re-exported: a value re-exported from a
   `server-only` module still drags this file into the browser bundle, which is
   the build error that put the shapes in `compute.ts` in the first place. */
export type { LivePackage, PacksData, PacksTrainer, PriceListPack };

/* ----------------------------------------------------------------- the writes */

export interface PackWrite {
  name: string;
  type: PackType;
  sessions: number | null;
  amount: number;
  validityDays: number | null;
}

export async function postPack(
  input: PackWrite & { owner: 'trainer' | 'gym'; orderIndex: number },
): Promise<void> {
  await call('/v1/packs', { method: 'POST', body: JSON.stringify(input) });
}

/**
 * PATCH is partial **by key presence**, so `JSON.stringify` doing the obvious
 * thing is load-bearing: `{validityDays: null}` serialises the key and therefore
 * CLEARS the expiry, while a field left off the object is untouched. That is why
 * `savePack` sends the whole form and `setPackStatus` sends one field.
 *
 * `owner` is deliberately never sent: moving a pack between the two lists would
 * re-attribute every package already sold from it, and the gym's prices are not
 * the trainer's to re-badge. The server answers 400 rather than ignoring it.
 */
export async function patchPack(packId: string, patch: Partial<PackWrite> & { status?: string }): Promise<void> {
  await call(`/v1/packs/${packId}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

/** Whose lists exist, and the gym's name to head one with. */
export async function patchTrainerGym(patch: { workMode: WorkMode; gymName: string }): Promise<void> {
  await call('/v1/trainers/me', { method: 'PATCH', body: JSON.stringify(patch) });
}
