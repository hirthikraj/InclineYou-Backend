import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';

/**
 * THE MONEY SCREEN'S DATA LAYER.
 *
 * Four requests, all parallel, no sync/pull. Payments, the Pending tab and the
 * GST tab all read from a single unwindowed payments fetch, which is the right
 * tool here: the API.md note on `GET /v1/payments` says "a payment row is one
 * per invoice — a couple of hundred rows for a full book", and the money book is
 * exactly the screen that needs them all. `lib/today/api.ts` fetches them
 * unwindowed for the same reason and names this screen as the one that will want
 * `from`/`to`.
 *
 * Packages are also unwindowed. A package sold in March that still has sessions
 * on it in August is live, and the Packages tab's "On it now" count is wrong
 * without it.
 */

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

export class MoneyApiError extends Error {
  constructor(
    readonly status: number | null,
    /**
     * The server's own sentence, from RFC 7807's `detail`, where it sent one.
     *
     * Every refusal in this module used to become one of four generic lines in
     * `actions.ts` — *"did not go through. Nothing changed."* — and that is the
     * right copy for a 500, because there is nothing true to say. It is the
     * wrong copy for a **409**, where the server knows exactly why and has
     * written it down: *the gym collected this one and raises its own receipt*
     * tells a trainer to stop clicking; *did not go through* tells them to try
     * again.
     *
     * Only read on a refusal, and only used where a caller opts into it. A
     * generic message stays generic — see `fail` in `actions.ts`.
     */
    readonly detail?: string,
  ) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'MoneyApiError';
  }
}

/**
 * The problem body, read off a failed response.
 *
 * Swallows everything: a server that answers a 409 with HTML, or with nothing,
 * must not turn a refusal into a parse crash on the way to being reported.
 */
async function refusal(res: Response): Promise<MoneyApiError> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    const detail = typeof body?.detail === 'string' ? body.detail : undefined;
    return new MoneyApiError(res.status, detail);
  } catch {
    return new MoneyApiError(res.status);
  }
}

async function get<T>(path: string): Promise<T> {
  const token = await getToken();
  if (!token) throw new MoneyApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new MoneyApiError(null);
  }
  if (!res.ok) throw new MoneyApiError(res.status);

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  const token = await getToken();
  if (!token) throw new MoneyApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new MoneyApiError(null);
  }
  if (!res.ok) throw await refusal(res);

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/**
 * `PATCH`, for the two things that happen to a payment AFTER it is written.
 *
 * The book is append-only in the sense that matters — nothing is ever deleted —
 * but a row's STATUS is not part of that promise. A payment recorded `pending`
 * becomes `paid` when the money turns up, and becomes `write_off` when the
 * trainer decides it never will. Both are `PATCH` on the row's own sub-paths
 * (`/confirm`, `/write-off`) rather than a status field on the row, because the
 * server does more than set a word: confirming stamps `paidAt` and the gym's
 * percentage AT THAT INSTANT, which is the whole reason a renegotiation in
 * October cannot move September's split.
 *
 * `POST` above and this differ only in the verb, and they stay two functions
 * rather than one with a `method` argument for the reason `get` is separate:
 * the call sites read as what they do.
 */
export async function patch<T>(path: string, body: unknown): Promise<T> {
  const token = await getToken();
  if (!token) throw new MoneyApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new MoneyApiError(null);
  }
  if (!res.ok) throw await refusal(res);

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/* ---------------------------------------------------------------- wire shapes */

interface TrainerWire {
  id: string;
  name: string;
  phone: string | null;
  gymName: string | null;
  gymSharePercent: number | null;
  setupComplete: boolean;
}

export interface ClientWire {
  id: string;
  name: string;
  status: string;
}

export interface PackageWire {
  id: string;
  clientId: string;
  type: string;
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  amount: number | string | null;
  status: string; // active | completed | expired
  startDate: string | null;
  endDate: string | null;
  createdAt: number;
  updatedAt: number;
  /* ── V30 ─────────────────────────────────────────────────────────────── */
  pausedAt?: number | null;
  amountPaid?: number | string | null;
  amountDue?: number | string | null;
}

export interface PaymentWire {
  id: string;
  clientId: string;
  packageId?: string | null;
  amount: number | string | null;
  method: string | null;
  collectedBy?: string | null; // trainer | gym
  status: string; // pending | paid | confirmed | write_off
  upiReference: string | null;
  paidAt: number | null;
  gymShareAmount: number | string | null;
  /** V11's `payment.note`, finally selected by REST. Free text, never parsed. */
  note?: string | null;
  createdAt: number;
}

/* ----------------------------------------------------------------- coercion */

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function maybeNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ---------------------------------------------------------------- public shapes */

export interface MoneyTrainer {
  id: string;
  name: string;
  gymName: string | null;
  gymSharePercent: number | null;
  setupComplete: boolean;
}

export interface MoneyClient {
  id: string;
  name: string;
  status: string;
}

export interface MoneyPackage {
  id: string;
  clientId: string;
  type: string;
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  amount: number;
  status: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: number;
  updatedAt: number;
  /** V30 · set while the clock is stopped. Null means running. */
  pausedAt: number | null;
  /** V30 · server-computed. See `PackageService.PACKAGE_COLUMNS`. */
  amountPaid: number;
  /** V30 · `amount − paid − writtenOff`, floored at zero. */
  amountDue: number;
}

export interface MoneyPayment {
  id: string;
  clientId: string;
  packageId: string | null;
  amount: number;
  method: string | null;
  collectedBy: string | null;
  status: string;
  upiReference: string | null;
  paidAt: number | null;
  gymShareAmount: number | null;
  /** "He paid the rest in cash on Tuesday." Optional on every method. */
  note: string | null;
  createdAt: number;
}

export interface MoneyData {
  trainer: MoneyTrainer;
  clients: MoneyClient[];
  packages: MoneyPackage[];
  payments: MoneyPayment[];
  now: number;
}

/**
 * All four fetches in parallel. `cache()` so the page and its metadata both call
 * this and pay for it once — same per-request cache as `lib/today/api.ts`.
 */
export const getMoney = cache(async (): Promise<MoneyData> => {
  const now = Date.now();

  const [trainer, clients, packages, payments] = await Promise.all([
    get<TrainerWire>('/v1/trainers/me'),
    get<ClientWire[]>('/v1/clients'),
    get<PackageWire[]>('/v1/packages'),
    get<PaymentWire[]>('/v1/payments'),
  ]);

  return {
    trainer: {
      id: trainer?.id ?? '',
      name: trainer?.name ?? '',
      gymName: trainer?.gymName ?? null,
      gymSharePercent: maybeNum(trainer?.gymSharePercent),
      setupComplete: trainer?.setupComplete !== false,
    },
    clients: (clients ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
    })),
    packages: (packages ?? []).map((p) => ({
      id: p.id,
      clientId: p.clientId,
      type: p.type,
      sessionsTotal: p.sessionsTotal ?? null,
      sessionsRemaining: p.sessionsRemaining ?? null,
      amount: num(p.amount),
      status: p.status,
      startDate: p.startDate ?? null,
      endDate: p.endDate ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      pausedAt: p.pausedAt ?? null,
      amountPaid: num(p.amountPaid),
      /*
       * Falls back to `amount − paid` against a backend that predates V30, so
       * the record panel still finds a pack with money on it. It cannot know
       * about write-offs from here, which the server-side figure does subtract —
       * one more reason the computed field is the one to read.
       */
      amountDue:
        p.amountDue != null ? num(p.amountDue) : Math.max(0, num(p.amount) - num(p.amountPaid)),
    })),
    payments: (payments ?? []).map((p) => ({
      id: p.id,
      clientId: p.clientId,
      packageId: p.packageId ?? null,
      amount: num(p.amount),
      method: p.method ?? null,
      collectedBy: p.collectedBy ?? null,
      status: p.status,
      upiReference: p.upiReference ?? null,
      paidAt: p.paidAt ?? null,
      gymShareAmount: maybeNum(p.gymShareAmount),
      note: p.note ?? null,
      createdAt: p.createdAt,
    })),
    now,
  };
});
