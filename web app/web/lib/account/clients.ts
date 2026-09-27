import 'server-only';

import { getToken } from '@/lib/auth/session';

/**
 * How many clients this trainer has — for the delete confirmation, and for
 * nothing else.
 *
 * ## Why it is here and not in `lib/clients/api.ts`
 *
 * That module returns the whole roster with its packages, sessions and pending amounts,
 * because the roster screen draws all of it. This wants one integer. Importing
 * the roster's reader would pull four requests' worth of a screen the trainer is
 * not looking at, on a page whose other request is a single profile row.
 *
 * ## And why the count is worth a request at all
 *
 * Because the confirmation on an irreversible button should name what is going.
 * *"Your 22 clients, and every package, payment and session against them, stop
 * being reachable"* is a different sentence from *"your data will be deleted"* —
 * the first is the fact most likely to stop a mis-tap, and it is the one thing
 * on that card the product knows and the trainer may not have in mind.
 *
 * ## Failure is not fatal, deliberately
 *
 * Null on anything that goes wrong, and the card has a sentence for it. A roster
 * that will not load is not a reason a trainer cannot change their own name, and
 * this is a garnish on one paragraph of one card — the only screen in this half
 * where swallowing an error is the right call rather than the lazy one, because
 * the alternative is an error page for a fact nobody asked for.
 */
const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';

export async function countClients(): Promise<number | null> {
  try {
    const token = await getToken();
    if (!token) return null;
    const res = await fetch(`${BASE}/v1/clients?status=all`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    // 1.1: every list is an `{items}` envelope; `status=all` counts archived too.
    const rows = ((await res.json()) as { items?: unknown })?.items;
    return Array.isArray(rows) ? rows.length : null;
  } catch {
    return null;
  }
}
