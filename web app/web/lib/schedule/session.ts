import type { DeckSession } from '@/lib/today/deck';

/**
 * The two row shapes this screen reasons in, in a module with NO `server-only`.
 *
 * They were declared in `lib/schedule/api.ts` first, which is where the wire is
 * read — and that file is `server-only`, so `lib/schedule/grid.ts` could not
 * import them without dragging the fetch layer into the browser bundle. Types
 * are erased at build time and the import is not: `import type` would have
 * worked, and would have left a `server-only` module one careless edit away from
 * being a client dependency.
 *
 * So the SHAPES live here and the FETCHING lives there. `api.ts` re-exports both
 * names, so nothing that already reads them from it has to change.
 */

/**
 * A scheduled session, as this screen needs it.
 *
 * Extends Today's `DeckSession` rather than redefining it, and that is the point:
 * `findGaps`, `dayMoney` and `findClash` in `lib/today/day.ts` all take that
 * shape, so the schedule and Today answer "is this hour free" with the SAME
 * function. Two definitions is two answers on two screens open at the same
 * minute, which is the disagreement `lib/today/deck.ts` opens by refusing.
 */
export interface ScheduleSession extends DeckSession {
  /** `scheduled`, `done`, `no_show`, `cancelled` — the panel prints the word. */
  status: string;
  /**
   * A no-show is DEAD in the deck's sense and it is not cancelled, and the
   * schedule needs to tell them apart: a cancelled session is drawn nowhere, and
   * a no-show is drawn in danger because it is a thing that happened.
   */
  noShow: boolean;
  /**
   * Whether this session has a live charge on a pack (`charge != null` on L4,
   * R13).
   *
   * A settled session is not one fact but two — what happened, and what it was
   * charged for — and a no-show is the only outcome where the second one is a
   * decision rather than a consequence. So the panel says which, rather than
   * leaving the trainer to open the money book to find out.
   */
  charged: boolean;
  /** When the log was opened, or null. A started session can't be moved, cancelled or no-showed. */
  startedAt: number | null;
  /** The row's version — sent as If-Match on the panel's Save (R69). */
  version: string;
  notes: string | null;
  programName: string | null;
}

/**
 * THE PART OF A SESSION THE BOOKING FORM READS, AND ONLY THAT PART.
 *
 * `BookPanel` asks two questions of the sessions around a slot — *who already
 * trains at this hour* (`suggestClients`) and *what does this land on*
 * (`collisionsAt`) — and both are answered from five fields. It took a whole
 * `ScheduleSession[]` because the schedule was the only screen that opened it.
 *
 * Today opens the same panel now, from a deck whose sessions are `DeckSession`s:
 * they have no `status`, no `packDelta`, no `programName`, and building those on
 * Today would mean fetching rows for a form that never reads them. So the panel
 * asks for the intersection instead. `ScheduleSession` extends `DeckSession`, so
 * the schedule still passes its own rows unchanged.
 */
export type BookSession = Pick<
  DeckSession, 'id' | 'clientId' | 'clientName' | 'at' | 'minutes' | 'dead'
>;

/** One roster row, with the four facts the booking form and the panel read. */
export interface ScheduleClient {
  id: string;
  name: string;
  status: string;
  /**
   * The ROSTER relationship — `invited`, `active`, `paused`, `removed` — which
   * is a different fact from `status` above and the one that matters here.
   *
   * FOUND BY RENDERING the week by client: `status` is the client record's own
   * lifecycle and is only ever `active` or `archived`, so a paused client and a
   * prospect who has never trained both arrived as `active` and both drew
   * *Nothing booked* in warn, which is the exact conflation `buildWeekPivot`
   * exists to avoid. It has been on `ClientResponse` all along — `lib/clients/`
   * and `lib/business/` both read it — and this screen simply never declared it.
   */
  membership: string;
  mode: 'floor' | 'remote';
  /** What this client's sessions are, in minutes — `session_duration_minutes`,
   *  which has existed since schema V2 and which §01.2 found the design set had
   *  no representation for anywhere. */
  minutes: number;
  sessionsPerWeek: number | null;
  programId: string | null;
  programName: string | null;
  /** Sessions left on the newest pack, for the panel and the booking warning. */
  packLeft: number | null;
  packTotal: number | null;
}
