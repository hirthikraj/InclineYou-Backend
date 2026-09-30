import 'server-only';

import { api, ApiError } from '@/lib/http/client';

import type { PlanDiff } from './diff';
import {
  dayLabelsOf,
  equipmentOf,
  flatRowsOf,
  goalIdOf,
  goalLabelOf,
  trainingDaysOf,
  treeOf,
  type FlatRow,
  type PlanExerciseNameWire,
  type PlanProgramWire,
} from './wire';

export class ProgramsApiError extends Error {
  constructor(
    readonly status: number | null,
    /** The server's own sentence, when it sent one. Always preferred over
     *  anything this half could invent — the rule belongs to the backend. */
    readonly detail?: string,
    /** The wire `code` (`PROGRAM_REVISED`, `PRECONDITION_FAILED` …). */
    readonly code?: string,
  ) {
    super(detail ?? `inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'ProgramsApiError';
  }
}

/**
 * The shared client does the bearer, `x-inclineyou-client: web`, the timeout and
 * the dev log; this keeps the screen's own error type, which `guard.ts` reads.
 */
async function call<T>(
  path: string,
  init?: { method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; ifMatch?: string },
): Promise<T> {
  try {
    return await api<T>(path, {
      method: init?.method,
      body: init?.body,
      headers: init?.ifMatch ? { 'if-match': `"${init.ifMatch}"` } : undefined,
    });
  } catch (error) {
    if (error instanceof ApiError) throw new ProgramsApiError(error.status, error.problem.detail, error.problem.code);
    throw error;
  }
}

async function get<T>(path: string): Promise<T> {
  return call<T>(path);
}

/** A 1.1 list is `{ items }`. */
async function items<T>(path: string): Promise<T[]> {
  return (await get<{ items: T[] }>(path))?.items ?? [];
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
  /** v1.1 — the program's `revisedAt` as text; what `If-Match` carries. */
  version: string;
  /** From the summary row, which has no tree: the shelf's figure when `exercises` is empty. */
  exerciseCount: number;
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
  /** The copy's version, when the list sends it — else a push reads it fresh. */
  version?: string;

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
   * The days and times this client already trains — `1 = Monday`. The assign
   * panel seeds itself from it. Read off the summary's `slots` (`programDay`
   * is the template day the slot books, else its place in the week).
   */
  weeklySchedule: Array<{ templateDay: number; weekday: number; time: string }> | null;
  /** `schedule.version` — the `If-Match` of `PUT /v1/clients/{id}/schedule`. */
  scheduleVersion: string | null;
}

/** `GET /v1/clients?view=summary` (Clients L3), the fields this screen reads. */
interface ClientSummaryWire {
  id: string;
  name: string | null;
  status: string;
  schedule: {
    sessionsPerWeek: number | null;
    sessionDurationMinutes: number | null;
    deliveryMode: string | null;
    version: string;
  } | null;
  slots: { weekday: number; start: string; programDay: number | null }[] | null;
}

function clientOf(c: ClientSummaryWire): ClientWire {
  const slots = [...(c.slots ?? [])].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
  return {
    id: c.id,
    name: c.name ?? 'Unnamed client',
    status: c.status,
    sessionsPerWeek: c.schedule?.sessionsPerWeek ?? null,
    sessionDurationMinutes: c.schedule?.sessionDurationMinutes ?? null,
    deliveryMode: c.schedule?.deliveryMode ?? null,
    weeklySchedule: slots.length
      ? slots.map((s, i) => ({ templateDay: s.programDay ?? i + 1, weekday: s.weekday, time: s.start }))
      : null,
    scheduleVersion: c.schedule?.version ?? null,
  };
}

async function clients(): Promise<ClientWire[]> {
  return (await items<ClientSummaryWire>('/v1/clients?view=summary')).map(clientOf);
}

/** `GET /v1/programs/{id}/assignments` items (Programs L5). */
interface AssignmentItem {
  programId: string;
  clientId: string;
  clientName: string;
  status: string;
  startDate: string | null;
  syncedAt: number | null;
  behind: boolean;
  programName?: string;
  endDate?: string | null;
  createdAt?: number;
  updatedAt?: number;
  divergence?: PlanDiff | null;
  version?: string;
}

function assignmentOf(a: AssignmentItem): AssignmentWire {
  return {
    programId: a.programId,
    clientId: a.clientId,
    clientName: a.clientName,
    programName: a.programName ?? '',
    startDate: a.startDate,
    endDate: a.endDate ?? null,
    status: a.status,
    createdAt: a.createdAt ?? a.syncedAt ?? 0,
    updatedAt: a.updatedAt ?? a.syncedAt ?? 0,
    behindTemplate: a.behind,
    version: a.version,
    divergence: a.divergence ?? null,
  };
}

/* ═══════════════════════════════════ the four-level wire, flattened ══

   The backend answers with the schema's tree (`wire.ts`); every screen here
   reads the flat shapes above. These are the only functions that know both. */

/** A program template (or certified plan) as the shelf and builder read it. */
function templateOf(p: PlanProgramWire): TemplateWire {
  return {
    id: p.id,
    version: p.version,
    exerciseCount: p.exerciseCount,
    name: p.name,
    goal: goalLabelOf(p.goal),
    description: p.description,
    exercises: flatRowsOf(p.workouts) as TemplateExerciseWire[],
    dayLabels: dayLabelsOf(p.workouts),
    createdAt: p.createdAt,
    /* A certified plan's stamp is its REVISION — what a copy is compared
       against. A trainer's own keeps `updatedAt`, the shelf's order. */
    updatedAt: p.origin === 'inclineyou' ? p.revisedAt : p.updatedAt,
    weeks: p.weeks,
    trainingDays: trainingDaysOf(p.days),
    assignedCount: p.assignedCount,
    activeAssignedCount: p.activeAssignedCount,
    assignedClients: p.assignedClients,
    source: p.origin === 'inclineyou' ? 'certified' : 'own',
    /* The copy's `syncedAt` is the moment it took the source — which is what
       `copiedFrom.updatedAt` has always meant to the *revised since* notice. */
    copiedFrom: p.copiedFrom
      ? { id: p.copiedFrom.id, name: p.copiedFrom.name, updatedAt: p.syncedAt ?? 0 }
      : null,
  };
}

function certifiedOf(p: PlanProgramWire): CertifiedWire {
  return {
    ...templateOf(p),
    certified: p.certified
      ? {
          summary: p.certified.summary,
          level: p.certified.level,
          equipment: equipmentOf(p.certified.equipment),
          reviewedAt: p.certified.reviewedAt ?? 0,
          usedCount: p.certified.usedCount,
        }
      : null,
    exerciseCount: p.exerciseCount,
    mine: p.mine,
  };
}

/** A client's plan as the client screens read it. */
function programOf(p: PlanProgramWire): ProgramWire {
  return {
    id: p.id,
    clientId: p.clientId ?? '',
    templateId: p.copiedFromProgramId,
    name: p.name,
    goal: goalLabelOf(p.goal),
    startDate: p.startDate,
    endDate: p.endDate,
    status: p.status ?? 'active',
    version: p.version,
    dayLabels: dayLabelsOf(p.workouts),
    weeks: p.weeks,
    trainingDays: trainingDaysOf(p.days),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    syncedAt: p.syncedAt ?? undefined,
  };
}

/** A plan's rows as a client copy's — each with the `workout_exercise` id. */
function programRowsOf(p: PlanProgramWire): ProgramExerciseWire[] {
  const ids = (p.workouts ?? [])
    .slice()
    .sort(
      (a, b) =>
        (a.week ?? 1) - (b.week ?? 1) || (a.day ?? 1) - (b.day ?? 1) || (a.position ?? 0) - (b.position ?? 0),
    )
    .flatMap(w => w.exercises.map(e => e.id ?? ''));
  return flatRowsOf(p.workouts).map((r, i) => ({
    ...(r as TemplateExerciseWire),
    id: ids[i] || `${p.id}_${i}`,
    programId: p.id,
  }));
}

/**
 * The builder's patch → the program body. The tree is rebuilt whenever the
 * rows OR the shape moved — a *mark as rest day* sends `trainingDays` alone,
 * and compacting the days renumbers the rows under them — so a shape-only
 * patch reads the current rows first and writes them back re-placed.
 */
/** Does this edit touch the tree or its shape? Only then is it a PUT; a rename is a PATCH. */
const touchesShape = (patch: TemplatePatch) =>
  patch.exercises !== undefined || patch.trainingDays !== undefined || patch.dayLabels !== undefined
  || patch.weeks !== undefined;

async function bodyOf(patch: TemplatePatch, currentId: string | null): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.goal !== undefined) body.goal = goalIdOf(patch.goal);
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.weeks !== undefined) body.weeks = patch.weeks;
  if (!touchesShape(patch)) return body;

  /* A PUT is the whole program, so whatever the edit left out comes from what is saved. */
  const current = currentId ? await get<PlanProgramWire>(`/v1/programs/${encodeURIComponent(currentId)}`) : null;
  if (current) {
    if (body.name === undefined) body.name = current.name;
    if (body.goal === undefined) body.goal = current.goal;
    if (body.description === undefined) body.description = current.description;
  }
  const rows: FlatRow[] = (patch.exercises ?? flatRowsOf(current?.workouts)) as FlatRow[];
  const tree = treeOf(rows, {
    trainingDays: patch.trainingDays ?? (current ? trainingDaysOf(current.days) : undefined),
    dayLabels: patch.dayLabels ?? dayLabelsOf(current?.workouts),
  });
  /* Weeks: the patch's, or enough to hold every row written. */
  const deepest = tree.workouts.reduce((m, w) => Math.max(m, w.week ?? 1), 1);
  body.weeks = Math.max(Number(body.weeks ?? current?.weeks ?? 1), deepest);
  body.days = tree.days;
  body.workouts = tree.workouts;
  return body;
}

/** Save an existing program: a PUT of the whole tree, or a PATCH when only its name, goal or description moved. */
async function savePlan(id: string, patch: TemplatePatch, version: string): Promise<PlanProgramWire> {
  return call<PlanProgramWire>(`/v1/programs/${encodeURIComponent(id)}`, {
    method: touchesShape(patch) ? 'PUT' : 'PATCH',
    body: await bodyOf(patch, id),
    ifMatch: version,
  });
}

/* ══════════════════════════════════════════════════════ the reads ══ */

/**
 * Names come WITH the program read (R48): `exercises` is a dictionary of each
 * movement once. The builder no longer makes a follow-up `?ids=` request.
 * A summary row carries no tree and so no dictionary — the shelf needs none.
 */
function namesOf(...plans: (PlanProgramWire | null | undefined)[]): Record<string, ExerciseNameWire> {
  const out: Record<string, ExerciseNameWire> = {};
  for (const plan of plans) {
    for (const [id, n] of Object.entries(plan?.exercises ?? {}) as [string, PlanExerciseNameWire][]) {
      out[id] = {
        id,
        name: n.name,
        muscleGroup: n.muscleGroup ?? null,
        bodyPart: n.bodyPart ?? null,
        target: n.target ?? null,
        equipment: n.equipment ?? null,
        movementPattern: n.movementPattern ?? null,
        level: n.level ?? null,
        isCustom: n.isCustom ?? false,
      };
    }
  }
  return out;
}

export interface ShelfData {
  templates: TemplateWire[];
  names: Record<string, ExerciseNameWire>;
}

/**
 * The shelf. One request: `GET /v1/programs?kind=template` (Programs L1) —
 * summaries with counts and who is on each, no trees, so no names to fetch.
 */
export async function getShelf(): Promise<ShelfData> {
  const templates = (await items<PlanProgramWire>('/v1/programs?kind=template')).map(templateOf);
  return { templates, names: {} };
}

export interface CertifiedShelfData {
  certified: CertifiedWire[];
  /** How many of the trainer's OWN programs there are, for the tab strip's count. */
  ownCount: number;
}

export async function getCertifiedShelf(): Promise<CertifiedShelfData> {
  const [certified, own] = await Promise.all([
    items<PlanProgramWire>('/v1/programs/certified'),
    items<PlanProgramWire>('/v1/programs?kind=template'),
  ]);
  return { certified: certified.map(certifiedOf), ownCount: own.length };
}

export interface CertifiedPreviewData {
  template: CertifiedWire;
  names: Record<string, ExerciseNameWire>;
  ownCount: number;
}

/** One library program with its tree, for the read-only preview (Programs L2). */
export async function getCertifiedPreview(id: string): Promise<CertifiedPreviewData> {
  const [plan, own] = await Promise.all([
    get<PlanProgramWire>(`/v1/programs/certified/${encodeURIComponent(id)}`),
    items<PlanProgramWire>('/v1/programs?kind=template'),
  ]);
  return { template: certifiedOf(plan), names: namesOf(plan), ownCount: own.length };
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
  /** v1.1 — `revisedAt` as text; the `If-Match` of the next save. */
  version: string;
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
  const [plan, all, history] = await Promise.all([
    get<PlanProgramWire>(`/v1/programs/${encodeURIComponent(programId)}`),
    clients(),
    items<PlanProgramWire>(`/v1/programs?clientId=${encodeURIComponent(clientId)}`)
      .then(rows => rows.map(programOf))
      .catch(() => [] as ProgramWire[]),
  ]);
  const client = all.find(c => c.id === clientId);
  if (!client) throw new ProgramsApiError(404);
  const program = programOf(plan);
  const exercises = programRowsOf(plan);

  // A programme reached through the wrong client's URL is not this client's
  // plan. 404 rather than rendering somebody else's prescription under their
  // name — the guard turns it into *this plan is gone*.
  if (program.clientId !== clientId) throw new ProgramsApiError(404);

  /* An InclineYou source is read through /certified, a trainer's through /{id}; the
     copy's own `copiedFrom` does not say which, so try the trainer's first and
     let a 404 (a deleted or library source) fall through to null. */
  const originPlan = program.templateId
    ? await get<PlanProgramWire>(`/v1/programs/${encodeURIComponent(program.templateId)}`)
        .catch(() => get<PlanProgramWire>(`/v1/programs/certified/${encodeURIComponent(program.templateId!)}`))
        .catch(() => null)
    : null;
  const origin = originPlan ? templateOf(originPlan) : null;

  /* THE ORIGIN'S IDS ARE IN HERE TOO, and they have to be: a diff line reads
     *Bench Press → Dumbbell Press*, and the movement a trainer REMOVED for this
     client is by definition not in their copy any more. Naming it off the copy's
     rows alone printed the id. */
  const names = namesOf(plan, originPlan);

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
  const [templates, plan, assignments, roster] = await Promise.all([
    items<PlanProgramWire>('/v1/programs?kind=template').then(rows => rows.map(templateOf)),
    get<PlanProgramWire>(`/v1/programs/${encodeURIComponent(templateId)}`),
    items<AssignmentItem>(`/v1/programs/${encodeURIComponent(templateId)}/assignments`),
    clients(),
  ]);

  return {
    templates,
    template: templateOf(plan),
    assignments: assignments.map(assignmentOf),
    clients: roster,
    names: namesOf(plan),
  };
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

const newId = () => crypto.randomUUID();

/** `id` is minted here so a retried create replays (200) instead of making two. */
export async function postTemplate(body: TemplatePatch, id: string = newId()): Promise<TemplateWire> {
  const made = await call<PlanProgramWire>('/v1/programs', {
    method: 'POST',
    body: { id, ...(await bodyOf(body, null)) },
  });
  return templateOf(made);
}

/**
 * A blueprint edit is one PUT of the whole tree, conditional on the version the
 * builder loaded (R46/R82); the answer carries the next one. A stale save is
 * `412 PROGRAM_REVISED`, which the caller surfaces as the server's own sentence.
 */
export async function putTemplate(id: string, body: TemplatePatch, version: string): Promise<TemplateWire> {
  return templateOf(await savePlan(id, body, version));
}

/** Duplicate · Save as template · Use this — one route, `copyFrom` (Programs A4). */
export async function postCopy(sourceId: string, name?: string | null): Promise<TemplateWire> {
  const copy = await call<PlanProgramWire>('/v1/programs', {
    method: 'POST',
    body: { id: newId(), copyFrom: sourceId, ...(name?.trim() ? { name: name.trim() } : {}) },
  });
  return templateOf(copy);
}

/** Use an InclineYou program: the same copy call, the library id as the source. */
export async function postCertifiedCopy(id: string, name?: string | null): Promise<TemplateWire> {
  return postCopy(id, name);
}

export async function postDuplicate(id: string, name?: string): Promise<TemplateWire> {
  return postCopy(id, name);
}

/** The catalogue, list-shaped, and nothing beside it. */
export async function getCertifiedList(): Promise<CertifiedWire[]> {
  return (await items<PlanProgramWire>('/v1/programs/certified')).map(certifiedOf);
}

export async function deleteTemplate(id: string): Promise<void> {
  await call<void>(`/v1/programs/${encodeURIComponent(id)}`, { method: 'DELETE' });
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
  /** The new plan's id, minted by the caller so a retry replays. */
  id?: string;
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

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Give a client a copy of a template (Programs A5, R81).
 *
 * Apply takes no schedule any more, so when the trainer changed the week in the
 * panel this saves it first — `PUT /v1/clients/{id}/schedule`, conditional on
 * the version the summary carries, `programDay` per slot — and only then applies.
 * If apply fails after the week saved, a retry with the same `id` is safe.
 */
export async function postApply(id: string, body: ApplyPayload): Promise<ProgramSummaryWire> {
  if (body.schedule.length > 0) {
    const client = (await clients()).find(c => c.id === body.clientId);
    const current = (client?.weeklySchedule ?? [])
      .map(s => `${s.weekday}@${s.time}#${s.templateDay}`)
      .sort()
      .join('|');
    const wanted = body.schedule
      .map(s => `${s.weekday}@${s.time}#${s.day}`)
      .sort()
      .join('|');
    if (client && client.scheduleVersion && current !== wanted) {
      await call(`/v1/clients/${encodeURIComponent(body.clientId)}/schedule`, {
        method: 'PUT',
        ifMatch: client.scheduleVersion,
        body: {
          deliveryMode: client.deliveryMode === 'remote' ? 'remote' : 'floor',
          sessionsPerWeek: body.schedule.length,
          slots: body.schedule.map(s => ({ weekday: s.weekday, start: s.time, programDay: s.day })),
        },
      });
    }
  }
  const made = await call<PlanProgramWire>(`/v1/programs/${encodeURIComponent(id)}/apply`, {
    method: 'POST',
    body: {
      id: body.id ?? newId(),
      clientId: body.clientId,
      name: body.name ?? null,
      goal: body.goal ? goalIdOf(body.goal) : null,
      startDate: body.startDate ? isoDay(body.startDate) : null,
      endDate: body.endDate ? isoDay(body.endDate) : null,
    },
  });
  return {
    id: made.id,
    clientId: made.clientId ?? body.clientId,
    templateId: made.copiedFromProgramId ?? id,
    name: made.name,
    startDate: made.startDate,
    endDate: made.endDate,
    status: made.status ?? 'active',
  };
}

/**
 * THE CLIENT COPY'S SAVE — one conditional PUT of the whole prescription.
 * It does NOT move `synced_at`: tuning a copy is not taking the blueprint.
 */
export async function putProgramBlueprint(
  programId: string,
  body: TemplatePatch,
  version: string,
): Promise<ProgramWire> {
  return programOf(await savePlan(programId, body, version));
}

export interface ResyncResultWire {
  programId: string;
  templateId: string;
  removed: number;
  added: number;
  version: string;
}

/** Take the template's latest (Programs A6). `version` is the plan's, as the banner drew it. */
export async function postResync(programId: string, version?: string): Promise<ResyncResultWire> {
  /* The assignments list does not carry each copy's version, so a push from the
     template's side reads it now — the trainer has just confirmed the warning. */
  version ??= (await get<PlanProgramWire>(`/v1/programs/${encodeURIComponent(programId)}`)).version;
  const done = await call<{ programId: string; sourceId: string; removed: number; added: number; version: string }>(
    `/v1/programs/${encodeURIComponent(programId)}/resync`,
    { method: 'POST', body: {}, ifMatch: version },
  );
  return {
    programId: done.programId,
    templateId: done.sourceId,
    removed: done.removed,
    added: done.added,
    version: done.version,
  };
}

/** `PATCH /v1/programs/{id} {status}` — pause, resume or end a client's plan. */
export async function patchStatus(
  programId: string,
  status: 'active' | 'paused' | 'completed',
): Promise<ProgramWire> {
  return programOf(
    await call<PlanProgramWire>(`/v1/programs/${encodeURIComponent(programId)}`, {
      method: 'PATCH',
      body: { status },
    }),
  );
}

export interface PlanNoticeResultWire {
  sent: boolean;
}

/**
 * HELD BACK IN v1 (R47). `POST /v1/programs/{id}/notify` writes to the portal's
 * bell, which is out of v1 — the route is gone, so this answers "not sent"
 * without a request. The call sites stay behind the release flag.
 */
export async function postPlanNotice(_programId: string): Promise<PlanNoticeResultWire> {
  return { sent: false };
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
  const [programs, roster] = await Promise.all([
    items<PlanProgramWire>('/v1/programs?kind=client&status=active,paused,completed'),
    clients(),
  ]);
  return { programs: programs.map(programOf), clients: roster };
}
