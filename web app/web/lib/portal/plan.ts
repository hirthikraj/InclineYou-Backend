import 'server-only';

import { DAY_MS, clockParts, dayStamp, startOfDay } from '@/lib/today/time';

import type {
  MeWire,
  PortalProgramSummaryWire,
  PortalProgramWire,
  PortalSessionWire,
} from './api';

/**
 * What Plan says. §4's whole brief is a length limit: *"Keep this thin. It's a
 * reference screen, not a working one."*
 *
 * ── AND THREE TABS MAKE IT THINNER, NOT LONGER ──────────────────────────────
 *
 * The screen was four blocks in one column, and the fourth was a card per
 * training day with every movement expanded — so a client who opened it to find
 * out when their next session was scrolled past ~25 exercise rows on the way.
 * `lib/portal/plan-tabs.ts` carries the argument for the split; what it means
 * here is that this file now derives what each of the three tabs needs and each
 * PAGE reads only its own part.
 *
 * ── THERE IS STILL NO BOOKING ENGINE ────────────────────────────────────────
 *
 * §4 is explicit: *"Request reschedule — a button that opens WhatsApp to the
 * trainer. Don't build a booking engine for v1."* That is also the only answer
 * this product's data model supports: a client-side booking would have to
 * respect the trainer's working hours, their other clients and their pack
 * balance, which is `/schedule`'s whole screen.
 */

export interface PlanSession {
  id: string;
  at: number;
  /** `Thu · 1 Oct`. */
  stamp: string;
  time: string;
  meridiem: string;
  label: string | null;
  minutes: number | null;
  place: string | null;
  remote: boolean;
  /** Today, so the row can say so without the caller doing date maths. */
  today: boolean;
  /**
   * Its start time has passed.
   *
   * The window has a day of slack on the near end so a client checking at six
   * in the evening still sees the morning they went to — which means the LEAD
   * card can be a session that began forty minutes ago, and *your next session,
   * 8:04 AM* about something already under way is the wrong tense. The old flat
   * list drew it as the first of twelve identical rows and got away with it;
   * promoting it is what made the tense matter.
   *
   * Plan does not read workout logs — it is the one portal screen that looks
   * only forward — so this says the start time has passed and nothing more.
   * Whether anybody is lifting is Home's hero's question, and it has the log.
   */
  started: boolean;
  /**
   * Whole days from today to this session — 0 today, 1 tomorrow — and NULL past
   * a week out.
   *
   * §4 is about *"the anxiety of not knowing what's coming"*, and `Thu · 1 Oct`
   * does not answer that: it is a date a client has to hold against today's to
   * turn into a feeling. *Tomorrow* is the same fact already converted.
   *
   * Null beyond seven for `DayRule.relative`'s stated reason — a relative day
   * "earns its ink near `now` and is noise on a day eleven weeks back". Past a
   * week the group heading (*Week of 5 Oct*) is the orientation, and *in 23
   * days* under it would be a second, worse spelling of the same thing.
   */
  inDays: number | null;
  /**
   * The program day this session is an instance of, where the booking carries
   * one.
   *
   * ── THIS IS THE FIX FOR THE SCREEN'S WORST DEFECT ─────────────────────────
   *
   * The old page said its own structure three times in three vocabularies and
   * joined none of them up: the arc card said *Week 5 of 8*, the week table said
   * `Monday → Upper A → 6:30 AM`, and a card much further down said
   * `Upper A — 6 exercises`. A client asking *what am I doing Monday, and what
   * is in it* read a label off a table row and then scrolled hunting for the
   * card carrying the same label. Recognition rather than recall, failed by a
   * page that had every piece of the answer on it.
   *
   * `PortalSessionWire.templateDay` was on the wire the whole time and unread.
   * With it, a diary row is a link into the day it is an instance of.
   */
  templateDay: number | null;
}

export interface PlanWeekDay {
  /** `Monday`. */
  name: string;
  /** The program day that lands here, when one does. */
  label: string | null;
  time: string | null;
  /** True on the client's own rest days, which §1 insists are stated. */
  rest: boolean;
  /** The program day, so a row can open it. Null on a rest day. */
  templateDay: number | null;
  /** How many movements that day holds, so the row says what it opens. */
  exerciseCount: number | null;
  /**
   * This weekday is today's.
   *
   * ── AND THE STRIP DELIBERATELY DOES NOT DRAW IT ───────────────────────────
   *
   * It was drawn for one pass, as `WeekDay.today` -> `.wkd__d--now`, and the
   * screenshot killed it. That modifier is a 2px `--tx-accent-line` outline
   * OUTSIDE the cell; `.wkd__c--plan` is a 1px `--tx-accent-line` ring INSIDE
   * it. On Home the two are told apart by everything around them -- a row with
   * `done` cells in it is mostly lime FILL, so an outline of either kind reads
   * as "not that". A TEMPLATE week has no `done` cells at all, so the strip is
   * nothing but rings, and a rest-day Wednesday sitting between a training
   * Monday and a training Thursday read as the middle of THREE training days.
   *
   * The week's shape is the one thing this strip exists to say, and a marker
   * that makes it say the wrong shape is not worth the orientation it buys --
   * which the lead card (*Today*) and the diary above it already give.
   *
   * It stays on the model because it is a fact about the week and the next
   * drawing that wants it (a letter in full-strength ink, say, which does not
   * collide with a ring) should not have to re-derive the rotation below.
   */
  today: boolean;
}

/** §4's *next 2–4 weeks*, chunked. */
export interface PlanGroup {
  /** `This week` · `Next week` · `Week of 22 Sep`. */
  label: string;
  sessions: PlanSession[];
}

/** One training day, as the *Workouts* list reads it. */
export interface PlanDaySummary {
  templateDay: number;
  label: string;
  exerciseCount: number;
  /** `['Mon', 'Thu']` — which weekdays this day lands on, from the arrangement. */
  weekdays: string[];
  /**
   * How long a session on this day runs.
   *
   * The BOOKED length where the diary has one, then the arrangement's own
   * default, and **null where neither exists** — never a figure derived from
   * sets and rest times. §2 asks for an estimate and the trainer has already
   * answered the question by booking sixty minutes; inventing a second,
   * disagreeing number would be this screen asserting a duration it cannot
   * know, which is `utilisation`'s rule on the other half (*"printing that
   * would be this screen inventing the denominator"*).
   */
  minutes: number | null;
  /** The next booked session that is an instance of this day, if any. */
  next: PlanSession | null;
}

/** A finished block, as the *Past plans* list reads it. */
export interface PastPlan {
  id: string;
  name: string;
  goal: string | null;
  /** `Jan – Mar 2026`, or `From January 2026` where an end date is missing. */
  ran: string | null;
  weeks: number | null;
  dayCount: number;
  exerciseCount: number;
  /** Sessions on record inside the block. Null means not knowable — see below. */
  workoutCount: number | null;
}

export interface PortalPlanData {
  /**
   * The very next session, promoted out of the list.
   *
   * *When do I next see my trainer* is the most-asked question of this screen
   * and the old list gave its answer exactly the weight of the twelfth row. It
   * leads now, and `upcoming` still holds every row including this one so a
   * caller that wants the whole diary has it.
   */
  next: PlanSession | null;
  /** §4's *next 2–4 weeks*, in time order, `next` included. */
  upcoming: PlanSession[];
  /** The same sessions, chunked by week — twelve dates read as three groups. */
  groups: PlanGroup[];
  /** The arc. Null where the trainer has assigned no program. */
  program: PortalProgramWire | null;
  /**
   * §4's *Week 5 of 12: Strength Phase*, as one sentence, because that is how
   * the screen prints it and deriving it twice is how the two drift.
   *
   * **It is the page header's subtitle and appears nowhere else.** It used to be
   * both that and the arc card's own title — the same string 60px apart, which
   * is `.ph--today`'s recorded rule broken for the third time in this portal.
   * The card carries the program's NAME and a bar; this line frames all three
   * tabs from the header.
   */
  arc: string | null;
  /** The typical week, from the client's own schedule. Seven rows, always. */
  week: PlanWeekDay[];
  /** The program's training days, for the *Workouts* tab. */
  days: PlanDaySummary[];
  /**
   * The one place every booked in-person session is at — or null the moment two
   * of them disagree.
   *
   * ── MEASURED: ONE STRING, NINE TIMES, ON A 319px CARD ──────────────────────
   *
   * The seeded client's diary is nine sessions and every one of them is at
   * *Iron Yard, Anna Nagar*. Each row's second line therefore read
   * `Full B · 45 min · Iron Yard, Anna Nagar` — 38 characters of which 22 were
   * identical on every row above and below it, in the widest slot on the row,
   * while the one fact a client actually wants from a diary (*how soon*) was
   * not on the row at all.
   *
   * A constant down a column is not information; it is the heading of the
   * column. `c-dayrule`'s docstring makes the same argument about a date
   * printed nine times running, and this is that argument applied to a value
   * that does not even change between the runs.
   *
   * So the venue is stated ONCE, above the list, and each row spends the slot
   * it freed on `inDays`. A client who trains at two gyms gets null here and
   * every row keeps its own place — the saving is only ever collected where
   * there is genuinely nothing to distinguish.
   *
   * Remote sessions are ignored rather than disqualifying: they carry no place
   * at all (`toSession` nulls it), so they cannot disagree with one, and their
   * rows say *Online* on their own account.
   */
  venue: string | null;
  /** The `wa.me` link §4's *Request reschedule* opens. Null with no number. */
  rescheduleHref: string | null;
}

/**
 * `0 → Today`, `1 → Tomorrow`, `5 → In 5 days`. Null in, null out.
 *
 * Here rather than in the component for `WorkoutRow`'s stated reason: a
 * component holding its own `Date.now()` computes a relative day twice and the
 * two can fall either side of midnight. `inDays` is derived once, on the
 * server, against the same `now` every other figure on the screen used.
 */
export function relativeDay(inDays: number | null): string | null {
  if (inDays === null) return null;
  if (inDays === 0) return 'Today';
  if (inDays === 1) return 'Tomorrow';
  return `In ${inDays} days`;
}

const NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * `9841022119` → `https://wa.me/919841022119?text=…`.
 *
 * The same mechanism `lib/nudges` uses in the other direction, and the same
 * reason: nothing in this product sends a message. It opens the trainer's own
 * thread with a draft in it, which is the one channel the client already has
 * open — and it means a reschedule request costs no backend at all.
 *
 * The text is a DRAFT the client can edit, and it deliberately does not propose
 * a new time: proposing one would need the trainer's availability, which is the
 * booking engine §4 refuses.
 */
export function rescheduleHref(
  trainerPhone: string | null,
  clientName: string,
  next: PlanSession | null,
): string | null {
  if (!trainerPhone) return null;
  const digits = trainerPhone.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return null;
  const first = clientName.split(' ')[0];
  const when = next ? `${next.stamp} at ${next.time} ${next.meridiem}` : 'my next session';
  const text = `Hi, it's ${first}. Could we move ${when}? Let me know what suits you.`;
  return `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`;
}

/** Monday-of-the-week containing `at`, at midnight. */
function weekStart(at: number): number {
  const d = startOfDay(at);
  const wd = (new Date(d).getDay() + 6) % 7; // Monday = 0
  return d - wd * DAY_MS;
}

/** `8 Sep` — the date half of `dayStamp`, for a heading that names a week. */
function dateOnly(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

/**
 * `Jan – Mar 2026`. One year is stated once; two are both stated.
 *
 * A past plan's dates are the whole of what it says about when it ran, since
 * `week` is deliberately null on it — so this is the field doing the work the
 * arc does for the live block.
 */
export function ranLabel(startDate: string | null, endDate: string | null): string | null {
  const a = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const b = endDate ? new Date(`${endDate}T00:00:00`) : null;
  if (!a && !b) return null;
  if (a && !b) return `From ${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  if (!a && b) return `Until ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  const s = a as Date;
  const e = b as Date;
  const sm = MONTHS[s.getMonth()].slice(0, 3);
  const em = MONTHS[e.getMonth()].slice(0, 3);
  return s.getFullYear() === e.getFullYear()
    ? sm === em
      ? `${sm} ${s.getFullYear()}`
      : `${sm} – ${em} ${s.getFullYear()}`
    : `${sm} ${s.getFullYear()} – ${em} ${e.getFullYear()}`;
}

/** The past-plan list, from the summaries the wire hands back. */
export function buildPastPlans(rows: PortalProgramSummaryWire[]): PastPlan[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    goal: r.goal,
    ran: ranLabel(r.startDate, r.endDate),
    weeks: r.weeks,
    dayCount: r.dayCount,
    exerciseCount: r.exerciseCount,
    workoutCount: r.workoutCount,
  }));
}

function toSession(
  s: PortalSessionWire,
  today: number,
  now: number,
  dayOf: (d: number | null) => number | null,
): PlanSession {
  const { time, meridiem } = clockParts(s.scheduledAt);
  const remote = s.deliveryMode === 'remote';
  return {
    id: s.id,
    at: s.scheduledAt,
    stamp: dayStamp(s.scheduledAt),
    time,
    meridiem,
    label: s.dayLabel,
    minutes: s.durationMinutes,
    place: remote ? null : s.location,
    remote,
    today: startOfDay(s.scheduledAt) === today,
    started: s.scheduledAt <= now,
    /* From MIDNIGHT to midnight, never `(at - now) / DAY_MS`: a session at 7am
       tomorrow is 19 hours away and floors to 0, so the row would read *Today*
       about a day that has not started. The stamp is a calendar day and the
       relative has to be one too or the two disagree on the same row. */
    inDays: (() => {
      const d = Math.round((startOfDay(s.scheduledAt) - today) / DAY_MS);
      return d >= 0 && d <= 7 ? d : null;
    })(),
    templateDay: dayOf(s.templateDay),
  };
}

export function buildPlan(
  me: MeWire,
  sessions: PortalSessionWire[],
  program: PortalProgramWire | null,
  now: number,
): PortalPlanData {
  const today = startOfDay(now);

  /* ── A DAY THIS PROGRAM DOES NOT HAVE IS NOT A DAY ────────────────────

     `templateDay` reaches this file from two places that can disagree with the
     program: a booking made against an earlier block, and the client's own
     arrangement. Both did, and it was invisible until a day became a ROUTE —
     `Upper / Lower · 4 day` trains days 1, 2, 4, 5 while this client's Friday
     slot claimed to be day 3, so the week table linked at a 404.

     The seed's own mismatch is fixed at source, and this is the guard that
     makes it not matter: anything the program does not list is nulled here,
     once, so no consumer can build a link to it. A row that cannot be opened is
     drawn as a statement, which is what `ListRow` does with no `href` — the
     dead-control rule, enforced by the model rather than remembered at four
     call sites. */
  const known = new Set(program?.trainingDays ?? []);
  const dayOf = (d: number | null) => (d !== null && known.has(d) ? d : null);

  const upcoming: PlanSession[] = sessions
    .filter((s) => s.status === 'scheduled' && s.scheduledAt >= today)
    .sort((a, b) => a.scheduledAt - b.scheduledAt)
    .map((s) => toSession(s, today, now, dayOf));

  /* ── THE 28 DAYS, CHUNKED ──────────────────────────────────────────────

     Twelve dates in one flat list run across three week boundaries with
     nothing marking any of them, and a client scanning for *the week after
     next* has to do the arithmetic. Grouping is the cheapest legibility win on
     the screen and it needs no new data.

     `This week` and `Next week` are named; anything beyond is dated, because
     *the week after next* is a phrase people have to count on their fingers.
     A group is only emitted when it holds something, so a fortnight's gap does
     not draw an empty heading. */
  const thisWeek = weekStart(now);
  const groups: PlanGroup[] = [];
  /* ── THE LEAD SESSION IS NOT IN THE LIST ──────────────────────────────

     MEASURED: the lead card and the first row printed the identical string —
     *Upper A · 60 min · Iron Yard, Anna Nagar* — about 200px apart, which is
     the defect this whole pass is about, committed inside the fix for it.

     The card is the promotion and the list is what comes after it, which is
     also what makes the promotion mean anything. The card directly above says
     *Today*, so nothing is lost by the list starting at the one after.

     The COUNT is untouched — *13 booked* is how many sessions are in the diary,
     not how many rows are under this heading. */
  for (const s of upcoming.slice(1)) {
    const offset = Math.round((weekStart(s.at) - thisWeek) / (7 * DAY_MS));
    const label =
      offset <= 0 ? 'This week'
      : offset === 1 ? 'Next week'
      : `Week of ${dateOnly(weekStart(s.at))}`;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.sessions.push(s);
    else groups.push({ label, sessions: [s] });
  }

  /* §4's arc, in one sentence. The GOAL is used as the phase name where the
     trainer set one — *Week 5 of 8 · Strength* — because this schema has no
     phase column and inventing one would be the screen asserting a structure
     the program does not carry. Without a goal it says the weeks and stops. */
  let arc: string | null = null;
  if (program && program.week !== null && program.weeks !== null) {
    arc = `Week ${program.week} of ${program.weeks}`;
    if (program.goal) arc += ` · ${program.goal}`;
  } else if (program) {
    arc = program.name;
  }

  /* exerciseCount per program day, so both the week table and the days list can
     say what a row opens without either of them walking the program. */
  const countFor = new Map<number, number>();
  for (const d of program?.days ?? []) countFor.set(d.templateDay, d.exercises.length);

  /* The typical week, from `client.weeklySchedule` rather than from the diary —
     the diary answers *what is booked*, which `upcoming` already draws, and this
     row answers *what does my week normally look like*. The rest days are the
     point: §1's rule that a rest day is stated rather than left blank applies
     to the plan as much as to Home. */
  /* `getDay()` is 0 = Sunday; this array is 0 = Monday. `(d + 6) % 7` is the
     rotation, and it is written once here rather than at the two call-sites
     that would each have to get it right. The same off-by-one on `weekday`
     eight lines down drew every client's week a day late for a release. */
  const todayIndex = (new Date(now).getDay() + 6) % 7;

  const week: PlanWeekDay[] = NAMES.map((name, i) => {
    /* `i + 1`, AND IT WAS `i`. A stored slot's weekday is 1 = Monday … 7 =
       Sunday — the phone's `parseWeeklySchedule` states it, `program.schedule`
       shares it and `validateSchedule` enforces it — while this array is
       0-indexed from Monday. Matching them directly drew every client's week one
       day late on their own plan screen and made Sunday (7) unmatchable, so a
       client training Sunday was told it was a rest day. */
    const slot = (me.client.weeklySchedule ?? []).find((s) => s.weekday === i + 1);
    if (!slot) {
      return {
        name, label: null, time: null, rest: true,
        templateDay: null, exerciseCount: null, today: i === todayIndex,
      };
    }
    const day = dayOf(slot.templateDay);
    const label = program?.dayLabels[String(slot.templateDay)] ?? null;
    return {
      name,
      label,
      time: slot.time,
      rest: false,
      templateDay: day,
      exerciseCount: day === null ? null : (countFor.get(day) ?? null),
      today: i === todayIndex,
    };
  });

  /* ── THE TRAINING DAYS, FOR THE WORKOUTS TAB ───────────────────────────

     `weekdays` is the join the old screen was missing in the other direction:
     a card headed *Upper A* said nothing about when Upper A happens, so the
     label was jargon until a client found it in the week table. Naming the
     weekdays on the day itself means neither list has to be read against the
     other.

     `minutes` prefers what is actually booked. See `PlanDaySummary.minutes`. */
  const days: PlanDaySummary[] = (program?.days ?? []).map((d) => {
    const weekdays = (me.client.weeklySchedule ?? [])
      .filter((s) => s.templateDay === d.templateDay)
      .map((s) => SHORT[s.weekday - 1])
      .filter(Boolean);
    const nextForDay = upcoming.find((s) => s.templateDay === d.templateDay) ?? null;
    return {
      templateDay: d.templateDay,
      label: d.label,
      exerciseCount: d.exercises.length,
      weekdays,
      minutes: nextForDay?.minutes ?? me.client.sessionDurationMinutes ?? null,
      next: nextForDay,
    };
  });

  /* ── THE VENUE, IF THERE IS ONLY ONE ───────────────────────────────────

     Every in-person session in the window, reduced to a set. One member is a
     constant the rows do not need to repeat; anything else and the rows keep
     it. See `PortalPlanData.venue`.

     `upcoming` and not `groups`: the lead card is in the first and not the
     second, and a venue line reading *All at Iron Yard* directly above a list
     that excludes the one session at a different gym would be a false
     statement produced by an off-by-one. */
  const places = new Set(
    upcoming.filter((s) => !s.remote && s.place).map((s) => s.place as string),
  );
  const venue = places.size === 1 ? [...places][0] : null;

  return {
    next: upcoming[0] ?? null,
    upcoming,
    groups,
    program,
    arc,
    week,
    days,
    venue,
    rescheduleHref: rescheduleHref(me.trainer.phone, me.client.name, upcoming[0] ?? null),
  };
}

/** §4's window, so the page and this file cannot disagree about it. */
export const PLAN_WINDOW_DAYS = 28;
export const PLAN_WINDOW_MS = PLAN_WINDOW_DAYS * DAY_MS;
