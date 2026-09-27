import 'server-only';

import { cache } from 'react';

import type { PlanDiff } from './diff';

import { getToken } from '@/lib/auth/session';

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

export class ProgramsApiError extends Error {
  constructor(
    readonly status: number | null,
    /** The server's own sentence, when it sent one. Always preferred over
     *  anything this half could invent — the rule belongs to the backend. */
    readonly detail?: string,
  ) {
    super(detail ?? `inclineyou api ${status ?? 'unreachable'}`);
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
  /**
   * WHICH WORKOUT ON THE DAY THIS ROW BELONGS TO — law 5 on the wire.
   *
   * Optional, and that is what makes the column additive: a blueprint written
   * before containers existed comes back without either key, and `toEntries`
   * reads that day as one unnamed container rather than as rows in no workout.
   * Nothing on the server interprets them — the structure is one jsonb blob —
   * so this is a shape the builder writes and reads back.
   */
  workoutId?: string | null;
  /** The container's name, carried on every member. See `Entry.workoutName`. */
  workoutName?: string | null;
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
  /**
   * A SAMPLE OF WHO IS ON IT — enough to draw faces, never enough to count.
   *
   * The shelf draws an `AvatarStack` instead of the figure `13 clients on this`,
   * and a cluster needs names. It does not need forty of them: the wire caps
   * this (six, in the mock's `ASSIGNED_SAMPLE`) and `activeAssignedCount` stays
   * the authority for the total, so the overflow disc reads `+38` off the count
   * and never off this array's length. **Nothing may derive a client count from
   * `assignedClients.length`** — on the shelf's busiest program the two numbers
   * are six and forty-two.
   *
   * The ACTIVE assignments only, matching the count it is drawn beside, and
   * total-ordered by name server-side: a sample taken off an unordered scan is
   * a different six per request, and the faces would reshuffle between page
   * loads under a figure that did not move.
   *
   * Optional, because a build that predates the field reads `undefined` and the
   * row falls back to drawing nothing — which is the same thing it does for a
   * program nobody is on, and the wrong-but-safe direction.
   */
  assignedClients?: { id: string; name: string }[];

  /**
   * WHO OWNS THIS BLUEPRINT, and therefore who may edit it.
   *
   * An enum rather than an `isCertified` boolean: trainers publishing to each
   * other is refused *now* and not forever, and a third value can be added
   * without every read on the shelf changing shape.
   *
   * Optional on the wire so a build that predates the column reads `undefined`
   * and every `=== 'certified'` test answers false — which is the right default
   * for a trainer's own shelf.
   */
  source?: 'own' | 'certified';

  /**
   * PROVENANCE ON A COPY, and it is not a status.
   *
   * Six months later it answers *where did this come from and can I trust it*,
   * and it is what lets the certified shelf draw *You have a copy* and the
   * builder say the original has since moved. `updatedAt` is the ORIGINAL's
   * stamp at the moment the copy was taken, which is the whole mechanism for
   * that second sentence.
   */
  copiedFrom?: { id: string; name: string; updatedAt: number } | null;
}

/* ════════════════════════════════════════ the certified library ══ */

/**
 * One InclineYou-certified program, as the shelf reads it.
 *
 * `exercises` is EMPTY on the list read and full on the detail read — the card
 * states the size of the thing and `exerciseCount` is what says it. Thirty-four
 * blueprint rows a card, forty cards, to render one figure is the payload
 * `GET /v1/exercises?ids=` was narrowed to avoid.
 */
export interface CertifiedWire extends TemplateWire {
  /** Required on a certified row, always null on a trainer's own. */
  certified: CertifiedMetaWire | null;
  exerciseCount: number;
  /** The CALLER's copy of this blueprint, when they have one. Part of the list
   *  response on purpose: a shelf that asked per card would make forty
   *  requests to answer one question. */
  mine: { id: string; copiedAt: number; stale: boolean } | null;
}

export interface CertifiedMetaWire {
  /** The sentence the card is built around: who it is for, what it does. */
  summary: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  equipment: 'full-gym' | 'dumbbells' | 'bodyweight';
  /** When a human last checked it. Printed on the preview header — a blueprint
   *  with no review date is an assertion; one with a date is a claim. */
  reviewedAt: number;
  /** How many trainers have copied it. A fact, in place of a rating. */
  usedCount: number;
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

  /**
   * WHAT THIS COPY SAYS THAT THE BLUEPRINT DOES NOT — and therefore what a
   * push would delete.
   *
   * `behindTemplate` is a stamp comparison and answers a different question:
   * *has the blueprint moved since this copy took it.* It cannot tell a copy
   * nobody has touched from one a trainer rewrote for a shoulder injury three
   * weeks ago, and a push replaces the whole prescription either way — so the
   * panel that offers the push was, until this field, offering to destroy work
   * it had no way to mention.
   *
   * **COMPUTED SERVER-SIDE, ON PURPOSE.** Thirteen assignments diffed in the
   * browser is thirteen extra reads of a whole prescription to render one
   * panel. `lib/programs/diff.ts` is import-free precisely so the same code can
   * run on both ends; `BACKEND_GAPS.md` carries the projection the real
   * `/v1/templates/{id}/assignments` owes.
   *
   * Null on a build that predates the field, which every reader treats as
   * *unknown*, never as *no changes*.
   */
  divergence?: PlanDiff | null;
}

/**
 * What the builder knows about an exercise it did not fetch by browsing.
 *
 * ── `target` IS THE FIELD THAT MAKES TWO ROWS DIFFERENT ─────────────────────
 *
 * This carried `muscleGroup` and `equipment` and nothing else, so *Barbell Bench
 * Press* and *Close-Grip Bench Press* printed the identical meta line — *Chest ·
 * Barbell* — on every row of every column. The catalogue has always known that
 * one targets the **pectoralis major** and the other the **triceps brachii**;
 * the wire was the half throwing it away, and no detail panel fixes it, because
 * a panel is opened one row at a time while a column is read all at once.
 *
 * `GET /v1/exercises?ids=` narrows the SEARCH route, which returns whole
 * exercise rows — so all four of these were already in the response body and
 * merely undeclared. **The real backend must project them**; a Spring projection
 * that selects two columns will answer `undefined` here and the rows will go
 * quiet again, which typechecks on both sides. `BACKEND_GAPS.md` carries it.
 */
export interface ExerciseNameWire {
  id: string;
  name: string;
  muscleGroup: string | null;
  bodyPart: string | null;
  target: string | null;
  equipment: string | null;
  movementPattern: string | null;
  level: string | null;
  isCustom: boolean;
}

export interface ClientWire {
  id: string;
  name: string;
  status: string | null;
  sessionsPerWeek: number | null;
  sessionDurationMinutes: number | null;
  deliveryMode: string | null;
  /**
   * The days and times this client already trains — `1 = Monday`, and set when
   * their pack was sold. The assign panel seeds itself from it, which is the
   * difference between *place these four days somewhere* and *confirm the four
   * mornings this person already comes in*. Null for anyone with no rhythm yet.
   */
  weeklySchedule: Array<{ templateDay: number; weekday: number; time: string }> | null;
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

export interface CertifiedShelfData {
  certified: CertifiedWire[];
  /** How many of the trainer's OWN programs there are, for the tab strip's
   *  count. The blueprints are not wanted here, but the strip is drawn on this
   *  screen and a tab that counts nothing on one of its three pages is a tab
   *  that looks broken on that page. */
  ownCount: number;
}

/**
 * The certified catalogue. Two requests, and the second is only for a count.
 *
 * Deliberately NOT `getShelf()` for the second half: that read comes back with
 * every blueprint on the trainer's shelf and then fetches a name for every
 * exercise in them, to render an integer on a tab.
 */
export async function getCertifiedShelf(): Promise<CertifiedShelfData> {
  const [certified, own] = await Promise.all([
    get<CertifiedWire[]>('/v1/templates/certified'),
    get<TemplateWire[]>('/v1/templates'),
  ]);
  return { certified, ownCount: own.length };
}

export interface CertifiedPreviewData {
  template: CertifiedWire;
  names: Record<string, ExerciseNameWire>;
  ownCount: number;
}

/**
 * One certified program, with its blueprint, for the read-only preview.
 *
 * No shelf and no client list: nothing on that screen can assign, and the
 * list pane is the certified grid the trainer came from rather than their own
 * programs. `/v1/clients` is the request `getBuilder` makes for a panel this
 * screen does not have.
 */
export async function getCertifiedPreview(id: string): Promise<CertifiedPreviewData> {
  const [template, own] = await Promise.all([
    get<CertifiedWire>(`/v1/templates/certified/${encodeURIComponent(id)}`),
    get<TemplateWire[]>('/v1/templates'),
  ]);
  const names = await exercisesByIds(
    template.exercises.flatMap(e => [e.exerciseId, e.altExerciseId ?? '']),
  );
  return { template, names, ownCount: own.length };
}

/* ══════════════════════════════════════════ one client's own copy ══ */

/**
 * A PROGRAMME — the copy that was made when a blueprint was handed to somebody.
 *
 * Assigning does not point a client at a template; `POST /v1/templates/:id/apply`
 * copies every blueprint row into `program_exercise` in one transaction, and
 * from that moment the two are independent. `templateId` is PROVENANCE and not a
 * live link: it is what lets the assignment list say *behind*, and it is what
 * *Reset to template* reaches for. Nothing else follows it.
 *
 * Which is the whole reason this screen exists. A trainer writes one good
 * programme and then tunes it per person — Meera's shoulder, Karthik's Tuesday
 * — and until now the tuned copy was a thing the product created and gave
 * nobody a way to open.
 */
export interface ProgramWire {
  id: string;
  clientId: string;
  /** Where the copy came from. Null once the blueprint has been deleted, which
   *  is survivable: the copy is whole on its own. */
  templateId: string | null;
  name: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  /** The copy's own shape — see the note on the server's `ProgramRow`. Optional
   *  on the wire so a build that predates the columns still renders: the
   *  builder falls back to deriving days and weeks from the rows themselves,
   *  which is what `daysOf` and `weekCountOf` have always done. */
  dayLabels?: Record<string, string>;
  weeks?: number | null;
  trainingDays?: number[];
  createdAt: number;
  updatedAt: number;
  /** When the copy last TOOK the blueprint. Not when it was last edited. */
  syncedAt?: number;
}

/** One prescribed row of a client's copy. `TemplateExerciseWire` plus the two
 *  fields that make it a row in a table rather than an element in a jsonb blob
 *  — which is why the per-row writes exist for the session log to use. */
export interface ProgramExerciseWire extends TemplateExerciseWire {
  id: string;
  programId: string;
}

export interface ClientPlanData {
  program: ProgramWire;
  exercises: ProgramExerciseWire[];
  client: ClientWire;
  /**
   * The blueprint this was copied from, when it still exists and we could read
   * it. The rail draws *copied from …* off it and states whether it has moved
   * since — the same fact `AssignedList` draws as *Behind*, from the other end.
   */
  origin: {
    id: string;
    name: string;
    updatedAt: number;
    /**
     * THE BLUEPRINT'S OWN ROWS AND SHAPE, so this screen can say what it
     * changed rather than only that something did.
     *
     * It is the read this route already made — `getClientPlan` fetches the
     * whole `TemplateWire` to learn the origin's name and stamp — so carrying
     * the rows costs nothing on the wire and buys the two sentences the screen
     * is built around: *tuned for Meera · 3 changes* on the header, and the
     * list of them under *What is different*. Which is also what makes
     * *Take the blueprint again* honest: it can name what it would discard.
     */
    exercises: TemplateExerciseWire[];
    dayLabels: Record<string, string>;
    weeks: number | null;
    trainingDays: number[];
  } | null;
  /** Every programme this client has ever been on, for the rail's history. */
  history: ProgramWire[];
  names: Record<string, ExerciseNameWire>;
}

/**
 * One client's copy, everything the builder needs to draw it, and nothing else.
 *
 * Deliberately NOT `getBuilder`. That read comes down with the trainer's whole
 * shelf and a name for every exercise in it, to render a list this screen does
 * not have — the left column here is the CLIENT, not the other programmes.
 *
 * The origin read is guarded rather than awaited with the rest: a blueprint the
 * trainer deleted last month is a 404, and a client's live plan must not fail
 * to open because the thing it was copied from is gone. That is the two-table
 * design working, not an error.
 */
export async function getClientPlan(
  clientId: string,
  programId: string,
): Promise<ClientPlanData> {
  const [program, exercises, client, history] = await Promise.all([
    get<ProgramWire>(`/v1/programs/${encodeURIComponent(programId)}`),
    get<ProgramExerciseWire[]>(`/v1/programs/${encodeURIComponent(programId)}/exercises`),
    get<ClientWire>(`/v1/clients/${encodeURIComponent(clientId)}`),
    get<ProgramWire[]>(`/v1/programs?clientId=${encodeURIComponent(clientId)}`).catch(() => []),
  ]);

  // A programme reached through the wrong client's URL is not this client's
  // plan. 404 rather than rendering somebody else's prescription under their
  // name — the guard turns it into *this plan is gone*.
  if (program.clientId !== clientId) throw new ProgramsApiError(404);

  const origin = program.templateId
    ? await get<TemplateWire>(`/v1/templates/${encodeURIComponent(program.templateId)}`).catch(
        () => null,
      )
    : null;

  /* THE ORIGIN'S IDS ARE IN HERE TOO, and they have to be: a diff line reads
     *Bench Press → Dumbbell Press*, and the movement a trainer REMOVED for this
     client is by definition not in their copy any more. Naming it off the copy's
     rows alone printed the id. */
  const names = await exercisesByIds([
    ...exercises.flatMap(e => [e.exerciseId, e.altExerciseId ?? '']),
    ...(origin?.exercises ?? []).flatMap(e => [e.exerciseId, e.altExerciseId ?? '']),
  ]);

  return {
    program,
    exercises,
    client,
    origin: origin
      ? {
          id: origin.id,
          name: origin.name,
          updatedAt: origin.updatedAt,
          exercises: origin.exercises,
          dayLabels: origin.dayLabels,
          weeks: origin.weeks,
          trainingDays: origin.trainingDays,
        }
      : null,
    history,
    names,
  };
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
    get<ClientWire[]>('/v1/clients?view=legacy'),
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
  /** Law 5 — see `TemplateExerciseWire`. Sent on every row this build writes. */
  workoutId: string | null;
  workoutName: string | null;
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

/**
 * Copy a certified program onto the caller's shelf.
 *
 * One request, and the copy is made SERVER-SIDE in one transaction — a
 * read-then-create from here would be a thirty-four-row blueprint rewritten
 * from the browser, which is a half-copied program waiting for a dropped
 * connection, on the endpoint trainers use most.
 *
 * `name` is the ONE thing the copy may differ from its origin in, and the route
 * has always taken it (`str(ctx.body.name, origin.name)`). The certified
 * shelf's *Use this* sends none — a trainer who copied *Upper / Lower · 4 day*
 * is building an upper/lower and the original is not on their shelf to be
 * confused with. The new-program dialog sends one, because there the trainer
 * has a name field in front of them and has typed in it.
 */
export async function postCertifiedCopy(id: string, name?: string | null): Promise<TemplateWire> {
  return call<TemplateWire>(`/v1/templates/certified/${encodeURIComponent(id)}/copy`, {
    method: 'POST',
    body: JSON.stringify(name?.trim() ? { name: name.trim() } : {}),
  });
}

/**
 * The catalogue, list-shaped, and nothing beside it.
 *
 * `getCertifiedShelf` reads the trainer's own shelf as well, to put an integer
 * on a tab; the new-program dialog's picker already holds that list in the
 * browser and needs only this half. The list read carries no blueprints —
 * `CertifiedWire`'s own note — so it is a small response even at forty rows.
 */
export async function getCertifiedList(): Promise<CertifiedWire[]> {
  return get<CertifiedWire[]>('/v1/templates/certified');
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

/**
 * THE CLIENT COPY'S SAVE — one PUT of the whole prescription.
 *
 * The same shape as `putTemplate` and for the same reason, arriving at the
 * other table: the builder holds a draft, every structural edit is local, and
 * this is what the debounce presses. Per-row `POST`/`PUT`/`DELETE` on
 * `/v1/programs/:id/exercises/:rowId` stay where they are — the session log
 * uses them to swap one exercise mid-workout, which is a single edit with a
 * single row's intent behind it. A drag on a board is not.
 *
 * It does NOT move `synced_at`. Tuning a client's copy is not the same act as
 * taking the blueprint, and the assignment list has to go on saying so.
 */
export async function putProgramBlueprint(
  programId: string,
  body: TemplatePatch,
): Promise<ProgramWire> {
  return call<ProgramWire>(`/v1/programs/${encodeURIComponent(programId)}/exercises`, {
    method: 'PUT',
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

export interface PlanNoticeResultWire {
  /** False when the client has turned plan notifications off. The write still
   *  succeeded; nobody was told. See `mintClientNotification`'s gate. */
  sent: boolean;
}

/**
 * TELL THE CLIENT THEIR PLAN CHANGED — the optional half of saving a copy.
 *
 * Its own route rather than a flag on the save, because the two acts have
 * different audiences and the trainer decides on them separately: a typo fixed
 * in a day label is a save nobody needs to hear about, and a deload week is a
 * save that is meaningless unless they do. Folding it into `PUT .../exercises`
 * would make *tell them* a property of *write it down*, and the trainer would
 * be choosing at the moment they are thinking hardest about the prescription.
 *
 * It carries no summary of WHAT changed, and that is the notification system's
 * standing rule rather than a shortcut here: `lib/notifications/types.ts` has
 * it as "a notification never offers to change the book. It names what happened
 * and points at where it happened." The client's bell says their trainer
 * changed their plan and links to the plan, which is the one place the change
 * is actually legible.
 */
export async function postPlanNotice(programId: string): Promise<PlanNoticeResultWire> {
  return call<PlanNoticeResultWire>(`/v1/programs/${encodeURIComponent(programId)}/notify`, {
    method: 'POST',
  });
}

/* ═══════════════════════════════ every client's copy, in one list ══ */

export interface ClientProgramsData {
  /** Every programme on the trainer's book — one row per copy, not per client. */
  programs: ProgramWire[];
  /** The roster, for the name beside each copy and for the Client facet. */
  clients: ClientWire[];
}

/**
 * THE PROGRAMMES THEMSELVES — `/programs`' own read, and the list that existed
 * nowhere.
 *
 * A trainer's shelf of blueprints has always had a screen; the COPIES those
 * blueprints produced have only ever been reachable one client at a time,
 * through that client's file. So *who is training on what* — the question the
 * word *Programs* actually names — was a question this product could only
 * answer by opening twenty-four client files in turn.
 *
 * ── TWO REQUESTS, AND DELIBERATELY NOT `getRosterData` ──────────────────────
 *
 * `lib/clients/api.ts` already reads both of these, inside a seven-request
 * fan-out that also fetches every payment, package, workout and session on the
 * book. That read is right for the roster, whose tags are derived from all of
 * it, and wrong here: this screen draws a programme's own columns — its shape,
 * its weeks, its goal, its stamp — and one name per row.
 *
 * `/v1/programs` unwindowed on purpose. A programme that ended in June is a
 * row a trainer looks for when they want the block somebody was on last time,
 * and the *Ended* filter is the whole reason the status column is drawn; a
 * window would make that filter lie about the past rather than narrow it.
 *
 * NO EXERCISE NAMES. `getShelf` fetches one per blueprint row because the
 * builder beside it needs them; nothing on this list says what a movement is
 * called. The shape comes off the copy's own `trainingDays` / `weeks` /
 * `dayLabels` — the three columns `V2__program_shape.sql` added precisely so a
 * copy could be drawn without reading its rows.
 */
export async function getClientPrograms(): Promise<ClientProgramsData> {
  const [programs, clients] = await Promise.all([
    get<ProgramWire[]>('/v1/programs'),
    get<ClientWire[]>('/v1/clients?view=legacy'),
  ]);
  return { programs: programs ?? [], clients: clients ?? [] };
}
