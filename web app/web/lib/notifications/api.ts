import 'server-only';

import { getToken } from '@/lib/auth/session';

import type { Notification, NotificationKind } from './types';

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';

const KINDS: NotificationKind[] = ['payment', 'cancelled', 'metric', 'team'];

/**
 * The bell's feed, for the shell.
 *
 * ── WHY THE LAYOUT FETCHES THIS AND NOT THE PAGE ────────────────────────────
 *
 * Exactly the argument `lib/shell/api.ts` makes for the palette's roster, and
 * it lands harder here: the bell is drawn by `TopBar` on every screen in the
 * shell, and a count that each page had to remember to fetch is a count that is
 * right on the screens somebody remembered and absent on the rest. The palette
 * failed that way on fifteen of twenty screens before it moved into the shell.
 *
 * So it is one read in the layout, beside `getTrainerName()` and `getRoster()`,
 * and it runs on every navigation inside `(main)`. That is affordable for the
 * same reason theirs is: the server windows the feed to three weeks and caps
 * it, so this is a couple of dozen small rows and never the whole account.
 *
 * ── AND IT RETURNS [] ON EVERY FAILURE ──────────────────────────────────────
 *
 * Same promise as the other two shell reads, for the same reason: a bell with
 * no count is a smaller loss than a layout that throws. The one difference
 * worth naming is that an empty feed and a broken feed look identical to the
 * trainer — and that is the right trade here, because the bell is the one
 * surface in the product whose whole job is "there is nothing you missed". An
 * error banner in the top bar on every screen, to report that a list of things
 * that already happened could not be fetched, would be louder than the feature.
 */
export async function listNotifications(): Promise<Notification[]> {
  const token = await getToken();
  if (!token) return [];
  try {
    const res = await fetch(`${BASE}/v1/notifications`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    /* Filtered on the way in rather than trusted. `kind` drives a CSS modifier
       and a switch with no default, so a kind this build has never heard of
       would render an untinted plate above an empty line — a row that says
       nothing, on the one surface whose contract is that every row says
       something. A backend that adds a fifth kind should ship a client that
       knows it; until then the row is dropped rather than half-drawn. */
    return data.filter(isNotification).sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

function isNotification(row: unknown): row is Notification {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.at === 'number' &&
    KINDS.includes(r.kind as NotificationKind)
  );
}
