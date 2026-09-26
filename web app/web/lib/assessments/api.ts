import 'server-only';

import { getToken } from '@/lib/auth/session';
import type { ClientWire } from '@/lib/clients/api';
import { PAGE_SIZE, type Query } from './address';
import type { AssessmentDetailWire } from './detail';
import { STATUSES_FOR } from './vocab';
import type { AssessmentWire, CatalogWire, TemplateWire } from './vocab';

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

export class AssessmentsApiError extends Error {
  constructor(readonly status: number | null) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'AssessmentsApiError';
  }
}

async function request<T>(path: string): Promise<T> {
  const token = await getToken();
  if (!token) throw new AssessmentsApiError(401);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AssessmentsApiError(null);
  }
  if (!res.ok) throw new AssessmentsApiError(res.status);

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
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
interface Page {
  items: AssessmentWire[];
  total: number;
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
  if (states.length > 0) p.set('status', states.join(','));
  if (q.read !== 'all') p.set('read', q.read);
  if (q.clientId) p.set('clientId', q.clientId);
  if (q.q.trim()) p.set('q', q.q.trim());
  p.set('page', String(q.page));
  p.set('size', String(PAGE_SIZE));
  return `/v1/assessments?${p.toString()}`;
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
  const [page, all, templates, catalog, clients] = await Promise.all([
    request<Page>(listPath(q)),
    lenient<Page>('/v1/assessments?size=1', { items: [], total: 0 }),
    lenient<TemplateWire[]>('/v1/assessment-templates', []),
    lenient<CatalogWire | null>('/v1/assessment-catalog', null),
    lenient<ClientWire[]>('/v1/clients', []),
  ]);

  return {
    rows: page.items,
    total: page.total,
    grandTotal: all.total,
    templates,
    catalog,
    clients,
    now: Date.now(),
  };
}

export interface TemplatesData {
  templates: TemplateWire[];
  catalog: CatalogWire | null;
  /** For the strip's count on the tab the reader is NOT on. */
  assessmentTotal: number;
  clients: ClientWire[];
  now: number;
}

export async function getAssessmentTemplates(): Promise<TemplatesData> {
  const [templates, catalog, all, clients] = await Promise.all([
    request<TemplateWire[]>('/v1/assessment-templates'),
    lenient<CatalogWire | null>('/v1/assessment-catalog', null),
    lenient<Page>('/v1/assessments?size=1', { items: [], total: 0 }),
    lenient<ClientWire[]>('/v1/clients', []),
  ]);
  return { templates, catalog, assessmentTotal: all.total, clients, now: Date.now() };
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
 * `size=200` and no paging, which is the difference between this read and the
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
  const page = await request<Page>(
    `/v1/assessments?clientId=${encodeURIComponent(clientId)}&size=200`,
  );
  return page.items ?? [];
}
