import { ProgressHistory } from '@/components/portal/ProgressHistory';
import {
  getPortalMilestones,
  getPortalSessions,
  getPortalWorkouts,
} from '@/lib/portal/api';
import { requirePortal } from '@/lib/portal/guard';
import { buildHistory, historyMonths, historyTypes } from '@/lib/portal/progress';
import { DAY_MS, startOfDay } from '@/lib/today/time';

export const metadata = { title: 'History · Progress · InclineYou' };

/**
 * §3 · Progress → **History** — *"history of sessions, workouts logged in that
 * session, date and time, a quick link to view any of the previous history"*.
 *
 * ── `nav.tsx` PROMISED THIS AND A SIX-ROW CARD WAS NOT IT ───────────────────
 *
 * The table that renamed the portal's fourth destination says why: *"Sessions →
 * Plan. The frame's Sessions is a HISTORY; §4 asks for what is coming, which is
 * a different question and the anxious one. **The history is on Progress, where
 * it is evidence.**"*
 *
 * It arrived as a card capped at six rows; the cap is a card's constraint and
 * this is the tab, so every workout on record is drawn.
 *
 * ── AND THE RANGE CHIPS WERE A SECOND CONTROL OVER ONE LIST ──────────────────
 *
 * This tab used to read the shared range as well, which put a three-way window
 * ABOVE a month picker: two controls narrowing one list, with the month having
 * to be resolved against the range on every read, and *8 weeks + March* a
 * combination that could only ever be empty. The month and the session type
 * answer the question more precisely, so they are the whole of it now.
 *
 * ── THE SESSIONS READ EARNS ITS PLACE TWICE ─────────────────────────────────
 *
 * `PortalWorkoutSummaryWire` carries `startedAt`, which is when the client
 * opened the log — usually the right answer and occasionally not, because a
 * session logged from paper hours later starts at the hour it was typed. The
 * booking's own `scheduledAt` is what a client means by *my six o'clock*.
 *
 * And the same rows carry `dayLabel`, which is what a session IS — see
 * `PortalHistoryRow.dayLabel` for the measurement that made it the most
 * valuable field on the page. One read, two joins, no new request.
 *
 * ── AND THE MILESTONES ARE THE THIRD ────────────────────────────────────────
 *
 * `getPortalMilestones` is `cache()`d and the Summary tab already pays for it,
 * so on a client who arrived here from there it costs nothing. What it buys is
 * the one thing a history of identical rows cannot otherwise have: a day that
 * was different from the others, marked on the day it happened.
 */
export const dynamic = 'force-dynamic';

/** A timestamp → the `YYYY-MM-DD` a `sessionDate` is spelled in. */
function isoDay(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const result = await requirePortal();
  if (!result.ok) return null;
  const { me, now } = result;

  const q = await props.searchParams;

  const [workouts, sessions, milestones] = await Promise.all([
    getPortalWorkouts(),
    getPortalSessions(startOfDay(me.client.startedAt) - DAY_MS, now + DAY_MS),
    getPortalMilestones(),
  ]);

  /* workoutId → the booked minute and what the session was called. A log
     started off the client's own *Start* button with no booking has neither,
     and the row simply says less rather than guessing. */
  const bookedAt: Record<string, number> = {};
  const labels: Record<string, string | null> = {};
  for (const s of sessions) {
    if (!s.workoutId) continue;
    bookedAt[s.workoutId] = s.scheduledAt;
    labels[s.workoutId] = s.dayLabel;
  }

  /* The set is only ever asked *did one fire on this day*, for days the list
     already holds, so it needs no filtering of its own. */
  const prDates = new Set(milestones.map((m) => isoDay(m.at)));

  const { history } = buildHistory(workouts, null, Infinity, { labels, prDates });

  /* ── THE OPTIONS ARE DERIVED FROM THE ROWS, AND THE PICK IS RESOLVED ───────

     Both lists are built from the history itself, so neither control can name
     a month or a session type with nothing in it. A `?month=` typed by hand is
     checked against the list rather than trusted, and falls back to *all* —
     the rule `resolveWorkspaces` states for a cookie naming a workspace the
     trainer has left. A filter showing a value nothing can reach is worse than
     one that quietly returns to everything. */
  const months = historyMonths(history);
  const types = historyTypes(history);

  const askedMonth = typeof q.month === 'string' ? q.month : 'all';
  const askedType = typeof q.type === 'string' ? q.type : 'all';
  const month = months.some((m) => m.value === askedMonth) ? askedMonth : 'all';
  const type = types.some((t) => t.value === askedType) ? askedType : 'all';

  const rows = history.filter(
    (r) =>
      (month === 'all' || r.iso.slice(0, 7) === month) &&
      (type === 'all' || r.dayLabel === type),
  );

  /* ── THE BAR'S SCALE IS YOUR BIGGEST EVER, NOT THE FILTER'S ────────────────

     Deliberate, and it is the one number here that is NOT computed over what is
     on screen. Scaling to the visible set would make a 9.3 t session draw a
     full bar in a month where it was the biggest and a half bar in one where it
     was not — the same session, two lengths, depending on a filter. A bar has
     to mean one thing, so it means *against your biggest session*, which is
     what the card's own foot says it means. */
  const peak = Math.max(...history.map((r) => r.volumeKg), 1);

  return (
    <div className="body">
      <ProgressHistory
        me={me}
        rows={rows}
        total={history.length}
        peak={peak}
        months={months}
        types={types}
        month={month}
        type={type}
        bookedAt={bookedAt}
      />
    </div>
  );
}
