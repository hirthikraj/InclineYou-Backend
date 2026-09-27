import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';

/**
 * The one way a server component or server action talks to the backend.
 *
 * Only the Next server calls the API (api-contract *Conventions*), so these
 * requests never appear in the browser's Network tab. To make them readable
 * anyway, every call is logged twice in development:
 *
 *   · to the terminal running `next dev` — request line and body, then status,
 *     duration and the parsed response; and
 *   · to the BROWSER console, via `<ApiLogConsole>` — each call made while
 *     rendering the page is recorded here and handed to the client, which
 *     prints it as a collapsible group. See `apiLogEntries`.
 *
 * Neither logs the bearer token. Production logs nothing and records nothing.
 */

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const DEFAULT_TIMEOUT_MS = 8_000;
const DEV = process.env.NODE_ENV === 'development';

/** Past this many characters a logged body is cut, so one big list cannot flood the terminal. */
const MAX_LOGGED_CHARS = 20_000;

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Serialised as JSON. */
  body?: unknown;
  /** Default true: send the signed-in cookie's token, and 401 locally without one. */
  auth?: boolean;
  timeoutMs?: number;
  /** Extra request headers, e.g. `if-match` on a conditional write. */
  headers?: Record<string, string>;
}

/**
 * A call that did not come back 2xx. `status` is null when nothing answered at
 * all — connection refused, DNS, or the timeout — which screens read as
 * *unreachable* rather than as a server problem.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number | null,
    /** The RFC 7807 body, when the server sent one. */
    readonly problem: { detail?: string; code?: string } = {},
  ) {
    super(`inclineyou api ${status ?? 'unreachable'}`);
    this.name = 'ApiError';
  }
}

/** One logged call, as the browser console receives it. */
export interface ApiLogEntry {
  method: string;
  url: string;
  requestBody: unknown;
  status: number | null;
  ms: number;
  responseBody: unknown;
  error?: string;
}

/**
 * The calls made while rendering THIS request. `cache()` scopes it to one
 * server render, so two browsers never see each other's log.
 */
const requestLog = cache((): ApiLogEntry[] => []);

/** What `<ApiLogConsole>` prints. Empty outside development. */
export function apiLogEntries(): ApiLogEntry[] {
  return DEV ? [...requestLog()] : [];
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs = DEFAULT_TIMEOUT_MS, headers: extra } = options;
  const url = `${BASE}${path}`;

  const headers: Record<string, string> = {
    ...extra,
    // Every web request says it is the web (api-contract *Conventions*).
    'x-inclineyou-client': 'web',
  };
  if (auth) {
    const token = await getToken();
    // Without a token the backend answers 401 anyway; saying so here keeps a
    // signed-out browser from being reported as a server problem.
    if (!token) throw new ApiError(401);
    headers.authorization = `Bearer ${token}`;
  }
  if (body !== undefined) headers['content-type'] = 'application/json';

  const started = Date.now();
  logRequest(method, url, body);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Nothing from the API is cacheable: a cached screen is wrong in a way
      // that looks exactly like being right.
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    record({ method, url, requestBody: body, status: null, ms: Date.now() - started, responseBody: null, error: reason });
    throw new ApiError(null);
  }

  const text = await res.text();
  const parsed = parse(text);
  record({ method, url, requestBody: body, status: res.status, ms: Date.now() - started, responseBody: parsed });

  if (!res.ok) {
    const problem = parsed && typeof parsed === 'object' ? (parsed as { detail?: string; code?: string }) : {};
    throw new ApiError(res.status, { detail: problem.detail, code: problem.code });
  }
  return parsed as T;
}

function parse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function logRequest(method: string, url: string, body: unknown) {
  if (!DEV) return;
  console.log(`[api] → ${method} ${url}${body === undefined ? '' : `\n${pretty(body)}`}`);
}

function record(entry: ApiLogEntry) {
  if (!DEV) return;
  const outcome = entry.status === null ? `✗ no response (${entry.error})` : `← ${entry.status}`;
  console.log(`[api] ${outcome} ${entry.method} ${entry.url} · ${entry.ms} ms`
    + (entry.responseBody === null ? '' : `\n${pretty(entry.responseBody)}`));
  requestLog().push(entry);
}

function pretty(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length > MAX_LOGGED_CHARS
    ? `${text.slice(0, MAX_LOGGED_CHARS)}\n… (${text.length - MAX_LOGGED_CHARS} more characters)`
    : text;
}

/* ------------------------------------------------------------ lists (1.1) ──
 * Every list on the 1.1 wire is an envelope, `{ items: […] }`, and a paged one
 * adds `nextCursor` (api-contract *Conventions · Lists*, R66). Nothing is ever
 * cut off silently: a non-null cursor means there is more, so a screen that
 * needs the whole window follows it.
 * -------------------------------------------------------------------------- */

export interface ListEnvelope<T> {
  items: T[];
  nextCursor?: string | null;
}

/** Past this many pages something is wrong with the cursor, not the book. */
const MAX_PAGES = 50;

/**
 * Every item of a list, following `nextCursor` until it is null. `path` may
 * already carry a query; `cursor` is appended. `fetchPage` defaults to `api`,
 * and a screen with its own wrapper (for its own error type) passes that.
 */
export async function listAll<T>(
  path: string,
  fetchPage: (path: string) => Promise<ListEnvelope<T> | null> = (p) => api<ListEnvelope<T>>(p),
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null | undefined = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const res: ListEnvelope<T> | null = await fetchPage(
      cursor ? `${path}${sep}cursor=${encodeURIComponent(cursor)}` : path,
    );
    out.push(...(res?.items ?? []));
    cursor = res?.nextCursor;
    if (!cursor) break;
  }
  return out;
}
