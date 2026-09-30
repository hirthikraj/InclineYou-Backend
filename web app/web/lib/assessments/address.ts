/**
 * THE ADDRESS OF THE ASSESSMENTS SCREEN — what the URL carries, and what it
 * deliberately does not.
 *
 * The standing rule, trap 25: *a search-param change is a server round trip*,
 * so the URL carries what is FETCHED and state carries the rest. Everything
 * here changes which rows come back — the tab, the facets, the search, the page
 * — and every one of them is therefore in the address and re-read on the
 * server. The editor being open, the accordion inside it and which measurement
 * group is folded are all state, and none of them is here.
 *
 * `lib/sessions/tabs.ts` is the same file for `/programs/workouts`, and this
 * one follows it down to the `parse*` names so a reader who knows one knows
 * both.
 *
 * Not `server-only`: the page parses the address on the server and the screen
 * writes it in the browser, which is trap 18's exact shape.
 */

import type { PageTab } from '@/components/shell/PageTabs';
import { STATUS_FILTERS, type StatusFilter } from './vocab';

export type AssessmentsTabKey = 'list' | 'templates';

export const ASSESSMENTS_TABS: { key: AssessmentsTabKey; label: string; href: string }[] = [
  { key: 'list', label: 'Assessments', href: '/clients/assessments' },
  { key: 'templates', label: 'Templates', href: '/clients/assessments/templates' },
];

/**
 * The strip, with a count on whichever tab is not the one being read.
 *
 * `/programs`' rule, kept: a count on the CURRENT tab is a figure the page
 * below it already states in its own subtitle, so it is dropped rather than
 * drawn twice. On the other tab it is the one thing the strip can say that the
 * page cannot — how much is over there.
 */
export function assessmentsTabs(
  current: AssessmentsTabKey,
  counts: Partial<Record<AssessmentsTabKey, number | null>> = {},
): PageTab[] {
  return ASSESSMENTS_TABS.map((t) => ({
    key: t.key,
    label: t.label,
    href: t.href,
    count: t.key === current ? null : counts[t.key] ?? null,
  }));
}

/** How many rows a page of the list holds. */
export const PAGE_SIZE = 20;

export interface Query {
  /** One of four, `all` included — `StatusFilter` carries why it is not the
   *  four stored states and not a set. */
  status: StatusFilter;
  /** A client id, or null for the whole roster. */
  clientId: string | null;
  q: string;
  page: number;
}

export const NO_QUERY: Query = { status: 'all', clientId: null, q: '', page: 0 };

type Param = string | string[] | undefined;

function one(v: Param): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

const FILTERS = new Set<string>(STATUS_FILTERS.map((f) => f.value));

/**
 * `?status=incoming` → the filter. One value, never a list.
 *
 * An unknown name falls back to `all` rather than refusing, and so does a
 * comma list left over from the address this parameter used to take —
 * `parseView`'s rule: a hand-typed parameter is a typo, not a request for
 * nothing, and a link somebody kept from last week is the same thing.
 */
export function parseStatus(v: Param): StatusFilter {
  const s = one(v);
  return FILTERS.has(s) ? (s as StatusFilter) : 'all';
}

export function parseClientId(v: Param): string | null {
  const s = one(v).trim();
  return s === '' ? null : s;
}

export function parsePage(v: Param): number {
  const n = Number.parseInt(one(v), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseQuery(params: Record<string, Param>): Query {
  return {
    status: parseStatus(params.status),
    clientId: parseClientId(params.client),
    q: one(params.q).slice(0, 80),
    page: parsePage(params.page),
  };
}

/**
 * The address, written back.
 *
 * Every default is OMITTED, which is what keeps `/clients/assessments` the
 * canonical address of the unfiltered list. A screen that wrote
 * `?status=&page=0` would have two URLs for one view, and the one a
 * trainer copied out of the bar would be the ugly one.
 */
export function assessmentsHref(q: Query): string {
  const p = new URLSearchParams();
  if (q.status !== 'all') p.set('status', q.status);
  if (q.clientId) p.set('client', q.clientId);
  if (q.q.trim()) p.set('q', q.q.trim());
  if (q.page > 0) p.set('page', String(q.page));
  const s = p.toString();
  return s ? `/clients/assessments?${s}` : '/clients/assessments';
}

/**
 * Narrowing the list puts you back on page one.
 *
 * Every write except the pager's own goes through this. Without it, a trainer
 * reading page 3 who ticks *Missed* lands on page 3 of a two-row list, which
 * draws the *past the end* empty state for an action that should have shown
 * them two rows.
 */
export function refine(q: Query, patch: Partial<Query>): Query {
  return { ...q, ...patch, page: 0 };
}

/** How many facets are set — the figure on the phone's *Filter* chip. */
export function facetCount(q: Query): number {
  return (q.status === 'all' ? 0 : 1) + (q.clientId ? 1 : 0);
}

/* ───────────────────────────────────────── one check-in, and its two tabs ── */

export type AssessmentTab = 'summary' | 'measurements';

/**
 * THE TAB IS IN THE ADDRESS AND THE PICKED MEASUREMENT IS NOT, which looks
 * inconsistent and is trap 25 applied twice.
 *
 * The rule is that the URL carries what is FETCHED. A tab is on that list by
 * name — it is what a trainer sends somebody ("look at the measurements on
 * this one"), it is what the back button has to return to, and `PageTabs` is a
 * strip of LINKS precisely because a tab is a destination.
 *
 * Which measurement the panel is showing is not. Every reading and its whole
 * history arrive in the one payload this screen already fetched, so moving the
 * picker from *Body weight* to *Waist* is a filter over data in the browser —
 * putting it in the address would spend a server round trip and a history
 * entry per twitch of a dropdown, which is the cost `Assessments`' own search
 * field pays deliberately and this control has no reason to.
 */
export function parseAssessmentTab(v: Param): AssessmentTab {
  return one(v) === 'measurements' ? 'measurements' : 'summary';
}

/**
 * WHICH EARLIER CHECK-IN THIS ONE IS BEING READ AGAINST — `?cmp=asm_008`.
 *
 * It was state, and the argument for that was sound and is now beaten by a
 * fact: **a comparison has to survive a tab change, and a tab change is a
 * navigation.** The two tabs are two server renders (`PageTabs` is a strip of
 * links, because a tab here is a destination), so a comparison held in React
 * state is a comparison the trainer loses the moment they go and look at the
 * measurement they just picked it to see. A selection that must outlive a
 * navigation is in the address or it is nowhere.
 *
 * What it buys beyond that is the thing the state version could never do: the
 * URL of *this block against the last one* is a link, and both tabs read the
 * same parameter, so the comparison the Summary is drawing is the one the
 * Measurements panel opens with.
 */
export function parseCompare(v: Param): string | null {
  const s = one(v).trim();
  return s === '' ? null : s;
}

/**
 * WHERE A CHECK-IN IS READ, WHICH IS TWO PLACES AND THEREFORE TWO ADDRESSES.
 *
 * `/clients/assessments/asm_007` is the check-in reached from the BOOK-WIDE
 * list — the screen that answers *who owes me twenty minutes and a tape*, where
 * the row above it belonged to any of forty people.
 *
 * `/clients/cli_008/assessments/asm_007` is the same check-in reached from
 * INSIDE a client's file, where the row above it was one of the three this
 * person has ever been asked. Same payload, same screen; what differs is the
 * way back, and the way back is most of what a leaf screen's address is for. A
 * check-in opened from a file and addressed book-wide hands the trainer a crumb
 * reading *Assessments* and a Back button into a list of forty strangers, when
 * they arrived from a person and are going back to that person.
 *
 * THE SCOPE IS IN THE PATH AND NOT IN A `?from=`, which is trap 25 from its
 * other side: the parameter rule is about what gets FETCHED, and this changes
 * nothing about the fetch. It is where the screen *is*. In the path it survives
 * a copied link, a reload, a tab press and a comparison — the four things a
 * hint would have to be re-attached to by hand, and the tab press is the one
 * that gave this away, because dropping the scope there is a strip of links
 * that silently walks the trainer out of the file they were reading in.
 */
function assessmentBase(id: string, clientId: string | null): string {
  const leaf = `assessments/${encodeURIComponent(id)}`;
  return clientId ? `/clients/${encodeURIComponent(clientId)}/${leaf}` : `/clients/${leaf}`;
}

/** `/clients/assessments/asm_007?tab=measurements&cmp=asm_008`. */
export function assessmentHref(
  id: string,
  tab: AssessmentTab = 'summary',
  compareId: string | null = null,
  /* The client file this check-in is being read INSIDE, or null for the
     book-wide address — see `assessmentBase`. Last and optional, so the list
     that reads the whole roster (every caller that existed before the nested
     route) keeps the address it already had. */
  clientId: string | null = null,
): string {
  const p = new URLSearchParams();
  /* Every default omitted, `assessmentsHref`'s rule one level up: one view,
     one address, and the one a trainer copies out of the bar is the short. */
  if (tab !== 'summary') p.set('tab', tab);
  if (compareId) p.set('cmp', compareId);
  const q = p.toString();
  return `${assessmentBase(id, clientId)}${q ? `?${q}` : ''}`;
}

/**
 * The two tabs, with the measurement count on whichever one is not being read
 * — `assessmentsTabs`' rule one level up, and the same reason: the Summary
 * already says how many tapes came back, so repeating it on its own tab is a
 * badge spent on a figure the page states.
 */
export function assessmentTabs(
  id: string,
  current: AssessmentTab,
  counts: { measurements: number },
  /* THE COMPARISON RIDES ON BOTH TAB LINKS. Without it the strip is the one
     control on the screen that silently drops what the trainer just chose —
     and it is the control they press to go and LOOK at that choice. */
  compareId: string | null = null,
  /* AND SO DOES THE SCOPE, for a sharper version of the same reason: a strip
     that dropped it would take a trainer reading a check-in inside a client's
     file and land them on the book-wide copy of the screen they were already
     on, one press from the tab they wanted. See `assessmentBase`. */
  clientId: string | null = null,
): PageTab[] {
  return [
    {
      key: 'summary',
      label: 'Summary',
      href: assessmentHref(id, 'summary', compareId, clientId),
      count: null,
    },
    {
      key: 'measurements',
      label: 'Measurements',
      href: assessmentHref(id, 'measurements', compareId, clientId),
      count: current === 'measurements' ? null : counts.measurements,
    },
  ];
}
