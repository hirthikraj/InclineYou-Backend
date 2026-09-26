import { readMode } from '@/lib/today/mode';
import type { ScheduleClient } from './session';

/**
 * THE ROSTER AS THE BOOKING FORM NEEDS IT — IN ONE PLACE, BECAUSE TWO SCREENS
 * NOW OPEN THAT FORM.
 *
 * `BookPanel` was the schedule's, so its raw material was built inline inside
 * `lib/schedule/api.ts` and nothing else could reach it. Today's *New session*
 * opens the same panel in place rather than navigating (see `Today.tsx`), and
 * `lib/today/api.ts` already fetches every row this needs — the same
 * `/v1/clients`, `/v1/programs` and `/v1/packages` — so the alternative was the
 * same thirty lines written twice against two copies of the same wire.
 *
 * That is the disagreement `lib/today/deck.ts` opens by refusing: two mappers is
 * two answers to *who can be booked and how long are their sessions*, on two
 * screens open at the same minute. So the mapping lives here, both API modules
 * call it, and neither of them owns it.
 *
 * NO `server-only` — it is pure, and the panel's own module imports the shape it
 * returns. See the note at the top of `./session`.
 */

/** What a session lasts when neither the booking nor the client says. */
export const DEFAULT_DURATION = 60;

/**
 * Every status that means the session is not going to happen, in both spellings
 * the wire has used. One set, because a status the schedule counts as dead and
 * Today's booking form counts as live is a clash warning that appears on one
 * screen and not the other.
 */
export const DEAD_SESSION = new Set([
  'cancelled', 'canceled', 'no_show', 'noshow', 'skipped',
]);

/** The booking's own length, then the client's usual, then the default. */
export function sessionMinutes(
  onSession: number | null | undefined,
  onClient: number | null | undefined,
): number {
  if (onSession && onSession > 0) return onSession;
  if (onClient && onClient > 0) return onClient;
  return DEFAULT_DURATION;
}

/* The three row shapes this reads, structural rather than imported: both
   `api.ts` modules declare their own wire interfaces against the same Java
   records, and neither should have to import the other's. */

export interface RosterClientRow {
  id: string;
  name: string;
  status: string;
  /** The roster relationship — see `ScheduleClient.membership`. */
  membershipStatus?: string | null;
  deliveryMode: string | null;
  metadata: Record<string, unknown> | null;
  sessionDurationMinutes?: number | null;
  sessionsPerWeek?: number | null;
}

export interface RosterProgramRow {
  id: string;
  clientId: string;
  name: string;
  status: string;
}

export interface RosterPackRow {
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
}

const DEAD_PROGRAM = new Set(['cancelled', 'canceled', 'completed', 'archived']);

/** Off the roster on either field — see the long note this replaces below. */
const GONE = new Set(['removed', 'archived']);

/**
 * The clients a session may be booked against, alphabetically.
 *
 * ── OFF THE ROSTER ON EITHER FIELD, AND IT USED TO BE NEITHER ────────────────
 *
 * This tested `status !== 'removed'`, and `status` is the client record's own
 * lifecycle — which spells the same fact `archived`. The roster relationship
 * spells it `removed`, on `membershipStatus`, which the schedule did not read. So
 * the test matched nothing and an archived client stayed in the list the booking
 * form offers: pre-existing, and found only because the week by client draws
 * every roster row and one of them was somebody who left.
 *
 * Both fields, both spellings. A `paused` client is deliberately KEPT — a pause
 * is a holiday and V30 gave it a lifecycle so that it stops looking like an exit;
 * they still appear, tagged, and can still be booked back in.
 *
 * `newestPack` is the newest package per client REGARDLESS of status, which is
 * both API modules' rule already: a client whose pack ran out yesterday still has
 * an agreed price, and "0 of 12 left" is the sentence the form has to be able to
 * say.
 */
export function bookableClients(
  clients: RosterClientRow[],
  programs: RosterProgramRow[],
  newestPack: Map<string, RosterPackRow>,
): ScheduleClient[] {
  const live = programs.filter((p) => !DEAD_PROGRAM.has((p.status ?? '').toLowerCase()));

  return clients
    .filter((c) => !GONE.has((c.status ?? '').toLowerCase())
      && !GONE.has((c.membershipStatus ?? '').toLowerCase()))
    .map((c) => {
      const plan = live.find((p) => p.clientId === c.id);
      const pack = newestPack.get(c.id);
      return {
        id: c.id,
        name: c.name?.trim() || 'Client',
        status: c.status ?? 'active',
        membership: c.membershipStatus ?? 'active',
        mode: readMode({ session: null, client: c.deliveryMode, metadata: c.metadata }),
        minutes: sessionMinutes(null, c.sessionDurationMinutes),
        sessionsPerWeek: c.sessionsPerWeek ?? null,
        programId: plan?.id ?? null,
        programName: plan?.name ?? null,
        packLeft: pack?.sessionsRemaining ?? null,
        packTotal: pack?.sessionsTotal ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
