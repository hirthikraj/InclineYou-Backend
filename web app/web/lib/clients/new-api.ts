import 'server-only';

import { cache } from 'react';

import { api, ApiError, type ListEnvelope } from '@/lib/http/client';
import type { Pack, PackType } from '@/lib/setup/money';
import { DAY_MS } from '@/lib/today/time';

import { ClientsApiError, getClients, getMe } from './api';

/**
 * The add-client flow's reads on the v1.1 wire — api-contract *Clients ·
 * Add-client load*: L1 (/v1/me), L2 (working hours, for slot suggestions), L3
 * (everyone's slots, to flag a taken time), the price list and the templates.
 *
 * Mapped here onto the shapes `AddClientFlow` already draws, so the component
 * did not have to change with the wire.
 */
export class NewClientApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'NewClientApiError';
  }
}

async function get<T>(path: string): Promise<T> {
  try {
    return await api<T>(path);
  } catch (error) {
    if (error instanceof ApiError) throw new NewClientApiError(error.status);
    throw error;
  }
}

/** The shared reads throw the roster's error type; the flow's guard reads this one. */
async function shared<T>(read: Promise<T>): Promise<T> {
  try {
    return await read;
  } catch (error) {
    if (error instanceof ClientsApiError) throw new NewClientApiError(error.status);
    throw error;
  }
}

/* -------------------------------------------------------- wire shapes ── */

interface WorkingHourV1 { id: string; weekday: number; start: string; end: string }

/** `PackService.PackRow`. */
interface PackWire {
  id: string;
  name: string;
  service: string;
  basis: 'sessions' | 'period';
  sessions: number | null;
  validityDays: number | null;
  amount: string;
  owner: 'trainer' | 'gym';
  status: string;
  orderIndex: number;
}

/** `ProgramTemplateService.Template`. */
interface TemplateV1 {
  id: string;
  name: string;
  goal: string | null;
  description: string | null;
  days: number;
  /** The tree, and ONLY on a detail read: `ProgramItem.workouts` is
   *  `@JsonInclude(NON_NULL)`, so a LIST row (`/v1/programs?kind=template`) has no
   *  such key at all — and where it is present it is `PlanWorkout` OBJECTS, not the
   *  strings this interface used to claim. That claim was the crash: the day label
   *  read `t.workouts[i]` on `undefined` and every press of *Add client* answered
   *  with a server error. A type is a claim the JSON never has to satisfy. */
  workouts?: { week: number; day: number; name: string }[];
}

/** `SessionReadService.SessionRow`, trimmed to what the demo picker's clash
 *  check needs. */
interface SessionV1 {
  scheduledAt: number;
  endsAt: number;
  status: string;
}

/* ------------------------------------------ the shapes the flow draws ── */

export interface WorkingHourWire {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface ClientScheduleWire {
  id: string;
  name: string;
  status: string;
  sessionDurationMinutes: number | null;
  weeklySchedule: Array<{ templateDay: number; weekday: number; time: string }>;
}

export interface TemplateWire {
  id: string;
  name: string;
  goal: string | null;
  description: string | null;
  /** One label per program day — its length is what step 4 matches against the week picked. */
  dayLabels: string[];
}

/** A trainer's other booking, trimmed to what the demo step's clash check
 *  needs to grey out an already-taken slot. */
export interface UpcomingSessionWire {
  scheduledAt: number;
  endsAt: number;
}

export interface NewClientData {
  trainer: {
    id: string;
    name: string;
    gymName: string | null;
    gymSharePercent: number | null;
  };
  workingHours: WorkingHourWire[];
  clients: ClientScheduleWire[];
  /** The ACTIVE price list, both owners. */
  packs: Pack[];
  templates: TemplateWire[];
  /** The trainer's other bookings over the demo picker's 14-day window —
   *  read-only quietly (see below): a failed fetch just means nothing greys
   *  out, not that a client cannot be added. */
  sessions: UpcomingSessionWire[];
  setupComplete: boolean;
  trainerName: string;
  trainerPhone: string | null;
}

const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** `single | session_pack | monthly` from basis + sessions (R24). */
function packType(p: PackWire): PackType {
  if (p.basis === 'period') return 'monthly';
  return p.sessions === 1 ? 'single' : 'session_pack';
}

/** `yyyy-MM-dd` for a local-calendar instant — `/v1/sessions`' `from`/`to`. */
function isoDate(at: number): string {
  const d = new Date(at);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** The demo picker shows 14 days; one extra on each side covers the server
 *  resolving the day boundary in the trainer's own timezone rather than this
 *  server's. */
const DEMO_WINDOW_DAYS = 14;

export const getNewClientData = cache(async (): Promise<NewClientData> => {
  const now = Date.now();
  const [me, hours, clients, templates, packs, sessions] = await Promise.all([
    // L1 and L3 are the roster's own cached reads, so /clients fetches each once.
    shared(getMe()),
    get<ListEnvelope<WorkingHourV1>>('/v1/working-hours'),
    shared(getClients()),
    get<ListEnvelope<TemplateV1>>('/v1/programs?kind=template'),
    /* The one read allowed to fail quietly: the price list decides what step 2
       can DRAW, not whether a client can be added. */
    get<ListEnvelope<PackWire>>('/v1/packs').catch((): ListEnvelope<PackWire> => ({ items: [] })),
    /* Also allowed to fail quietly: greying out an already-booked demo slot is
       a courtesy, not a gate — a trainer can still double-book by hand, the
       same as `BookPanel` allows everywhere else. */
    get<ListEnvelope<SessionV1>>(
      `/v1/sessions?from=${isoDate(now - DAY_MS)}&to=${isoDate(now + (DEMO_WINDOW_DAYS + 1) * DAY_MS)}`,
    ).catch((): ListEnvelope<SessionV1> => ({ items: [] })),
  ]);

  return {
    trainer: {
      id: me.id,
      name: me.name ?? '',
      gymName: me.gymName,
      // The split is set per pack sale now (R3); the flow's default stands in.
      gymSharePercent: null,
    },
    // v1 says 1 = Monday; the flow's `slotsForDay` still reads the old 0 = Monday.
    workingHours: (hours?.items ?? []).map((h) => ({
      id: h.id, weekday: h.weekday - 1, startMinute: minutes(h.start), endMinute: minutes(h.end),
    })),
    clients: clients.filter((c) => c.status !== 'archived').map((c) => ({
      id: c.id,
      name: c.name ?? 'Client',
      status: c.status,
      sessionDurationMinutes: c.schedule.sessionDurationMinutes,
      weeklySchedule: c.slots.map((s, i) => ({ templateDay: s.programDay ?? i + 1, weekday: s.weekday, time: s.start })),
    })),
    packs: (packs?.items ?? [])
      .map((p) => ({
        id: p.id,
        name: p.name || 'Pack',
        type: packType(p),
        sessions: p.sessions,
        amount: Number(p.amount) || 0,
        validityDays: p.validityDays,
        owner: p.owner,
        orderIndex: p.orderIndex,
      }))
      .sort((a, b) => a.orderIndex - b.orderIndex),
    templates: (templates?.items ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      goal: t.goal,
      description: t.description,
      dayLabels: Array.from(
        { length: t.days },
        (_, i) =>
          t.workouts?.find((w) => w.week === 1 && w.day === i + 1)?.name?.trim() || `Day ${i + 1}`,
      ),
    })),
    sessions: (sessions?.items ?? [])
      .filter((s) => s.status !== 'cancelled')
      .map((s) => ({ scheduledAt: s.scheduledAt, endsAt: s.endsAt })),
    setupComplete: me.setupCompletedAt !== null,
    trainerName: me.name ?? '',
    trainerPhone: me.phone,
  };
});
