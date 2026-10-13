import { getToken } from '@/lib/auth/session';

/**
 * `GET /api/portal/export` — the client's own data as a JSON download, proxied (api-contract 1.2, ps-a6).
 *
 * The browser never holds the token and never talks to Spring, so this handler is the link: it adds the token and the web header and hands the
 * body straight back with the backend's own `Content-Disposition`. A refusal — the per-person ceiling of five an hour is `429 RATE_LIMITED` — keeps
 * its status and its JSON problem body, so the browser lands on a sentence rather than on a "file" that is really an error page. Reachable from the
 * removed wall as well: a client who has left can still take their history with them.
 */
export const dynamic = 'force-dynamic';

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';

export async function GET(request: Request): Promise<Response> {
  const token = await getToken();
  if (!token) return Response.json({ code: 'UNAUTHENTICATED' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

  let upstream: Response;
  try {
    upstream = await fetch(`${BASE}/v1/portal/export`, { headers: { authorization: `Bearer ${token}`, 'x-inclineyou-client': 'web' }, cache: 'no-store', signal: request.signal });
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
