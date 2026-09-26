import 'server-only';

import { DAY_MS, startOfDay } from '@/lib/today/time';

import type { PortalSetHistoryWire } from './api';

/**
 * §3 · every exercise this client has logged, and whether it is moving.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THIS IS THE HALF `buildStrength` DELIBERATELY THROWS AWAY
 *
 * `lib/portal/progress.ts` ends its strength builder with two lines that are
 * right for a summary and wrong for a catalogue:
 *
 *     if (days.size < MIN_SESSIONS_FOR_A_CLAIM) continue;
 *     if (to <= from) continue;
 *
 * The second is the important one, and its own comment says why it is there:
 * *"a lift that has not moved is dropped, never shown as zero … §3's whole
 * framing is make invisible progress visible rather than audit every lift."*
 * That is correct on a screen whose job is one encouraging sentence.
 *
 * **It is exactly backwards for this tab.** A stalled lift is the single most
 * actionable thing on a client's progress screen, and dropping it means the one
 * movement they most need to raise with their trainer is the one the product
 * silently hides. So nothing is dropped here: every exercise with a logged set
 * appears, and the ones that have stopped moving are the ones that get a mark.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * AND A PLATEAU IS INFORMATION, NEVER AN ACCUSATION
 *
 * §1's rule governs this file more than any other in the portal: *"No red 'you
 * missed 3 workouts.' Guilt-based design produces uninstalls, not attendance."*
 * A row reading *STUCK* in red is that rule broken on the screen §3 calls "the
 * emotional core of the product".
 *
 * Three things keep it the right side of the line:
 *
 *   1. **The word is *Holding*, not *stuck* and not *no progress*.** Holding at
 *      a weight is what a training block is often deliberately doing.
 *   2. **The tone is `info`, never `warn` or `danger`.** Amber is what this
 *      product uses for a thing going wrong; a plateau is not one.
 *   3. **The sentence hands it to the trainer.** *"Worth mentioning to Arun"* —
 *      because the client did not choose the load, their trainer did, and a
 *      product that told them to add weight would be programming over the
 *      person they are paying. That is also what makes the row actionable
 *      rather than merely true.
 */

/**
 * How many sessions at one load before it is worth naming.
 *
 * Three, and it is a judgement rather than a measurement. Two is a normal week
 * — most programmes repeat a load once before moving it, and a product that
 * flagged that would flag every exercise every week and be ignored inside a
 * fortnight. Four is late: on a twice-a-week lift that is a fortnight of
 * standing still before anything is said.
 */
const HOLDING_SESSIONS = 3;

/** Enough sessions to make any claim about a direction at all. */
const MIN_SESSIONS = 3;

/**
 * Past this, a movement is *not lately* rather than holding or climbing.
 *
 * A lift dropped from the plan two months ago has not plateaued — it has
 * stopped, usually because the trainer changed the programme, which is not a
 * fact about the client at all. Calling that "holding" would be the tab
 * inventing a stall out of somebody else's decision.
 */
const STALE_DAYS = 35;

/**
 * What a movement is doing, and the four are ordered by how much they are worth
 * saying.
 *
 * `new` and `resting` are deliberately not failures: one is a client who has
 * just started something, the other is a movement their trainer took off the
 * plan. Neither is drawn with a tone.
 */
export type ExerciseState = 'climbing' | 'holding' | 'new' | 'resting';

/** One session's best effort at one movement. */
export interface ExercisePoint {
  /** `2026-08-14`. The join key back to a workout — see `workoutByDate`. */
  date: string;
  /** The heaviest load lifted that session, or null for a bodyweight movement. */
  loadKg: number | null;
  /**
   * The most reps done at that session's top load — NOT the most reps done at
   * any load. 60 kg × 5 after 60 kg × 8 is not a rep PB, and pairing the top
   * load with the top reps of a lighter set would invent one.
   */
  reps: number | null;
}

export interface ExerciseProgress {
  exerciseId: string;
  /** Null where the name cannot be resolved — see `resolveNames`. */
  name: string | null;
  state: ExerciseState;
  /** Every session's top set, oldest first. */
  points: ExercisePoint[];
  sessions: number;
  /** The series the trend is drawn from — load where there is one, else reps. */
  series: number[];
  /** Which of the two `series` is, so the caller can print the unit. */
  measure: 'load' | 'reps' | 'none';
  first: number | null;
  best: number | null;
  latest: number | null;
  /** `best − first`, rounded. Null where there is no measure to subtract. */
  delta: number | null;
  /**
   * Reps gained at the top load, across the window — the OTHER progression.
   *
   * ── AND WITHOUT IT THE TAB HAS A ROW IT CANNOT EXPLAIN ─────────────────────
   *
   * MEASURED on *Hammer Curl*: 17.5 kg for seven sessions with the reps going
   * 10 → 11 → 12. `buildExercises` classifies that as climbing and is right —
   * double progression is how most programmes advance somebody — but the row
   * rendered as **`7 sessions · 17.5 kg`** under a heading reading *Climbing*,
   * with nothing on it saying what had climbed. A correct classification the
   * screen cannot justify reads to a client as a mislabel.
   *
   * Null where the load is what moved, so a caller can print one gain or the
   * other and never both: *up 2.5 kg* and *up 2 reps* side by side would be two
   * claims about one session's top set.
   *
   * ── `to` IS THE BEST, NOT THE LATEST, WHICH IS THE LOAD RULE ───────────────
   *
   * `delta` is `best − first` and `buildStrength`'s own note says why — *"a
   * block often closes on a deload, and a real gain would read as a loss."* The
   * first version of this field used `last − first` and produced the same
   * screen stating two gains two different ways: *Bench 40 → 42.5* against its
   * peak beside *Hammer Curl 11 → 12* against its last session.
   *
   * Both endpoints are carried rather than the gain alone, so the overview's
   * row and the detail card read one derivation instead of each doing their own
   * — which is the drift `holdingCount` was passed in to avoid on the summary.
   */
  repsProgress: { from: number; to: number; gain: number } | null;
  /**
   * How many trailing sessions have sat at the current level.
   *
   * Only meaningful on a `holding` row, and **it can be 1 or 2 there** — see
   * `noGain`: a movement that has bounced between two loads without ever
   * beating its first session is holding without being on a flat run. The
   * caller branches on `>= HOLDING_SESSIONS` to pick which sentence is true.
   */
  holdingFor: number;
  lastAt: number;
  /** True when the best was set in the last fortnight. §3's *New best*. */
  fresh: boolean;
}

/** `2026-08-14` → a timestamp. */
function dateOf(iso: string): number {
  return new Date(`${iso}T00:00:00`).getTime();
}

/**
 * Every movement with a logged set, newest activity first within each state.
 *
 * `sets` is the unwindowed read — `getPortalSets`' own docstring argues for it —
 * and `windowFrom` narrows here rather than at the fetch, so the range chips
 * re-derive without a second round trip.
 */
export function buildExercises(
  sets: PortalSetHistoryWire[],
  names: Map<string, string>,
  now: number,
  windowFrom: number | null = null,
): ExerciseProgress[] {
  /* Session → the top set, per movement. Two passes rather than one, because
     "the most reps AT the top load" cannot be known until the top load is. */
  const byExercise = new Map<string, Map<string, PortalSetHistoryWire[]>>();
  for (const s of sets) {
    if (windowFrom !== null && dateOf(s.sessionDate) < windowFrom) continue;
    /* A set with neither a load nor a rep count is a row nothing can be read
       from — a timed movement whose duration this projection does not carry.
       Counting it as a session would put a movement on the tab with an empty
       trend beside it. */
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

  const out: ExerciseProgress[] = [];

  for (const [exerciseId, days] of byExercise) {
    const dates = [...days.keys()].sort();
    const points: ExercisePoint[] = dates.map((date) => {
      const rows = days.get(date) ?? [];
      const loads = rows.map((r) => r.loadKg).filter((n): n is number => n !== null && n > 0);
      const topLoad = loads.length > 0 ? Math.max(...loads) : null;
      /* Reps AT the top load, which is what makes a rep gain at a fixed weight
         legible as progress rather than as noise from a lighter back-off set. */
      const atTop = topLoad === null ? rows : rows.filter((r) => r.loadKg === topLoad);
      const reps = atTop.map((r) => r.reps).filter((n): n is number => n !== null);
      return {
        date,
        loadKg: topLoad,
        reps: reps.length > 0 ? Math.max(...reps) : null,
      };
    });

    /* WHICH NUMBER IS THE MEASURE, and the fallback is not cosmetic: a pull-up
       or a plank carries no load at all, and reading `loadKg` for it would
       report every session as null and classify a movement that is genuinely
       improving as having no trend. Reps are what moves on those. */
    const measure: 'load' | 'reps' | 'none' = points.some((p) => p.loadKg !== null)
      ? 'load'
      : points.some((p) => p.reps !== null)
        ? 'reps'
        : 'none';

    const valueAt = (p: ExercisePoint): number | null =>
      measure === 'load' ? p.loadKg : measure === 'reps' ? p.reps : null;

    const series = points
      .map(valueAt)
      .filter((n): n is number => n !== null);

    const first = series.length > 0 ? series[0] : null;
    const best = series.length > 0 ? Math.max(...series) : null;
    const latest = series.length > 0 ? series[series.length - 1] : null;
    const lastAt = dateOf(points[points.length - 1].date);

    /* ── THE HOLDING RUN ───────────────────────────────────────────────────
       Walk backwards while the measure has not changed. `===` and not `<=`,
       because a session that went DOWN is not the same fact as one that stood
       still — a deload is usually the plan, and rolling it into a plateau
       would name the one week the trainer deliberately backed the weight off. */
    let holdingFor = 0;
    if (latest !== null) {
      for (let i = points.length - 1; i >= 0; i -= 1) {
        if (valueAt(points[i]) !== latest) break;
        holdingFor += 1;
      }
    }

    /* ── AND REPS BREAK THE RUN, WHICH IS THE ONE THING THIS MUST NOT GET
           WRONG ─────────────────────────────────────────────────────────────
       Four sessions at 60 kg going 6 → 7 → 8 → 10 reps is textbook double
       progression and it is the most common way a well-run programme moves
       somebody. Reading only the load would file that under *Holding* and tell
       a client who is visibly improving that they are stuck — which is both
       wrong and precisely the discouragement §1 forbids. */
    let repsMoved = false;
    if (measure === 'load' && holdingFor >= 2) {
      const run = points.slice(points.length - holdingFor);
      const repsIn = run.map((p) => p.reps).filter((n): n is number => n !== null);
      if (repsIn.length >= 2 && repsIn[repsIn.length - 1] > repsIn[0]) repsMoved = true;
    }

    /* The same question over the WHOLE window rather than the trailing run —
       see `noGain` below, which needs it. A movement whose load never rose but
       whose reps did is progressing, and neither figure alone can say so.

       `best` and not `last`, matching how `delta` reads the load: see
       `repsProgress`. */
    const repsAll = points.map((p) => p.reps).filter((n): n is number => n !== null);
    const repsFirst = repsAll.length > 0 ? repsAll[0] : null;
    const repsBest = repsAll.length > 0 ? Math.max(...repsAll) : null;
    const repsGained =
      measure === 'load' && repsFirst !== null && repsBest !== null && repsBest > repsFirst;

    /* ── NOT CLIMBING JUST BECAUSE IT IS NOT ON A FLAT RUN ────────────────────

       MEASURED, and it was live on the first version of this tab: *Hammer Curl,
       7 sessions* sat under the **Climbing** heading with no gain clause beside
       it, because its best never exceeded its first session and its trailing run
       happened to be two long rather than three. `climbing` was the fallback
       state, so anything that was not stale, not new and not on a flat run got
       it — including a movement that has bounced between two loads for two
       months and gone nowhere.

       A heading is a claim. Fifteen movements under *Climbing* where one of them
       has not moved is the tab being wrong about the one thing it exists to say,
       and it is wrong in the direction that matters least to a client and most
       to their trainer: it hides work that needs a conversation.

       So `holding` means NOT MOVING rather than *on a flat run*, and the two
       ways of not moving are told apart in the SENTENCE rather than in the
       state — `holdingFor` is what the caller branches on. */
    const noGain = !repsGained && best !== null && first !== null && best <= first;

    const stale = startOfDay(now) - lastAt > STALE_DAYS * DAY_MS;

    const state: ExerciseState = stale
      ? 'resting'
      : points.length < MIN_SESSIONS
        ? 'new'
        : (holdingFor >= HOLDING_SESSIONS && !repsMoved) || noGain
          ? 'holding'
          : 'climbing';

    const bestAt =
      best === null ? lastAt : dateOf(points[series.indexOf(best)]?.date ?? points[0].date);

    out.push({
      exerciseId,
      name: names.get(exerciseId) ?? null,
      state,
      points,
      sessions: points.length,
      series,
      measure,
      first,
      best,
      latest,
      delta: first !== null && best !== null ? Math.round((best - first) * 10) / 10 : null,
      /* Only where the LOAD did not move — see the field's own note. */
      repsProgress:
        repsGained && first !== null && best !== null && best <= first
          ? {
              from: repsFirst as number,
              to: repsBest as number,
              gain: (repsBest as number) - (repsFirst as number),
            }
          : null,
      holdingFor: state === 'holding' ? holdingFor : 0,
      lastAt,
      fresh: now - bestAt < 14 * DAY_MS,
    });
  }

  /* ── THE ORDER, AND IT IS NOT THE SUMMARY'S ────────────────────────────────

     `buildStrength` ranks by proportional gain, so the summary leads with the
     most encouraging number. This tab answers a different question — *what
     needs attention* — so the movements that have stopped come first.

     That is not a contradiction with §1: putting them first is not shaming
     anybody, it is what makes the tab worth opening. The never-shame rule is
     about TONE and about blame, and it is honoured in the words and the colour,
     not by burying the finding at the bottom of a list nobody scrolls. */
  const rank: Record<ExerciseState, number> = { holding: 0, climbing: 1, new: 2, resting: 3 };
  return out.sort((a, b) => {
    const byState = rank[a.state] - rank[b.state];
    if (byState !== 0) return byState;
    /* Inside a state, the one done most recently first — it is the one the
       client is actually training and the one they can act on this week. */
    return b.lastAt - a.lastAt;
  });
}

/** How many of each state, for the tab's own one-line summary. */
export function countStates(rows: ExerciseProgress[]): Record<ExerciseState, number> {
  const out: Record<ExerciseState, number> = { climbing: 0, holding: 0, new: 0, resting: 0 };
  for (const r of rows) out[r.state] += 1;
  return out;
}

/**
 * What the row's numbers are counted in.
 *
 * Shared by the overview and the detail view rather than declared in each: a
 * pull-up reading *8 reps* on one screen and *8 kg* on the other is the two
 * spellings defect, and this is the function that decides it.
 */
export function unitFor(row: ExerciseProgress): string {
  return row.measure === 'load' ? 'kg' : 'reps';
}

/**
 * The order the overview draws its groups in, and it is `buildExercises`'s own
 * sort made explicit so the two cannot disagree about which comes first.
 */
export const STATE_ORDER: ExerciseState[] = ['holding', 'climbing', 'new', 'resting'];

/**
 * What each group is CALLED, and the holding one is the whole feature.
 *
 * *Worth a word with Arun* rather than *Stuck* or *No progress*. §1's
 * never-shame rule is not satisfied by a neutral word alone — a heading reading
 * *Holding* over two movements is still a scoreboard — so the heading names the
 * ACTION instead of the state, which is also the only thing on this screen a
 * client can actually do about it. The trainer sets the load; the client's move
 * is to mention it.
 */
export const STATE_HEADING: Record<ExerciseState, string> = {
  holding: 'Worth a word with',
  climbing: 'Climbing',
  new: 'Just started',
  resting: 'Not lately',
};

/** The same states as a short label, for the count tiles. */
export const STATE_LABEL: Record<ExerciseState, string> = {
  holding: 'Holding',
  climbing: 'Climbing',
  new: 'Just started',
  resting: 'Not lately',
};

/** One movement out of the set, by id. Null where the range holds none. */
export function findExercise(
  rows: ExerciseProgress[],
  exerciseId: string,
): ExerciseProgress | null {
  return rows.find((r) => r.exerciseId === exerciseId) ?? null;
}
