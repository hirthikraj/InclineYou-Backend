'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { listWorkspaces, resolveWorkspaces } from './api';
import {
  WORKSPACE_COOKIE, WORKSPACE_DEFAULT_COOKIE, WORKSPACE_MAX_AGE,
} from './types';

const SECURE = process.env.NODE_ENV === 'production';

/**
 * Open a different book.
 *
 * ── A SERVER ACTION AND NOT A `document.cookie` WRITE ────────────────────────
 *
 * The switcher's current state is rendered by the layout, on the server, from
 * this cookie. Writing it in the browser would leave the two halves disagreeing
 * until something happened to re-render — the menu would say one book and every
 * screen under it would still be the other. Here the write and the re-render
 * are one response: `revalidatePath('/', 'layout')` re-runs the shell, so the
 * trigger, the menu's check mark and (when the tenanted reads land) the screen
 * itself all change together.
 *
 * `'layout'`, not `'page'`, and the path is the ROOT: the workspace scopes every
 * screen in the product, so there is no page this is allowed to be stale on.
 *
 * ── AND IT VALIDATES ─────────────────────────────────────────────────────────
 *
 * The id arrives from a click on a row this same module listed, so in practice
 * it is always one of them. It is still checked, because a server action is a
 * public endpoint: anything that can post to this app can post any string, and
 * an unchecked write would let a cookie name a workspace that does not exist —
 * which `resolveWorkspaces` would then quietly discard on every read, giving a
 * trainer a switch that appears to do nothing. Refusing here means the failure
 * is at the write, once, rather than invisible forever after.
 */
export async function switchWorkspace(id: string): Promise<void> {
  const list = await listWorkspaces();
  if (!list.some((w) => w.id === id)) return;

  (await cookies()).set(WORKSPACE_COOKIE, id, {
    // Not httpOnly: it is a view preference and not a credential, and leaving it
    // readable keeps the door open for the client to render optimistically later
    // without a second source of truth.
    httpOnly: false,
    secure: SECURE,
    sameSite: 'lax',
    path: '/',
    // NO `maxAge`, and that omission is the feature. This is a session cookie:
    // it holds the book for THIS sitting and dies with the browser, which is
    // what leaves the *open the app* moment to `setDefaultWorkspace` below.
    // `types.ts` carries the argument for why the two settings are split by
    // lifetime rather than ranked against each other.
  });

  revalidatePath('/', 'layout');
}

/**
 * Which book the app opens in.
 *
 * ── IT DOES NOT ALSO SWITCH ──────────────────────────────────────────────────
 *
 * Starring a row a trainer is not in leaves them where they are, and that is the
 * point of having two controls on one row: *I am working here today* and *this
 * is where I start* are different sentences, and a star that navigated would
 * make the second one impossible to say without doing the first. The menu stays
 * open for the same reason — the only thing that changed is a mark two rows
 * away, and closing the panel would hide the one piece of feedback the press
 * produces.
 *
 * ── AND IT HAS TO PIN THE SITTING FIRST. FOUND BY RENDERING ─────────────────
 *
 * This wrote one cookie and the paragraph here said so, approvingly. **It was
 * wrong, and the bug it caused was the exact one the section above promises not
 * to cause: starring a row switched to it.**
 *
 * `resolveWorkspaces` answers `activeId` with the session cookie *and falls back
 * to the default when there is none* — which is the whole point of the default,
 * and which means that for a trainer who has not switched during this sitting,
 * the two ids are the same value read from one cookie. Move the default and the
 * active moves with it: star the gym while sitting in your own book, and the
 * screen you are reading changes underneath you.
 *
 * So the sitting is pinned before the preference is written. The active
 * workspace is resolved as it stands and stored in the session cookie, which
 * makes explicit what was until then merely implied — *this browser is open in
 * this book* — and leaves the default free to mean only what it says. Two
 * cookies, and the second one is what makes the sentence "takes effect next time
 * you sign in" true rather than aspirational.
 *
 * Clearing the session cookie, so the change lands at once, is still the wrong
 * move for the reason it always was: a trainer setting a preference about
 * tomorrow must not be moved out of the book they are reading today.
 *
 * Validated for `switchWorkspace`'s reason, and one more: an unchecked id here
 * would be stored for a YEAR rather than for a sitting.
 */
export async function setDefaultWorkspace(id: string): Promise<void> {
  const list = await listWorkspaces();
  if (!list.some((w) => w.id === id)) return;

  const { activeId } = await resolveWorkspaces(list);
  const jar = await cookies();

  const shared = {
    httpOnly: false,
    secure: SECURE,
    sameSite: 'lax' as const,
    path: '/',
  };

  // The sitting, nailed down — see above. No `maxAge`: it is still this
  // browser's answer and still dies with it.
  jar.set(WORKSPACE_COOKIE, activeId, shared);
  jar.set(WORKSPACE_DEFAULT_COOKIE, id, { ...shared, maxAge: WORKSPACE_MAX_AGE });

  revalidatePath('/', 'layout');
}
