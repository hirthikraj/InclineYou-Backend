import 'server-only';

import { cookies } from 'next/headers';

import { getToken } from '@/lib/auth/session';
import { getTrainerIdentity } from '@/lib/shell/api';

import {
  SOLO_ID, WORKSPACE_COOKIE, WORKSPACE_DEFAULT_COOKIE, type Workspace,
} from './types';

const BASE = process.env.INCLINEYOU_API_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 8_000;

/** The slice of `/v1/team` this module reads. `lib/team/api.ts` declares the
 *  full row for the screen; the switcher needs a name and a headcount. */
interface TeamHead {
  id?: unknown;
  name?: unknown;
  myRole?: unknown;
  activeMembers?: unknown;
}

/**
 * Does this trainer belong to a team, and what is it called.
 *
 * `null` on 404 — which is the ANSWER, not a failure: `/v1/team` 404s for a
 * trainer who is in no team, and that is the commonest case in the product.
 * Also `null` on a refusal or a timeout, deliberately: a switcher that drops a
 * workspace it cannot confirm is better than one that draws a team row which
 * leads nowhere. The solo workspace is always there to fall back to.
 */
async function readTeam(): Promise<TeamHead | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${BASE}/v1/team`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? (JSON.parse(text) as TeamHead) : null;
  } catch {
    return null;
  }
}

/** `owner` → `Owner`. The API sends lowercase role words; a menu row is a
 *  sentence, not an enum. */
function titleCase(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

/**
 * EVERY BOOK THIS TRAINER CAN OPEN, in the order the menu draws them.
 *
 * ── THE ORDER IS SOLO · TEAM · GYM AND IT IS AN ARGUMENT ─────────────────────
 *
 * Solo first because it is the one that always exists and the one a trainer
 * owns outright — it is the floor of the model, and a list whose first row can
 * disappear is a list whose rows move under the pointer. Team before gym
 * because a team is a book the trainer helps run and a gym is a floor they
 * work on: the further from their own name, the further down.
 *
 * ── EACH IS DERIVED, NOT CONFIGURED ──────────────────────────────────────────
 *
 * There is no workspaces table on the backend yet, and inventing one here would
 * be inventing a contract. Every row below is read off something the API
 * already answers — the trainer, and the team — so the list is TRUE the moment
 * the data is, and it collapses to a single row for a trainer who has neither.
 * When the backend grows a real tenant list this function is the one place that
 * changes; nothing above it knows where the rows came from.
 */
export async function listWorkspaces(): Promise<Workspace[]> {
  const [me, team] = await Promise.all([getTrainerIdentity(), readTeam()]);

  const list: Workspace[] = [
    {
      id: SOLO_ID,
      kind: 'solo',
      // The trainer's own name IS the tenant's name — this book has no other.
      // 'Your practice' rather than a blank plate on a profile with no name yet.
      name: me.name || 'Your practice',
      role: 'Independent · just you',
    },
  ];

  if (team && typeof team.id === 'string' && typeof team.name === 'string') {
    const coaches = typeof team.activeMembers === 'number' ? team.activeMembers : 0;
    const myRole = typeof team.myRole === 'string' ? titleCase(team.myRole) : '';
    list.push({
      id: `team:${team.id}`,
      kind: 'team',
      name: team.name,
      // The headcount is the fact that distinguishes a team from the row above
      // it; the role is what distinguishes this trainer's seat in it. Both, when
      // both are known — `Team · 3 coaches` alone on a backend that sends no
      // role, rather than a dangling separator.
      role: [
        `Team · ${coaches || 1} ${coaches === 1 ? 'coach' : 'coaches'}`,
        myRole,
      ].filter(Boolean).join(' · '),
    });
  }

  if (me.gymName) {
    list.push({
      // Derived from the name rather than an id, because the gym is a STRING on
      // the trainer's profile today — there is no gym row to point at. It is
      // stable for as long as the name is, which is the same promise the name
      // itself makes on every screen that prints it.
      id: `gym:${me.gymName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      kind: 'gym',
      name: me.gymName,
      role: 'Gym · shared floor',
    });
  }

  return list;
}

/**
 * Which of them is open, and which one opens the app.
 *
 * ── EVERY STORED ID IS RESOLVED AGAINST THE LIST, NEVER TRUSTED ──────────────
 *
 * That check is the whole point of this function: a cookie outlives the thing it
 * names. A trainer who leaves a team, or whose gym is renamed in Settings, is
 * holding cookies for a workspace that no longer exists — and a chrome that
 * renders an active workspace nobody can switch away from, or stars a default
 * that is not on the list, is worse than one that quietly returns the trainer to
 * their own book. It costs one `some()` per read and it is the difference
 * between a stale preference healing itself and a switcher that has to be
 * explained.
 *
 * ── AND THE ORDER IS ACTIVE, THEN DEFAULT, THEN THE FLOOR ────────────────────
 *
 * The active cookie is the sitting's — it expires with the browser — so its
 * presence IS the question "am I mid-session". Present, and the trainer has
 * already chosen a book since this browser opened and must be given it back on
 * every navigation. Absent, and this is the *open the app* moment the default
 * exists to own. `list[0]` is the last word and is always the solo book, so
 * neither answer is ever a guess.
 *
 * Both come out of ONE cookie read, and they are returned together because a
 * caller wanting one almost always wants the other: the menu marks the current
 * row and stars the default in the same pass.
 */
export async function resolveWorkspaces(
  list: Workspace[],
): Promise<{ activeId: string; defaultId: string }> {
  const jar = await cookies();
  const known = (id: string | undefined): id is string =>
    !!id && list.some((w) => w.id === id);

  const floor = list[0]?.id ?? SOLO_ID;

  const stored = jar.get(WORKSPACE_DEFAULT_COOKIE)?.value;
  const defaultId = known(stored) ? stored : floor;

  const open = jar.get(WORKSPACE_COOKIE)?.value;
  const activeId = known(open) ? open : defaultId;

  return { activeId, defaultId };
}
