'use server';

import { getToken } from '@/lib/auth/session';

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';

/**
 * The two writes the bell can make, and neither of them changes the book.
 *
 * That is the whole point of the surface: a notification carries no verb (see
 * `types.ts`), so the only thing that can be written about one is whether it
 * has been seen. Everything a trainer might want to DO about an event is on the
 * screen the row links to.
 *
 * ── WHY OPENING THE PANEL DOES NOT MARK EVERYTHING READ ─────────────────────
 *
 * It is the cheapest way to make the bell go quiet and it destroys the feature.
 * A trainer opens the panel between two clients, sees five rows, reads two of
 * them and gets pulled back onto the floor. If the open marked all five, the
 * three they never read are gone — and the next time the bell is empty they
 * have no way of knowing whether that means "nothing happened" or "you missed
 * it". A count that clears itself on being looked at is a count nobody can
 * trust, and an untrusted count is one nobody opens.
 *
 * So a row is read when it is OPENED, and the header carries an explicit *Mark
 * all read* for the trainer who has decided the rest does not matter. Those are
 * the two things that happened, and each is something the trainer did.
 *
 * ── AND NEITHER OF THEM CAN UNREAD ──────────────────────────────────────────
 *
 * There is no route for it — see `mock/router.ts`. `readAt` is when the trainer
 * first saw the row, and the feed is a record.
 *
 * ── NO `revalidatePath`, AND THAT IS NOT AN OMISSION ────────────────────────
 *
 * The obvious line to end each of these with is `revalidatePath('/', 'layout')`
 * — the feed is read by the `(main)` layout, so that is where it would go. It
 * is left out for two reasons and both are about scope. The layout does not
 * re-render on a navigation between two screens it already wraps, so the call
 * would not refresh the bell on the trip it was written for; and revalidating
 * the shell's layout throws away the roster and the trainer's name with it, on
 * every row anybody reads.
 *
 * What keeps the bell right is `NotificationsHost`, which owns the rows in the
 * browser and stamps them there as they are read. The server is re-read on the
 * next full load, `listNotifications` sends `cache: 'no-store'`, and the two
 * agree because they are stamping the same field.
 */

async function post(path: string): Promise<boolean> {
  const token = await getToken();
  if (!token) return false;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * One row, on the way to somewhere else.
 *
 * Fired as the trainer follows the link, so it races the navigation and is
 * allowed to: the panel has already moved the row to its read state in the
 * browser, and a failure here costs one row that comes back unread on the next
 * full load. The alternative — holding the navigation until a stamp lands — is
 * a click that hesitates, on the one control in the product that is supposed to
 * be a glance.
 */
export async function markRead(id: string): Promise<boolean> {
  return post(`/v1/notifications/${encodeURIComponent(id)}/read`);
}

/** All of them, in one request — see the router for why it is not N of them. */
export async function markAllRead(): Promise<boolean> {
  return post('/v1/notifications/read');
}
