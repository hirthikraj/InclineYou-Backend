import 'server-only';

import { cache } from 'react';

import { getToken } from '@/lib/auth/session';

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';

/** The two things the chrome reads off `/v1/trainers/me`. Both empty on any
 *  failure — see `getTrainerIdentity`. */
export interface TrainerIdentity {
  name: string;
  /** The floor they work on, when they work on one. Drives the gym workspace
   *  in `lib/workspace/api.ts`; `''` when the trainer trains nowhere fixed. */
  gymName: string;
}

/**
 * `/v1/trainers/me`, read ONCE per request.
 *
 * ── WHY `cache()` AND NOT TWO FETCHES ────────────────────────────────────────
 *
 * Two parts of the chrome want this row now: the rail's foot prints the name,
 * and the workspace switcher needs the gym. They are built by different modules
 * and called from the same layout, and without `cache()` that is a second HTTP
 * round trip on the critical path of every navigation inside the shell — for a
 * row the first call already has in hand. React's `cache` dedupes per REQUEST,
 * not across them, which is exactly the lifetime a `no-store` read wants: fresh
 * on every navigation, fetched once within one.
 *
 * Empty on any failure rather than a throw, which is the rule the whole shell
 * follows: a rail with no name is a smaller loss than a layout that crashes.
 */
export const getTrainerIdentity = cache(async (): Promise<TrainerIdentity> => {
  const token = await getToken();
  if (!token) return { name: '', gymName: '' };
  try {
    const res = await fetch(`${BASE}/v1/trainers/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return { name: '', gymName: '' };
    const data = await res.json();
    return {
      name: typeof data?.name === 'string' ? data.name : '',
      gymName: typeof data?.gymName === 'string' ? data.gymName.trim() : '',
    };
  } catch {
    return { name: '', gymName: '' };
  }
});

/** Fetches the signed-in trainer's display name for the persistent shell.
 *  Returns empty string on any failure — the Rail renders without a name
 *  rather than crashing the layout. */
export async function getTrainerName(): Promise<string> {
  return (await getTrainerIdentity()).name;
}

/**
 * The roster, name and id only, for the shell's command palette.
 *
 * ── WHY THE SHELL FETCHES THIS AND NOT THE PAGE ──────────────────────────────
 *
 * `TopBar` draws a search box on every screen it appears on, hints `⌘K` inside
 * it and carries `aria-keyshortcuts` on both of its forms. On fifteen of the
 * twenty screens that box was wired to `onSearch={() => {}}` — a control that
 * announces a keyboard shortcut, takes a click and does nothing. The palette was
 * something each screen had to remember to mount, and most did not.
 *
 * So it moves into the shell, which is the only place that can promise it on
 * every screen at once, and the shell needs the one thing the palette matches
 * on. This is deliberately the CHEAP read — `/v1/clients` and nothing else —
 * because it runs on every navigation inside `(main)`. The richer rows (today's
 * sessions, the attention queue) stay with the screens that already hold them
 * and are handed up through `PaletteHost`; a screen that has none of that still
 * gets a palette that finds a person by name, which is what it is mostly for.
 *
 * Empty on any failure, exactly like `getTrainerName` above: a palette with no
 * rows is a smaller loss than a layout that throws.
 */
export async function getRoster(): Promise<{ id: string; name: string }[]> {
  const token = await getToken();
  if (!token) return [];
  try {
    const res = await fetch(`${BASE}/v1/clients?status=all`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    // 1.1: every list is an `{items}` envelope.
    const body = (await res.json()) as { items?: unknown };
    const data: unknown = body?.items;
    if (!Array.isArray(data)) return [];
    return data
      .filter((c): c is { id: string; name?: string } => !!c && typeof (c as { id?: unknown }).id === 'string')
      .map((c) => ({ id: c.id, name: (typeof c.name === 'string' ? c.name.trim() : '') || 'Client' }));
  } catch {
    return [];
  }
}
