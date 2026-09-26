import 'server-only';

import { DAY_MS, dayStamp, monthName, startOfDay } from '@/lib/today/time';
import type { ProgressRange } from '@/lib/log/log';

import { DEFAULT_RANGE, rangeChoices, rangeFrom } from './range';

import type {
  MeWire,
  PortalMetricWire,
  PortalMilestoneWire,
  PortalProgramWire,
  PortalSessionWire,
  PortalSetHistoryWire,
  PortalWorkoutSummaryWire,
} from './api';
import { progressTabHref } from './progress-tabs';
import { buildTraining, type PortalTraining } from './training';

/**
 * What Progress says, and §3's instruction is the whole shape of this file:
 * **"Show change, not data. Lead with a plain-language summary, not a chart.
 * Charts go below. Most clients want the sentence, not the graph."**
 *
 * So `buildProgress` returns SENTENCES first and series second, and the screen
 * draws them in that order. Every series here has a line of prose attached to
 * it, because a chart a beginner cannot read is a chart that says *you are
 * failing* on any week that is flat.
 *
 * ── FOUR RULES THIS FILE ENFORCES, NOT FOUR IT MENTIONS ──────────────────────
 *
 * §3's weight paragraph is the most consequential thing in the client spec, and
 * it is four separate constraints. Each one is a real branch below:
 *
 *   1. **Smoothed, never raw.** `TrendChart` cannot draw a raw line at all, and
 *      the SENTENCE beside it reads the same `smooth()` — so the prose and the
 *      graph cannot tell two different stories about one series.
 *   2. **Hideable.** `hideWeight` removes weight from the summary, from the
 *      chart list and from Home's quick log. Not greyed out — absent.
 *   3. **Never celebrate a rate.** There is no kg-per-week figure anywhere in
 *      this file and there must never be one. `weightChange` is a total, stated
 *      flatly, with no tone attached — see `WEIGHT_HAS_NO_TONE`.
 *   4. **Something else is always visible.** `summary` puts strength and
 *      consistency in front of weight *by construction*, so a client whose
 *      scale has not moved in six weeks cannot open this screen and find only
 *      the number that has not moved.
 */

/**
 * WEIGHT CARRIES NO TONE, ANYWHERE.
 *
 * `lib/reports/build.ts` states this for the shareable card — *"a green arrow
 * on a card the client keeps is the product taking a side in a conversation it
 * was not in"* — and on this screen it is stronger, because the client is
 * reading it about themselves.
 *
 * Down is not good. Up is not bad. A client putting on muscle and a client
 * losing fat are both doing what they came for, and this product does not hold
 * the field that would tell them apart — `client.goal` is the trainer's free
 * text. So the figure is a figure, and the only thing coloured on this screen
 * is a strength gain, which is unambiguous in one direction.
 */
export const WEIGHT_HAS_NO_TONE = true;

/** How long a client has to have been training before a strength claim is fair. */
const MIN_SESSIONS_FOR_A_CLAIM = 3;

/**
 * The window the consistency figure is stated over when nothing else says.
 *
 * Still 90, and still the number `PORTAL_LOOKBACK_DAYS` is pinned to — but it is
 * no longer the only window on this screen: see `RANGE_DAYS`, and note that
 * `'6m'` is what a client picks to get something close to it.
 */
export const CONSISTENCY_DAYS = 90;

/* ── the range lives in `./range.ts`, and had to ──────────────────────────────

   `RANGE_DAYS`, `RANGE_LABEL`, `RANGE_PROSE`, `DEFAULT_RANGE`, `readRange`,
   `rangeFrom` and `rangeChoices` were all declared HERE first, and the screen
   rendered blank: this file is `server-only` and the chips that read the labels
   are a client component. That module's header carries the whole note; the
   short version is that a range is a vocabulary and a vocabulary both sides of
   the boundary read belongs in neither.

   Re-exported so a server caller has one import for the model and its window.

   §3's screen had one window per metric and no way to change any of them:
   attendance over 90 days, strength since the first ever set, the tape from
   first reading to last. The caption explained the mixture in a sentence —
   *"Attendance is over the last 90 days. Everything else is since you started"*
   — which is the tell: a screen that has to explain its own axes has more than
   one. Trainerize and TrueCoach both let a client change it, and this product's
   own TRAINER half already does on the same client's progress tab.            */
export {
  RANGE_DAYS,
  RANGE_LABEL,
  RANGE_PROSE,
  DEFAULT_RANGE,
  readRange,
  rangeFrom,
  rangeChoices,
} from './range';

export interface StrengthGain {
  exerciseId: string;
  name: string;
  /** The first top set on record, in kg. */
  from: number;
  /** The best top set on record. */
  to: number;
  /** `to − from`, and always ≥ 0 — see `buildStrength`. */
  delta: number;
  /** Every session's top set, oldest first, for the chart. */
  series: number[];
  /** The dates those top sets were done on, for the axis. */
  dates: string[];
  /** True when the best was set in the last fortnight. §3's *New best*. */
  fresh: boolean;
}

/* ── `MeasureChange` AND `PortalWeight` WERE HERE, AND BOTH ARE GONE ────────
   23 Sep 2026. They were the Summary tab's two body figures — the biggest mover
   on the tape and the change on the scale — and the Progress tab is exercise
   progress now (`lib/portal/progress-tabs.ts` carries the argument). The tape
   has ONE builder, `buildMeasureSeries` below, which the Assessments tab reads:
   it drops nothing, sorts by the body rather than by the size of a change, and
   is therefore the honest shape for a record. `buildMeasures` existed only to
   pick a winner out of it for a summary line that no longer exists, and
   `buildWeight` only to feed a chart that moved to the same tab.

   Deleted rather than kept: they are derivations, not components, and this
   codebase keeps an unused COMPONENT with a docstring because a route may
   arrive for it. Two builders nothing calls are two places for the tape to
   learn a second set of rules. */

export interface PortalConsistency {
  /** Sessions trained in the window. */
  attended: number;
  /** Sessions that were scheduled and have settled. The denominator. */
  offered: number;
  /** `attended / offered`, or null where nothing has settled yet. */
  rate: number | null;
  /** Sessions a week, averaged over the window. §3's *per week*. */
  perWeek: number;
  /** Weeks the client has been with this trainer. */
  weeks: number;
}

/**
 * §3's summary, and it is a LEAD plus a set of supporting rows rather than a
 * list of lines.
 *
 * ── WHY THE SHAPE CHANGED, AND IT WAS A REPORTED DEFECT ──────────────────────
 *
 * It returned `string[]`, then `SummaryLine[]`, and the screen drew whichever
 * it was as one column of identically-weighted 17px lines. Reported as *"this
 * is not appealing to see"*, and the report was right in a way the previous
 * pass half-missed: that pass found "no hierarchy in the summary — six
 * identically-weighted lines", fixed the SPELLING with `ui/Change.tsx`, and
 * left the flatness. Consistent and flat is still flat.
 *
 * Six figures of four different kinds — an attendance rate, two lifts, two tape
 * sites and a bodyweight — rendered at one size in one column is a data dump
 * with no way in. §3 asks for a *"plain-language summary"* and its own example
 * is a sentence with one number in it; a reader needs somewhere to look first.
 *
 * ── SO THE MODEL DECIDES THE LEAD, BECAUSE §3 DOES ───────────────────────────
 *
 * §3's table: *"Strength — 'Your squat is up 22kg.' The most motivating number
 * for beginners, and the one most apps bury. **Lead with it.**"* That is a
 * ranking instruction and it belongs here rather than in the JSX: the screen
 * should not be picking which of six figures is the important one, and
 * `buildStrength` has already done the ordering work that answers it.
 *
 * Everything else becomes a supporting ROW — a key and a short figure — which
 * is a different component and a different size, and that is the hierarchy.
 */
export interface SummaryLead {
  /** The movement. *Overhead Press*. */
  label: string;
  from: number;
  to: number;
  unit: string;
  /** *up 2.5 kg* — the one accent §3 sanctions, and only on this figure. */
  delta: string;
}

/**
 * One supporting figure, as a key and a value.
 *
 * ── THE KEY IS THE THING AND THE VALUE IS ITS FIGURE, MEASURED ───────────────
 *
 * These render as `.kv` rows: `flex-wrap:nowrap`, an 80px min-width key, and a
 * right-ranged nowrap value. `AGENTS.md` records what happens when that is
 * given prose — the notify rows put *"227px of content in a 147px slot"* — and
 * the first version of this row did it anyway: `Also stronger` →
 * *"Barbell Bench Press, +2.5 kg"*, which is **192px of nowrap value that ran
 * 15px past its own card at 320px.** Found by measuring, after quoting the
 * warning in this very docstring.
 *
 * The fix is not a shorter phrase, it is the right split. The key column is
 * already the *what* column, so the movement and the tape site move INTO it and
 * the value is only ever a figure: *Barbell Bench Press → +2.5 kg*, *Chest →
 * +1.1 cm*. Five keys that are things and five values that are numbers, which
 * also makes the column scannable in the way the flat version was not.
 *
 * ── AND `href` IS NOW A TAB, WHERE IT IS ANYTHING ───────────────────────────
 *
 * These pointed at `#turning-up` and `#tape`, which were the right answer while
 * Progress was one five-screen page: the rows were the way down it. With four
 * routes most of what they summarise is on the summary itself, so a row links
 * only where the detail genuinely lives somewhere else — the second lift to
 * *Exercises*, the tape to *Measurements*.
 *
 * The rest carry no href at all, deliberately. An anchor to a card 300px below
 * on the same short tab is a control that appears to navigate and does not, and
 * the underline it would draw is a promise about a place.
 */
export interface SummaryRow {
  /** The left column. *Turned up*, *The tape*. */
  key: string;
  /** The right column. Short — see above. */
  value: string;
  /** The tab that draws this figure in full, where that is another tab. */
  href?: string;
}

/**
 * One workout, as a row in the history — the block this screen was promised and
 * did not have.
 *
 * ── `nav.tsx` COMMITTED TO THIS AND NOTHING BUILT IT ─────────────────────────
 *
 * The table that renamed the fourth destination says why: *"Sessions → Plan.
 * The frame's Sessions is a HISTORY; §4 asks for what is coming, which is a
 * different question and the anxious one. **The history is on Progress, where
 * it is evidence.**"* Progress then shipped with charts, figures and a tape, and
 * no list of what the client had actually done — so the history was moved off
 * one screen and never landed on the other.
 *
 * It is also the one block every workout tracker has and this did not: Hevy's
 * own docs describe *"History — your performance on that activity from workout
 * to workout, and tap on any to see the entire session."* The tapping is the
 * half that matters here, and it is the reason these rows are links: every
 * figure above them on this screen is a claim, and this is the only place a
 * client can go and check one.
 *
 * ── CLOSED LOGS ONLY ────────────────────────────────────────────────────────
 *
 * An open one is a session in progress. It belongs to Home's hero, which is
 * already drawing it with a *Carry on* button, and a history that listed it
 * would offer a second door into a workout the client is standing in.
 */
export interface PortalHistoryRow {
  id: string;
  /** *Mon · 7 Sep*. `dayStamp`'s, so this and Plan spell a day one way. */
  stamp: string;
  /** The ISO date, for `<time datetime>`. A stamp is not machine-readable. */
  iso: string;
  at: number;
  setCount: number;
  exerciseCount: number;
  volumeKg: number;
  /** The client's own answer to §2's *how did that feel*. Never a judgement. */
  effort: 'easy' | 'right' | 'hard' | null;
  /**
   * *Upper A* — WHICH session this was, and the single most useful thing on the
   * row.
   *
   * ── IT WAS ONE CLICK AWAY AND NOT ON THE LIST ──────────────────────────────
   *
   * MEASURED, and it is what made this page unusable rather than merely plain:
   * every one of twenty-one rows read *6 exercises · 20 sets · 7:00 AM*, because
   * this client trains the same shape every session. Three of the five facts on
   * the row were the SAME on all twenty-one, and the row spent an 847px subtitle
   * track saying them. What varied was the date and the tonnage.
   *
   * Meanwhile `/me/workout/:id` opens with **"Upper B · 57 minutes"**. The
   * product knew what each session was and the list of them did not say.
   *
   * Null for a workout with no booking behind it — a client who pressed *Start*
   * with nothing in the diary — which is a real state and draws nothing rather
   * than a placeholder.
   */
  dayLabel: string | null;
  /**
   * How long it took, in minutes, or null where the pair cannot be trusted.
   *
   * `endedAt − startedAt` is on the wire and was being thrown away. It is
   * guarded rather than printed raw: a session caught up from paper hours after
   * it happened has a `startedAt` of when it was TYPED, so the subtraction can
   * produce four hours or four seconds. Outside 5–240 minutes the row says
   * nothing, which is the honest reading of a figure the data cannot support.
   */
  minutes: number | null;
  /** A milestone fired on this day. §3's recognition, on the day it happened. */
  pr: boolean;
}

export interface PortalProgressData {
  /**
   * *61 weeks with Arun* — the frame, and its own field rather than
   * `summary[0]`.
   *
   * It is separate because it was BEING DRAWN TWICE: the page put
   * `summary[0]` in `.ph__sub` and the summary card put `summary[0]` in its
   * head, so the identical string rendered 58px apart. `AGENTS.md`'s
   * `.ph--today` rule is written about exactly that shape. Splitting the field
   * is what makes the fix structural — the header renders the lead, the card
   * renders the lines, and there is no index either of them can get wrong.
   */
  lead: string;
  /**
   * The one figure the card leads with — §3's *"lead with it"*, resolved.
   * Null for a client with no qualifying strength gain in the range, and the
   * card then leads with its first supporting row instead.
   */
  lead2: SummaryLead | null;
  /**
   * The supporting figures, in §3's own priority order: consistency, the second
   * lift, the tape, and weight LAST. That order is rule 4 of this file's
   * header, and weight being last is the half of it that matters — a client
   * whose scale has not moved must not open this screen and find the number
   * that has not moved at the top of it.
   */
  summary: SummaryRow[];
  /** The goal, the block and the agreed frequency. See `buildArrangement`. */
  arrangement: PortalArrangement;
  consistency: PortalConsistency;
  strength: StrengthGain[];
  /**
   * How many movements have logged sets in this window, so the summary's lift
   * block can say what it is showing five of rather than implying it is all of
   * them. Counted over the same sets `buildStrength` reads.
   */
  exerciseCount: number;
  /**
   * How many of those have stopped moving — the Exercises tab's own headline,
   * surfaced here as a count and a door.
   *
   * It is on the SUMMARY because a plateau is the one thing on this screen a
   * client would want to know without going looking for it, and burying it one
   * tab deep would mean only the clients who already suspected it ever saw it.
   * A count and a link, never the rows: the detail is that tab's job, and §1's
   * never-shame rule is why this is a neutral figure rather than a warning.
   */
  holdingCount: number;
  /**
   * WHAT THE CLIENT LIFTED — the figures, the weekly volume and the top-set
   * sequence, over the same window everything else here is stated over.
   *
   * Built by `lib/portal/training.ts` and folded in here rather than fetched
   * beside this payload, because it comes off the SAME `sets` array
   * `buildStrength` is already reading. A second call at the page would be a
   * second walk over four hundred rows to answer a question this builder is
   * already holding the rows for.
   */
  training: PortalTraining;
  /**
   * Every milestone on record, and this field is DELIBERATELY NOT WINDOWED.
   *
   * `AGENTS.md`: *"a personal best is a claim about the whole history, so a
   * window is what produced the wrong answer."* A milestone is that claim with
   * a date on it, and filtering it to eight weeks would empty the *Along the
   * way* card for most clients — which reads as the records having been lost
   * rather than as a range having been narrowed. A lifetime record is not a
   * period figure, so the range does not reach it.
   */
  milestones: PortalMilestoneWire[];
  /** Which window this data is over, so the screen can name it. */
  range: ProgressRange;
  /** The ranges worth offering this client. See `rangeChoices`. */
  choices: ProgressRange[];
  /**
   * True when the chosen range holds nothing — a real state, and NOT the same
   * one as a brand-new client with nothing anywhere.
   *
   * The bare-state copy reads *"After two or three sessions it will show what
   * is getting stronger"*, which is right for somebody in their first week and
   * plainly wrong for somebody sixty-one weeks in who has just pressed *8
   * weeks*. The trainer's own progress tab already says the other sentence —
   * *"Nothing logged in this range yet"* — and this is what lets this screen
   * pick between the two.
   */
  emptyRange: boolean;
  /**
   * How many closed logs are in the window — the History tab's count, on the
   * summary as a figure and a door rather than as the list itself.
   */
  historyTotal: number;
  /**
   * ISO date → the workout logged on it, so a claim can link to its day.
   *
   * Every figure on this screen is a claim about a day — *Back Squat at 60 kg*
   * happened ON one, and `StrengthGain.dates` names the session each top set
   * came from — and until now none of them led anywhere. This is what makes a
   * milestone tag and a chart's endpoint openable, and it is a MAP rather than
   * an id per claim because the claims outnumber the workouts: three lifts and
   * six milestones point at maybe four distinct days.
   *
   * A miss is the normal case and not an error: a milestone can be minted on a
   * day whose log has since been deleted, and the seed back-fills some from
   * before the client's first logged workout. The caller draws a plain tag then,
   * which is `ClipThumb`'s rule — a control that cannot do its job is not drawn.
   */
  workoutByDate: Record<string, string>;
  /** Total sessions trained, ever, as far as the window reaches. */
  totalSessions: number;
}

/**
 * ── `weight` WAS MISSING, AND IT ONLY SHOWED WHEN A SCREEN DREW IT ──────────
 *
 * `buildMeasures` filters weight out before it labels anything — the tape card
 * and the weight card are two different blocks on the summary — so the gap was
 * unreachable and invisible for as long as this map existed. The Measurements
 * tab draws every metric type through one list, so it hit the `?? metricType`
 * fallback and rendered a card headed **`weight`**, lower-case, beside *Body
 * fat* and *Waist*. Found by rendering; no gate could have seen it.
 */
const MEASURE_LABELS: Record<string, string> = {
  weight: 'Weight',
  waist: 'Waist',
  chest: 'Chest',
  arm: 'Arms',
  hip: 'Hips',
  body_fat: 'Body fat',
};

/** `2026-08-18` → a timestamp, for the axis. */
function dateOf(iso: string): number {
  return new Date(`${iso}T00:00:00`).getTime();
}

/**
 * §3's consistency — *"Sessions attended per week/month. Something they always
 * control."*
 *
 * ── THE DENOMINATOR IS WHAT SETTLED, WHICH IS THE TRAINER HALF'S OWN RULE ────
 *
 * `buildWeek` on the trainer side divides delivered by everything *scheduled*,
 * which on a Tuesday is a denominator mostly in the future — and `AGENTS.md`
 * records that it is "survivable as seven bars; not survivable as a headline
 * percentage." This is a headline percentage, read by the person it is about,
 * so it counts only sessions that have HAPPENED one way or the other.
 *
 * ── AND ATTENDED MEANS TRAINED, BY EITHER ROUTE ──────────────────────────────
 *
 * A marked session or a logged workout, the same rule `buildWeek` uses here and
 * the roster uses for *last attended*. A cancelled session is in NEITHER
 * number: the client did not miss it, and holding it against them would be the
 * screen blaming somebody for a change their trainer made.
 */
export function buildConsistency(
  sessions: PortalSessionWire[],
  startedAt: number,
  now: number,
  /**
   * The range's start, or `null` for *since you started*.
   *
   * Optional, and it defaults to the 90 days this figure was fixed at before
   * the range control existed — so `buildConsistency(rows, startedAt, now)`
   * still answers exactly what it used to for `components/portal/Home.tsx`,
   * which reads this function for its own foot tile over its own window and has
   * no range of its own to pass.
   */
  windowFrom: number | null | undefined = undefined,
): PortalConsistency {
  const from =
    windowFrom === undefined
      ? startOfDay(now) - CONSISTENCY_DAYS * DAY_MS
      : (windowFrom ?? startOfDay(startedAt));
  const inWindow = sessions.filter((s) => s.scheduledAt >= from && s.scheduledAt <= now);

  const settled = inWindow.filter((s) => s.status !== 'scheduled' && s.status !== 'cancelled');
  const attended = settled.filter((s) => s.status === 'done' || s.workoutId !== null).length;

  /* ── THE SPAN IS WHAT THE RECORDS COVER, NOT WHAT THE WINDOW CLAIMS ───────

     It was `now − max(startedAt, from)`, clamped so *8 weeks* on somebody three
     weeks in divides by three weeks. That clamp is right and it was not enough,
     and putting an agreed target beside the figure is what exposed it:

         **0.3 of 3 sessions a week**

     on a client who trains three times a week and has never missed. The
     arithmetic was correct and the denominator was a fiction — 21 sessions on
     record divided by 61 weeks of tenure, because the session history only
     reaches back sixty days while `startedAt` is fourteen months old.

     That is not only a fixture artefact. A trainer who has coached somebody for
     a year and started using this app last month has exactly the same shape,
     and the client would open Progress to be told they train 0.3 times a week.
     A figure divided by a period the data does not cover is the same mistake
     `utilisation` refuses on the trainer's half — *"a trainer who never told us
     when they work is not 0% utilised, and printing that would be this screen
     inventing the denominator."*

     So the divisor starts at the FIRST SESSION ON RECORD inside the window.
     Floored at a week, because a single session logged three days ago would
     otherwise read as 2.3 a week — the same lie pointing the other way. */
  /* `reduce` and not `inWindow[0]`: the mock happens to sort ascending and the
     backend is not promised to, and a rate that silently depends on a caller's
     sort order is one that breaks without a type error. */
  const earliest = inWindow.reduce((min, s) => Math.min(min, s.scheduledAt), now);
  const spanFrom = Math.max(startedAt, from, earliest);
  const spanDays = Math.max(7, (now - spanFrom) / DAY_MS);
  return {
    attended,
    offered: settled.length,
    rate: settled.length > 0 ? attended / settled.length : null,
    perWeek: Math.round((attended / spanDays) * 7 * 10) / 10,
    weeks: Math.max(1, Math.round((now - startedAt) / (7 * DAY_MS))),
  };
}

/**
 * §3's headline: *"Your squat is up 22kg. The most motivating number for
 * beginners, and the one most apps bury. Lead with it."*
 *
 * ── FIRST-EVER AGAINST BEST-EVER, AND NEITHER IS *LATEST* ────────────────────
 *
 * `lib/reports/build.ts` argues the second half and it holds here: *"the first
 * day of the window against the BEST day in it, not against the last: a block
 * often closes on a deload, and a real gain would read as a loss."* A client
 * whose trainer has them at 55kg this week after a 62.5kg top set in August has
 * not got weaker, and a screen that says so is a screen they stop opening.
 *
 * The first half — first EVER, not first in a window — is this screen's own:
 * the sentence is *Squat 40 → 62.5*, which is a claim about where they started,
 * and where they started is older than any window a screen would pick. It is
 * why `getPortalSets` is unwindowed.
 *
 * ── RANKED BY PROPORTION, WHICH PUTS THE BEGINNER'S LIFT FIRST ───────────────
 *
 * Also the report's rule: *"+5 kg on a 20 kg curl beats +5 kg on a 140 kg
 * deadlift, and the client who did the first one is the one who needs to see
 * it."*
 *
 * ── AND A LIFT THAT HAS NOT MOVED IS DROPPED, NEVER SHOWN AS ZERO ────────────
 *
 * `delta === 0` is a true fact and a discouraging one, and §3's whole framing is
 * *make invisible progress visible* rather than *audit every lift*. A flat
 * movement says nothing the client can act on; the four that moved do.
 */
export function buildStrength(
  sets: PortalSetHistoryWire[],
  names: Map<string, string>,
  now: number,
  /**
   * The range's start, or `null` for every set on record.
   *
   * ── AND THE DEFAULT RANGE IS `all` BECAUSE OF THIS FUNCTION ────────────────
   *
   * `AGENTS.md` states the rule twice and it is about exactly this read: *"a
   * personal best is a claim about the whole history, so a window is what
   * produced the wrong answer"*, and §3's headline is *Squat 40kg → 62.5kg*,
   * which "is a statement about a beginning, and the beginning is older than
   * any window a screen would pick."
   *
   * So a narrower range does not make this claim wrong — it makes it a
   * DIFFERENT claim, *what has moved in the last eight weeks*, which is a fair
   * question and the one a range control is for. What would be wrong is that
   * being the default, and it is not: `DEFAULT_RANGE` is `all`.
   */
  windowFrom: number | null = null,
): StrengthGain[] {
  /* Top set per exercise per DAY, which is what a "session's best" means and
     what makes the series one point a session rather than one point a set. */
  const byExercise = new Map<string, Map<string, number>>();
  for (const s of sets) {
    if (s.loadKg === null || s.loadKg <= 0) continue;
    if (windowFrom !== null && dateOf(s.sessionDate) < windowFrom) continue;
    let days = byExercise.get(s.exerciseId);
    if (!days) {
      days = new Map();
      byExercise.set(s.exerciseId, days);
    }
    days.set(s.sessionDate, Math.max(days.get(s.sessionDate) ?? 0, s.loadKg));
  }

  const out: StrengthGain[] = [];
  for (const [exerciseId, days] of byExercise) {
    if (days.size < MIN_SESSIONS_FOR_A_CLAIM) continue;
    const dates = [...days.keys()].sort();
    const series = dates.map((d) => days.get(d) ?? 0);

    const from = series[0];
    const to = Math.max(...series);
    if (to <= from) continue;

    const bestAt = dateOf(dates[series.indexOf(to)]);
    out.push({
      exerciseId,
      name: names.get(exerciseId) ?? 'That movement',
      from,
      to,
      delta: Math.round((to - from) * 10) / 10,
      series,
      dates,
      fresh: now - bestAt < 14 * DAY_MS,
    });
  }

  /* ── THE ORDER, AND IT IS NOT PURELY PROPORTIONAL ────────────────────────

     `lib/reports/build.ts` ranks a client's lifts by proportion and argues for
     it: *"+5 kg on a 20 kg curl beats +5 kg on a 140 kg deadlift, and the
     client who did the first one is the one who needs to see it."* That is a
     rule about which CLIENT's gain to lead a trainer's report with, and it does
     not transfer whole to one client's own screen — FOUND BY RENDERING.

     On fourteen months of real sets it put **Hammer Curl 17.5 → 20** and
     **Lateral Raise 22.5 → 25** at the top of somebody's summary, with *Back
     Squat at 60 kg* sitting in the milestone row directly underneath. A
     proportional gain on an accessory is arithmetically the largest and it is
     not what §3 asked for: *"Your squat is up 22kg. The most motivating number
     for beginners, and the one most apps bury. Lead with it."*

     So the lifts somebody says out loud come first, and proportion orders
     WITHIN each tier. The set is the same one the milestone rule uses, and
     deliberately so — a screen whose headline lift and whose milestone chip
     disagreed about what matters would be two answers to one question. */
  return out.sort((a, b) => {
    const lead = Number(isLeadLift(b.name)) - Number(isLeadLift(a.name));
    if (lead !== 0) return lead;
    return b.delta / b.from - a.delta / a.from;
  });
}

/**
 * The lifts a client names without being prompted.
 *
 * Squat, deadlift, bench, press. §3's own example is a squat, `mock/seed.ts`
 * mints strength milestones off the same four, and the shared list is what
 * keeps the summary's first line and the milestone chips agreeing about which
 * movements are the ones worth talking about.
 *
 * A row and not a column: `exercise` has no *is this a headline lift* field and
 * should not grow one, because the answer is about what a beginner has heard of
 * rather than about the movement. Matching on the name is crude and it is the
 * honest crude — the alternative is a taxonomy nobody asked for.
 */
function isLeadLift(name: string): boolean {
  return /squat|deadlift|bench press|overhead press|pull-up/i.test(name);
}

/**
 * One measurement, as a SERIES — the Measurements tab's row.
 *
 * ── WHY IT IS NOT `MeasureChange` WITH A `values` FIELD ─────────────────────
 *
 * `buildMeasures` answers *what has moved most*, so it drops a type with one
 * reading, drops one that has not changed, and sorts by absolute delta. Every
 * one of those is right for a summary line and wrong for a tab whose subject is
 * the record: a client whose waist is the same as it was in March is entitled
 * to see the four readings that say so, and *nothing has changed here* is a
 * finding rather than a row to hide.
 *
 * So this drops nothing and sorts by nothing but a fixed, readable order.
 */
export interface MeasureSeries {
  metricType: string;
  label: string;
  unit: string;
  /** Every reading on record, oldest first. */
  values: number[];
  dates: number[];
  first: number;
  latest: number;
  /** `latest − first`. Zero is a real answer and is printed as one. */
  delta: number;
}

/**
 * The order the tape is read in, and it is fixed rather than ranked.
 *
 * `buildMeasures` sorts by absolute change because a summary quotes the biggest
 * mover. A LIST that reordered itself every time a range changed would be one a
 * client cannot learn — the same argument the booking form's roster makes for
 * not ranking by recency. Weight leads because it is the one most people look
 * for; the four tapes follow head to toe.
 */
const MEASURE_ORDER = ['weight', 'body_fat', 'chest', 'arm', 'waist', 'hip'];

export function buildMeasureSeries(
  metrics: PortalMetricWire[],
  hideWeight: boolean,
): MeasureSeries[] {
  const byType = new Map<string, PortalMetricWire[]>();
  for (const m of metrics) {
    /* The client's own choice, honoured on every screen that could draw it —
       `hideWeight` removes weight from the summary, from Home's quick log and
       from here. Absent, never greyed out. */
    if (hideWeight && m.metricType === 'weight') continue;
    const rows = byType.get(m.metricType) ?? [];
    rows.push(m);
    byType.set(m.metricType, rows);
  }

  const out: MeasureSeries[] = [];
  for (const [metricType, all] of byType) {
    all.sort((a, b) => a.recordedAt - b.recordedAt);

    if (all.length === 0) continue;

    /* ── NO WINDOW, AND THEREFORE NO REACH-BACK ────────────────────────────────

       This took a `windowFrom` and carried `buildMeasures`' reach-back with it:
       where the window held one reading it pulled in the last reading before
       the window, and the card had to print *which is older than the last 8
       weeks* so the dates under it stayed honest. Both halves are gone with the
       range chips. A tape is a RECORD — a trainer takes it every few weeks, so
       a client has a handful of readings and the point of the tab is all of
       them. `buildMeasures` keeps the reach-back, because the SUMMARY is still
       ranged and a summary line quoting no change from a single reading is the
       thing that rule exists to prevent. */
    const rows = all;

    const values = rows.map((r) => r.value);
    out.push({
      metricType,
      label: MEASURE_LABELS[metricType] ?? metricType,
      unit: rows[rows.length - 1].unit,
      values,
      dates: rows.map((r) => r.recordedAt),
      first: values[0],
      latest: values[values.length - 1],
      delta: Math.round((values[values.length - 1] - values[0]) * 10) / 10,
    });
  }

  return out.sort((a, b) => {
    const ai = MEASURE_ORDER.indexOf(a.metricType);
    const bi = MEASURE_ORDER.indexOf(b.metricType);
    /* Anything the order does not name goes last, alphabetically, rather than
       to the front — a metric type added to the seed tomorrow should not
       silently take the top of somebody's tape. */
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.label.localeCompare(b.label);
  });
}

/**
 * The prose §3 leads with, and the ORDER is rule 4 of this file's header.
 *
 * Strength and consistency come before weight unconditionally, so a client
 * whose scale has been flat for six weeks cannot open this screen and find only
 * the number that has not moved. That is not a presentational preference — §3
 * calls a plateau in one dimension reading as total failure "precisely when
 * people quit."
 */
/**
 * How many workouts a SUMMARY of the history lists before it stops.
 *
 * **Six, and twelve was tried and measured first.** At twelve the card rendered
 * **775px** on a 920px desk column, against neighbours of 134, 218, 244, 329
 * and 360 — so the block that is meant to be evidence for the figures above it
 * was the second-tallest thing on the screen and the page went from 4.2 to 6.0
 * screens. Six brings it to ~440px, which sits inside that distribution.
 *
 * ── AND THE CAP IS NOW A CALLER'S CHOICE, WHICH IS WHY THE TAB EXISTS ───────
 *
 * That measurement was taken when the history was one card among seven on a
 * single page, and it is still the right number for a card among others. The
 * History TAB is a screen whose whole subject is the list, so it passes
 * `Infinity` and shows every workout in the window: the cap was buying back
 * height from neighbours that tab does not have.
 *
 * The card still says the real total rather than pretending its six are all of
 * them — see `historyTotal`, which is why that field exists.
 */
export const HISTORY_ROWS = 6;

/**
 * The history, and the date map that lets a claim link to its day.
 *
 * One pass over the workouts for both, because they are the same rows read two
 * ways — the map has to cover EVERY workout and not just the ones listed, or a
 * milestone from last March would fail to link on a screen that has its log.
 */
export function buildHistory(
  workouts: PortalWorkoutSummaryWire[],
  windowFrom: number | null = null,
  limit: number = HISTORY_ROWS,
  /**
   * What the workout summary cannot say about itself.
   *
   * Both are joins the CALLER already holds — `dayLabel` comes off the sessions
   * the History tab fetches for its clock, and the milestone dates off a read it
   * makes anyway — so this stays a pure function over rows rather than growing
   * two fetches. Optional, because the two callers that want only
   * `workoutByDate` have no use for either.
   */
  extras: {
    /** workoutId → *Upper A*, from the booking behind it. */
    labels?: Record<string, string | null>;
    /** ISO dates a milestone fired on. */
    prDates?: Set<string>;
  } = {},
): {
  history: PortalHistoryRow[];
  historyTotal: number;
  workoutByDate: Record<string, string>;
} {
  const closed = workouts.filter((w) => w.endedAt !== null);
  const workoutByDate: Record<string, string> = {};

  /* THE MAP IS BUILT OVER EVERY CLOSED WORKOUT AND IS NEVER WINDOWED.

     It is what lets a claim link to its day, and the claims outlive the range:
     on *8 weeks* the strength cards still name a peak that may be a year old,
     and a map built inside the window would leave those links dead on exactly
     the ranges a client narrows to. The window applies to the LIST, which is a
     question about the period; the map answers *where is that day*, which is
     not. */
  for (const w of closed) {
    /* First writer wins, and `closed` is newest-first off the wire, so a day
       with two logs on it maps to the LATER one — which is the one a client
       means by "that day", and the same tie-break `lastWeight` takes. */
    if (!workoutByDate[w.sessionDate]) workoutByDate[w.sessionDate] = w.id;
  }

  const inWindow =
    windowFrom === null ? closed : closed.filter((w) => w.startedAt >= windowFrom);

  const history = inWindow
    .slice()
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit === Infinity ? undefined : limit)
    .map((w) => {
      /* Guarded, not printed raw — see `minutes` on the interface. */
      const mins =
        w.endedAt === null ? null : Math.round((w.endedAt - w.startedAt) / 60000);
      return {
        id: w.id,
        stamp: dayStamp(dateOf(w.sessionDate)),
        iso: w.sessionDate,
        at: w.startedAt,
        setCount: w.setCount,
        exerciseCount: w.exerciseCount,
        volumeKg: w.volumeKg,
        effort: w.effort,
        dayLabel: extras.labels?.[w.id] ?? null,
        minutes: mins !== null && mins >= 5 && mins <= 240 ? mins : null,
        pr: extras.prDates?.has(w.sessionDate) ?? false,
      };
    });

  /* The total is the WINDOW's, so *the last 6 of 21* becomes *the last 6 of 9*
     on a narrower range rather than promising fifteen more rows the range does
     not contain. */
  return { history, historyTotal: inWindow.length, workoutByDate };
}

/**
 * *61 weeks with Arun* — the frame, and it takes `now` rather than the
 * consistency block.
 *
 * ── WHICH IS WHAT LETS THE LAYOUT DRAW IT WITHOUT A FETCH ───────────────────
 *
 * It read `c.weeks`, and `c.weeks` is `(now − startedAt) / 7 days` — a fact
 * about the arrangement that never touched a session row. So the dependency on
 * `PortalConsistency` was real in the types and imaginary in the arithmetic,
 * and it was the one thing stopping the tab layout from putting this line in
 * the page header: a layout that had to call `buildConsistency` would have to
 * read a window of sessions on all four tabs, including the two that have no
 * other use for them.
 *
 * The header is where it belongs, because it frames all four tabs rather than
 * any one of them — and drawing it in the layout is also what stops it
 * re-rendering as the client moves between them.
 */
/**
 * The two filters the History tab offers, derived from the rows themselves.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * A FILTER'S OPTIONS ARE A FACT ABOUT THE DATA, NEVER A CONSTANT
 *
 * `rangeChoices` states the rule for the range chips — *"a chip for 6 months on
 * somebody eight weeks in is a control that redraws the screen identically …
 * the dead control this codebase keeps deleting, wearing a filter's clothes"* —
 * and it is the whole design of both of these:
 *
 *   · a month a client did not train in is not offered;
 *   · a session type they have never done is not offered;
 *   · **and neither control is drawn at all with fewer than two real answers**,
 *     which is what makes them free for a client three weeks in. One month is
 *     not a choice, and a client on a single-day programme has no *type*.
 *
 * ── AND THE TWO LISTS ARE INDEPENDENT, WHICH IS THE ARGUABLE PART ────────────
 *
 * Deriving the type list from whatever month is picked would guarantee every
 * combination has rows — and it would make one control's contents change while
 * the client is using the other, which is the worse failure: a list that
 * reshuffles under the pointer cannot be learned. So both are derived from the
 * whole range and an empty intersection is a real state the screen names, with
 * one control to undo it.
 */
export interface HistoryOption {
  value: string;
  label: string;
}

/** *September 2026* … newest first, one per month the client actually trained. */
export function historyMonths(rows: PortalHistoryRow[]): HistoryOption[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    const key = r.iso.slice(0, 7);
    if (seen.has(key)) continue;
    const at = new Date(`${r.iso}T00:00:00`).getTime();
    seen.set(key, `${monthName(at)} ${new Date(at).getFullYear()}`);
  }
  /* `rows` arrives newest-first, so insertion order is already the order a
     client reads a history in and no sort is needed. */
  return [...seen].map(([value, label]) => ({ value, label }));
}

/**
 * *Upper A* · *Lower A* … the session types on record.
 *
 * Sorted alphabetically rather than by frequency or recency: this is the one
 * list on the screen a client returns to repeatedly, and `BookSheet`'s own rule
 * applies — *"a ranking that reorders itself as the week fills is one a trainer
 * cannot learn, and band one is only worth having because the same face is in
 * the same place."*
 *
 * A workout with no booking behind it has no label and is in no type, which is
 * correct: it is not a *kind* of session, it is a session nobody planned.
 */
export function historyTypes(rows: PortalHistoryRow[]): HistoryOption[] {
  const seen = new Set<string>();
  for (const r of rows) if (r.dayLabel) seen.add(r.dayLabel);
  return [...seen].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
}

export function buildLead(me: MeWire, now: number): string {
  const first = me.trainer.name.split(' ')[0];
  const weeks = Math.max(1, Math.round((now - me.client.startedAt) / (7 * DAY_MS)));
  return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} with ${first}`;
}

/**
 * §3's *"goal and target set by a trainer"*, and it is half a feature because
 * the schema holds half the fields.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT A TRAINER CAN ACTUALLY SET, AND WHAT THEY CANNOT
 *
 * Asked for as *"our goal and target set by a trainer"*, and the honest answer
 * had to be measured against the wire rather than assumed:
 *
 *   · **The goal is real, and it is free text.** `client.goal` — *Strength*,
 *     *Fat loss*, *Post-injury return*. `program.goal` carries the block's own
 *     phase name. Both are prose the trainer typed.
 *   · **The agreed frequency is real.** `client.sessionsPerWeek` is the
 *     arrangement — `buildWeek`'s own note calls it "the arrangement, not the
 *     diary", which is what stops a trainer's cancellation shrinking the
 *     target. It is the one number on this card a client can be measured
 *     against fairly, because they agreed to it.
 *   · **A numeric TARGET does not exist anywhere.** No target weight, no target
 *     body fat, no goal-with-a-number on any row. `program_exercise.targetLoad`
 *     is a column that exists on the wire and is **null on every seeded row** —
 *     nothing in either half of the product ever writes it.
 *
 * ── SO THIS DRAWS THE THREE AND INVENTS NO FOURTH ───────────────────────────
 *
 * The alternative was a progress bar toward a target weight, which is the
 * obvious rendering and would have meant this file picking the number. That is
 * the same refusal `utilisation` makes on the trainer's half — *"a trainer who
 * never told us when they work is not 0% utilised, and printing that would be
 * this screen inventing the denominator"* — and it matters more here, because
 * an invented target is a target the client would try to hit.
 */
export interface PortalArrangement {
  /** *Strength*, *Fat loss*. The trainer's own words, or null. */
  goal: string | null;
  /** The block's phase name, where a program is assigned. */
  programName: string | null;
  /** *Week 5 of 12*, where the program says. */
  arc: string | null;
  /** The agreed frequency. Null where nobody set one. */
  perWeekTarget: number | null;
  /** What they have actually averaged over the window. */
  perWeekActual: number;
}

export function buildArrangement(
  me: MeWire,
  program: PortalProgramWire | null,
  c: PortalConsistency,
): PortalArrangement {
  const arc =
    program && program.week !== null
      ? program.weeks
        ? `Week ${program.week} of ${program.weeks}`
        : `Week ${program.week}`
      : null;

  return {
    /* The client's own goal first, the program's phase as the fallback — the
       client row is the standing answer and the program's is this block's. */
    goal: me.client.goal ?? program?.goal ?? null,
    programName: program?.name ?? null,
    arc,
    perWeekTarget: me.client.sessionsPerWeek,
    perWeekActual: c.perWeek,
  };
}

/**
 * A signed figure with its unit, spaced — `+1.1 cm`, `−0.1 kg`.
 *
 * The space is a literal here where `.chg__u` owns it inside `Change`, and the
 * two must not be read as a second spelling: a `.kv` value is a DELTA and a
 * `Change` is a MOVEMENT between two figures, so no number is drawn by both.
 * The row that broke that rule is documented where it was fixed, below.
 *
 * A real minus sign (U+2212) and not a hyphen: at `.kv__v`'s tabular figures a
 * hyphen is half the width of the digits beside it and reads as a dash.
 */
function signed(delta: number, unit: string): string {
  if (delta > 0) return `+${delta} ${unit}`;
  if (delta < 0) return `−${Math.abs(delta)} ${unit}`;
  return `no change`;
}

/**
 * ── THE BODY ROWS CAME OUT — 23 Sep 2026 ────────────────────────────────────
 *
 * This took `measures` and `weight` and put two more rows in the key column:
 * the biggest mover on the tape, and the change on the scale. Both are gone,
 * and so are the parameters, because **the Progress tab is exercise progress
 * now** — the trainer's half settled that on 20 Sep and the portal follows it.
 * See `lib/portal/progress-tabs.ts` for the whole argument.
 *
 * What made them worth removing rather than merely moving is that each was
 * ALREADY drawn in full on the tab it belonged to, so the key column was a
 * preview of a screen two taps away with no way to tell the two apart. The
 * weight row was the clearer case: it printed a signed delta 400px above a card
 * printing the same change as a from→to, which is the two-spellings defect this
 * file's own header records `ui/Change.tsx` being written to end.
 *
 * The column is three rows now — sessions, attendance, the second lift — and
 * every one of them is a fact about the training, which is what the tab is.
 */
export function buildSummary(
  c: PortalConsistency,
  strength: StrengthGain[],
): { lead: SummaryLead | null; rows: SummaryRow[] } {
  /* ── THE LEAD IS THE FIRST LIFT, AND `buildStrength` ALREADY RANKED THEM ──

     Its own sort puts the movements a beginner names out loud — squat,
     deadlift, bench, press — ahead of proportional gains on accessories,
     precisely so that this is not *Hammer Curl 17.5 → 20*. So the lead is
     `strength[0]` and nothing here re-decides it: one ranking, in one place,
     shared with the milestone rule. */
  const top = strength[0] ?? null;
  const lead: SummaryLead | null = top
    ? {
        label: top.name,
        from: top.from,
        to: top.to,
        unit: 'kg',
        delta: `up ${top.delta} kg`,
      }
    : null;

  const rows: SummaryRow[] = [];

  /* §3's *"something they always control"*, and two rows rather than one: the
     count and the rate are two facts, and *20 sessions · 91% attendance* as a
     single value is the kind of two-clause string `.kv` cannot hold. */
  if (c.attended > 0) {
    rows.push({ key: 'Sessions', value: String(c.attended) });
  }
  if (c.offered > 0 && c.rate !== null) {
    rows.push({ key: 'Turned up', value: `${Math.round(c.rate * 100)}%` });
  }

  /* The second lift, as a DELTA rather than a from→to pair — the pair is the
     lead's shape and repeating it here would flatten the two back together,
     which is the thing this rework exists to undo. Its own card below draws
     the pair in full. */
  const second = strength[1];
  if (second) {
    rows.push({
      key: second.name,
      value: signed(second.delta, 'kg'),
      href: progressTabHref('exercises'),
    });
  }

  /* The tape row and the weight row used to close this list. See the note above
     the signature for where they went and why they are not simply re-homed. */

  return { lead, rows };
}

/**
 * The SUMMARY tab's payload — *"a tight overview of what happened over the
 * time"*.
 *
 * ── WHAT IT STOPPED RETURNING, AND WHY THAT IS THE POINT ────────────────────
 *
 * It used to carry the history rows and the tape rows as well, because it was
 * the only builder on a screen that drew everything. Those are two tabs now, so
 * what comes back here is the OVERVIEW of each — `historyTotal` and
 * `holdingCount` are figures with a door beside them, where the rows themselves
 * belong to the tab whose subject they are.
 *
 * ── AND ON 23 Sep 2026 IT STOPPED RETURNING THE BODY ────────────────────────
 *
 * `measures` and `weight` are gone, and `metrics` is no longer a parameter. The
 * Progress tab is exercise progress now — `lib/portal/progress-tabs.ts` carries
 * the argument — so the tape and the scale belong to Assessments, which builds
 * them from its own read. **The Summary page stopped fetching `/v1/me/metrics`
 * altogether**, which is the split paying off a third time: this tab reads
 * sessions, sets, milestones, workouts and the program, and nothing about the
 * client's body.
 *
 * What arrived in their place is `training`, which is the subject the tab is
 * actually about.
 */
export function buildProgress(
  me: MeWire,
  sessions: PortalSessionWire[],
  sets: PortalSetHistoryWire[],
  milestones: PortalMilestoneWire[],
  workouts: PortalWorkoutSummaryWire[],
  names: Map<string, string>,
  program: PortalProgramWire | null,
  now: number,
  range: ProgressRange = DEFAULT_RANGE,
  /**
   * How many movements are holding, from `buildExercises`.
   *
   * Passed in rather than computed, because `lib/portal/exercises.ts` owns that
   * classification and two files deciding what a plateau is would be the drift
   * `templateForKind` exists to prevent — a client could read *2 holding* here
   * and count three on the tab it links to.
   */
  holdingCount = 0,
  /**
   * How many movements `buildExercises` recognises in this window.
   *
   * Passed in for the same reason `holdingCount` is, and it was a measured bug
   * rather than a precaution — see `exerciseCount` below.
   */
  knownExercises = 0,
): PortalProgressData {
  const startedAt = me.client.startedAt;
  const from = rangeFrom(range, startedAt, now);

  const consistency = buildConsistency(sessions, startedAt, now, from);
  const strength = buildStrength(sets, names, now, from);
  /* The same rows `buildStrength` just read, walked once more for the figures,
     the weeks and the sequence. See `training` on the payload. */
  const training = buildTraining(sets, names, now, from);
  const { historyTotal, workoutByDate } = buildHistory(workouts, from);
  const summary = buildSummary(consistency, strength);

  /* ── THE DENOMINATOR IS THE EXERCISES TAB'S OWN COUNT, PASSED IN ──────────

     MEASURED, and it was wrong the first way it was written. Counting distinct
     `exerciseId`s over the windowed sets here gave **18**, while the tab it
     links to listed **17** — because `buildExercises` skips a set carrying
     neither a load nor a rep count, which is a timed movement whose duration
     this projection does not carry. One movement, present in one count and
     absent from the other, on two tabs a client moves between in one tap.

     So the figure comes from the same builder as the list rather than from a
     second rule over the same rows — the identical argument `holdingCount`
     makes one parameter down. */
  const exerciseCount = knownExercises;

  /* The one thing that is NOT computed from the windowed data, because it is
     what tells a narrowed range apart from an empty account: the lead counts
     weeks with this trainer, which is a fact about the arrangement. */
  /* ── AND THE TAPE IS NO LONGER ONE OF THE TESTS ──────────────────────────

     `measures.length === 0` was a conjunct here, which made an empty range
     harder to reach than it should have been: a client with one tape reading
     inside eight weeks and no training at all was NOT reported as an empty
     range, so the screen drew *nothing to show yet* — the brand-new-client
     copy — at somebody sixty-one weeks in. The tape is not on this tab now, so
     the test is what the tab draws: lifts, sessions and attendance. */
  const emptyRange =
    range !== 'all' &&
    strength.length === 0 &&
    training.movements.length === 0 &&
    historyTotal === 0 &&
    consistency.attended === 0;

  return {
    /* Not windowed, and it takes `now`: the lead says *61 weeks with Arun*
       whichever range is chosen, because it is a fact about the arrangement
       rather than about a period. The tab layout draws it from the same
       function for the same reason. */
    lead: buildLead(me, now),
    lead2: summary.lead,
    range,
    choices: rangeChoices(startedAt, now),
    emptyRange,
    summary: summary.rows,
    arrangement: buildArrangement(me, program, consistency),
    consistency,
    strength,
    exerciseCount,
    holdingCount,
    training,
    milestones,
    historyTotal,
    workoutByDate,
    totalSessions: sessions.filter((s) => s.status === 'done' || s.workoutId !== null).length,
  };
}
