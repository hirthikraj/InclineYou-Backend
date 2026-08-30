import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';

const BASE = process.env.XREP_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

export class ProgramsApiError extends Error {
  constructor(
    readonly status: number | null,
    /** The server's own sentence, when it sent one. Always preferred over
     *  anything this half could invent — the rule belongs to the backend. */
    readonly detail?: string,
  ) {
    super(detail ?? `xrep api ${status ?? 'unreachable'}`);
    this.name = 'ProgramsApiError';
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  if (!token) throw new ProgramsApiError(401);

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
    throw new ProgramsApiError(null);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail: string | undefined;
    try {
      const body = JSON.parse(text) as { detail?: string; message?: string };
      detail = body.detail ?? body.message;
    } catch {
      /* not JSON — the servlet error page, or nothing at all */
    }
    throw new ProgramsApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function get<T>(path: string): Promise<T> {
  return call<T>(path);
}

/* ═══════════════════════════════════════════════════════ the wire ══ */

/**
 * One set of a per-set prescription. V31.
 *
 * `toFailure` is the reason the list exists — an exercise-level mode cannot say
 * "the last two to failure", because there is nothing for "the last two" to
 * attach to.
 */
export interface SetDetailWire {
  reps: number | null;
  durationSeconds: number | null;
  toFailure: boolean | null;
}

/**
 * One row of a template's blueprint.
 *
 * **camelCase, and that is newer than it looks.** `GET /v1/templates` used to
 * answer with the storage map — `exercise_id`, `day_of_week`, `rest_seconds` —
 * because `TemplateResponse.exercises` was a raw `List<Map<String,Object>>`
 * handed straight out of the jsonb. `API.md` had documented camelCase since the
 * endpoint existed, so this interface was right and the server was wrong, and
 * the visible symptom was that every template on `/programs` drew as "0 days a
 * week" with no exercises in it. Fixed on the server on 28 Aug 2026; the
 * *storage* is still snake_case, because the phone's `parseBlueprint` keys on it.
 */
export interface TemplateExerciseWire {
  exerciseId: string;
  sets: number | null;
  reps: number | null;
  restSeconds: number | null;
  targetLoad: number | null;
  notes: string | null;
  /** Ordinal day slot, 1-indexed. "Day 1" = 1 — **not** a weekday. */
  dayOfWeek: number | null;
  orderIndex: number;
  /** Week slot, 1-indexed. Null reads as week 1. V20. */
  week: number | null;
  /** A hold — "3 × 45s" — carried instead of reps. V25. */
  durationSeconds: number | null;
  /** V31 · the four below. */
  tempo: string | null;
  altExerciseId: string | null;
  groupId: string | null;
  setDetail: SetDetailWire[] | null;
}

export interface TemplateWire {
  id: string;
  name: string;
  goal: string | null;
  description: string | null;
  exercises: TemplateExerciseWire[];
  /** Ordinal day string → label. `"1"` → `"Push"`. Not a weekday. */
  dayLabels: Record<string, string>;
  createdAt: number;
  updatedAt: number;
  /** How long the block runs. V20's column, writable over REST since V31. */
  weeks: number | null;
  /** The ordinal slots the trainer laid out. V24's column, same story. */
  trainingDays: number[];
  /** Every copy ever made of this blueprint, and the ones still running. */
  assignedCount: number;
  activeAssignedCount: number;
}

export interface AssignmentWire {
  programId: string;
  clientId: string;
  clientName: string;
  programName: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
  /** The blueprint has moved since this copy last did. Not an error — see
   *  `ProgramService.resync` for why nothing repairs it on its own. */
  behindTemplate: boolean;
}

export interface ExerciseNameWire {
  id: string;
  name: string;
  muscleGroup: string | null;
  equipment: string | null;
  isCustom: boolean;
}

export interface ClientWire {
  id: string;
  name: string;
  status: string | null;
  sessionsPerWeek: number | null;
  sessionDurationMinutes: number | null;
  deliveryMode: string | null;
}

/* ══════════════════════════════════════════════════════ the reads ══ */

/**
 * Names for exactly the exercises a blueprint uses.
 *
 * `?ids=` was added for `/sessions/:id` and closed BACKEND_GAPS 8; without it
 * naming six movements costs the whole 1,324-row library. **Keyed on a sorted
 * CSV rather than the array**, because `cache()` memoises on argument identity
 * and a fresh array literal would turn the cache off silently — the same trap
 * `lib/sessions/api.ts` records.
 *
 * The library PANEL is the other half of this and deliberately does not use it:
 * browsing wants everything, and `lib/exercises/api.ts` already serves that
 * through a paged search.
 */
const namesByCsv = cache(async (csv: string): Promise<ExerciseNameWire[]> => {
  if (!csv) return [];
  // `?ids=` narrows the SEARCH route, so it answers in the search route's
  // envelope — `{exercises, total}`, not a bare array. Reading it as an array
  // is a 200 that throws on the spread, which is what it did the first time
  // this screen was rendered against a real backend. `lib/sessions/api.ts`
  // unwraps it the same way.
  const page = await get<{ exercises: ExerciseNameWire[] }>(
    `/v1/exercises?ids=${encodeURIComponent(csv)}`,
  );
  return page?.exercises ?? [];
});

export async function exercisesByIds(ids: string[]): Promise<Record<string, ExerciseNameWire>> {
  const unique = [...new Set(ids.filter(Boolean))].sort();
  if (unique.length === 0) return {};
  // The route refuses over 600 ids rather than truncating silently, and one
  // blueprint cannot approach that — but a shelf's worth of them can, so this
  // chunks rather than trusting the arithmetic.
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 400) chunks.push(unique.slice(i, i + 400));

  const out: Record<string, ExerciseNameWire> = {};
  const pages = await Promise.all(chunks.map(chunk => namesByCsv(chunk.join(','))));
  for (const page of pages) for (const ex of page) out[ex.id] = ex;
  return out;
}

export interface ShelfData {
  templates: TemplateWire[];
  names: Record<string, ExerciseNameWire>;
}

/**
 * The shelf. Two requests, and the second is scoped to what the first uses.
 *
 * Deliberately **not** `/v1/sync/pull`: `lib/setup/api.ts` allows itself the
 * full envelope and says exactly why it is the only screen that may — the
 * account is nearly empty there. A program shelf is opened by a trainer with a
 * year of set logs behind it, which is the case that comment forbids.
 */
export async function getShelf(): Promise<ShelfData> {
  const templates = await get<TemplateWire[]>('/v1/templates');
  const ids = templates.flatMap(t => t.exercises.map(e => e.exerciseId));
  const names = await exercisesByIds(ids);
  return { templates, names };
}

export interface BuilderData extends ShelfData {
  template: TemplateWire;
  assignments: AssignmentWire[];
  clients: ClientWire[];
}

/**
 * The shelf plus one open template.
 *
 * The list pane is drawn beside the builder — the IA's own row, *"list and
 * builder are one screen"* — so the shelf comes down either way and the extra
 * cost of opening a template is the three requests below.
 *
 * `/v1/clients` is here rather than fetched when *Assign* opens, because the
 * assign panel is one click from every row on the shelf and a spinner inside a
 * form the trainer has already committed to is worse than a slightly larger
 * page. It is the same request `/schedule` and `/today` already make.
 */
export async function getBuilder(templateId: string): Promise<BuilderData> {
  const [templates, template, assignments, clients] = await Promise.all([
    get<TemplateWire[]>('/v1/templates'),
    get<TemplateWire>(`/v1/templates/${encodeURIComponent(templateId)}`),
    get<AssignmentWire[]>(`/v1/templates/${encodeURIComponent(templateId)}/assignments`),
    get<ClientWire[]>('/v1/clients'),
  ]);

  const ids = [
    ...templates.flatMap(t => t.exercises.map(e => e.exerciseId)),
    ...template.exercises.flatMap(e => [e.exerciseId, e.altExerciseId ?? '']),
  ];
  const names = await exercisesByIds(ids);

  return { templates, template, assignments, clients, names };
}

/* ═════════════════════════════════════════════════════ the writes ══ */

export interface TemplateExercisePayload {
  exerciseId: string;
  sets: number | null;
  reps: number | null;
  restSeconds: number | null;
  targetLoad: number | null;
  notes: string | null;
  dayOfWeek: number;
  orderIndex: number;
  week: number;
  durationSeconds: number | null;
  tempo: string | null;
  altExerciseId: string | null;
  groupId: string | null;
  setDetail: SetDetailWire[] | null;
}

export interface TemplatePatch {
  name?: string;
  goal?: string | null;
  description?: string | null;
  weeks?: number;
  trainingDays?: number[];
  dayLabels?: Record<string, string>;
  exercises?: TemplateExercisePayload[];
}

export async function postTemplate(body: TemplatePatch): Promise<TemplateWire> {
  return call<TemplateWire>('/v1/templates', { method: 'POST', body: JSON.stringify(body) });
}

/**
 * A blueprint edit is one PUT of the whole structure, and that is the storage
 * shape rather than a shortcut: `template.structure` is a single jsonb column
 * and there is no row to PATCH. It is also why the builder holds a draft and
 * saves — a per-keystroke write would be a full rewrite per keystroke.
 */
export async function putTemplate(id: string, body: TemplatePatch): Promise<TemplateWire> {
  return call<TemplateWire>(`/v1/templates/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function postDuplicate(id: string, name?: string): Promise<TemplateWire> {
  return call<TemplateWire>(`/v1/templates/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
    body: JSON.stringify({ name: name ?? null }),
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  await call<void>(`/v1/templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export interface ScheduleEntryPayload {
  /** The template's ordinal slot. */
  day: number;
  /** ISO weekday the client trains it on. 1 = Monday. */
  weekday: number;
  /** 24-hour "HH:mm". */
  time: string;
}

export interface ApplyPayload {
  clientId: string;
  name?: string | null;
  goal?: string | null;
  startDate?: number | null;
  endDate?: number | null;
  schedule: ScheduleEntryPayload[];
}

export interface ProgramSummaryWire {
  id: string;
  clientId: string;
  templateId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
}

export async function postApply(id: string, body: ApplyPayload): Promise<ProgramSummaryWire> {
  return call<ProgramSummaryWire>(`/v1/templates/${encodeURIComponent(id)}/apply`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface ResyncResultWire {
  programId: string;
  templateId: string;
  removed: number;
  added: number;
}

export async function postResync(programId: string): Promise<ResyncResultWire> {
  return call<ResyncResultWire>(`/v1/programs/${encodeURIComponent(programId)}/resync`, {
    method: 'POST',
  });
}
