import type { Placed, ScheduleGrid } from './grid';
import type { ScheduleClient } from './session';

/**
 * THE WEEK, PIVOTED ONTO THE ROSTER — rows are people, columns are days.
 *
 * `TimeGrid` answers *when*. This answers *who*, and they are two different
 * questions about the same seven days rather than two renderings of one.
 *
 * ── WHY A SECOND ARRANGEMENT AT ALL, GIVEN THE GRID IS HEALTHY ───────────────
 *
 * MEASURED before this was written, across ten weeks of a real book at
 * 1440x900: 44 sessions in the busiest week, **all 44 drawn with no scrolling**,
 * 45% of the track covered, and **zero `+N` chips** — `useCwScale` and the quiet
 * band between the two shifts are doing their job. So this is NOT here because
 * the grid runs out of room, and building it on that premise would have been
 * building it on a fact that is false.
 *
 * It is here because of what the same measurement found on the other axis:
 * **21 distinct clients across those 44 sessions, 15 of them on exactly two
 * sessions a week.** This book is not a queue of appointments, it is a couple of
 * dozen standing weekly rhythms — and a grid organised by minute cannot show a
 * rhythm. *Did Meera come twice this week?* costs a scan of seven columns and a
 * tally held in the head, on a screen that already knows the answer.
 *
 * Pivoted, the answer is the SHAPE OF A ROW. A client on Monday and Thursday
 * draws two marks in the same two places every week, a slipped session is a
 * HOLE in a line the eye has already learnt, and a client who has drifted is a
 * row that has gone empty. That is the same fact `deck.ts` computes as the
 * `quiet` and `missed` attention bands, drawn a week before it becomes a queue
 * item — which is the difference between a conversation and a chase.
 *
 * ── AND THE ROSTER IS THE ROW SET, NOT THE WEEK'S SESSIONS ───────────────────
 *
 * Every client is a row, including the ones with nothing booked. Listing only
 * the clients who appear in the week would drop exactly the row that matters
 * most — somebody who has stopped coming vanishes from the view whose whole
 * subject is who has stopped coming, and the emptier the row the more
 * completely it disappears. So they are drawn, at the bottom, and `absence`
 * says which kind of empty each one is.
 *
 * ── THREE KINDS OF EMPTY, AND CONFLATING THEM WOULD BE THE BUG ───────────────
 *
 * A paused client is not drifting — V30 gave a pause a whole lifecycle
 * precisely so a holiday stops looking like an exit, and `deck.ts` already
 * refuses to raise attention rows for one. A prospect has never trained, so
 * there is no rhythm to have broken. Only the third kind — an active client
 * with an empty week — is the signal, and it is worth nothing if the other two
 * are sitting in the list next to it wearing the same face.
 */

/** Which arrangement of the week is drawn. */
export type WeekLayout = 'hours' | 'clients';

/**
 * ONE COLUMN OF THE PIVOT, AND IT IS READ OFF `grid.days` RATHER THAN COUNTED
 * FORWARD FROM A MONDAY.
 *
 * `ClientWeek` used to build its own column heads from `weekStartAt + i *
 * 86_400_000`, which is the second copy of a rule `gridStart` already owns —
 * the same class of duplication `Schedule.tsx` refuses when it measures a
 * filter by running `buildGrid` twice rather than re-deriving the date window.
 * Seven days is not seven times 86.4 million milliseconds on a day the clock
 * moves, and the only reason the copy has never been wrong is that this book
 * happens to be kept in a zone with no DST. `at` here is the grid's own local
 * midnight, so the head and the cells under it cannot disagree.
 *
 * `count` and `hasClash` are counted from the cells THIS TABLE DRAWS rather
 * than taken from `day.count`. They are normally the same number, and where
 * they are not — a session whose client is not on the passed roster — the head
 * would be stating a figure the column cannot show. A head that says 9 over
 * eight chips is a lie about its own column; the hours view's head keeps
 * `day.count` because there every session lands somewhere.
 */
export interface PivotDay {
  /** Local midnight, straight off `ScheduleDay.at`. */
  at: number;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  dayOfMonth: number;
  isToday: boolean;
  isPast: boolean;
  /**
   * A day the trainer does not work — answered hours, none of them on this
   * weekday. NOT the same as "no hours answered at all", which is the whole
   * week and is the notice bar's business: `TimeGrid` refuses to hatch a grid
   * for a trainer who has never been asked, and inventing a rest day out of
   * that same silence would be the same invention in the other direction.
   */
  closed: boolean;
  /** Sessions drawn in this column. */
  count: number;
  /** Any of them sharing a minute with another. */
  hasClash: boolean;
}

/** Why a row has no sessions in the week — `null` when it has some. */
export type Absence = 'paused' | 'prospect' | 'none';

export interface PivotRow {
  client: ScheduleClient;
  /** Seven cells, Monday first, each in start order. */
  days: Placed[][];
  /** Live sessions this week — cancelled ones are not sessions a week has. */
  booked: number;
  done: number;
  /** No-shows, which count as booked and emphatically not as done. */
  missed: number;
  /**
   * `sessionsPerWeek` — the rhythm the client is ON, which is what makes
   * `booked` a comparison rather than a bare figure. Null where the roster has
   * never been told, and then the row states the count alone rather than
   * inventing a denominator. `utilisation` refuses the same way.
   */
  usual: number | null;
  /** Short of the usual rhythm, and the roster knows what the rhythm is. */
  short: boolean;
  /**
   * Sessions that have already happened and were never marked — `late` on the
   * session, which is `!done && !dead && it has ended`.
   *
   * It is a THIRD outcome and not the absence of the other two. A booking on
   * Tuesday that nobody has said anything about is money that has not come off
   * a pack and a week whose `2 of 2` is a claim rather than a fact, and until
   * this was carried the row could not tell it apart from a session still to
   * come. See the chip, which draws the same distinction one axis down.
   */
  late: number;
  absence: Absence | null;
}

export interface WeekPivot {
  /** Clients with at least one session in the week. */
  booked: PivotRow[];
  /** Clients with none, drift first — see `EMPTY_ORDER`. */
  empty: PivotRow[];
  /** The seven columns, in order. See `PivotDay`. */
  days: PivotDay[];
  /** Every day in the range is behind us, which changes what an empty row MEANS. */
  isPastWeek: boolean;
  totals: {
    clients: number;
    onBook: number;
    sessions: number;
    /** Rows booked under their own usual rhythm. */
    short: number;
    /** Active clients with an empty week — `absence === 'none'`, the drift. */
    drifting: number;
    /** Sessions that have happened and were never marked. */
    late: number;
  };
}

/**
 * Drift first, then the two kinds of empty that are nobody's problem.
 *
 * The order is what the cap eats from the bottom of, so it has to rank by how
 * much each row is worth reading rather than alphabetically — an active client
 * who has not booked is the one row in this group a trainer would act on today.
 */
const EMPTY_ORDER: Record<Absence, number> = { none: 0, paused: 1, prospect: 2 };

/**
 * How many empty rows are drawn before the rest fold.
 *
 * `QUEUE_CAP`'s rule, one screen over: **bounded, never truncated.** On this
 * book the group is two rows and the cap never fires; on the 44-client book
 * AGENTS.md measures it would be twenty, which is a wall of names under a view
 * somebody opened to read seven columns of chips. The fold states its own count
 * and opens, so nothing is hidden — it is just not the first thing.
 */
export const EMPTY_CAP = 10;

function absenceOf(client: ScheduleClient): Absence {
  /* `membership` and NOT `status` — the second is the client record's own
     lifecycle and cannot say either of these words. See the note on the field. */
  const membership = client.membership.toLowerCase();
  if (membership === 'paused') return 'paused';
  // The roster's word for somebody who has not started. There is no rhythm to
  // have broken, so this is not a silence worth reporting.
  if (membership === 'invited' || membership === 'pending') return 'prospect';
  return 'none';
}

/**
 * Build the pivot.
 *
 * Reads `grid.days[].placed`, which is the SAME list every count, rupee and gap
 * on this screen is summed from — so the pivot cannot disagree with the grid
 * about what the week holds, and the delivery-mode filters reach it for free
 * because `buildGrid` has already applied them.
 *
 * One thing it gets that the grid does not: `placed` carries the sessions the
 * week folds into `+N` chips (`hidden`), and a row has no lanes to run out of,
 * so **a pivoted week draws sessions the hours view cannot**. That is a side
 * effect of the arrangement rather than the reason for it.
 */
export function buildWeekPivot(
  grid: ScheduleGrid,
  clients: ScheduleClient[],
  /**
   * The trainer has answered when they work. Passed in rather than read off
   * `grid.days` — `TimeGrid`'s `offRunsIn` needs the same fact for the same
   * decision and can NOT derive it (the day view holds one column), so there is
   * one answer and `Schedule` owns it.
   */
  hoursSet: boolean,
): WeekPivot {
  const dayCount = grid.days.length;

  /* One pass over the week rather than one filter per client per day, which on
     a 44-client roster is 308 scans of the same list. */
  const byClient = new Map<string, Placed[][]>();
  const cell = (clientId: string) => {
    let rows = byClient.get(clientId);
    if (!rows) {
      rows = Array.from({ length: dayCount }, () => [] as Placed[]);
      byClient.set(clientId, rows);
    }
    return rows;
  };

  grid.days.forEach((day, index) => {
    for (const placed of day.placed) {
      cell(placed.session.clientId)[index].push(placed);
    }
  });

  for (const rows of byClient.values()) {
    for (const day of rows) day.sort((a, b) => a.startMinute - b.startMinute);
  }

  const rows: PivotRow[] = clients.map((client) => {
    const days = byClient.get(client.id)
      ?? Array.from({ length: dayCount }, () => [] as Placed[]);
    const all = days.flat();
    const done = all.filter((p) => p.session.done).length;
    const missed = all.filter((p) => p.session.noShow).length;
    const usual = client.sessionsPerWeek && client.sessionsPerWeek > 0
      ? client.sessionsPerWeek
      : null;

    return {
      client,
      days,
      booked: all.length,
      done,
      missed,
      usual,
      short: usual !== null && all.length > 0 && all.length < usual,
      /* `late` and not `!done && !noShow && isPast`: the session already carries
         the answer (`api.ts` computes it against the session's own END), and a
         second rule written here would disagree with the block the first time
         somebody is mid-session at the minute the page renders. */
      late: all.filter((p) => p.session.late).length,
      absence: all.length ? null : absenceOf(client),
    };
  });

  /* Alphabetical, and it is a decision rather than a default. The value of this
     view is that a row's shape is LEARNT — two marks in the same two columns,
     week after week — and a row that moves cannot be learnt. `BookPanel`'s
     roster makes the same call in the opposite direction and says why: "a
     ranking that reorders itself as the week fills is one a trainer cannot
     learn". Ranking by who is most at risk would be a different list every
     Monday, on the axis whose whole job is to be stable. */
  const byName = (a: PivotRow, b: PivotRow) => a.client.name.localeCompare(b.client.name);

  const booked = rows.filter((r) => r.booked > 0).sort(byName);
  const empty = rows
    .filter((r) => r.booked === 0)
    .sort((a, b) =>
      EMPTY_ORDER[a.absence ?? 'none'] - EMPTY_ORDER[b.absence ?? 'none'] || byName(a, b));

  const days: PivotDay[] = grid.days.map((day, index) => ({
    at: day.at,
    weekday: day.weekday,
    dayOfMonth: day.dayOfMonth,
    isToday: day.isToday,
    isPast: day.isPast,
    closed: hoursSet && day.windows.length === 0,
    count: rows.reduce((n, r) => n + r.days[index].length, 0),
    hasClash: rows.some((r) => r.days[index].some((p) => p.lanes > 1)),
  }));

  return {
    booked,
    empty,
    days,
    isPastWeek: grid.days.length > 0 && grid.days.every((d) => d.isPast),
    totals: {
      clients: rows.length,
      onBook: booked.length,
      sessions: booked.reduce((n, r) => n + r.booked, 0),
      short: booked.filter((r) => r.short).length,
      /* The drift, and only the drift. A paused client and a prospect are both
         empty weeks and neither is a finding — the three-kinds-of-empty argument
         at the top of this file is what stops the header counting them. */
      drifting: empty.filter((r) => r.absence === 'none').length,
      late: booked.reduce((n, r) => n + r.late, 0),
    },
  };
}
