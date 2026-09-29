import 'server-only';

import { cache } from 'react';

import { api, ApiError, listAll, type ListEnvelope } from '@/lib/http/client';
import type { NudgeLogEntry } from '@/lib/nudges/types';

/**
 * THE CLIENT FILE'S WIRE — api-contract 1.1 *Client file*.
 *
 * The layout reads the header alone — `GET /v1/clients/{id}` and the client's
 * current packs — and each tab reads its own data (R25). It used to be one
 * payload of about thirteen requests that every tab paid for: every session
 * from three months back to four ahead, every payment of every pack (one request
 * per pack), the price list, the adjustments, the programs, every workout, the
 * notes, the body metrics and a year of nudges.
 */

export class ClientDetailApiError extends Error {
  /**
   * `detail` is the server's own sentence and `code` the branch the UI takes
   * (api-contract *Errors*). Null for the reads and for a body that was not JSON.
   */
  constructor(
    readonly status: number | null,
    readonly detail: string | null = null,
    readonly code: string | null = null,
  ) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'ClientDetailApiError';
  }
}

/** Through the common client (the web header, the dev log), re-thrown as this module's error. */
async function call<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  try {
    return await api<T>(path, options);
  } catch (e) {
    if (e instanceof ApiError) {
      throw new ClientDetailApiError(e.status, e.problem.detail ?? null, e.problem.code ?? null);
    }
    throw e;
  }
}

const get = <T>(path: string) => call<T>(path);
const items = <T>(path: string) => listAll<T>(path, (p) => get<ListEnvelope<T>>(p));
/** A tab's secondary read: an empty list rather than a file that will not open. */
const itemsOr = <T>(path: string) => items<T>(path).catch(() => [] as T[]);

/* -------------------------------------------------------- wire shapes ── */

/** `GET /v1/clients/{id}` — the L3 summary row plus the client's own fields and the pinned notes. */
export interface ClientDetailWire {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  pausedAt: number | null;
  pausedUntil: string | null;
  archivedAt: number | null;
  archiveReason: string | null;
  archiveNote: string | null;
  membershipStatus: string;
  clientType: 'independent' | 'gym';
  hasPinnedNote: boolean;
  schedule: {
    sessionsPerWeek: number | null;
    sessionDurationMinutes: number | null;
    deliveryMode: string | null;
    version: string | null;
  };
  /** Weekday is 1 = Monday … 7 = Sunday, the schema's. */
  slots: {
    id: string;
    weekday: number;
    start: string;
    programDay: number | null;
    durationMinutes: number | null;
    deliveryMode: string | null;
  }[];
  program: { id: string; name: string; weeks: number; days: number; startDate: string | null; endDate: string | null } | null;
  stats: { sessionsDone: number; lastDoneAt: number | null; nextSessionAt: number | null; missedStreak: number };
  createdAt: number;
  /** `client.updated_at` — the If-Match for `PATCH /v1/clients/{id}`. */
  version: string;
  dateOfBirth: string | null;
  heightCm: number | null;
  activityLevel: string | null;
  goal: string | null;
  pinnedNotes: { id: string; body: string; updatedAt: number }[];
}

/** L4 — one diary row. The log sits on the row itself (R28). */
export interface ClientSessionWire {
  id: string;
  clientId: string;
  scheduledAt: number;
  endsAt: number;
  durationMinutes: number;
  status: string;
  deliveryMode: string | null;
  notes: string | null;
  slotId: string | null;
  workout: { id: string; name: string; programId: string | null; week: number | null; day: number | null } | null;
  startedAt: number | null;
  endedAt: number | null;
  log: { exercises: number; setsDone: number; volumeKg: number; lastSetAt: number | null } | null;
  charge: { packageId: string } | null;
  /** The Sessions tab's *Edited on*. */
  updatedAt: number;
  version: string;
}

/**
 * L5 — a pack this client bought. `amountPaid`, `amountRefunded` and
 * `amountDue` are COMPUTED BY THE SERVER and must not be re-derived here: the
 * old file summed payments itself and showed every paid-up client as owing.
 */
export interface ClientPackageWire {
  id: string;
  clientId: string;
  packId: string | null;
  name: string;
  service: 'floor' | 'home_visit' | 'remote' | 'programming' | string;
  basis: 'sessions' | 'period';
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  amount: string;
  discountAmount: string | null;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  status: 'active' | 'completed' | 'expired' | 'cancelled' | 'refunded' | string;
  pausedAt: number | null;
  pausedDays: number;
  trainerSharePercent: string | null;
  trainerShareAmount: string | null;
  amountPaid: string;
  amountRefunded: string;
  amountDue: string;
  closedAt: number | null;
  createdAt: number;
  version: string;
}

/** L7 — one ledger row. `collectedBy` is stamped by the database from the client's type. */
export interface ClientPaymentWire {
  id: string;
  clientId: string;
  packageId: string;
  clientName: string;
  packageName: string;
  amount: string;
  currency: string;
  collectedBy: 'trainer' | 'gym';
  method: 'upi' | 'cash' | 'bank_transfer' | null;
  status: 'pending' | 'paid' | 'write_off' | 'refund' | string;
  reference: string | null;
  note: string | null;
  paidAt: number | null;
  writtenOffAt: number | null;
  refundedAt: number | null;
  /** The instant the row counts on — the ledger's order. */
  bookAt: number;
  split: { gym: string; trainer: string } | null;
  createdAt: number;
  version: string;
}

/** `GET /v1/packs` — one entry on the price list. */
export interface PriceListPackWire {
  id: string;
  name: string;
  service: string;
  basis: 'sessions' | 'period';
  sessions: number | null;
  validityDays: number | null;
  amount: string;
  currency?: string;
  owner: 'trainer' | 'gym';
  status: string;
  orderIndex: number;
  trainerSharePercent?: number | null;
}

/** `GET /v1/packages/{id}/adjustments` — append-only, oldest first. */
export interface PackageAdjustmentWire {
  id: string;
  kind: 'pause' | 'resume' | 'extend' | 'sessions' | 'session' | 'due_date' | string;
  days: number;
  sessions: number;
  sessionId: string | null;
  reason: string | null;
  effectiveAt: number;
  dueDate: string | null;
  previousDueDate: string | null;
  reversedAt: number | null;
  createdAt: number;
}

/** `GET /v1/programs?clientId=` — active first, then past. */
export interface ClientProgramWire {
  id: string;
  name: string;
  goal: string | null;
  weeks: number;
  days: number;
  status: 'active' | 'paused' | 'completed' | string;
  startDate: string | null;
  endDate: string | null;
  copiedFromProgramId: string | null;
  revisedAt: number;
  progress: { sessionsDone: number; sessionsPlanned: number; currentWeek: number | null };
}

/**
 * One note the trainer wrote. Free text and a pin, and that is the whole shape:
 * no injury field, no condition field, no PAR-Q flag, ever — a field that tells
 * a medical note apart makes this a health record under the DPDP Act.
 */
export interface ClientNoteWire {
  id: string;
  body: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  version: string;
}

/** `GET /v1/clients/{id}/readings` — read out of completed assessments, oldest first. */
export interface ClientReadingWire {
  assessmentId: string;
  key: 'weight' | 'body_fat' | 'chest' | 'waist' | 'hip' | 'arm' | string;
  label: string;
  unit: string;
  value: number;
  at: number;
}

/* -------------------------------------------------------- the payload ── */

export interface ClientFileHeader {
  client: ClientDetailWire;
  /** `GET /v1/packages?clientId=&scope=current` — the header's "4 of 12 left · ₹5,000 owed". */
  packages: ClientPackageWire[];
}

/**
 * The header and whatever the open tab read. A tab's lists are empty on every
 * other tab — they were never fetched, and nothing outside the tab reads them.
 */
export interface ClientFilePayload extends ClientFileHeader {
  sessions: ClientSessionWire[];
  /** Every pack the client bought (Payments); the header's current packs elsewhere. */
  history: ClientPackageWire[];
  payments: ClientPaymentWire[];
  priceList: PriceListPackWire[];
  /** The live pack's life — pauses, resumes, extensions, corrections, due-date moves. */
  adjustments: PackageAdjustmentWire[];
  programs: ClientProgramWire[];
  notes: ClientNoteWire[];
  readings: ClientReadingWire[];
  nudges: NudgeLogEntry[];
}

export type ClientTab =
  | 'overview' | 'calendar' | 'progress' | 'assessments' | 'sessions' | 'program' | 'payments' | 'notes';

const DAY_MS = 86_400_000;

/**
 * A `yyyy-MM-dd` in the workspace's calendar. Query parameters carry dates,
 * never instants (Conventions).
 * ponytail: IST, the one workspace timezone v1 ships with; read `/v1/me`'s
 * `workspace.timezone` when a second one exists.
 */
export function dayIso(at: number): string {
  return new Date(at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/* --------------------------------------------------------- the header ── */

export const getClientDetail = cache(async (clientId: string): Promise<ClientDetailWire> =>
  get<ClientDetailWire>(`/v1/clients/${encodeURIComponent(clientId)}`),
);

export const getClientHeader = cache(async (clientId: string): Promise<ClientFileHeader> => {
  const id = encodeURIComponent(clientId);
  const [client, packages] = await Promise.all([
    getClientDetail(clientId),
    items<ClientPackageWire>(`/v1/packages?clientId=${id}&scope=current`),
  ]);
  return { client, packages };
});

/* ------------------------------------------------------- per-tab reads ── */

/** L4 for one client over [from, to), dates in the workspace calendar. */
export function clientSessions(
  clientId: string,
  from: string,
  to: string,
  order: 'asc' | 'desc' = 'asc',
): Promise<ClientSessionWire[]> {
  const id = encodeURIComponent(clientId);
  return items<ClientSessionWire>(`/v1/sessions?clientId=${id}&from=${from}&to=${to}&order=${order}`);
}

/** Every package the client bought, newest first. Bounded, so no cursor. */
export function clientPackages(clientId: string): Promise<ClientPackageWire[]> {
  return items<ClientPackageWire>(`/v1/packages?clientId=${encodeURIComponent(clientId)}`);
}

/** L7 for one client, every status, followed to its last page. */
export function clientPayments(clientId: string, from?: string, limit?: number): Promise<ClientPaymentWire[]> {
  const q = `clientId=${encodeURIComponent(clientId)}${from ? `&from=${from}` : ''}`;
  if (limit) {
    return get<ListEnvelope<ClientPaymentWire>>(`/v1/payments?${q}&limit=${limit}`).then((r) => r?.items ?? []);
  }
  return items<ClientPaymentWire>(`/v1/payments?${q}&limit=200`);
}

export function clientReadings(clientId: string): Promise<ClientReadingWire[]> {
  return itemsOr<ClientReadingWire>(`/v1/clients/${encodeURIComponent(clientId)}/readings`);
}

export function clientPrograms(clientId: string): Promise<ClientProgramWire[]> {
  return itemsOr<ClientProgramWire>(`/v1/programs?clientId=${encodeURIComponent(clientId)}`);
}

export function clientNotes(clientId: string): Promise<ClientNoteWire[]> {
  return items<ClientNoteWire>(`/v1/clients/${encodeURIComponent(clientId)}/notes`);
}

export function packageAdjustments(packageId: string): Promise<PackageAdjustmentWire[]> {
  return itemsOr<PackageAdjustmentWire>(`/v1/packages/${encodeURIComponent(packageId)}/adjustments`);
}

/** The price list the Sell sheet offers — the owner that matches the client's type. */
export function priceList(owner: 'trainer' | 'gym'): Promise<PriceListPackWire[]> {
  return itemsOr<PriceListPackWire>(`/v1/packs?owner=${owner}`);
}

/** L9 for one client, with the message text — a year of it, because "when did I last chase this" is often months old. */
export async function clientNudges(clientId: string, days = 365): Promise<NudgeLogEntry[]> {
  const rows = await itemsOr<{
    id: string; clientId: string; template: string; reason: string; sentAt: number; message?: string | null;
  }>(`/v1/nudges?clientId=${encodeURIComponent(clientId)}&from=${dayIso(Date.now() - days * DAY_MS)}&include=message`);
  return rows.map((n) => ({
    id: n.id,
    clientId: n.clientId,
    clientName: '',
    templateName: n.template,
    templateLabel: n.template,
    channel: 'whatsapp_manual',
    status: n.reason,
    message: n.message ?? null,
    sentAt: n.sentAt,
  }));
}

/** The pack Payments shows the life of: the running one, else the newest. */
export function livePackage(packages: ClientPackageWire[]): ClientPackageWire | null {
  return packages.find((p) => p.status === 'active') ?? packages[0] ?? null;
}

export interface TabOptions {
  /** Calendar: the month shown, `yyyy-MM`. */
  month?: string;
  /** Sessions: the window chip. `all` reads the newest 400 days (L4's cap, R76). */
  range?: '30d' | '90d' | 'all';
  /** Sessions: `Load older` steps the window back by whole windows. */
  older?: number;
}

const EMPTY: Omit<ClientFilePayload, keyof ClientFileHeader> = {
  sessions: [], history: [], payments: [], priceList: [], adjustments: [],
  programs: [], notes: [], readings: [], nudges: [],
};

/** What one tab reads, per the contract's *Per-tab reads* table. */
export async function getClientFilePayload(
  clientId: string,
  tab: ClientTab,
  options: TabOptions = {},
): Promise<ClientFilePayload> {
  const header = await getClientHeader(clientId);
  const now = Date.now();
  const at = (days: number) => dayIso(now + days * DAY_MS);
  const out: ClientFilePayload = { ...header, ...EMPTY };

  switch (tab) {
    case 'overview': {
      // The contract lists L7 here too; nothing on the tab draws a payment, so it isn't read.
      const [sessions, nudges, readings] = await Promise.all([
        clientSessions(clientId, at(-28), at(15)),
        clientNudges(clientId),
        clientReadings(clientId),
      ]);
      return { ...out, sessions, nudges, readings };
    }
    case 'calendar': {
      const month = /^\d{4}-\d{2}$/.test(options.month ?? '') ? options.month! : at(0).slice(0, 7);
      const [y, m] = month.split('-').map(Number);
      const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
      // A day of slack each side: the grid shows the edges of the weeks around the month.
      const from = dayIso(Date.parse(`${month}-01T00:00:00+05:30`) - 7 * DAY_MS);
      const to = dayIso(Date.parse(`${next}-01T00:00:00+05:30`) + 7 * DAY_MS);
      return { ...out, sessions: await clientSessions(clientId, from, to) };
    }
    case 'sessions': {
      const span = options.range === '30d' ? 30 : options.range === '90d' ? 90 : 400;
      const back = Math.max(0, Math.floor(options.older ?? 0));
      // Windows end four weeks ahead, so Upcoming shows what is booked; each is
      // one span long, inside L4's 400-day cap.
      const to = at(29 - back * span);
      const from = at(29 - (back + 1) * span);
      return { ...out, sessions: await clientSessions(clientId, from, to, 'desc') };
    }
    case 'program': {
      const [programs, sessions] = await Promise.all([
        clientPrograms(clientId),
        clientSessions(clientId, at(0), at(29)),
      ]);
      return { ...out, programs, sessions };
    }
    case 'payments': {
      const [history, payments, list] = await Promise.all([
        clientPackages(clientId),
        clientPayments(clientId),
        priceList(header.client.clientType === 'gym' ? 'gym' : 'trainer'),
      ]);
      const live = livePackage(history);
      const adjustments = live ? await packageAdjustments(live.id) : [];
      return { ...out, history, payments, priceList: list.filter((p) => p.status === 'active'), adjustments };
    }
    case 'notes':
      return { ...out, notes: await clientNotes(clientId), readings: await clientReadings(clientId) };
    case 'progress':
    case 'assessments':
      return out;
  }
}

/* -------------------------------------------------------------- writes ── */

const cid = encodeURIComponent;

/** Money writes answer the row and the package with its new sums. */
export interface LedgeredWire {
  payment: ClientPaymentWire;
  package: ClientPackageWire;
}

/* notes */

export const createNote = (clientId: string, input: { id: string; body: string; pinned: boolean }) =>
  call<ClientNoteWire>(`/v1/clients/${cid(clientId)}/notes`, { method: 'POST', body: input });

/** Send only what changed — `body`, `pinned`, or both — so the pin toggle cannot clobber an edit. */
export const editNote = (clientId: string, noteId: string, patch: { body?: string; pinned?: boolean }) =>
  call<ClientNoteWire>(`/v1/clients/${cid(clientId)}/notes/${cid(noteId)}`, { method: 'PATCH', body: patch });

export const removeNote = (clientId: string, noteId: string) =>
  call<null>(`/v1/clients/${cid(clientId)}/notes/${cid(noteId)}`, { method: 'DELETE' });

/** The delete toast's Undo. */
export const restoreNote = (clientId: string, noteId: string) =>
  call<ClientNoteWire>(`/v1/clients/${cid(clientId)}/notes/${cid(noteId)}/restore`, { method: 'POST', body: {} });

/* the client's own fields — Clients A6 */

export const patchClient = (
  clientId: string,
  patch: Partial<Pick<ClientDetailWire, 'name' | 'phone' | 'dateOfBirth' | 'goal' | 'heightCm' | 'activityLevel'>>,
  version?: string,
) =>
  call<ClientDetailWire>(`/v1/clients/${cid(clientId)}`, {
    method: 'PATCH',
    body: patch,
    headers: version ? { 'if-match': `"${version}"` } : undefined,
  });

/* a pack's life */

export interface SaleInput {
  id: string;
  packId?: string;
  name?: string;
  service?: string;
  basis?: 'sessions' | 'period';
  sessionsTotal?: number | null;
  amount?: string;
  validityDays?: number | null;
  startDate?: string | null;
  dueDate?: string | null;
  discountAmount?: string | null;
  trainerSharePercent?: number | null;
}

/** Clients A7 — off the price list (the pack's terms win) or custom. */
export const sellPackage = (clientId: string, input: SaleInput) =>
  call<ClientPackageWire>(`/v1/clients/${cid(clientId)}/packages`, { method: 'POST', body: input });

/** Today A3 — the same pack again, its terms copied on the server. */
export const renewPackage = (packageId: string, input: { id: string; startDate?: string | null }) =>
  call<ClientPackageWire>(`/v1/packages/${cid(packageId)}/renew`, { method: 'POST', body: input });

export const pausePackage = (packageId: string, input: { reason?: string | null; effectiveAt?: number | null } = {}) =>
  call<ClientPackageWire>(`/v1/packages/${cid(packageId)}/pause`, { method: 'POST', body: input });

export const resumePackage = (packageId: string, input: { effectiveAt?: number | null } = {}) =>
  call<ClientPackageWire>(`/v1/packages/${cid(packageId)}/resume`, { method: 'POST', body: input });

export const extendPackage = (packageId: string, days: number, reason?: string | null) =>
  call<ClientPackageWire>(`/v1/packages/${cid(packageId)}/extend`, { method: 'POST', body: { days, reason: reason ?? null } });

/** R74 — end one deal early, once nothing is owed. */
export const cancelPackage = (packageId: string) =>
  call<ClientPackageWire>(`/v1/packages/${cid(packageId)}/cancel`, { method: 'POST', body: {} });

/* money */

export interface PaymentInput {
  id: string;
  amount: string;
  /** Null for a gym client — the gym's desk collected it (R75). */
  method: 'upi' | 'cash' | 'bank_transfer' | null;
  reference?: string | null;
  status: 'paid' | 'pending';
  paidAt?: number | null;
  note?: string | null;
}

export const recordPayment = (packageId: string, input: PaymentInput) =>
  call<LedgeredWire>(`/v1/packages/${cid(packageId)}/payments`, { method: 'POST', body: input });

export const markPaymentPaid = (
  paymentId: string,
  input: { method?: string | null; reference?: string | null; paidAt?: number | null },
) => call<LedgeredWire>(`/v1/payments/${cid(paymentId)}/paid`, { method: 'POST', body: input });

export const writeOffPayment = (paymentId: string, note?: string | null) =>
  call<LedgeredWire>(`/v1/payments/${cid(paymentId)}/write-off`, { method: 'POST', body: { note: note ?? null } });

/** `amount: null` forgives everything still owed. */
export const writeOffPackage = (packageId: string, input: { id: string; amount: string | null; note?: string | null }) =>
  call<LedgeredWire>(`/v1/packages/${cid(packageId)}/write-off`, { method: 'POST', body: input });

export const refundPackage = (
  packageId: string,
  input: { id: string; amount: string; method: string | null; reference?: string | null; note?: string | null },
) => call<LedgeredWire>(`/v1/packages/${cid(packageId)}/refund`, { method: 'POST', body: input });

export const patchPayment = (
  paymentId: string,
  patch: { amount?: string; method?: string | null; reference?: string | null; paidAt?: number; note?: string | null },
  version?: string,
) =>
  call<LedgeredWire>(`/v1/payments/${cid(paymentId)}`, {
    method: 'PATCH',
    body: patch,
    headers: version ? { 'if-match': `"${version}"` } : undefined,
  });

export const deletePayment = (paymentId: string) =>
  call<null>(`/v1/payments/${cid(paymentId)}`, { method: 'DELETE' });
