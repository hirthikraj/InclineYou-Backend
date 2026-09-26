import 'server-only';

import { DAY_MS, clockParts, dayStamp, startOfDay } from '@/lib/today/time';
import type { WeekDay } from '@/web-components/ui/WeekDots';

import type { CheckInWire } from './checkin';
import type {
  MeWire,
  PortalMessageWire,
  PortalMilestoneWire,
  PortalPackageWire,
  PortalSessionWire,
  PortalWorkoutSummaryWire,
} from './api';

/**
 * What Home says, and it is one decision: WHICH OF THREE HEROES.
 *
 * ── ALL THREE ARE DESIGNED, AND THE THIRD IS THE ONE THAT MATTERS ────────────
 *
 * §1 names them and then names the failure: *"Rest day: say so warmly. Never
 * leave this blank — an empty home screen on a rest day teaches people the app
 * is sometimes useless."* A portal that draws a hero on four days a week and a
 * blank on three has taught the client to stop opening it by Wednesday, which
 * is the retention metric this whole half exists to move.
 *
 * So `heroFor` is total. There is no case that returns null.
 *
 * ── AND IT NEVER SHAMES ──────────────────────────────────────────────────────
 *
 * §1's third design rule: *"No red 'you missed 3 workouts.' Missed sessions get
 * warm, forward-looking framing: 'Ready to get back to it?' Guilt-based design
 * produces uninstalls, not attendance."*
 *
 * That is why a missed session produces NO hero of its own. A fourth state
 * whose whole content is an absence would be the accusation the rule forbids,
 * dressed as information. What a missed yesterday changes is one line of copy on
 * the rest-day hero — and `tone` is never `danger` anywhere in this file.
 */
export type HeroKind =
  /** A session with the trainer today. Time, place, and their name. */
  | 'session'
  /** A workout to do alone today, from the program. Name, size, and Start. */
  | 'workout'
  /** The plan asked for nothing today, or asked for it and it is done. */
  | 'rest';

export interface PortalHero {
  kind: HeroKind;
  /** The line above the figure. *Today, 6:00 with Arun* / *Rest day*. */
  kicker: string;
  /** The big thing. A time, a day's name, or a short sentence. */
  headline: string;
  /** One line under it, and never a reproach. */
  detail: string;
  /** Where it happens, when that is a fact this book holds. */
  place: string | null;
  /**
   * The session this hero is about, when there is one — so *Start* can name it
   * and the flow can attach the log to the right booking.
   */
  sessionId: string | null;
  /** An open log against today, if the client already started. */
  workoutId: string | null;
  /** How many movements are in front of them, when the program says. */
  exerciseCount: number | null;
  /** Estimated minutes. §2's "reduces the what-am-I-in-for hesitation". */
  minutes: number | null;
  /** True once today's work is behind them. Changes the verb, not the tone. */
  done: boolean;
  /**
   * The band under the figure — `HeroCard`'s own slot, and the reason it is here
   * rather than composed at the call-site.
   *
   * ── WHY THE HERO GREW ONE ───────────────────────────────────────────────────
   *
   * `HeroCard` has had a `band` since it was extracted from the trainer's Today,
   * where its docstring calls it the thing that "turns a fact into a decision" —
   * *the next sellable hour is worth ₹1,400*, *nothing logged yet*. The client's
   * hero passed none, and it showed: measured at a 1536px laptop the card is
   * **918 × 187 with the figure occupying the left ~200px**, so two thirds of
   * the loudest card in the portal was empty while the one sentence a client
   * needs before they leave the house was nowhere on the screen.
   *
   * ── AND WHAT IT IS ALLOWED TO SAY ───────────────────────────────────────────
   *
   * A fact the client cannot get from the rest of the card, and never a nudge.
   * `detail` already carries the plan and the length and `chips` carry the place
   * and the movement count, so this is the line about *how far in they are* or
   * *what happens next* — which is the only thing on the hero that changes
   * between opening the app at 6am and opening it mid-session.
   *
   * `tone` is **`acc` on exactly one band and absent on every other**, and
   * `danger` is not in the type at all: §1's never-shame rule is total, and
   * `buildHero`'s own header says `tone` is never `danger` anywhere in this
   * file. `acc` marks the one band that is a STATE rather than a fact — a log
   * open right now — which is `HeroCard`'s own distinction between `card--acc`
   * (*a log is open*) and `card--lead` (*start reading here*), applied one level
   * in. `warn` is in the type and unused; a band that scolded a client for a
   * session they know they missed is the accusation the rule forbids, and
   * `buildHero` produces no hero for one for the same reason.
   *
   * The ICON is the call-site's, because an icon is JSX and this file is a model.
   * `Home` picks one off `kind` and `done`.
   */
  band: { text: string; tone?: 'acc' | 'warn' } | null;
}

export interface PortalWeek {
  days: WeekDay[];
  /** Trained so far this week. */
  done: number;
  /** What the week was meant to hold — the PLAN's number. `WeekDots` says why. */
  planned: number;
}

export interface PortalPack {
  /** Null when they are between packs, which is a real and quiet state. */
  live: PortalPackageWire | null;
  sessionsLeft: number | null;
  /** Days until it expires, negative once it has. Null on a pack with no end. */
  daysLeft: number | null;
  /** Whole rupees still owed on it. */
  due: number;
  /**
   * The one line the strip prints. §1: *"Quiet, factual, always visible. When
   * the client notices and raises it first, the renewal conversation becomes
   * easy for the trainer — which is the whole commercial point."*
   */
  line: string;
}

/**
 * The next appointment AFTER today — §4's anxious question, answered on Home.
 *
 * ── WHY IT IS ON HOME AT ALL, WHEN PLAN EXISTS ───────────────────────────────
 *
 * `nav.tsx`'s own table says why Sessions became Plan: *"the frame's Sessions is
 * a HISTORY; §4 asks for what is coming, which is a different question and the
 * anxious one."* Right — and it left Home saying **nothing whatever** about
 * tomorrow. On a rest day, or after today's session is in the book, the client's
 * home screen answered *what do I do now* with *nothing* and *when do I see my
 * trainer next* not at all, which is the second question every competitor's
 * client home leads with (Trainerize's dashboard opens on today's list and its
 * upcoming appointments; TrueCoach and Everfit both put the next session on the
 * client's first screen).
 *
 * ── ONE, NOT A LIST ──────────────────────────────────────────────────────────
 *
 * Plan draws the next 28 days and is the reference screen. This is one row, and
 * it is deliberately the one row: §1's rule is *"one primary action, and
 * everything else is a fact"*, and a list of five appointments on the home
 * screen is a second screen competing with the hero. `null` on the day there is
 * nothing booked, and the card is absent rather than empty — a card reading
 * *nothing booked* is the portal apologising for its own diary.
 */
export interface PortalNext {
  id: string;
  /** *Wed · 9 Sep*. `dayStamp`'s, so Home and Plan cannot spell a day two ways. */
  stamp: string;
  time: string;
  meridiem: string;
  /** *Upper A*, when the program says. */
  label: string | null;
  minutes: number | null;
  /** Where, or null on a remote session — which says it in `remote` instead. */
  place: string | null;
  remote: boolean;
  /** Days from today. 1 is tomorrow, and the copy says *Tomorrow* for it. */
  inDays: number;
}

/**
 * The three figures at the foot — the client's half of the trainer's *Glance*.
 *
 * ── SAME COMPONENT, SAME POSITION, OPPOSITE AUDIENCE ─────────────────────────
 *
 * `components/today/PhoneStack.tsx`'s `Glance` is three linked `.stat` tiles at
 * the FOOT of the trainer's Today, and `Today.tsx` says why that position is the
 * claim: *"three figures at the FOOT, which is the opposite position and the
 * opposite claim: what you check after the work, not what greets you before
 * it."* That argument transfers to a client without a word changed, and it is
 * the reason these are at the bottom of Home rather than the top — §1's own
 * order puts the hero first and the commercial line last, and a figure rail
 * above the hero would be the report `deck.ts` refuses on the other half.
 *
 * ── AND EVERY FIGURE IS ONE THE SCREEN ALREADY PAID FOR ──────────────────────
 *
 * No new request. `attended`/`offered` come from `buildConsistency` over the
 * same 90-day session window Home already reads for `buildWeek` — the windows
 * match exactly, `PORTAL_LOOKBACK_DAYS` is `CONSISTENCY_DAYS` — `sessionsLeft`
 * is the pack Home already draws, and `logged` is the workouts list, which is
 * one small read. A figure worth a sixth round trip on the screen whose budget
 * is §1's *"opens to the workout in under two seconds"* is a figure that belongs
 * on Progress.
 *
 * Each tile is a DOOR, which is what `Stat`'s `href` was added for: §3's own
 * shape is *show change, not data*, and a figure a client cannot open is a
 * figure they have to take on trust.
 */
export interface PortalGlance {
  /** Sessions turned up to in the window, and how many were offered. */
  attended: number;
  offered: number;
  /**
   * Workouts with a CLOSED log against them, and every kilo in them.
   *
   * ── WHY THE SECOND TILE IS VOLUME AND NOT THE COUNT ──────────────────────
   *
   * The count was the first version and it is redundant on this row: this
   * client's 90-day attendance is *21 of 23* and their logged workouts are
   * **21**, so two of three tiles printed the same figure under different
   * labels — which does not read as two facts, it reads as one of them being
   * wrong. Volume is the same read for free and answers a question nothing
   * else in the portal answers: Progress draws per-lift curves and the week
   * draws attendance, and neither says *how much work is behind me*.
   *
   * It is also the figure the consumer trackers lead with, and §3 has no
   * objection to it: `WEIGHT_HAS_NO_TONE` is about BODYweight, and §3's own
   * order puts strength and consistency in front of it. Nothing here
   * celebrates a rate — it is a running total, which is the one shape that
   * cannot go down.
   */
  logged: number;
  volumeKg: number;
  /** Sessions left on the live pack, or null between packs. */
  sessionsLeft: number | null;
  /** The window the first two are over, so the tile can say it. */
  windowDays: number;
}

export interface PortalHomeData {
  hero: PortalHero;
  week: PortalWeek;
  pack: PortalPack;
  /** The trainer's newest line, read or not. §"Make the trainer present". */
  message: PortalMessageWire | null;
  /** Today's weight, if they have logged one. Home's quick log reads it back. */
  weightToday: number | null;
  /** The last weight on file, whenever it was. The quick log's placeholder. */
  weightLast: { value: number; at: number } | null;
  /** The next appointment after today. See `PortalNext`. */
  next: PortalNext | null;
  /** The three figures at the foot. See `PortalGlance`. */
  glance: PortalGlance;
  /**
   * The newest milestone, and exactly one.
   *
   * §3's *"trigger them automatically"* is built and lives on Progress as a row
   * of `Tag` chips — *50th session with Arun*, *Back Squat at 60 kg* — and Home
   * read none of them, which is the one place recognition is worth anything: a
   * client opens Home and opens Progress on purpose. Every competitor's client
   * home carries this block (Trainerize files personal bests and badges directly
   * on the dashboard).
   *
   * ONE, because §"What to cut" caps the whole idea hard — *"gamification beyond
   * simple milestones — badges wear off in two weeks and cost real build time"*
   * — and because the six-chip row is Progress' and drawing it twice would make
   * the second one wallpaper. `null` for a client who has not reached one yet,
   * and nothing is drawn: a card explaining that no milestone has fired is the
   * accusation §1's never-shame rule forbids, arriving as a compliment's absence.
   */
  milestone: PortalMilestoneWire | null;
  /**
   * The check-ins waiting on this client — everything sent and not yet sent
   * back, soonest first.
   *
   * A LIST and not one row, which is the opposite call from `message` and
   * `milestone` above. Those two are a stream somebody dips into, so the newest
   * is the whole of what Home owes them; this is a list of tasks, and the one
   * that is NOT drawn is the one a client never finds out about. Two open
   * check-ins is rare and it is exactly the case where showing one is wrong.
   *
   * Empty on the ordinary day, and the block is then absent — not an empty
   * state. Home has seven other blocks and a card apologising for having
   * nothing to ask is a card about the product rather than about the client.
   *
   * There is no `buildCheckIns` beside `buildHero`: a model function exists
   * where a screen would otherwise derive something, and there is nothing here
   * to derive — the wire already sorts, already drops what a client may not see
   * and already carries the status. Filtering the done ones out is one
   * predicate and it lives at the read.
   */
  checkIns: CheckInWire[];
}

const SETTLED = new Set(['done', 'cancelled', 'no_show']);

/** Monday-first, which is `isoWeekday`'s basis and the seed's `weekday`. */
function startOfIsoWeek(at: number): number {
  const d = new Date(startOfDay(at));
  const shift = (d.getDay() + 6) % 7;
  return startOfDay(at) - shift * DAY_MS;
}

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/**
 * §1's *3 of 4 sessions this week*, as seven cells and two figures.
 *
 * ── THE DENOMINATOR IS THE ARRANGEMENT, NOT THE DIARY ────────────────────────
 *
 * `sessionsPerWeek` is what this client signed up for, and `WeekDots` carries
 * the argument: a trainer who cancelled Wednesday should not shrink the target,
 * because that would silently reward the cancellation. It falls back to the
 * diary's own count only where the arrangement is unrecorded.
 *
 * ── AND A DAY IS `done` IF IT WAS TRAINED, BY EITHER ROUTE ───────────────────
 *
 * A marked session OR a workout logged against it. That is the roster's own
 * rule for *last attended*, and it is right for the same reason: an unlogged
 * session a client turned up to is still a session they turned up to, and a
 * logged workout with no booking behind it is still training.
 */
export function buildWeek(
  sessions: PortalSessionWire[],
  perWeek: number | null,
  now: number,
): PortalWeek {
  const monday = startOfIsoWeek(now);
  const today = startOfDay(now);
  const mine = sessions.filter(
    (s) => s.scheduledAt >= monday && s.scheduledAt < monday + 7 * DAY_MS,
  );

  const days: WeekDay[] = [];
  let done = 0;

  for (let i = 0; i < 7; i += 1) {
    const dayStart = monday + i * DAY_MS;
    const onThisDay = mine.filter((s) => startOfDay(s.scheduledAt) === dayStart);
    const trained = onThisDay.some((s) => s.status === 'done' || s.workoutId !== null);

    let state: WeekDay['state'];
    if (trained) {
      state = 'done';
      done += 1;
    } else if (onThisDay.length === 0) {
      state = 'rest';
    } else if (dayStart > today) {
      state = 'plan';
    } else if (dayStart === today) {
      /* Today, with a session on it and nothing logged. `plan` and not `miss`:
         the day is not over, and a cell that read *no session* at nine in the
         morning would be wrong about a session at six in the evening. */
      state = 'plan';
    } else {
      state = 'miss';
    }

    days.push({ letter: LETTERS[i], name: NAMES[i], state, today: dayStart === today });
  }

  const planned = perWeek ?? days.filter((d) => d.state !== 'rest').length;
  return { days, done, planned: Math.max(planned, done) };
}

/**
 * The next appointment after today. See `PortalNext` for why it is on Home.
 *
 * ── `scheduled` ONLY, AND STRICTLY AFTER TODAY ────────────────────────────────
 *
 * `lib/portal/plan.ts`'s `upcoming` filters `status === 'scheduled'` and
 * `scheduledAt >= today`, which is right for a reference screen — Plan lists
 * today's remaining session as *Today* alongside the rest of the fortnight. Here
 * today is the HERO, two cards up, so including it would be the same appointment
 * drawn twice inside 400px: the duplicate-row defect `.srow--h2` exists to stop
 * on the trainer's half, arriving on this one.
 *
 * A `done`, `cancelled` or `no_show` session is not an appointment, so the
 * status filter is the same one Plan uses and for the same reason.
 */
export function buildNext(
  sessions: PortalSessionWire[],
  now: number,
): PortalNext | null {
  const today = startOfDay(now);
  const s = sessions
    .filter((r) => r.status === 'scheduled' && startOfDay(r.scheduledAt) > today)
    .sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
  if (!s) return null;

  const { time, meridiem } = clockParts(s.scheduledAt);
  const remote = s.deliveryMode === 'remote';
  return {
    id: s.id,
    stamp: dayStamp(s.scheduledAt),
    time,
    meridiem,
    label: s.dayLabel,
    minutes: s.durationMinutes,
    place: remote ? null : s.location,
    remote,
    inDays: Math.round((startOfDay(s.scheduledAt) - today) / DAY_MS),
  };
}

/**
 * The three figures at the foot. See `PortalGlance`.
 *
 * ── IT TAKES `PortalConsistency`, RATHER THAN COMPUTING ONE ──────────────────
 *
 * `lib/portal/progress.ts`'s `buildConsistency` already turns this session
 * window into `attended`/`offered`/`rate`, and Progress prints the same pair as
 * a percentage. Two functions deriving *how often did I turn up* is how one of
 * them ends up a point off the other on two screens the client can put side by
 * side — the shape `AGENTS.md` records for `computeLedger` against
 * `computeTrend`, where the two readings are both right and mixing them produces
 * totals that will not agree. So Home calls the same function and this one only
 * arranges the answer.
 *
 * `logged` is the length of the workouts list rather than a count of sessions
 * with a `workoutId`: the second is bounded by the session window and misses
 * every workout logged with no booking behind it, which `buildWeek`'s own note
 * calls "still training".
 */
export function buildGlance({
  attended,
  offered,
  workouts,
  sessionsLeft,
  windowDays,
}: {
  attended: number;
  offered: number;
  workouts: PortalWorkoutSummaryWire[];
  sessionsLeft: number | null;
  windowDays: number;
}): PortalGlance {
  /* Closed logs only, for both figures. An open one is a session in progress,
     and counting it would make the tile tick up at the START of a workout — the
     same objection `AGENTS.md` records against `buildWeek` counting a live
     session, and here there is no reason to accept it: nothing about this tile
     is about today. It matters more for the volume than for the count, because a
     workout's `volumeKg` grows set by set while it is open. */
  const closed = workouts.filter((w) => w.endedAt !== null);

  return {
    attended,
    offered,
    logged: closed.length,
    volumeKg: closed.reduce((n, w) => n + w.volumeKg, 0),
    sessionsLeft,
    windowDays,
  };
}

/**
 * The pack, and the sentence it prints.
 *
 * `amountDue > 0` and never `status === 'active'` is the rule `AGENTS.md`
 * already states for the trainer half's money: a client can finish twelve
 * sessions and still owe for four. Here the consequence is smaller and the same
 * — the line has to be able to say both things at once.
 */
export function buildPack(packages: PortalPackageWire[], now: number): PortalPack {
  const live = packages.find((p) => p.status === 'active') ?? null;
  if (!live) {
    const owed = packages.reduce((n, p) => n + Math.max(0, p.amountDue), 0);
    return {
      live: null,
      sessionsLeft: null,
      daysLeft: null,
      due: owed,
      /* Between packs. Deliberately not a prompt to buy one: §"the restraint is
         the design" — a client is never sold anything in this portal, and the
         renewal is a conversation their trainer has. */
      line: owed > 0
        ? 'No pack running. There is still a balance on your last one.'
        : 'No pack running just now — your trainer will sort the next one.',
    };
  }

  const left = live.sessionsRemaining;
  const daysLeft = live.endDate
    ? Math.round(
        (startOfDay(new Date(`${live.endDate}T00:00:00`).getTime()) - startOfDay(now)) / DAY_MS,
      )
    : null;

  const parts: string[] = [];
  if (left !== null) parts.push(`${left} of ${live.sessionsTotal ?? left} sessions left`);
  else parts.push(live.name);
  if (daysLeft !== null) {
    parts.push(
      daysLeft < 0 ? 'expired' : daysLeft === 0 ? 'ends today' : `${daysLeft} days to run`,
    );
  }
  if (live.amountDue > 0) parts.push(`₹${live.amountDue.toLocaleString('en-IN')} still to pay`);

  return { live, sessionsLeft: left, daysLeft, due: live.amountDue, line: parts.join(' · ') };
}

/**
 * WHICH HERO, and the order the tests run in is the design.
 *
 * A session with the trainer beats a solo workout, because it is an appointment
 * with a person and the client has somewhere to be. A solo workout beats rest,
 * because the plan asked for it. Everything else is rest, said warmly.
 */
export function buildHero(
  me: MeWire,
  sessions: PortalSessionWire[],
  program: {
    name: string;
    /** §4's *Week 5 of 12*, for the band. Optional so the shape stays loose. */
    week?: number | null;
    weeks?: number | null;
    days: { templateDay: number; label: string; exercises: unknown[] }[];
  } | null,
  now: number,
  /**
   * The client's own workout list, for one figure: how many sets are already in
   * the log that is open right now.
   *
   * Optional, and the band degrades to a sentence with no number in it when it
   * is absent — `buildHero` has three other callers' worth of tests behind it
   * (`buildWeek`, the seed, `/me/plan`'s own reads) and a required fifth
   * parameter would be a signature change for a band.
   */
  workouts: PortalWorkoutSummaryWire[] = [],
): PortalHero {
  const today = startOfDay(now);
  const mine = sessions
    .filter((s) => startOfDay(s.scheduledAt) === today && s.status !== 'cancelled')
    .sort((a, b) => a.scheduledAt - b.scheduledAt);

  const first = me.trainer.name.split(' ')[0];
  const open = mine.find((s) => s.workoutId !== null && s.status !== 'done');
  const next = mine.find((s) => !SETTLED.has(s.status)) ?? null;
  const settled = mine.filter((s) => s.status === 'done');

  /* ── the band, and it is the same sentence on three of the four heroes ────

     §4's *Week 5 of 12: Strength Phase* is the one fact about the plan that is
     nowhere on Home — `detail` says which DAY of the program today is and the
     chips say how big it is, and neither says where in the block it falls. It is
     also the fact that makes a rest day read as deliberate rather than as an
     empty screen, which is §1's whole worry about that state.

     `arc` is `lib/portal/plan.ts`'s sentence with the goal dropped: Plan draws
     *Week 5 of 8 · Strength* because it has the room and the screen is about the
     plan. Here the band sits under a 62px figure and beside a primary button, so
     it says the two numbers and the program's name and stops. Null where the
     trainer has assigned no program, or has assigned one with no week count —
     the band is absent rather than guessing at a structure the program does not
     carry, which is `arc`'s own rule. */
  const arc =
    program && program.week != null && program.weeks != null
      ? { text: `Week ${program.week} of ${program.weeks} · ${program.name}` }
      : program
        ? { text: program.name }
        : null;

  /* ── a session with their trainer, today ──────────────────────────────── */
  if (next) {
    const { time, meridiem } = clockParts(next.scheduledAt);
    const day = program?.days.find((d) => d.templateDay === next.templateDay) ?? null;
    const remote = next.deliveryMode === 'remote';
    return {
      kind: 'session',
      kicker: `Today with ${first}`,
      headline: `${time} ${meridiem}`,
      detail: next.dayLabel
        ? `${next.dayLabel}${next.durationMinutes ? ` · about ${next.durationMinutes} minutes` : ''}`
        : `About ${next.durationMinutes ?? 60} minutes`,
      place: remote ? 'Online — your trainer will call you' : next.location,
      sessionId: next.id,
      workoutId: open?.workoutId ?? null,
      exerciseCount: day ? day.exercises.length : null,
      minutes: next.durationMinutes,
      done: false,
      /* ── the one `acc` band in the file ──────────────────────────────────

         A log open right now is the only thing on this screen that is a STATE,
         and it is the state the hero's verb already changed for — *Carry on*
         rather than *Start*. The band is what tells the client how far in they
         are, which is the question *Carry on* raises and cannot answer.

         The set count is named where it is known and the sentence stands
         without it where it is not: a log with nothing in it is a real and
         common state (§2's stages make `run` begin at *Begin*, before any set),
         and *0 sets in* reads as a reproach for a workout somebody started
         ninety seconds ago. */
      band: open
        ? (() => {
            const w = workouts.find((r) => r.id === open.workoutId);
            const n = w?.setCount ?? 0;
            return {
              text:
                n > 0
                  ? `${n} ${n === 1 ? 'set' : 'sets'} in already — pick up where you left off.`
                  : 'Your workout is open and waiting.',
              tone: 'acc' as const,
            };
          })()
        : arc,
    };
  }

  /* ── it already happened today ────────────────────────────────────────── */
  if (settled.length > 0) {
    const last = settled[settled.length - 1];
    return {
      kind: 'rest',
      kicker: 'Today',
      headline: 'Done for today',
      /* Names what they did rather than congratulating them for existing. §2's
         celebration is "brief, not obnoxious", and it belongs at the end of the
         flow rather than on a screen they open again at nine in the evening. */
      detail: last.dayLabel
        ? `${last.dayLabel} is in the book. Nice work.`
        : 'That session is in the book. Nice work.',
      place: null,
      sessionId: last.id,
      workoutId: last.workoutId,
      exerciseCount: null,
      minutes: null,
      done: true,
      band: arc,
    };
  }

  /* ── a training day the diary has no appointment for ──────────────────────

     §1's first hero: *"the day's workout, large. Name, duration estimate,
     exercise count, one button — Start."*

     Reaching it takes two rows and neither of them is a session, which is why
     this branch is worth its length. `client.weeklySchedule` maps a WEEKDAY to
     a `templateDay` — V24's law: "Day 1 is the first day this program trains;
     which weekday it lands on is the CLIENT's, chosen once at assign time." So
     a Wednesday with a `templateDay` against it is a day this client trains,
     whether or not anybody booked an appointment for it.

     That is the difference between the two heroes above and this one: a session
     is an appointment with a person, and this is a plan with nobody in it. A
     remote client has three of these a week and a floor client gets one
     whenever their trainer is away — and without this branch both of them get
     *Rest day* on a day the programme asked them to train, which is the portal
     lying about the plan.                                                    */
  /* `+ 1` on the end, and it was missing. A stored slot is 1 = Monday … 7 =
     Sunday (see `lib/clients/booking.ts`); `(getDay() + 6) % 7` answers the
     0-indexed `working_hours` convention. Without the shift this found the WRONG
     DAY'S plan every time it found one at all — and on a Sunday it found none,
     so the one screen that exists to say *what am I doing today* said rest. */
  const slot = (me.client.weeklySchedule ?? []).find(
    (s) => s.weekday === ((new Date(today).getDay() + 6) % 7) + 1,
  );
  const plannedDay = slot
    ? program?.days.find((d) => d.templateDay === slot.templateDay) ?? null
    : null;

  if (plannedDay && plannedDay.exercises.length > 0) {
    return {
      kind: 'workout',
      kicker: 'Today',
      headline: plannedDay.label,
      detail: `${plannedDay.exercises.length} exercises${
        me.client.sessionDurationMinutes ? ` · about ${me.client.sessionDurationMinutes} minutes` : ''
      }`,
      /* No place. Nobody is meeting them, and printing the gym's name would
         imply somebody is. */
      place: null,
      sessionId: null,
      workoutId: null,
      exerciseCount: plannedDay.exercises.length,
      minutes: me.client.sessionDurationMinutes,
      done: false,
      band: arc,
    };
  }

  /* ── a rest day ───────────────────────────────────────────────────────────

     Two sentences, and which one is chosen is the whole of §1's *never shame*
     rule in this file. A client who missed a scheduled session in the last
     three days gets the forward-looking one — *Ready to get back to it?* is the
     brief's own phrasing — and it says nothing about what they missed, because
     they know, and the app pointing at it is what produces the uninstall.     */
  const missedRecently = sessions.some(
    (s) =>
      s.status === 'no_show' &&
      s.scheduledAt < now &&
      s.scheduledAt > now - 4 * DAY_MS,
  );

  return {
    kind: 'rest',
    kicker: 'Today',
    headline: missedRecently ? 'Ready to get back to it?' : 'Rest day',
    detail: missedRecently
      ? `${first} has your next session in the plan. Nothing to catch up on.`
      : 'Recovery is part of the plan — this is what makes the training work.',
    place: null,
    sessionId: null,
    workoutId: null,
    exerciseCount: null,
    minutes: null,
    done: false,
    /* The band earns its place most on this hero. §1's worry about the rest-day
       state is that "an empty home screen on a rest day teaches people the app
       is sometimes useless" — and *Week 5 of 12 · Push Pull Legs* under *Rest
       day* is the line that makes the day read as part of a plan rather than as
       a screen with nothing on it. */
    band: arc,
  };
}
