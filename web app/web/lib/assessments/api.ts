import 'server-only';

import { api, ApiError, listAll, type ListEnvelope } from '@/lib/http/client';
import { PAGE_SIZE, type Query } from './address';
import type { AssessmentDetailWire } from './detail';
import { STATUSES_FOR } from './vocab';
import type { AssessmentWire, CatalogWire, ScheduleWire, TemplateWire } from './vocab';

/**
 * A row of `GET /v1/clients?view=summary` — the roster's own shape. This screen asked for `view=legacy`,
 * which the backend refuses with a 400 (`ClientController`: only `summary` exists), and `lenient` turned
 * the refusal into an empty list: every row read *A client*, the Client filter found nobody and the
 * Schedule sheet's picker was empty, with nothing saying why.
 */
export interface ClientWire {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  membershipStatus?: string | null;
  deliveryMode?: string | null;
  metadata?: Record<string, unknown> | null;
  weeklySchedule?: Array<{ templateDay: number; weekday: number; time: string }> | null;
  createdAt?: number;
  updatedAt?: number;
}

/** The whole roster, every page. `null` where the read FAILED, so the screen can say so. */
async function clientsOrNull(): Promise<ClientWire[] | null> {
  try {
    const rows = await listAll<ClientWire & { name: string | null }>('/v1/clients?view=summary', (p) =>
      request<ListEnvelope<ClientWire & { name: string | null }>>(p),
    );
    return rows.map((c) => ({ ...c, name: c.name ?? 'Unnamed' }));
  } catch {
    return null;
  }
}

export class AssessmentsApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'AssessmentsApiError';
  }
}

/**
 * The shared client does the work (bearer, `x-inclineyou-client: web`, timeout,
 * the dev log); this only keeps the screen's own error type, which `guard.ts`
 * reads to tell *unreachable* from *refused*.
 */
async function request<T>(path: string): Promise<T> {
  try {
    return await api<T>(path);
  } catch (error) {
    if (error instanceof ApiError) throw new AssessmentsApiError(error.status);
    throw error;
  }
}

/**
 * A read the screen can do without.
 *
 * `lib/sessions/api.ts` draws the line and this file draws it in the same
 * place. The LIST is content: a list that failed would tell a trainer nobody
 * has a check-in outstanding, which is the page confidently saying the wrong
 * thing. The CATALOGUE is context — without it the editor cannot offer new
 * measurements and says so, which is a state the screen already knows how to
 * draw, and taking the whole page down because a fixed list of twenty-one rows
 * did not load would be the worse outcome.
 */
async function lenient<T>(path: string, fallback: T): Promise<T> {
  try {
    return (await request<T>(path)) ?? fallback;
  } catch {
    return fallback;
  }
}

/** `{items, total}` — the shape a filtered search route answers with (trap 30). */
/**
 * `GET /v1/assessments` on the 1.1 wire: keyset-paged. `total` and `grandTotal`
 * come back only with `includeTotal=true`.
 */
interface Page {
  items: AssessmentWire[];
  nextCursor: string | null;
  total?: number;
  grandTotal?: number;
}

/** `GET /v1/assessment-templates` — a bounded envelope, no cursor. */
interface Shelf {
  items: TemplateWire[];
}

export interface AssessmentsData {
  rows: AssessmentWire[];
  /** The count AFTER the filters, which is what the pager divides. */
  total: number;
  /** Every check-in, unfiltered — the figure beside the page title. */
  grandTotal: number;
  templates: TemplateWire[];
  catalog: CatalogWire | null;
  /** Name and status per client, for the row, the avatar and the Client facet. */
  clients: ClientWire[];
  /** The roster read FAILED: names and the picker are unavailable, and the page says so. */
  clientsFailed: boolean;
  /** The whole book by what the trainer filters on — the Status options' counts. */
  counts: Record<'all' | 'done' | 'missed' | 'incoming', number>;
  now: number;
}

function listPath(q: Query): string {
  const p = new URLSearchParams();
  /* THE COLLAPSE IS UNDONE HERE, and only here. The address carries the
     trainer's question — *incoming* — and the wire takes the stored states it
     selects, which for that one is two. `STATUSES_FOR` is the single copy of
     that mapping; a second one in the route handler is how a filter chip comes
     to disagree with the rows it selects. */
  const states = STATUSES_FOR[q.status];
  // `state`, not `status` — the value is derived, not a column (1.1).
  if (states.length > 0) p.set('state', states.join(','));
  if (q.clientId) p.set('clientId', q.clientId);
  if (q.q.trim()) p.set('q', q.q.trim());
  p.set('limit', String(PAGE_SIZE));
  return `/v1/assessments?${p.toString()}`;
}

/**
 * Page `q.page` of the list. 1.1 pages by cursor, not by number, so the pager's
 * page N is reached by walking N−1 cursors — cheap at twenty a page, and the
 * first read asks for the totals the pager divides.
 */
async function pageOf(q: Query): Promise<Page> {
  const base = listPath(q);
  let page = await request<Page>(`${base}&includeTotal=true`);
  const totals = { total: page.total ?? 0, grandTotal: page.grandTotal ?? 0 };
  for (let n = 1; n < q.page && page.nextCursor; n++) {
    page = await request<Page>(`${base}&cursor=${encodeURIComponent(page.nextCursor)}`);
  }
  return { ...page, ...totals };
}

/**
 * The screen, in one round of parallel reads.
 *
 * FIVE READS AND ONLY ONE OF THEM CAN FAIL THE PAGE. The filtered page is the
 * content. The unfiltered count is a second call and not `page.total` because
 * `total` is the count after the facets — the title said *Assessments · 2*
 * while the list held thirty-three the first time this was one read, which is
 * the same class of bug as a filter the pagination does not know about, seen
 * from the other end.
 */
export async function getAssessments(q: Query): Promise<AssessmentsData> {
  const countOf = async (state: string) =>
    (await lenient<Page>(`/v1/assessments?limit=1&includeTotal=true${state ? `&state=${state}` : ''}`, {
      items: [],
      nextCursor: null,
      total: 0,
    })).total ?? 0;
  const [page, all, templates, catalog, clients, nDone, nMissed, nIncoming] = await Promise.all([
    pageOf(q),
    lenient<Page>('/v1/assessments?limit=1&includeTotal=true', { items: [], nextCursor: null, total: 0 }),
    lenient<Shelf>('/v1/assessment-templates', { items: [] }),
    lenient<CatalogWire | null>('/v1/assessment-catalog', null),
    clientsOrNull(),
    countOf('done'),
    countOf('missed'),
    countOf('booked'),
  ]);

  return {
    rows: page.items,
    total: page.total ?? 0,
    grandTotal: all.total ?? 0,
    templates: templates.items,
    catalog,
    clients: clients ?? [],
    clientsFailed: clients === null,
    counts: { all: all.total ?? 0, done: nDone, missed: nMissed, incoming: nIncoming },
    now: Date.now(),
  };
}

export interface TemplatesData {
  templates: TemplateWire[];
  catalog: CatalogWire | null;
  /** For the strip's count on the tab the reader is NOT on. */
  assessmentTotal: number;
  clients: ClientWire[];
  /** Per template: how many assessments were TAKEN with it, and when the last one was. `null` where the read failed. */
  usage: Record<string, { taken: number; last: number | null }> | null;
  now: number;
}

export async function getAssessmentTemplates(): Promise<TemplatesData> {
  const [templates, catalog, all, clients, taken] = await Promise.all([
    request<Shelf>('/v1/assessment-templates'),
    lenient<CatalogWire | null>('/v1/assessment-catalog', null),
    lenient<Page>('/v1/assessments?limit=1&includeTotal=true', { items: [], nextCursor: null, total: 0 }),
    clientsOrNull(),
    listAll<AssessmentWire>('/v1/assessments?state=done&limit=100', (p) =>
      request<ListEnvelope<AssessmentWire>>(p),
    ).catch(() => null),
  ]);
  /* WHAT EACH TEMPLATE HAS BEEN USED FOR: the assessments taken from it, off the list the server already
     serves, grouped here (there is no per-template count on the wire). */
  let usage: Record<string, { taken: number; last: number | null }> | null = null;
  if (taken) {
    usage = {};
    for (const a of taken) {
      const u = (usage[a.templateId] ??= { taken: 0, last: null });
      u.taken += 1;
      if (a.completedAt !== null && (u.last === null || a.completedAt > u.last)) u.last = a.completedAt;
    }
  }
  return { templates: templates.items, catalog, assessmentTotal: all.total ?? 0, clients: clients ?? [], usage, now: Date.now() };
}

/**
 * ONE CHECK-IN — the read behind `/clients/assessments/:id`.
 *
 * ONE REQUEST AND NOT FIVE, which is the difference between this and
 * `getAssessments` above. The detail route answers with the client, the
 * template, the readings joined to the catalogue, the answers joined to their
 * questions and the whole history behind each measurement — `assessmentDetail`
 * in the router carries why that join is the server's job. A screen assembling
 * it from `/v1/assessments/:id` + `/v1/assessment-templates` +
 * `/v1/assessment-catalog` would be three reads and one copy of a derivation
 * that already exists on the other side.
 *
 * Nothing is `lenient` here for the same reason nothing is on a client file:
 * every part of this payload IS the content. A detail screen that drew a
 * check-in with its answers quietly missing would be the page confidently
 * saying the client answered nothing.
 */
export async function getAssessment(id: string): Promise<AssessmentDetailWire> {
  return request<AssessmentDetailWire>(`/v1/assessments/${encodeURIComponent(id)}`);
}

/**
 * ONE CLIENT'S CHECK-INS — the client file's own tab.
 *
 * `limit=200` and followed to its end, which is the difference between this read and the
 * list's. The list is the whole book and pages at twenty; this is one person,
 * and a client on a check-in every eight weeks reaches twenty after three
 * years. A pager on a tab that will hold four rows for most of a client's life
 * is a control that exists to say *there is no more*.
 *
 * Newest first, which the route already answers with — the list sorts on
 * `dueAt` descending and the tab splits that run into what is owed and what
 * came back rather than re-sorting it.
 */
export async function getClientAssessments(clientId: string): Promise<AssessmentWire[]> {
  // One client's list, followed to its end (1.1 pages by cursor; 200 a page).
  return listAll<AssessmentWire>(
    `/v1/assessments?clientId=${encodeURIComponent(clientId)}&limit=200`,
    (p) => request<Page>(p),
  );
}

/**
 * One client's cycles, live first then ended. `null` on failure for the reason
 * `loadClientAssessments` gives: an empty list where the read failed would say
 * *this client is on no cycle*.
 */
export async function getClientSchedules(clientId: string): Promise<ScheduleWire[]> {
  const res = await request<{ items: ScheduleWire[] }>(
    `/v1/assessment-schedules?clientId=${encodeURIComponent(clientId)}`,
  );
  return res.items;
}

/** The trainer's shelf on its own — the client file's *Assign* sheet needs the forms and nothing else. */
export async function getTemplates(): Promise<TemplateWire[]> {
  return (await request<Shelf>('/v1/assessment-templates')).items;
}
