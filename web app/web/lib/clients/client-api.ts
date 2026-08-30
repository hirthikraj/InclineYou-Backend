import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';
import { listClientNudges } from '@/lib/nudges/api';
import type { NudgeLogEntry } from '@/lib/nudges/types';

export class ClientDetailApiError extends Error {
  /**
   * `detail` is the server's own sentence, when it wrote one. Every refusal on
   * the package-lifecycle path has a cause a trainer can act on, and a screen
   * that answers a specific 409 with "that did not go through" has discarded it.
   * Null for the reads and for anything that answered without a JSON body.
   */
  constructor(
    readonly status: number | null,
    readonly detail: string | null = null,
    readonly code: string | null = null,
  ) {
    super(`xrep api ${status ?? 'unreachable'}`);
    this.name = 'ClientDetailApiError';
  }
}

const BASE = process.env.XREP_API_URL ?? 'http://localhost:8080';

async function get<T>(path: string): Promise<T> {
  const token = await getToken();
  if (!token) throw new ClientDetailApiError(401);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new ClientDetailApiError(null);
  }
  if (!res.ok) throw new ClientDetailApiError(res.status);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/**
 * The write side. Same error type, same timeout, same `server-only` boundary.
 *
 * `DELETE` answers `204` with no body and `JSON.parse('')` throws, so the empty
 * response is read as `null` rather than parsed — the same guard `get` already
 * carries.
 */
async function send<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T | null> {
  return sendDetailed<T>(method, path, body);
}

/**
 * The same write, keeping the server's own sentence.
 *
 * `PackageRuleException` answers a `ProblemDetail` whose `detail` is written for
 * a trainer — "That pack is already paused", "That pack has no expiry date, so
 * there is nothing to extend" — and a panel that flattens that into "did not go
 * through" has thrown away the only useful part of the response. Same argument
 * `lib/packs/api.ts` already makes for the price list's 400s.
 *
 * `ClientDetailApiError` carries the detail so `send` above can stay the
 * three-line thing the notes path uses.
 */
async function sendDetailed<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T | null> {
  const token = await getToken();
  if (!token) throw new ClientDetailApiError(401);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new ClientDetailApiError(null);
  }
  if (!res.ok) {
    let detail: string | null = null;
    let code: string | null = null;
    try {
      const problem: unknown = await res.json();
      if (problem && typeof problem === 'object') {
        const d = (problem as Record<string, unknown>).detail;
        const c = (problem as Record<string, unknown>).code;
        if (typeof d === 'string') detail = d;
        if (typeof c === 'string') code = c;
      }
    } catch {
      /* a body that is not JSON tells us nothing the status has not */
    }
    throw new ClientDetailApiError(res.status, detail, code);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T | null;
}

/* -------------------------------------------------------- wire shapes ── */

export interface TrainerDetailWire {
  name: string;
  phone: string | null;
  gymName: string | null;
  gymSharePercent: number | null;
  setupComplete: boolean;
}

export interface ClientDetailWire {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  deliveryMode: string | null;
  trainerSplitPercent: number | null;
  weeklySchedule: Array<{ templateDay: number; weekday: number; time: string }> | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

export interface ClientSessionWire {
  id: string;
  clientId: string;
  scheduledAt: number;
  status: string;
  durationMinutes: number | null;
  notes: string | null;
  dayLabel: string | null;
  deliveryMode: string | null;
  programId: string | null;
}

/**
 * A pack this client bought.
 *
 * The fields through `createdAt` are V1's. Everything below them is V30's, and
 * they arrive appended for the reason the schema law gives — an old reader that
 * destructures the ten-field shape keeps working.
 *
 * `amountPaid` and `amountDue` are COMPUTED BY THE SERVER and must not be
 * re-derived here. They used to be, in three components, by summing payments
 * whose `status === 'confirmed'` — while the backend writes `'paid'`, so every
 * paid-up client's file showed ₹0 collected and the full amount outstanding.
 * One figure, computed next to the rows it comes from, cannot disagree with
 * itself about a vocabulary.
 */
export interface ClientPackageWire {
  id: string;
  clientId: string;
  type: string;
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  amount: number | string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: number;
  /* ── V30 ─────────────────────────────────────────────────────────────── */
  /** The price-list entry it was sold from, or null for a free-typed sale. */
  packId?: string | null;
  /** Set while the clock is stopped. Null means running. */
  pausedAt?: number | null;
  /** Days spent paused, all time — how far `endDate` has been pushed out. */
  pausedDays?: number | null;
  /** When it stopped being live. Null while it still is. */
  closedAt?: number | null;
  dueDate?: string | null;
  discountAmount?: number | string | null;
  amountPaid?: number | string | null;
  amountDue?: number | string | null;
}

/** One entry on the price list. `GET /v1/packs`. */
export interface PriceListPackWire {
  id: string;
  name: string;
  type: string;
  sessions: number | null;
  amount: number | string | null;
  validityDays: number | null;
  status: string;
  owner: string;
  orderIndex: number;
  activeClients: number;
}

/**
 * V30 · one thing that happened to a pack — a pause, a resume, an extension.
 *
 * Append-only. `days` is signed: on a resume it is the days the pause cost and
 * gave back, on an extension the goodwill given, and on a pause zero, because an
 * open pause has no length yet.
 */
export interface PackageAdjustmentWire {
  id: string;
  packageId: string;
  kind: string;
  days: number;
  reason: string | null;
  effectiveAt: number;
  createdAt: number;
}

export interface ClientPaymentWire {
  id: string;
  packageId: string;
  amount: number | string;
  status: string;
  method: string | null;
  collectedBy: string | null;
  gymShareAmount: number | string | null;
  createdAt: number;
  paidAt: number | null;
}

export interface ClientProgramWire {
  id: string;
  clientId: string;
  name: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  createdAt: number;
}

export interface ClientWorkoutWire {
  id: string;
  clientId: string;
  sessionDate: string;
  notes: string | null;
  endedAt: number | null;
  createdAt: number;
}

/**
 * V29 · one note the trainer wrote about this client.
 *
 * Free text and a pin, and that is the whole shape. There is no injury field,
 * no condition field and no PAR-Q flag, and there must never be one — the
 * interaction map excludes health data outright under the DPDP Act 2023, and a
 * field that tells a medical note apart from any other note makes this a health
 * record whatever it is called. `V29__client_note.sql` carries the argument.
 */
export interface ClientNoteWire {
  id: string;
  clientId: string;
  body: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ClientBodyMetricWire {
  id: string;
  clientId: string;
  metricType: string;
  value: number;
  unit: string;
  notes: string | null;
  recordedAt: number;
}

/* -------------------------------------------------------- output type ── */

export interface ClientFilePayload {
  client: ClientDetailWire;
  trainerName: string;
  trainerPhone: string | null;
  gymName: string | null;
  gymSharePercent: number | null;
  sessions: ClientSessionWire[];
  packages: ClientPackageWire[];
  /** Every payment against every pack this client has bought. See `getPayments`. */
  payments: ClientPaymentWire[];
  /** The active pack's payments — the subset Overview and the pack card want. */
  activePackagePayments: ClientPaymentWire[];
  /** The trainer's own price list, for *Sell a pack*. Empty if unreachable. */
  priceList: PriceListPackWire[];
  /** The live pack's pause / resume / extend history. See `getAdjustments`. */
  adjustments: PackageAdjustmentWire[];
  programs: ClientProgramWire[];
  workouts: ClientWorkoutWire[];
  bodyMetrics: ClientBodyMetricWire[];
  notes: ClientNoteWire[];
  /**
   * Every nudge sent to this client in the last year, newest first.
   *
   * A YEAR, not the cooldown window: this is the follow-up history the file
   * draws, and "when did I last chase this" is a question whose answer is often
   * months old. The queue's seven-day read is a different call with a different
   * job (`lib/today/api.ts`).
   *
   * Empty rather than absent when the read fails — `listClientNudges` swallows
   * its own error, because six tabs must render without it.
   */
  nudges: NudgeLogEntry[];
}

/* --------------------------------------------------------- fetchers ── */

export const getTrainerDetail = cache(async (): Promise<TrainerDetailWire> =>
  get<TrainerDetailWire>('/v1/trainers/me'),
);

export const getClientDetail = cache(async (clientId: string): Promise<ClientDetailWire> =>
  get<ClientDetailWire>(`/v1/clients/${clientId}`),
);

const getClientSessionsWindowed = cache(async (clientId: string): Promise<ClientSessionWire[]> => {
  const now = Date.now();
  const threeMonthsAgo = now - 90 * 24 * 60 * 60 * 1000;
  const fourWeeksAhead = now + 28 * 24 * 60 * 60 * 1000;
  const rows = await get<ClientSessionWire[]>(
    `/v1/sessions?clientId=${clientId}&from=${threeMonthsAgo}&to=${fourWeeksAhead}`,
  );
  return rows ?? [];
});

const getClientPackages = cache(async (clientId: string): Promise<ClientPackageWire[]> => {
  const rows = await get<ClientPackageWire[]>(`/v1/clients/${clientId}/packages`);
  return rows ?? [];
});

const getPackagePayments = cache(async (packageId: string): Promise<ClientPaymentWire[]> => {
  const rows = await get<ClientPaymentWire[]>(`/v1/packages/${packageId}/payments`);
  return rows ?? [];
});

/**
 * The trainer's own price list, active entries only.
 *
 * Fetched with the client file so *Sell a pack* can offer real prices instead of
 * an empty form. `owner=trainer` narrows it to the trainer's own list rather
 * than the gym's: V19's two lists exist because a trainer at a gym can discount
 * their own packs and neither price nor discount the gym's, and this panel sells
 * — so it offers the list the trainer is allowed to sell from.
 *
 * Swallows a failure to an empty list, the way notes and body metrics do. A
 * backend without `GET /v1/packs` should cost the trainer the pack picker, not
 * the client file — the panel falls back to typing the terms by hand, which is
 * what every sale did before V30.
 */
const getPriceList = cache(async (): Promise<PriceListPackWire[]> => {
  try {
    const rows = await get<PriceListPackWire[]>('/v1/packs?owner=trainer&status=active');
    return rows ?? [];
  } catch {
    return [];
  }
});

/**
 * What has happened to the live pack — its pauses, resumes and extensions.
 *
 * Read for the ACTIVE pack only, and that is a deliberate limit rather than an
 * oversight: the history of a pack that closed in March is not a question
 * anybody opens this file to ask, and fetching it for every past pack would be
 * one request per pack on a screen that already makes one per pack for payments.
 */
const getAdjustments = cache(async (packageId: string): Promise<PackageAdjustmentWire[]> => {
  try {
    const rows = await get<PackageAdjustmentWire[]>(`/v1/packages/${packageId}/adjustments`);
    return rows ?? [];
  } catch {
    return [];
  }
});

const getClientPrograms = cache(async (clientId: string): Promise<ClientProgramWire[]> => {
  const rows = await get<ClientProgramWire[]>(`/v1/programs?clientId=${clientId}`);
  return rows ?? [];
});

const getClientWorkouts = cache(async (clientId: string): Promise<ClientWorkoutWire[]> => {
  const rows = await get<ClientWorkoutWire[]>(`/v1/workouts?clientId=${clientId}`);
  return rows ?? [];
});

/**
 * Every payment against every pack, not just the live one.
 *
 * The Payments tab asks *what has this person paid me, ever* — a question the
 * active pack alone cannot answer, and the one a trainer chasing an old invoice
 * is actually asking. `GET /v1/payments` is trainer-wide with no `clientId`
 * filter, so this is one request per pack: a client has a handful of packs over
 * their life, against the roster-wide read's hundreds of rows, and the deck's
 * "22 requests for one dashboard" objection does not apply to one open file.
 *
 * A pack whose payments fail to load contributes nothing rather than failing the
 * page — a 404 on one old pack should not lose a trainer the client file.
 */
const getPayments = cache(async (packageIds: string[]): Promise<ClientPaymentWire[]> => {
  const rows = await Promise.all(
    packageIds.map((id) => getPackagePayments(id).catch(() => [] as ClientPaymentWire[])),
  );
  return rows.flat();
});

/**
 * The trainer's own notes. V29.
 *
 * Swallows a failure to an empty list on purpose, the way body metrics does: a
 * backend that has not run V29 yet answers 404, and a client file that will not
 * open because the notes route is missing is a worse outcome than a file with an
 * empty notes tab. Every other tab on this screen still has its data.
 */
const getClientNotes = cache(async (clientId: string): Promise<ClientNoteWire[]> => {
  try {
    const rows = await get<ClientNoteWire[]>(`/v1/clients/${clientId}/notes`);
    return rows ?? [];
  } catch {
    return [];
  }
});

const getClientBodyMetrics = cache(async (clientId: string): Promise<ClientBodyMetricWire[]> => {
  try {
    const rows = await get<ClientBodyMetricWire[]>(`/v1/clients/${clientId}/body-metrics`);
    return rows ?? [];
  } catch {
    return [];
  }
});

/** Everything the client file needs. Nine parallel reads, then the payments. */
export async function getClientFilePayload(clientId: string): Promise<ClientFilePayload> {
  const [
    client,
    trainer,
    sessions,
    packages,
    programs,
    workouts,
    bodyMetrics,
    notes,
    priceList,
    nudges,
  ] = await Promise.all([
    getClientDetail(clientId),
    getTrainerDetail(),
    getClientSessionsWindowed(clientId),
    getClientPackages(clientId),
    getClientPrograms(clientId),
    getClientWorkouts(clientId),
    getClientBodyMetrics(clientId),
    getClientNotes(clientId),
    getPriceList(),
    listClientNudges(clientId),
  ]);

  /* Sequential because the pack ids come out of the read above. */
  const activePackage = packages.find((p) => p.status === 'active');
  const [payments, adjustments] = await Promise.all([
    getPayments(packages.map((p) => p.id)),
    activePackage ? getAdjustments(activePackage.id) : Promise.resolve([]),
  ]);
  const activePackagePayments = activePackage
    ? payments.filter((p) => p.packageId === activePackage.id)
    : [];

  return {
    client,
    trainerName: trainer.name,
    trainerPhone: trainer.phone,
    gymName: trainer.gymName,
    gymSharePercent: trainer.gymSharePercent,
    sessions,
    packages,
    payments,
    activePackagePayments,
    priceList,
    adjustments,
    programs,
    workouts,
    bodyMetrics,
    notes,
    nudges,
  };
}

/* ----------------------------------------------------------- note writes ── */

export const createNote = (clientId: string, body: string, pinned: boolean) =>
  send<ClientNoteWire>('POST', `/v1/clients/${clientId}/notes`, { body, pinned });

/**
 * Both fields are optional and absent means UNCHANGED, which is the contract
 * `PUT /v1/clients/{id}/notes/{noteId}` states. So the pin toggle sends only
 * `pinned` and the editor sends only `body`, and neither clobbers the other.
 */
export const editNote = (
  clientId: string,
  noteId: string,
  patch: { body?: string; pinned?: boolean },
) => send<ClientNoteWire>('PUT', `/v1/clients/${clientId}/notes/${noteId}`, patch);

export const removeNote = (clientId: string, noteId: string) =>
  send<null>('DELETE', `/v1/clients/${clientId}/notes/${noteId}`);

/* ------------------------------------------------- package lifecycle writes ── */

/**
 * THE FIVE WRITES A PACKAGE'S LIFE IS MADE OF.
 *
 * All POSTs, and none of them a PATCH, because every one is an EVENT rather than
 * a field edit: each writes a `package_adjustment` row alongside whatever it
 * changes, and each has a precondition the others do not. `PackageController`
 * carries the full argument, including why there is deliberately no general
 * `PATCH /v1/packages/{id}` that could set a session count directly.
 */

/** Sell a pack. With `packId`, the price list fills in everything left blank. */
export const sellPackage = (
  clientId: string,
  input: {
    packId?: string | null;
    type?: string;
    sessionsTotal?: number | null;
    amount?: number;
    startDate?: string | null;
    endDate?: string | null;
    discountAmount?: number | null;
    dueDate?: string | null;
  },
) => send<ClientPackageWire>('POST', `/v1/clients/${clientId}/packages`, input);

/**
 * Repeat a pack that has run out. An empty body is a complete request — same
 * type, same price, same count, same validity window, starting where the old one
 * stopped. The overrides exist for the sale where something genuinely changed.
 */
export const renewPackage = (
  packageId: string,
  input: {
    packId?: string | null;
    sessionsTotal?: number | null;
    amount?: number;
    discountAmount?: number | null;
    startDate?: string | null;
    dueDate?: string | null;
  } = {},
) => send<ClientPackageWire>('POST', `/v1/packages/${packageId}/renew`, input);

/** Stop the clock. `effectiveAt` backdates it to the day the client actually left. */
export const pausePackage = (
  packageId: string,
  input: { reason?: string | null; effectiveAt?: string | null } = {},
) => send<ClientPackageWire>('POST', `/v1/packages/${packageId}/pause`, input);

/** Start it again, giving back exactly the days the pause cost. */
export const resumePackage = (
  packageId: string,
  input: { reason?: string | null; effectiveAt?: string | null } = {},
) => send<ClientPackageWire>('POST', `/v1/packages/${packageId}/resume`, input);

/** Goodwill, in days. Logged, so it is a fact next time and not a feeling. */
export const extendPackage = (packageId: string, days: number, reason?: string | null) =>
  send<ClientPackageWire>('POST', `/v1/packages/${packageId}/extend`, { days, reason });
