import 'server-only';

import type { PortalSetHistoryWire } from './api';

/**
 * §3 · Progress → **what the client lifted**, as the trainer's own screen sees
 * it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS AT ALL, WHEN `lib/log/log.ts` ALREADY BUILDS IT
 *
 * `buildProgress` on the trainer's half produces exactly this shape and cannot
 * be called from here: it takes a `LogInput` — the whole mock book, every
 * client's workouts and every set in the product — and the portal has no such
 * object and must never be handed one. What the portal holds is
 * `PortalSetHistoryWire[]`, one client's own set rows, carrying a load, a rep
 * count and the day it happened. Every figure below is derivable from those
 * three, so this is the same derivation over the one client's rows.
 *
 * The rules it copies deliberately, each settled by measurement on the
 * trainer's tab and each of which would otherwise be re-learned the hard way:
 *
 *   1. **A week with nothing in it keeps its bar.** The series runs from the
 *      first week with data to the last, filling the gaps — a fortnight off is
 *      the most legible thing a volume chart can show, and a chart that closes
 *      its gaps up is a chart claiming the fortnight never happened.
 *   2. **Records are JUDGED unwindowed and COUNTED inside the range.** Judging
 *      has to see everything, because a bounded window hands out a record for
 *      beating a number that was never the best. Counting is the opposite
 *      question, and a figure that ignores the only control on the screen reads
 *      as the control being broken.
 *   3. **A movement earns a figure by having written a number down.**
 *      `LogType` has two members and the catalogue has three, so a timed
 *      movement's sets carry `loadKg: null` and `reps: null` — and the first
 *      version of the trainer's sequence card drew `0 → 0 → 0 → 0 → 0 kg` on
 *      every client whose most-logged movement was the bike. The filter is on
 *      the ROW rather than on a type, because the same hole opens for every
 *      kind the enum still owes — and it is the same filter `buildExercises`
 *      applies, which is what stops the Summary counting eighteen movements
 *      over a list of seventeen.
 *   4. **`volumeNow` is the last week WITH data, not this week.** The series
 *      stops at the last week something was logged in, so on a client who last
 *      trained a fortnight ago *Volume this week* is a sentence about a week
 *      they did nothing in. The caller reads `weeks.at(-1).current` and says
 *      the other sentence.
 *
 * ── AND IT IS NOT IN `progress.ts` ──────────────────────────────────────────
 *
 * That file is 1,300 lines and is about the ARRANGEMENT — attendance, the goal,
 * the lead sentence. This is about the TRAINING, which is what the Progress tab
 * is now the whole of. They are read by different tabs and windowed on
 * different rules, and folding one into the other would be the second time a
 * body measurement and a barbell shared a module on this screen.
 */

/** `2026-08-14` → a timestamp at local midnight. */
function dateOf(iso: string): number {
  return new Date(`${iso}T00:00:00`).getTime();
}

/** A timestamp → `YYYY-MM-DD`. */
function isoDay(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** The Monday of the week an ISO day falls in. Weeks start Monday here. */
function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const at = new Date(y, m - 1, d);
  const back = (at.getDay() + 6) % 7;
  at.setDate(at.getDate() - back);
  return isoDay(at.getTime());
}

export interface TrainingWeek {
  /** `w1…w7` — an index, which is why `weekOf` sits beside it. */
  label: string;
  volumeKg: number;
  /** 0…1 against the tallest week in the series. */
  fraction: number;
  /** The calendar week containing today. May be absent from the series. */
  current: boolean;
  /** The Monday, `YYYY-MM-DD`, so a bar can say WHEN when it is asked. */
  weekOf: string;
}

/**
 * ONE MOVEMENT OVER THE WINDOW — the line of the *Every movement* table.
 *
 * Everything on it comes off the same walk the record count comes off, so a row
 * cannot disagree with the figures above it about what the client lifted.
 */
export interface TrainingMovement {
  exerciseId: string;
  /** Null where `resolveNames` could not reach it — drawn honestly, never `—`. */
  name: string | null;
  /** Sessions with a set of this movement logged in them, inside the window. */
  sessions: number;
  /** The top set at the start of the window, and at the end of it. */
  from: number | null;
  to: number;
  /** `kg` or `reps`, decided per movement — a pull-up carries no load. */
  unit: string;
  /**
   * Signed, and null where there is nothing to compare against or where the
   * movement did not move. `+0` is a claim about a change that never happened.
   */
  delta: number | null;
  /** Records set inside the window, judged against the whole history. */
  records: number;
  /** Kilos moved on this movement inside the window — its share of the work. */
  volumeKg: number;
  /**
   * The day it was last done, `YYYY-MM-DD`. Six sessions spread over eight
   * weeks and six in a fortnight are the same `6`, so the count cannot answer
   * *when did I last do this*.
   */
  lastOn: string;
}

export interface PortalTraining {
  /** Sessions with something logged in them, inside the window. */
  sessions: number;
  /** Set rows inside the window. */
  sets: number;
  /** Records set inside the window. See rule 2 in this file's header. */
  records: number;
  /** Distinct movements with a set inside the window. */
  exerciseCount: number;
  weeks: TrainingWeek[];
  /** The last week in the series — see rule 4. */
  volumeNow: number;
  /** `+22% on week one`, or null where there is no week one to compare with. */
  volumeDelta: string | null;
  /* ── THERE IS NO `focus` FIELD, AND THERE WAS ONE FOR AN AFTERNOON ───────
     It carried the most-logged movement and its last five top sets, which is
     the card the trainer's tab draws beside its volume chart. On the portal
     that card turned out to be a SECOND per-movement list on a tab that already
     had one: `StrengthGain.series` is every session's top set and was already
     on the wire, so the sequence belongs on the row that already names the
     movement. `ProgressSummary` carries the measurement.

     Rule 3 in this file's header survives it and is not dead: the same
     *a movement earns its sequence by having written a number down* test is
     what `buildStrength` applies, and this builder still skips a set carrying
     neither a load nor a rep count so the two agree about which movements
     exist at all. */
  movements: TrainingMovement[];
}

/** One session's best effort at one movement, plus what it moved. */
interface SessionPoint {
  date: string;
  /** The top set's figure in the movement's own measure, or null. */
  figure: number | null;
  volumeKg: number;
}

/**
 * Every figure the Progress tab draws, over one client's set rows.
 *
 * `sets` is the UNWINDOWED read — `getPortalSets` returns every row and its own
 * docstring argues for it — and `from` narrows here rather than at the fetch,
 * so the range chips re-derive without a second round trip. Rule 2 needs the
 * unwindowed rows anyway: a record cannot be judged inside a window.
 */
export function buildTraining(
  sets: PortalSetHistoryWire[],
  names: Map<string, string>,
  now: number,
  from: number | null = null,
): PortalTraining {
  const inWindow = (iso: string) => from === null || dateOf(iso) >= from;

  /* ── THE WEEKS ───────────────────────────────────────────────────────────
     Volume is `load × reps` and nothing else: a set missing either moves no
     measurable weight, so it contributes zero rather than being guessed at.
     Its movement still appears in the table — the row simply has no bar. */
  const volumeByWeek = new Map<string, number>();
  for (const s of sets) {
    if (!inWindow(s.sessionDate)) continue;
    /* The same skip the movement walk makes — see its note. A week whose only
       rows are figureless would otherwise get a bar at zero, which reads as a
       week the client turned up and moved nothing. */
    if (s.loadKg === null && s.reps === null) continue;
    const week = mondayOf(s.sessionDate);
    volumeByWeek.set(week, (volumeByWeek.get(week) ?? 0) + (s.loadKg ?? 0) * (s.reps ?? 0));
  }

  const keys = [...volumeByWeek.keys()].sort();
  const weeks: TrainingWeek[] = [];
  if (keys.length > 0) {
    const thisWeek = mondayOf(isoDay(now));
    const cursor = new Date(Date.parse(`${keys[0]}T00:00:00`));
    const end = Date.parse(`${keys[keys.length - 1]}T00:00:00`);
    while (cursor.getTime() <= end) {
      const key = isoDay(cursor.getTime());
      weeks.push({
        label: '',
        volumeKg: Math.round(volumeByWeek.get(key) ?? 0),
        fraction: 0,
        current: key === thisWeek,
        weekOf: key,
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    const tallest = weeks.reduce((max, w) => Math.max(max, w.volumeKg), 0) || 1;
    weeks.forEach((w, i) => {
      w.label = `w${i + 1}`;
      w.fraction = w.volumeKg / tallest;
    });
  }

  const firstWeek = weeks[0]?.volumeKg ?? 0;
  const lastWeek = weeks.length > 0 ? weeks[weeks.length - 1].volumeKg : 0;
  const volumeDelta =
    weeks.length > 1 && firstWeek > 0
      ? `${lastWeek >= firstWeek ? '+' : '−'}${Math.abs(
          Math.round(((lastWeek - firstWeek) / firstWeek) * 100),
        )}% on week one`
      : null;

  /* ── ONE WALK PER MOVEMENT, AND EVERY FIGURE COMES OFF IT ────────────────
     Grouped by movement, then by the day — a top set is a fact about a SESSION,
     and a client who worked up to 60 kg over three sets logged three rows for
     one effort. */
  const byExercise = new Map<string, Map<string, PortalSetHistoryWire[]>>();
  for (const s of sets) {
    /* ── A SET WITH NEITHER A LOAD NOR A REP COUNT IS SKIPPED ──────────────
       `buildExercises` drops exactly this row and says why: a timed movement
       whose duration this projection does not carry is a row nothing can be
       read from. **The rule is copied rather than reasoned out again**, because
       the two builders' movement lists are drawn on two tabs a client moves
       between in one tap — and the last time they disagreed the Summary counted
       **18** while the Exercises tab listed **17**, over one movement that was
       present in one rule and absent from the other.

       The cost, stated: the trainer's table has a *timed · no load* row and
       this one has no row at all. On the trainer's half that is a movement they
       programmed and want to see; here it would be a row whose every column is
       a dash on the screen §1 asks not to draw an absence on. */
    if (s.loadKg === null && s.reps === null) continue;
    let days = byExercise.get(s.exerciseId);
    if (!days) {
      days = new Map();
      byExercise.set(s.exerciseId, days);
    }
    const rows = days.get(s.sessionDate) ?? [];
    rows.push(s);
    days.set(s.sessionDate, rows);
  }

  const movements: TrainingMovement[] = [];
  let records = 0;

  for (const [exerciseId, days] of byExercise) {
    const dates = [...days.keys()].sort();

    /* WHICH NUMBER IS THE MEASURE, decided once per movement over its whole
       history rather than per session — a movement whose measure changed
       between two sessions would otherwise compare a kilo against a rep.
       `buildExercises` makes the identical call for the identical reason. */
    const anyLoad = dates.some((d) =>
      (days.get(d) ?? []).some((r) => r.loadKg !== null && r.loadKg > 0),
    );
    const measure: 'load' | 'reps' | 'none' = anyLoad
      ? 'load'
      : dates.some((d) => (days.get(d) ?? []).some((r) => r.reps !== null))
        ? 'reps'
        : 'none';
    const unit = measure === 'reps' ? 'reps' : 'kg';

    const points: SessionPoint[] = dates.map((date) => {
      const rows = days.get(date) ?? [];
      const loads = rows.map((r) => r.loadKg).filter((n): n is number => n !== null && n > 0);
      const topLoad = loads.length > 0 ? Math.max(...loads) : null;
      const reps = rows.map((r) => r.reps).filter((n): n is number => n !== null);
      const figure =
        measure === 'load'
          ? topLoad
          : measure === 'reps'
            ? reps.length > 0
              ? Math.max(...reps)
              : null
            : null;
      return {
        date,
        figure,
        volumeKg: rows.reduce((sum, r) => sum + (r.loadKg ?? 0) * (r.reps ?? 0), 0),
      };
    });

    /* ── JUDGED OVER EVERYTHING, COUNTED INSIDE THE WINDOW ─────────────────
       The walk is the whole history and the tally is conditional, which is the
       only arrangement that makes both figures true at once. The FIRST session
       is never a record: there is nothing behind it to have beaten, and a
       product that handed one out for turning up once would hand one out on
       every movement a client has ever tried. */
    let best: number | null = null;
    let own = 0;
    for (const p of points) {
      if (p.figure === null || p.figure <= 0) continue;
      if (best !== null && p.figure > best && inWindow(p.date)) own += 1;
      if (best === null || p.figure > best) best = p.figure;
    }

    const here = points.filter((p) => inWindow(p.date));
    if (here.length === 0) continue;

    records += own;

    const figures = here.map((p) => p.figure).filter((n): n is number => n !== null && n > 0);
    /* Null on a single reading, because a from→to over one sitting claims the
       sitting happened twice — `MeasurePanel` states that rule about a tape and
       this is it applied to a barbell. */
    const firstFigure = figures.length > 1 ? figures[0] : null;
    const lastFigure = figures.length > 0 ? figures[figures.length - 1] : 0;
    const moved = firstFigure === null ? null : Math.round((lastFigure - firstFigure) * 10) / 10;

    movements.push({
      exerciseId,
      name: names.get(exerciseId) ?? null,
      sessions: here.length,
      from: firstFigure,
      to: lastFigure,
      unit,
      /* Under half a kilo is rounding, not a gain. */
      delta: moved === null || Math.abs(moved) < 0.05 ? null : moved,
      records: own,
      volumeKg: Math.round(here.reduce((sum, p) => sum + p.volumeKg, 0)),
      lastOn: here[here.length - 1].date,
    });

  }

  /* Ranked by the work  }

  /* Ranked by the work, not by the name: what a client's training is MADE of is
     answered by the movement that ate the most kilos. A movement with no load
     to sum — the timed ones — sorts on sessions, which is all it has. */
  movements.sort(
    (a, b) =>
      b.volumeKg - a.volumeKg ||
      b.sessions - a.sessions ||
      (a.name ?? '').localeCompare(b.name ?? ''),
  );

  /* The same two filters the walks above use, so the *Sets* tile and the
     movements table cannot report two different set counts for one window. */
  const windowed = sets.filter(
    (s) => inWindow(s.sessionDate) && !(s.loadKg === null && s.reps === null),
  );

  return {
    sessions: new Set(windowed.map((s) => s.sessionDate)).size,
    sets: windowed.length,
    records,
    exerciseCount: movements.length,
    weeks,
    volumeNow: lastWeek,
    volumeDelta,
    movements,
  };
}
