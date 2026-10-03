import 'server-only';

import { cache } from 'react';

import { api, ApiError, listAll, type ListEnvelope } from '@/lib/http/client';
import type { PlaceHit } from '@/lib/places/types';
/* The shapes live in `compute.ts`, which is client-safe. This module is
   `server-only`, and a client component that imported a VALUE from it — not a
   type, which is erased — would fail the build. */
import type { LivePackage, PacksData, PacksTrainer, PriceListPack } from './compute';
import type { PackBasis, PackService } from './vocab';

/**
 * THE PRICE LIST'S DATA LAYER — `pack`, not `package`.
 *
 * One letter, two different things, and the whole screen turns on it. A **pack**
 * is what the trainer offers (a 12-session block at ₹9,000); a **package** is
 * what one client bought. This reads the actual list.
 *
 * ── ON THE v1.1 WIRE ─────────────────────────────────────────────────────────
 *
 * `GET /v1/packs?status=all&include=usage` returns every pack with how many
 * clients are on it and how many it has sold, and — on a gym pack — the
 * trainer's share and the gym's derived part. The writes are the three routes the
 * contract names (`POST` · `PATCH` · `DELETE /v1/packs`), each answering a pack
 * row. Four reads in all, in parallel: the profile for the gym, the list, the
 * live packages for *Ending soon*, and the client names to head those rows.
 *
 * `workMode` and `gymSharePercent` are gone from the wire. The first was a
 * defaults hint nothing branched on and the second is per pack now (R3): the
 * trainer's cut varies with the price of the pack, so no trainer-wide percentage
 * can be right.
 *
 * Money arrives as decimal strings and is parsed once, here.
 */

/** A refusal carrying the server's `code` and its sentence, so the action can choose the words. */
export class PacksApiError extends Error {
  constructor(
    readonly status: number | null,
    readonly detail: string | null = null,
    readonly code: string | null = null,
  ) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'PacksApiError';
  }
}

async function call<T>(path: string, options: Parameters<typeof api>[1] = {}): Promise<T> {
  try {
    return await api<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError) {
      throw new PacksApiError(error.status, error.problem.detail ?? null, error.problem.code ?? null);
    }
    throw error;
  }
}

/* ---------------------------------------------------------------- wire shapes */

interface TrainerWire {
  name: string | null;
  gymName: string | null;
  trainingModes: string[] | null;
  setupComplete: boolean;
}

export interface PackWire {
  id: string;
  name: string;
  service: PackService;
  basis: PackBasis;
  sessions: number | null;
  validityDays: number | null;
  amount: string;
  owner: 'trainer' | 'gym';
  trainerSharePercent: number | null;
  trainerShareAmount: string | null;
  gymSharePercent: number | null;
  gymShareAmount: string | null;
  status: string;
  orderIndex: number;
  version: string;
  activeClients?: number;
  soldCount?: number;
}

interface PackageWire {
  id: string;
  clientId: string;
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
}

interface ClientWire {
  id: string;
  name: string | null;
}

/* ----------------------------------------------------------------- coercion */

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function maybeNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** One pack row, parsed. Exported for the writes, which answer the same row. */
export function parsePack(p: PackWire): PriceListPack {
  return {
    id: p.id,
    name: p.name || 'Pack',
    service: p.service,
    basis: p.basis,
    sessions: typeof p.sessions === 'number' ? p.sessions : null,
    amount: num(p.amount),
    validityDays: typeof p.validityDays === 'number' ? p.validityDays : null,
    status: p.status === 'inactive' ? 'inactive' : 'active',
    owner: p.owner === 'gym' ? 'gym' : 'trainer',
    orderIndex: p.orderIndex ?? 0,
    activeClients: p.activeClients ?? 0,
    soldCount: p.soldCount ?? 0,
    trainerSharePercent: maybeNum(p.trainerSharePercent),
    trainerShareAmount: maybeNum(p.trainerShareAmount),
    gymSharePercent: maybeNum(p.gymSharePercent),
    gymShareAmount: maybeNum(p.gymShareAmount),
    version: p.version,
  };
}

export const getPacksData = cache(async (): Promise<PacksData> => {
  const now = Date.now();

  const [trainer, packs, live, clients] = await Promise.all([
    call<TrainerWire>('/v1/trainers/me'),
    listAll<PackWire>('/v1/packs?status=all&include=usage', (p) => call<ListEnvelope<PackWire>>(p)),
    listAll<PackageWire>('/v1/packages?scope=current', (p) => call<ListEnvelope<PackageWire>>(p)),
    listAll<ClientWire>('/v1/clients?view=summary&status=all', (p) => call<ListEnvelope<ClientWire>>(p)),
  ]);

  const me: PacksTrainer = {
    name: trainer?.name ?? '',
    gymName: trainer?.gymName?.trim() ? trainer.gymName.trim() : null,
    trainingModes: trainer?.trainingModes ?? [],
    setupComplete: trainer?.setupComplete !== false,
  };

  return {
    trainer: me,
    packs: packs.map(parsePack),
    live: live.map((p): LivePackage => ({
      id: p.id,
      clientId: p.clientId,
      sessionsRemaining: p.sessionsRemaining ?? null,
      sessionsTotal: p.sessionsTotal ?? null,
    })),
    clientNames: new Map(clients.map((c) => [c.id, c.name ?? 'Unnamed'])),
    now,
  };
});

/* Types only: a value re-exported from a `server-only` module drags this file
   into the browser bundle. */
export type { LivePackage, PacksData, PacksTrainer, PriceListPack };

/* ----------------------------------------------------------------- the writes */

/** The terms of one pack, in the v1 vocabulary. */
export interface PackWrite {
  name: string;
  service: PackService;
  basis: PackBasis;
  sessions: number | null;
  validityDays: number | null;
  amount: number;
  /** A gym pack's share: exactly one of the two is a number, the other null. */
  trainerSharePercent?: number | null;
  trainerShareAmount?: number | null;
}

/**
 * `POST /v1/packs`. The id is minted by the caller when the form OPENS, so a
 * double click or a retried request replays the same create (200) rather than
 * adding a second pack.
 */
export async function postPack(
  input: PackWrite & { id: string; owner: 'trainer' | 'gym'; orderIndex?: number },
): Promise<PriceListPack> {
  return parsePack(await call<PackWire>('/v1/packs', { method: 'POST', body: input }));
}

/**
 * PATCH is partial **by key presence**, so serialising the object as it is is
 * load-bearing: `{validityDays: null}` CLEARS the expiry, while a field left off
 * is untouched. `owner` is never sent — the server answers 400
 * `PACK_OWNER_IMMUTABLE`, because moving a pack between the two lists would
 * re-attribute every package already sold from it.
 */
export async function patchPack(
  packId: string,
  patch: Partial<PackWrite> & { status?: 'active' | 'inactive'; orderIndex?: number },
): Promise<PriceListPack> {
  return parsePack(await call<PackWire>(`/v1/packs/${packId}`, { method: 'PATCH', body: patch }));
}

/** Soft delete, and only for a pack nothing was ever sold from (409 `PACK_SOLD` otherwise). */
export async function deletePackRow(packId: string): Promise<void> {
  await call<null>(`/v1/packs/${packId}`, { method: 'DELETE' });
}

/**
 * The gym on the profile. A gym needs `gym_floor` among the training modes
 * (`trainer_business_gym_needs_floor`), so choosing one adds the mode in the same
 * save rather than refusing a trainer who never ticked it. `gymPlace: null`
 * clears the link AND the name together; `gymName` alone is a typed gym with no
 * place behind it.
 */
export async function patchTrainerGym(patch: {
  gymName?: string;
  gymPlace?: PlaceHit | null;
  trainingModes?: string[];
}): Promise<void> {
  await call<unknown>('/v1/trainers/me', { method: 'PATCH', body: patch });
}
