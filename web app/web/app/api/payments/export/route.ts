import { getToken } from '@/lib/auth/session';

/**
 * `GET /api/payments/export` — the ledger as a CSV download, proxied.
 *
 * ── WHY A ROUTE HANDLER ──────────────────────────────────────────────────────
 *
 * The browser never holds the token and never talks to Spring, so a plain link to
 * `/v1/payments/export` is not available to it. This handler is the link: it adds
 * the token and the web header, asks the backend for the same window and chip the
 * page is showing, and hands the body straight back as a stream with the
 * backend's own `Content-Disposition`. Next never buffers the file — the old
 * Transactions page read `size=5000` into memory to build one (contract R86).
 *
 * ── ONLY THE FILTERS THE BACKEND KNOWS GO THROUGH ────────────────────────────
 *
 * The query string is rebuilt from a whitelist rather than forwarded whole, so
 * this route cannot be used to reach any other backend path or parameter. `from`
 * and `to` are required by the backend (a CSV needs a span, and its ceiling is
 * three years); a missing one is the backend's 400 and is passed back as it is.
 *
 * ── AND A REFUSAL IS PASSED BACK, NOT REPLACED ───────────────────────────────
 *
 * A non-2xx answer keeps its status and its JSON problem body, so the browser
 * lands on an error the trainer can read rather than on a "file" that is really
 * an error page. No `Accept: text/csv` is sent: the backend's error body is JSON
 * and would be a 406 against that header.
 */
export const dynamic = 'force-dynamic';

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';

const FILTERS = ['from', 'to', 'status', 'method', 'clientId', 'collectedBy', 'clientType'] as const;

export async function GET(request: Request): Promise<Response> {
  const token = await getToken();
  if (!token) {
    return Response.json({ code: 'UNAUTHENTICATED' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  const incoming = new URL(request.url).searchParams;
  const q = new URLSearchParams();
  for (const name of FILTERS) {
    const v = incoming.get(name);
    if (v) q.set(name, v);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${BASE}/v1/payments/export?${q}`, {
      headers: { authorization: `Bearer ${token}`, 'x-inclineyou-client': 'web' },
      cache: 'no-store',
      // No timeout: a long export legitimately streams for a while. The browser
      // closing the tab aborts it, which is the only cancellation it needs.
      signal: request.signal,
    });
  } catch {
    return Response.json({ code: 'UNREACHABLE' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }

  const headers = new Headers({ 'Cache-Control': 'no-store' });
  for (const h of ['content-type', 'content-disposition']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
