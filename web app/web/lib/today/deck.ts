/**
 * The deck — everything Today shows, derived from rows the server fetched.
 *
 * A PORT of `app/src/home/deck.ts`, and the port is deliberate rather than lazy.
 * That file's docstring settles the two arguments this screen exists to win:
 *
 *   "The order of the modules is the finding the teardown produced: a trainer's
 *    home is a to-do list, not a report. What's next, where the day stands, who
 *    needs chasing, the schedule, the money, what happened. No chart until the
 *    day is over, and no greeting at all."
 *
 * Both halves show this at the same minute to the same person. If the phone ranks
 * a ₹9,000 six-day debt above a ₹3,000 four-day one and the laptop does not, the
 * trainer has two answers to *who do I chase first* and no way to know which is
 * the product's. So `ATTENTION_BANDS`, the weights, the phrasings and the
 * thresholds are copied to the character; changing one means changing it there
 * too, in the same commit.
 *
 * ── WHAT IS DIFFERENT HERE, AND WHY ───────────────────────────────────────────
 *
 * Pure, exactly as the phone's is: `now` and every row set come in as arguments
 * and nothing here touches a database or the clock. On the phone that is for
 * testability. Here it is load-bearing twice over — the server renders the first
 * paint and the browser re-derives on a timer, and a function that read
 * `Date.now()` internally would produce a hydration mismatch on the one screen
 * whose whole subject is what time it is.
 *
 * Three things the phone's version does not carry:
 *
 *   1 · `late`. `buildRunning` can already tell a session that has started and
 *       has an open log from one that has started and has none; the phone spends
 *       that on choosing the hero and drops it. The web draws a whole block state
 *       for it (`.ev--late`), so the fact is returned rather than consumed.
 *   2 · `DeckMoney.cut`. `yours` is `billed − cut` on both halves, but the web's
 *       money card names the gym's share on its own line, so the subtrahend has
 *       to survive the derivation instead of being folded into it.
 *   3 · `week` counts the ELAPSED week. See `buildWeek`.
 */

/* The cooldown is imported rather than restated. It is already the FOURTH copy
   of "never twice in seven days" — the phone's `app/src/nudges/rules.ts`, the
   backend's `NudgeService`, `lib/nudges/cooldown.ts` — and a fifth living inside
   the ranking would be the one that silently disagrees. */
import { COOLDOWN_DAYS } from '@/lib/nudges/cooldown';

import { readMode, type DeliveryMode } from './mode';
import {
  DAY_MS,
  WEEKDAYS_LONG,
  clockParts,
  daysBetween,
  isoWeekday,
  monthName,
  relativeMinutes,
  rupees,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from './time';

/* --------------------------------------------------------------- thresholds
 * § 06: vague statuses lose to explicit ones. Every number a trainer reads on
 * this screen — "9 days", "2 sessions" — comes from one of these, and the copy
 * always states the number rather than calling it "low compliance".
 * -------------------------------------------------------------------------- */

/** A client with a live plan and no logged workout for this long needs a nudge. */
export const QUIET_DAYS = 7;
/** A session pack this close to empty is worth renewing before it runs out. */
export const PACK_ENDING = 2;
/** Money owed for longer than this stops being a reminder and becomes a problem. */
export const OVERDUE_DAYS = 7;
/** How far back the activity feed and the "what happened" rules look. */
export const ACTIVITY_DAYS = 7;

/* ─────────────────────────────────────────────── the four new triggers ────
 * Added by the Today restructure of 27 Aug 2026, with the ranking that came
 * with it. See THE DIVERGENCE below for why these live on this half only.
 * ------------------------------------------------------------------------- */

/**
 * A pack whose *date* runs out this soon is expiring, whatever its session
 * count says.
 *
 * `PACK_ENDING` answers the same question by sessions, and the two are not
 * interchangeable: a monthly pack with 14 sessions left and four days to run is
 * invisible to a session count and is the more urgent of the two, because the
 * sessions are the thing about to be lost. Both raise the same row and the same
 * verb; only the sentence differs.
 */
export const PACK_EXPIRING_DAYS = 7;

/**
 * Two in a row. Not three, and not one.
 *
 * One missed session is a week that went wrong and needs nothing from the
 * product. Three is a client who has already left and is being chased by a row
 * that is a month late. Two is the last point at which a message still works,
 * which is the whole basis on which this queue ranks anything.
 */
export const MISSED_STREAK = 2;

/**
 * Delivered sessions per milestone. Every hundredth.
 *
 * ── AND THE HALF OF THIS TRIGGER THAT IS NOT BUILT ───────────────────────────
 *
 * The brief asks for "Birthday / milestone (100th session, 10kg lost)". Two of
 * those three are absent, and neither is an oversight:
 *
 *   · **Birthday.** There is no date of birth in this schema. V12 declares a
 *     `birthday` nudge KIND and no column to feed it ever landed, so there is
 *     nothing to read. Adding one is a migration and an intake field on both
 *     halves, not a change to this file.
 *   · **10kg lost.** Body metrics are not on this screen's wire.
 *     `lib/today/api.ts` does not fetch them and `DeckInput` has no field for
 *     them, and the per-client route is the only one there is — so a weight
 *     milestone would cost one request per client on the screen a trainer opens
 *     every morning. That is the exact mistake `GET /v1/packages` was added to
 *     fix.
 *
 * So the band raises what the wire can actually prove, and `milestoneLine` names
 * the count rather than the achievement — a feed that says "milestone" and means
 * "we counted your sessions" is worse than one that says what it counted.
 */
export const MILESTONE_EVERY = 100;

/**
 * How recently the milestone must have been reached to still be worth saying.
 *
 * Without a window a hundredth session raises a row that is true forever: the
 * count never goes back down, so the row can only be cleared by sending the
 * message, and a trainer who does not want to send it has a permanent row. Three
 * days is the honest span of "well done" — past that the moment has gone and the
 * message reads as an afterthought.
 */
export const MILESTONE_FRESH_DAYS = 3;

/**
 * How many rows the queue draws before it folds the rest behind a disclosure.
 *
 * ── THIS NUMBER REPLACES AN ARGUMENT THIS FILE USED TO WIN ───────────────────
 *
 * `ATTENTION_VISIBLE` is 3 on the phone and this half deliberately ignored it,
 * on the grounds that "hiding three of six here would mean a trainer who came to
 * the desk to clear the list could not see the list." That reasoning was about
 * SIX rows in a 1144px column, and it is still right about six.
 *
 * It is not right about forty. The brief's rule is the one this settles on — "if
 * everything is urgent, nothing is" — and six is where the ladder stops being a
 * ranking and starts being a backlog. So the rows past this are folded, not
 * dropped: the disclosure states the count, one click opens them, and the queue
 * keeps the property that made it worth reading.
 */
export const QUEUE_CAP = 6;

/**
 * How long *Snooze* is.
 *
 * A week, because the shortest useful snooze is "not this week" — a trainer who
 * has just spoken to a client about their pack does not want the row back
 * tomorrow, and every interval shorter than the trainer's own weekly rhythm gets
 * dismissed again rather than acted on. Permanent dismissal is the other button.
 */
export const SNOOZE_DAYS = 7;

/**
 * A workout log left open on a session that is over.
 *
 * There is no number to tune here, and that is the point — the rule is a pair of
 * facts, not a duration. See `staleOpenLogs`: a log is stale the moment its
 * session is marked **done**, because a done session cannot still be in progress,
 * and separately once it is dated **before today**, because a log open across a
 * day boundary was not left open on purpose. A session still running fails both,
 * which is what keeps the hero's live log out of the queue.
 */
export const LOG_OPEN_RULE = 'done-session-or-earlier-day' as const;

/**
 * The phone stops at three: "more than three alerts at the top of home and the
 * whole module becomes wallpaper."
 *
 * **That is a PHONE limit and the web is allowed to disagree with it.** The
 * reason it exists is that a fourth alert on a 390px screen pushes the day below
 * the fold, so the module competes with the thing it is meant to be read beside.
 * In a 1144px column the queue is a table in the third row with the whole day
 * already visible above it, and six rows are 264px — nothing moves. Hiding three
 * of six here would mean a trainer who came to the desk to clear the list could
 * not see the list.
 *
 * Kept as an export because it is the number the *phone* shows, and any copy on
 * this screen that says "three" would have to read it from here.
 */
export const ATTENTION_VISIBLE = 3;

/** A session stays "next" for this long after its start time before it's simply late. */
export const NEXT_GRACE_MS = 90 * 60_000;

/* ------------------------------------------------------- the attention model
 * One table, read by two screens — and now by four, across two halves.
 *
 * BANDS, not raw weights. A band is worth 1000 and the magnitude inside it is
 * clamped to 0…999, so an amount can order items within a band and can never
 * lift one out of it.
 * -------------------------------------------------------------------------- */

/**
 * Every band, most urgent first. The order IS the design, so it is one list
 * rather than thirteen numbers scattered across four files.
 *
 * Today raises eight of the thirteen. `setup`, `invite-stale` and `unavailable`
 * are roster-only and legitimately so — none of them is a thing that happens
 * today. **Selection differs per screen; the model does not.** A screen may
 * decline to show a band, and no screen may re-rank or re-word one it does show.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DIVERGENCE — 27 AUG 2026, AND IT IS DELIBERATE
 *
 * Until this commit this list was character-identical to the phone's, and the
 * docstring at the top of this file states the reason: "if the phone ranks a
 * ₹9,000 six-day debt above a ₹3,000 four-day one and the laptop does not, the
 * trainer has two answers to *who do I chase first* and no way to know which is
 * the product's."
 *
 * That is still true, and this list is no longer identical. Two things changed
 * and they are separate:
 *
 *   1 · **Five bands were added** — `pack-expiring`, `missed`, `no-program`,
 *       `unmarked`, `milestone`. Additive, and the phone simply does not raise
 *       them yet. On its own this would be within the existing law: a screen may
 *       decline to show a band.
 *   2 · **The ladder was RE-ORDERED.** A package running out now outranks money
 *       owed, which reverses `overdue-late` > `pack-empty`. This is the part the
 *       law forbade, and it was taken with the product owner's explicit decision
 *       on 27 Aug 2026, recorded in `AGENTS.md` under *The queue's ladder, and
 *       the half it now disagrees with*.
 *
 * The reasoning for the reversal, so it can be argued with later: an overdue
 * invoice is money the trainer has already earned and will very likely still
 * collect — the client is still training, and the debt does not expire. A pack
 * about to run out is money not yet earned, on a client who has no reason to come
 * back once it is empty. **Ignoring the first delays revenue; ignoring the second
 * ends it.** The queue ranks by what it costs to ignore, so the pack goes first.
 *
 * **The consequence, stated rather than hidden:** until `app/src/home/deck.ts`
 * takes the same change, a trainer's phone and their laptop will order the same
 * roster differently. `app/` is not edited from this half without being asked.
 * Whoever closes this gap moves BOTH halves in one commit and deletes this block.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * AND `BAND_VALUE` IS STILL DERIVED FROM POSITION
 *
 * So the safe way to add a band is still to append it, and the reason a re-order
 * needed a decision above is that it silently re-weights every band below the
 * insertion point. `lib/clients/roster.ts` reads `attentionWeight` too and its
 * ranking moved with this one — which is correct, because two screens on the same
 * half disagreeing would be the original bug at a smaller scale.
 */
export const ATTENTION_BANDS = [
  'unavailable',
  'setup',

  /* ── 1 · the pack. Ignoring this ends the revenue. ──────────────────────── */
  /* Already out. Nothing to deliver, so the next session is unpaid or refused. */
  'pack-empty',
  /* ≤ PACK_ENDING sessions left. */
  'pack-ending',
  /* ≤ PACK_EXPIRING_DAYS days left by DATE, whatever the session count says. */
  'pack-expiring',

  /* ── 2 · the money. Ignoring this delays the revenue. ───────────────────── */
  'overdue-late',
  'due-soon',

  /* ── 3 · two sessions missed in a row. ─────────────────────────────────── */
  'missed',

  /* ── 4 · gone quiet — no workout logged in QUIET_DAYS. ─────────────────── */
  'quiet',

  /* ── 5 · training, and no plan to train to. ────────────────────────────── */
  'no-program',

  /* ── 5b · an assessment the trainer owes a tape for. ───────────────────── */
  /*
   * Housekeeping, like `no-program` and `unmarked`: nobody is at risk and the
   * only person who can clear it is the trainer. It ranks with them and is NOT
   * in `RISK_BANDS`. It is also the one band that cannot be snoozed — the
   * `attention_dismissal_band` check constraint has no room for it (R31) and
   * "not now" on it would really mean "change the date", which the row sends
   * you to do. It clears itself when the assessment is taken or moved.
   */
  'assessment-due',

  /* ── 6 · yesterday's sessions nobody marked. ───────────────────────────── */
  /*
   * BELOW the five above and above the two below, which is the position the
   * brief gives it and the position it deserves: an unmarked session is the
   * trainer's own housekeeping, so nothing is at risk from somebody else — but
   * unlike a stale log it is not free, because `POST /v1/sessions/{id}/done` is
   * what decrements the pack. An unmarked session is a pack that is quietly one
   * session wrong, which is why it outranks `log-open`.
   */
  'unmarked',

  /* ── 7 · something worth saying well done about. ───────────────────────── */
  /*
   * The only band on the ladder that is not a problem, which is exactly why it
   * is second from bottom rather than absent: it is the one row a trainer is
   * pleased to see, and a queue that only ever carries bad news is a queue they
   * open with their shoulders up. It ranks below every row where something is at
   * risk, because a hundredth session keeps until the afternoon.
   */
  'milestone',

  'invite-stale',
  /*
   * A workout log nobody closed.
   *
   * LAST, and the position is the whole judgement: it is the only band on the
   * ladder where nothing is at risk and nothing is even slightly wrong. No money
   * is late, no pack is running out and no client has gone cold — the trainer
   * simply finished a session and left its log open, which costs nothing until it
   * is never fixed. It belongs in the queue because it is a thing only the
   * trainer can clear, and it belongs at the bottom of it because every other row
   * is about somebody else.
   */
  'log-open',
] as const;

export type AttentionBand = (typeof ATTENTION_BANDS)[number];

/** The ten Today is allowed to raise, in the ladder's own order. */
export const DECK_BANDS: AttentionBand[] = [
  'pack-empty',
  'pack-ending',
  'pack-expiring',
  'overdue-late',
  'due-soon',
  'missed',
  'quiet',
  'no-program',
  'assessment-due',
  'unmarked',
  'milestone',
  'log-open',
];

/**
 * The bands that mean a CLIENT is at risk — the third of Today's three figures.
 *
 * Deliberately not "every band in the queue". Four of the ten are the trainer's
 * own housekeeping or good news (`unmarked`, `no-program`, `milestone`,
 * `log-open`), and counting those would make the figure a restatement of the
 * queue's badge, which is drawn six inches away. *Clients at risk* has to mean
 * something the badge does not: how many people on this roster are on their way
 * out.
 *
 * `no-program` is the close call and it is excluded on purpose — a client with no
 * plan is a client the TRAINER has not finished setting up, not one who is
 * leaving.
 */
export const RISK_BANDS = new Set<AttentionBand>([
  'pack-empty',
  'pack-ending',
  'pack-expiring',
  'overdue-late',
  'due-soon',
  'missed',
  'quiet',
]);

/** Bigger is more urgent, so the list is read from the bottom up. */
const BAND_VALUE: Record<AttentionBand, number> = ATTENTION_BANDS.reduce(
  (acc, band, i) => {
    acc[band] = ATTENTION_BANDS.length - i;
    return acc;
  },
  {} as Record<AttentionBand, number>,
);

/**
 * Which bands are red rather than amber: the ones that stop the work.
 *
 * Still two, and it stays two however many bands the ladder grows. The rule is
 * not "the top of the list is red" — it is "a tone on every row is a tone on no
 * row", and five new bands are five new chances to break that. `pack-expiring`
 * is the one that argues for inclusion, being priority one by date, and it is
 * amber: a pack with a week to run is urgent and it is not yet stopped. An empty
 * pack and a debt past `OVERDUE_DAYS` are the two states where the next session
 * cannot honestly happen.
 */
const CRITICAL_BANDS = new Set<AttentionBand>(['overdue-late', 'pack-empty']);

export function attentionSeverity(band: AttentionBand): 'alert' | 'critical' {
  return CRITICAL_BANDS.has(band) ? 'critical' : 'alert';
}

/**
 * The sort key. `magnitude` orders items inside a band and is clamped, so it
 * cannot reach the band above — pass rupees through `moneyMagnitude` first.
 */
export function attentionWeight(band: AttentionBand, magnitude = 0): number {
  const inside = Math.max(0, Math.min(999, Math.round(magnitude)));
  return BAND_VALUE[band] * 1000 + inside;
}

/**
 * Rupees, as something that fits in a band. Hundreds, so ₹99,900 is the first
 * amount that saturates — above that two debts tie and the name breaks it,
 * which is the right failure: at a lakh owed the order stops being the point.
 */
export function moneyMagnitude(rupeesOwed: number): number {
  return rupeesOwed / 100;
}

/* One phrasing per fact. Every screen calls these rather than writing its own,
 * because "Pack is empty" here and "Pack finished" there described the same
 * package and gave a trainer no way to know it. */

export function moneyLine(total: number, days: number, late: boolean): string {
  return `${rupees(total)} ${late ? 'overdue' : 'due'} · ${days} day${days === 1 ? '' : 's'}`;
}

export function packLine(remaining: number): string {
  return remaining <= 0
    ? 'Pack is empty'
    : `Pack ends in ${remaining} session${remaining === 1 ? '' : 's'}`;
}

export function quietLine(days: number): string {
  return `No workout logged in ${days} days`;
}

/**
 * `Log still open · finished today` · `2 logs still open · oldest 9 days ago`.
 *
 * One row per client, so the COUNT is stated when there is more than one and the
 * age is the OLDEST — the same shape `moneyLine` takes for the same reason
 * ("three overdue invoices are one" row, and the row names the total). Saying
 * "finished today" rather than "0 days" because a zero-day age is the commonest
 * case here, and it is the one a trainer clears without thinking.
 */
export function logLine(count: number, days: number): string {
  const age = days <= 0 ? 'finished today' : `${days} day${days === 1 ? '' : 's'} ago`;
  return count === 1 ? `Log still open · ${age}` : `${count} logs still open · oldest ${age}`;
}

/**
 * `Pack expires Friday · 4 days` · `Pack expires tomorrow`.
 *
 * Names the weekday rather than only the count, because "4 days" is a number a
 * trainer has to do arithmetic on and "Friday" is a day they can picture a
 * session in. Both, so the ordering the count implies is still visible.
 */
export function packExpiryLine(days: number, weekday: string): string {
  if (days <= 0) return 'Pack expires today';
  if (days === 1) return 'Pack expires tomorrow';
  return `Pack expires ${weekday} · ${days} days`;
}

/**
 * `Missed the last 2 sessions` · `Missed the last 3 sessions`.
 *
 * The COUNT, not the dates, and not "no-show". A trainer marking `no_show`
 * recorded an absence; the row is about the pattern, and the pattern is the
 * number. Dates would be two more figures on a row that already has a name and a
 * verb — and the client file is one click away on the name.
 */
export function missedLine(count: number): string {
  return `Missed the last ${count} sessions`;
}

/** `Training with no program assigned`. One fact, no number to state. */
/** `Monthly check due today` · `Monthly check due 2 days ago`. */
export function assessmentLine(name: string, daysLate: number): string {
  if (daysLate <= 0) return `${name} due today`;
  return `${name} due ${daysLate} day${daysLate === 1 ? '' : 's'} ago`;
}

export function noProgramLine(): string {
  return 'Training with no program assigned';
}

/**
 * `Yesterday's session not marked` · `2 sessions from Friday not marked`.
 *
 * The DAY is named once it is not yesterday, which happens every Monday — the
 * window this reads reaches back past the weekend, so "yesterday" would be a lie
 * on the one morning of the week the row is most likely to exist.
 */
export function unmarkedLine(count: number, dayLabel: string | null): string {
  if (dayLabel === null) {
    // Two casings of the same word, because one of them opens the sentence and
    // the other sits inside it. "2 sessions from Yesterday" is a proper noun
    // where there is no proper noun.
    return count === 1
      ? 'Yesterday’s session not marked'
      : `${count} sessions from yesterday not marked`;
  }
  return count === 1
    ? `${dayLabel}’s session not marked`
    : `${count} sessions from ${dayLabel} not marked`;
}

/** `100th session delivered` · `200th session delivered`. */
export function milestoneLine(count: number): string {
  return `${count}th session delivered`;
}

/** The band money sits in, given how old the oldest unpaid invoice is. */
export function moneyBand(days: number, flaggedOverdue: boolean): AttentionBand {
  return flaggedOverdue || days >= OVERDUE_DAYS ? 'overdue-late' : 'due-soon';
}

/**
 * The band a pack sits in, or null when it has enough left to be nobody's
 * problem — by SESSIONS and by DATE, whichever is worse.
 *
 * Two inputs and one answer, rather than two rules that could each raise a row.
 * A pack with one session left and three days to run is one job: renew it. Two
 * rows for it would be the thing `buildAttention`'s own docstring forbids — "one
 * row per client per kind" — and the trainer would clear one and keep the other.
 *
 * `daysLeft` is null when the pack has no `endDate`, which is the common case: the
 * column is nullable and a session pack sold with no expiry is a normal thing to
 * sell. Null is not zero.
 */
export function packBand(
  remaining: number,
  daysLeft: number | null = null,
): AttentionBand | null {
  if (remaining <= 0) return 'pack-empty';
  if (remaining <= PACK_ENDING) return 'pack-ending';
  if (daysLeft !== null && daysLeft <= PACK_EXPIRING_DAYS) return 'pack-expiring';
  return null;
}

const DONE_SESSION = new Set(['done', 'completed']);
const DEAD_SESSION = new Set(['cancelled', 'canceled', 'no_show']);
const DUE_PAYMENT = new Set(['pending', 'due', 'unpaid', 'overdue']);
const PAID_PAYMENT = new Set(['paid', 'settled', 'received']);
const DEAD_PACKAGE = new Set(['cancelled', 'canceled', 'completed', 'expired', 'refunded']);
const DEAD_PROGRAM = new Set(['cancelled', 'canceled', 'completed', 'archived']);

/* -------------------------------------------------------------------- input */

export interface DeckClient {
  id: string;
  name: string;
  status: string;
  deliveryMode?: string | null;
  metadata?: unknown;
  /**
   * The trainer's own free text about this person — `client.goal`.
   *
   * Read for ONE purpose: the hero's *Has a note* chip. It is not printed on
   * Today and it is not searched. See `DeckSession.hasNote` for the whole
   * argument, including what this field must never be turned into.
   */
  goal?: string | null;
  /**
   * v1 · `client.hasPinnedNote` — the pinned `client_note` replaces `goal` as the
   * client half of the *Has a note* chip (api-contract R7). Still a boolean that
   * never looks at what the note says.
   */
  hasNote?: boolean;
  /**
   * v1 · the two session aggregates the server now computes (`stats` on
   * `GET /v1/clients?view=summary`). When present they replace the unbounded
   * workout history as the source for *gone quiet* and *100th session*:
   * epoch ms of the newest delivered session, and how many were delivered.
   */
  lastDoneAt?: number | null;
  sessionsDone?: number;
  /**
   * v1 · `stats.missedStreak` — consecutive no-shows among the client's newest
   * settled sessions, counted by the server over the WHOLE history. When present
   * it is the streak the *missed* row states: walking the sessions window here
   * would cut off a streak older than the window.
   */
  missedStreak?: number;
}
export interface DeckScheduled {
  id: string;
  clientId: string;
  programId?: string;
  scheduledAt: number;
  durationMinutes?: number;
  status: string;
  dayLabel?: string;
  templateDay?: number;
  deliveryMode?: string | null;
  /** `scheduled_session.notes` — what the trainer wrote about this booking. */
  notes?: string | null;
  /** v1 · `workout.week` — the plan week this session's workout sits in. */
  week?: number;
}
export interface DeckWorkout {
  id: string;
  clientId: string;
  programId?: string;
  scheduledSessionId?: string;
  sessionDate: string;
  createdAt: number;
  /** V13 — set when the trainer closed the log. Absent means still open. */
  endedAt?: number | null;
  /**
   * v1 · the log summary that rides on the session row (`log` on
   * `GET /v1/sessions`). When present it is used instead of `DeckInput.setLogs`,
   * which the v1 wire no longer carries.
   */
  setsDone?: number;
  volumeKg?: number;
  lastSetAt?: number | null;
}
export interface DeckSetLog {
  id: string;
  workoutSessionId: string;
  exerciseId: string;
  loadKg?: number;
  reps?: number;
  createdAt: number;
}
export interface DeckProgram {
  id: string;
  clientId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  status: string;
  /** v1 · `program.weeks` — the plan's length, the "8" in "Week 4/8". */
  weeks?: number;
}
export interface DeckPackage {
  id: string;
  clientId: string;
  sessionsTotal?: number | null;
  sessionsRemaining?: number | null;
  amount?: number;
  status: string;
  /** Last decrement — which is the moment a pack became worth renewing. */
  updatedAt: number;
  /**
   * `package.end_date` — ISO `yyyy-MM-dd`, and NULLABLE for a real reason rather
   * than a missing one: a session pack sold with no expiry is a normal thing to
   * sell in this market, and most of them are. Null means "no date to run out
   * on", never "runs out today" — `packBand` takes null and returns null.
   *
   * On the wire since V1 and on `PackageResponse` since it was written; this
   * screen simply never read it, because the pack bands were counted in sessions.
   */
  endDate?: string | null;
  /** V30 · set while the clock is stopped. See the skip in `buildAttention`. */
  pausedAt?: number | null;
  /**
   * v1 · what is still owed on this pack, computed by the server, and when it
   * was due. In v1 a due date lives on the package, not on a payment, so the
   * money rows are raised from these two fields (api-contract L5).
   */
  amountDue?: number;
  dueDate?: string | null;
  /** v1 · floor | home_visit | remote | programming — what "the same pack" means for a renewal. */
  service?: string;
}
export interface DeckPayment {
  id: string;
  clientId: string;
  amount: number;
  method?: string;
  status: string;
  upiReference?: string;
  /** The gym's cut, stored on the row at record time. */
  gymShareAmount?: number | null;
  paidAt?: number | null;
  createdAt: number;
}

/**
 * A queue row the trainer has silenced — `attention_dismissal`, V28.
 *
 * The row is stored by (client, kind) and carries the BAND it was silenced at,
 * which is what stops a dismissal becoming a blindfold: see `isSilenced`.
 */
export interface DeckDismissal {
  id: string;
  clientId: string;
  kind: string;
  band: string;
  /** Epoch ms, or null for "do not raise this again". */
  snoozedUntil: number | null;
}

/**
 * A message this trainer has already sent — `nudge_log`, read over REST since
 * V32.
 *
 * Only two fields, because only two are used: WHO and WHEN. The template is
 * deliberately not read here, and that is the cap's own rule rather than an
 * omission — see `lib/nudges/cooldown.ts`. A client who got a payment reminder on
 * Monday and a check-in on Tuesday has been messaged twice by somebody they pay,
 * whatever the two messages were about; keying the cooldown on the template would
 * let six bands each spend their own weekly message on the same person.
 */
export interface DeckNudge {
  clientId: string;
  sentAt: number;
}

export interface DeckInput {
  clients: DeckClient[];
  /**
   * Thirty days back through the end of tomorrow. The window is
   * `lib/today/api.ts`'s to choose, and it widened on 27 Aug 2026 — see the note
   * there. It used to be Monday-of-this-week, which cannot answer either of the
   * two backward-looking triggers.
   */
  sessions: DeckScheduled[];
  workouts: DeckWorkout[];
  setLogs: DeckSetLog[];
  programs: DeckProgram[];
  packages: DeckPackage[];
  payments: DeckPayment[];
  /** What the trainer has already said "not now" to. Empty is the normal state. */
  dismissals: DeckDismissal[];
  /**
   * The last week of messages, so the queue stops re-nagging.
   *
   * Optional, and it is optional on purpose: `lib/today/api.ts` returns an empty
   * list rather than throwing when this read fails, so a backend that predates
   * V32 — or an unreachable one — degrades the queue's RANKING and never the
   * screen. Nine requests answer the day; this tenth answers "who did I already
   * message", and the day must render without it.
   */
  nudges?: DeckNudge[];
  /**
   * v1 · `GET /v1/money/summary?months=2`, newest month first. When present the
   * money card reads it rather than summing payment rows (api-contract R4).
   */
  moneySummary?: DeckMoneyMonth[];
  /**
   * Today L10 — the earliest assessment each client owes today or earlier.
   * Optional for the same reason `nudges` is: a failed read degrades the queue,
   * never the screen.
   */
  assessments?: DeckAssessment[];
}

/** One owed assessment, as the queue reads it. `dueOn` is a `yyyy-MM-dd` calendar date. */
export interface DeckAssessment {
  id: string;
  clientId: string;
  name: string;
  dueOn: string;
}

/** One month of `GET /v1/money/summary`, numbers already parsed. */
export interface DeckMoneyMonth {
  month: string;
  billed: number;
  collected: number;
  gymCut: number;
  yours: number;
  pending: number;
  clientsOwing: number;
}

/* ------------------------------------------------------------------- output */

export interface DeckSession {
  id: string;
  clientId: string;
  clientName: string;
  /** Carried so Start can open the workout log already keyed to the plan. */
  programId?: string;
  templateDay?: number;
  at: number;
  /** Minutes, so the ribbon can lay it out without re-reading the timestamp. */
  minutes: number;
  time: string;
  meridiem: string;
  /** "Full Body B · Week 4/8" */
  detail: string;
  mode: DeliveryMode;
  done: boolean;
  dead: boolean;
  /**
   * Started, and no workout log was ever opened against it. The phone computes
   * this fact and spends it on choosing the hero; the ribbon draws it.
   */
  late: boolean;
  /** A log is open against this one right now. */
  live: boolean;
  /**
   * The trainer has written something about this booking or this client.
   *
   * ══════════════════════════════════════════════════════════════════════════
   * WHAT THIS IS, AND THE FIELD IT IS DELIBERATELY NOT
   *
   * The brief for this screen asked the hero to carry "the injury/medical flag if
   * there is one". There is no such field, and its absence is a decision rather
   * than a gap. `notes/InclineYou_MVP_interaction_map.md`: "**No medical or
   * health-condition fields anywhere** — no injuries, no conditions, no
   * medications … Do not design an 'injuries / health notes' field into intake",
   * and it lists health data under "legally excluded, not deferred" against the
   * DPDP Act 2023. `InclineYou_core_data_model.md` says the client note is "free text;
   * **no medical fields**".
   *
   * So this is a BOOLEAN about whether text exists, and nothing about what the
   * text says. It reads `scheduled_session.notes` and `client.goal` — two columns
   * that have always been the trainer's own free text — and renders a neutral
   * chip that opens the client's file. It classifies nothing, it stores nothing
   * new, and it must never grow a second variant that means "medical": the moment
   * a flag distinguishes a health note from any other note, the product is
   * holding health data whatever the column is called.
   *
   * What it buys is the thing the brief was actually after: a trainer walking up
   * to this screen can see that there is something they wrote about this session
   * before they start it.
   */
  hasNote: boolean;
}

export type AttentionKind =
  | 'overdue'
  | 'quiet'
  | 'pack'
  | 'log'
  | 'missed'
  | 'no-program'
  | 'unmarked'
  | 'milestone'
  | 'assess';

export interface AttentionItem {
  key: string;
  kind: AttentionKind;
  band: AttentionBand;
  clientId: string;
  clientName: string;
  /** States the number: "₹6,000 overdue · 11 days". */
  line: string;
  severity: 'alert' | 'critical';
  /** Remind · Check in · Renew · Assign · Mark · Wish · Close. */
  action: string;
  /** Sort key — bigger is more urgent. */
  weight: number;
  /** When the condition became true, so a notification centre can date it. */
  at: number;
  /**
   * Where the verb goes when the verb is a NAVIGATION rather than a write.
   *
   * `Assign` is the only one today: there is no "give this client a program"
   * request — a program is built exercise by exercise, or applied from a
   * template with a per-client schedule that has to be chosen. A row cannot
   * commit that in one click and should not pretend to. So the row carries a
   * destination and the queue renders a link.
   *
   * Present rather than inferred from `action`, so that a second navigating verb
   * needs no change to the component that draws it.
   */
  href?: string;
  /**
   * The scheduled sessions `Mark` will mark done. Ids only, the same shape and
   * for the same reason as `TodayData.openLogs`.
   */
  sessionIds?: string[];
  /**
   * The pack a `Renew` row is about — the one that raised it, which is the one
   * the server must renew. Renewing "the client's newest" instead would, right
   * after a renewal, renew the new pack a second time.
   */
  packageId?: string;
  /**
   * Set only on the rows in `Deck.silenced`: the `attention_dismissal` row that
   * is hiding this one, which is what *Restore* deletes.
   *
   * Absent on every row in `Deck.attention` by construction — a row in the queue
   * is a row nothing is hiding — so the presence of this field is also the answer
   * to "is this the folded list or the live one".
   */
  dismissalId?: string;
  /**
   * When this client was last messaged, if it was inside the cooldown.
   *
   * ══════════════════════════════════════════════════════════════════════════
   * THIS IS THE FIELD THAT STOPS THE QUEUE RE-NAGGING
   *
   * Set from `nudge_log`, and its only job is to move the row DOWN. A row
   * carrying it sorts below every row that does not, whatever band either is in,
   * so the six visible rows are six clients nobody has contacted this week and
   * everybody already chased falls behind `QUEUE_CAP`'s disclosure.
   *
   * It does NOT hide the row and it does not disable the verb. An overdue
   * invoice is still owed after a reminder, and a product that removed the row
   * because a message was drafted would be telling the trainer the money had
   * been dealt with. The row stays, reads *Messaged 2 days ago*, and its verb
   * still works — because the trainer knows things the log does not, and a
   * refusal here teaches them to open WhatsApp directly, which loses the log for
   * every client rather than enforcing the cap for one.
   *
   * Absent means either "never messaged" or "messaged longer ago than the
   * cooldown", and the two are the same fact as far as this queue is concerned.
   */
  contactedAt?: number;
}

export interface RunningSession {
  scheduledId: string;
  workoutId: string;
  clientId: string;
  clientName: string;
  programId?: string;
  templateDay?: number;
  startedAt: number;
  /** The scheduled window, which is what "18 min left" is measured against. */
  scheduledAt: number;
  durationMinutes: number;
  mode: DeliveryMode;
  detail: string;
  setsLogged: number;
  volumeKg: number;
  lastSetAt?: number;
}

/**
 * A row in *Recent activity* — the sixth of `deck.ts`'s six modules, and the only
 * one this half did not have.
 *
 * `ACTIVITY_DAYS` has been declared at the top of this file since it was ported
 * ("how far back the activity feed and the 'what happened' rules look") and until
 * now only the second half of that sentence was true: the attention bands used the
 * window and nothing built the feed. The desk has no room for it beside three
 * columns; the phone's stack is a column, and *what happened* is its last module.
 *
 * ── TWO KINDS, NOT THE APP'S THREE ───────────────────────────────────────────
 *
 * The app draws workouts, payments AND body metrics. Metrics are absent here for
 * a reason that is not an omission: `lib/today/api.ts` does not fetch them, and
 * `DeckInput` therefore has no `metrics` field to read — a metric row would mean
 * an eighth request on a screen whose whole budget argument is seven. The app
 * reads its own SQLite, where the table is already local and the read is free.
 *
 * `prSessionIds` is missing for the same reason and costs the `PR` tag with it.
 * Neither gap can invent a row: a feed that silently drops a kind is a feed that
 * says nothing happened when something did, so the sentence under the module names
 * what it covers.
 */
export interface DeckActivity {
  key: string;
  at: number;
  clientId: string;
  clientName: string;
  /** The predicate — "logged a workout", "paid ₹4,000". The subject is the name. */
  body: string;
  /** The detail line: sets and volume, or the method and the reference. */
  meta: string;
  tag?: { label: string; tone: 'ok' | 'pr' | 'info' };
}

export interface DeckMoney {
  monthLabel: string;
  billed: number;
  collected: number;
  pending: number;
  /** The gym's share of the month's billing, summed off the rows. */
  cut: number;
  /** The trainer's part of the month's billing — billed minus the gym's cut. */
  yours: number;
  /** Month-on-month change in billing, null when there is no previous month. */
  trendPercent: number | null;
  /** How many clients the `pending` figure is spread across. */
  clientsOwing: number;
}

export interface DeckWeek {
  /**
   * Seven bars, Monday first — what the PHONE draws instead of this card.
   *
   * The card beside it states the week as four figures and a rate, which is the
   * right shape for a column of `.kv` rows at a desk. `WeekBars` on the phone is
   * the same week as a shape you glance at, and it needs the count per DAY, which
   * no other field here carries. Ported from the app's `buildWeek` — the labels
   * are its labels (`M T W T F S S`) so the two halves draw the same row.
   *
   * `value` counts DELIVERED, not scheduled: the bars are what happened, and the
   * card next to them is where a trainer reads what did not.
   */
  days: { label: string; value: number; on: boolean }[];
  /** Everything scheduled this week that is not cancelled. */
  scheduled: number;
  /** How many have STARTED — the denominator the phone does not use. */
  started: number;
  delivered: number;
  noShows: number;
  /**
   * Started, and never settled either way. NOT "running".
   *
   * The first version of this field was called `running`, and on real data the
   * card read "Running now: 11" — because a trainer who forgets to mark a session
   * done leaves a `scheduled` row in the past, and eleven of them had piled up
   * over the week. Eleven simultaneous sessions is not a state a personal trainer
   * can be in, and the label turned a data-hygiene problem into a clock.
   *
   * `buildWeek` sees only `DeckScheduled` rows, which carry no workout log, so it
   * genuinely cannot tell a live session from a forgotten one — `buildRunning`
   * needs the log for that, and only looks at today. So the field is named after
   * what the row says rather than after a guess about the world.
   */
  unmarked: number;
  stillToCome: number;
  /**
   * Delivered as a share of what has SETTLED — delivered plus no-shows.
   *
   * `unmarked` is in NEITHER side of this fraction, which is why the card has to
   * print it as well: with eleven sessions unaccounted for, a bare "100%" is true
   * of the settled three and useless about the week.
   */
  percent: number;
}

export interface Deck {
  clientCount: number;
  /** The whole day, in order, including what is already done. */
  today: DeckSession[];
  todayDone: number;
  /** The hero when nothing is running: the next session that hasn't happened. */
  next: DeckSession | null;
  /**
   * The next three that have not happened — `next` first.
   *
   * ── WHY A LIST AND NOT JUST A PAIR ──────────────────────────────────────────
   *
   * The hero used to be two cards: what is happening, and what is next. Three is
   * the brief's number and the reason is a desk, not a preference — at 1440px the
   * pair leaves a third of the row empty, and on a 2560px monitor half of it. The
   * trainer's question at 06:00 is not "what is next" but "what is my morning",
   * and the third card is where that stops being a scroll.
   *
   * **The COUNT is CSS's decision, not this file's.** Three are always built and
   * `.today__hero` hides the second below 1080px and the third below 1440 — the
   * shell's rule since `Rail.tsx`: "a component that branches on a measured width
   * renders the wrong half for one frame after every resize and cannot be
   * server-rendered at all." So this is up to three, and a phone draws one of
   * them.
   *
   * Shorter than three is normal and needs no filler: a day with one session left
   * has one card, and `.today__hero` collapses to the cards it has.
   */
  upNext: DeckSession[];
  /** How far off it is — "starts in 34 min". */
  nextIn: string | null;
  /** The hero when a workout is being logged right now. */
  running: RunningSession | null;
  /** The hero once the day is over: tomorrow's first session. */
  tomorrow: DeckSession | null;
  /**
   * The whole of tomorrow, in order.
   *
   * The phone never draws tomorrow, so its `Deck` carries only the first session
   * and a count. The web needs the list for one thing — the clash check the
   * evening hero runs — and finding two sessions that overlap needs two sessions.
   * A clash surfaced at 20:52 tonight costs a message; the same clash found at
   * 17:15 tomorrow costs a client, and that is the whole reason this field exists.
   */
  tomorrowSessions: DeckSession[];
  tomorrowCount: number;
  tomorrowAt: number;
  /**
   * Every client, name and id only — what the command palette matches on.
   *
   * The roster, not the people who appear elsewhere in the deck. A trainer typing
   * `kav` into ⌘K means the client, and a client with no session today and nothing
   * in the queue is exactly the one they are typing a name to find.
   */
  roster: { id: string; name: string }[];
  /** Who needs chasing, most urgent first, with silenced rows already removed. */
  attention: AttentionItem[];
  /**
   * The rows a live dismissal is currently hiding — each carrying the
   * `dismissalId` that *Restore* deletes.
   *
   * Returned rather than merely counted, and that is the whole point. A queue that
   * can be silenced is only trustworthy if it admits to being silenced and can be
   * walked back: otherwise "you're all caught up" is a sentence the product cannot
   * honestly say, and the trainer who snoozed four rows last Tuesday has no route
   * to them from the screen that hid them.
   *
   * Empty is the normal state, and the disclosure that draws these is not rendered
   * at all when it is.
   */
  silenced: AttentionItem[];
  /**
   * The third of Today's three figures — how many people on this roster are on
   * their way out. `RISK_BANDS` says which bands count and why.
   *
   * Counted BEFORE the queue is capped and AFTER dismissals are applied. Both
   * halves of that matter: capping is a drawing decision and must not change a
   * figure, and a dismissal is the trainer saying they have dealt with it, which
   * must.
   */
  clientsAtRisk: number;
  collectedToday: number;
  pendingTotal: number;
  money: DeckMoney;
  week: DeckWeek;
  /** What happened, newest first — the last module in the phone's stack. */
  activity: DeckActivity[];
  /** True when the trainer has no clients at all — frame 1d. */
  firstRun: boolean;
}

/* -------------------------------------------------------------------- rules */

const lower = (v: string | undefined | null): string => (v ?? '').toLowerCase();

function parseDay(value?: string): number | null {
  if (!value) return null;
  const t = Date.parse(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(t) ? null : t;
}

/**
 * "Full Body B · Week 4/8".
 *
 * The week counter is what turns a session into a position in a plan, and it is
 * the single most-repeated element in the design set's session rows. It only
 * appears when the program has real dates — a made-up week number is worse than
 * none.
 */
function sessionDetail(
  session: DeckScheduled,
  program: DeckProgram | undefined,
  at: number,
): string {
  const label = session.dayLabel?.trim() || program?.name?.trim() || 'Session';
  if (!program) return label;
  // v1: the workout knows its own plan week, which beats counting from dates.
  if (session.week && program.weeks) return `${label} · Week ${Math.min(session.week, program.weeks)}/${program.weeks}`;

  const start = parseDay(program.startDate);
  const end = parseDay(program.endDate);
  if (start === null) return label;

  const week = Math.floor((startOfDay(at) - startOfDay(start)) / (7 * DAY_MS)) + 1;
  if (week < 1) return label;
  if (end === null) return `${label} · Week ${week}`;

  const total = Math.max(1, Math.ceil((startOfDay(end) - startOfDay(start)) / (7 * DAY_MS)));
  return `${label} · Week ${Math.min(week, total)}/${total}`;
}

/** The default a session with no `durationMinutes` gets. One slot. */
const DEFAULT_DURATION = 60;

function toDeckSession(
  session: DeckScheduled,
  client: DeckClient | undefined,
  program: DeckProgram | undefined,
  openLogIds: Set<string>,
  now: number,
): DeckSession {
  const at = session.scheduledAt;
  const { time, meridiem } = clockParts(at);
  const status = lower(session.status);
  const done = DONE_SESSION.has(status);
  const dead = DEAD_SESSION.has(status);
  const live = openLogIds.has(session.id);
  return {
    id: session.id,
    clientId: session.clientId,
    clientName: client?.name?.trim() || 'Client',
    programId: session.programId,
    templateDay: session.templateDay,
    at,
    minutes: session.durationMinutes && session.durationMinutes > 0
      ? session.durationMinutes
      : DEFAULT_DURATION,
    time,
    meridiem,
    detail: sessionDetail(session, program, at),
    mode: readMode({
      session: session.deliveryMode,
      client: client?.deliveryMode,
      metadata: client?.metadata,
    }),
    done,
    dead,
    live,
    // Started, not finished, not dead, and nobody opened a log. The block state
    // the stylesheet had no meaning for until this screen: before it, a session
    // twelve minutes past its start looked exactly like one twelve minutes
    // before it.
    late: !done && !dead && !live && at <= now,
    /*
     * Either column, not both required. A booking note is about THIS session and
     * a client goal is about every one of them, and the chip does not distinguish
     * them — it says "you wrote something", and the file says what. Trimmed
     * before it is tested, because an empty string and three spaces are both
     * "nothing written" and only one of them is falsy.
     */
    hasNote: (session.notes ?? '').trim().length > 0
      || client?.hasNote === true
      || (client?.goal ?? '').trim().length > 0,
  };
}

/**
 * Who needs chasing, most urgent first.
 *
 * One row per client per kind, never two rows for the same client and reason — a
 * trainer who owes you money and hasn't logged a workout is two different jobs,
 * but three overdue invoices are one.
 */
function buildAttention(input: DeckInput, now: number): AttentionItem[] {
  const items: AttentionItem[] = [];
  const byId = new Map(input.clients.map((c) => [c.id, c]));

  // --- money owed ---
  //
  // v1: from the package's server-computed `amountDue` against its `dueDate`
  // (api-contract L5). A pack whose due date is more than a week out is not
  // raised yet — "due soon" means soon — and one with no due date is dated from
  // when it was sold.
  const dueByClient = new Map<string, { total: number; oldest: number; overdue: boolean }>();
  for (const p of input.packages) {
    const owed = p.amountDue ?? 0;
    if (owed <= 0) continue;
    const at = parseDay(p.dueDate ?? undefined) ?? p.updatedAt;
    if (at - now > OVERDUE_DAYS * DAY_MS) continue;
    const entry = dueByClient.get(p.clientId);
    if (entry) {
      entry.total += owed;
      entry.oldest = Math.min(entry.oldest, at);
    } else {
      dueByClient.set(p.clientId, { total: owed, oldest: at, overdue: false });
    }
  }
  for (const [clientId, due] of dueByClient) {
    const client = byId.get(clientId);
    if (!client) continue;
    const days = Math.max(0, daysBetween(due.oldest, now));
    // Two bands, not a boolean: money owed is always worth seeing, and past
    // OVERDUE_DAYS it stops being a reminder.
    const band = moneyBand(days, due.overdue);
    items.push({
      key: `overdue:${clientId}`,
      kind: 'overdue',
      band,
      clientId,
      clientName: client.name?.trim() || 'Client',
      line: moneyLine(due.total, days, band === 'overdue-late'),
      severity: attentionSeverity(band),
      action: 'Remind',
      weight: attentionWeight(band, moneyMagnitude(due.total)),
      at: due.oldest,
    });
  }

  // --- gone quiet ---
  const lastWorkout = new Map<string, number>();
  for (const w of input.workouts) {
    const at = parseDay(w.sessionDate) ?? w.createdAt;
    const seen = lastWorkout.get(w.clientId);
    if (seen === undefined || at > seen) lastWorkout.set(w.clientId, at);
  }
  // v1: the server's last delivered session, at any age, wins over the window.
  for (const c of input.clients) {
    if (c.lastDoneAt !== undefined) {
      if (c.lastDoneAt === null) lastWorkout.delete(c.id);
      else lastWorkout.set(c.id, c.lastDoneAt);
    }
  }
  const engaged = new Set<string>();
  for (const p of input.programs) if (!DEAD_PROGRAM.has(lower(p.status))) engaged.add(p.clientId);
  for (const p of input.packages) if (!DEAD_PACKAGE.has(lower(p.status))) engaged.add(p.clientId);

  for (const client of input.clients) {
    // Only clients who are actually training: a prospect with no plan and no
    // pack has not "gone quiet", they have not started.
    if (lower(client.status) !== 'active' || !engaged.has(client.id)) continue;
    const last = lastWorkout.get(client.id);
    if (last === undefined) continue;
    const days = daysBetween(last, now);
    if (days < QUIET_DAYS) continue;
    items.push({
      key: `quiet:${client.id}`,
      kind: 'quiet',
      band: 'quiet',
      clientId: client.id,
      clientName: client.name?.trim() || 'Client',
      line: quietLine(days),
      severity: attentionSeverity('quiet'),
      /*
       * `Check in`, which was `Nudge` until 27 Aug 2026.
       *
       * The phone still says Nudge and this half no longer does, which is a copy
       * divergence and is listed with the ranking one in AGENTS.md. The reason is
       * that this half now has TWO bands whose answer is a message asking after
       * somebody — `quiet` and `missed` — and two rows reading *Nudge* and *Check
       * in* for the same act would be exactly the failure the phrasing helpers at
       * the top of this file exist to prevent. One verb, said the way a trainer
       * would say it.
       */
      action: 'Check in',
      weight: attentionWeight('quiet', days),
      // Dated from the moment they crossed the line, not from today, so nothing
      // re-announces it every morning.
      at: last + QUIET_DAYS * DAY_MS,
    });
  }

  /* --- pack running out, by sessions OR by date ---
   *
   * The date half is new (27 Aug 2026). `endDate` has been on the wire since V1
   * and this screen never read it, because the band was counted in sessions — so
   * a monthly pack with 14 sessions left and four days to run was invisible on
   * the screen whose first priority it is.
   *
   * Still ONE row per client, and the pack that raises it is the WORST of theirs
   * by band rather than the one with the fewest sessions. Those are different
   * packs: a client can hold a nearly-empty pack that runs to December and a full
   * one that expires on Friday, and "fewest sessions" picks the wrong one. */
  const worst = new Map<
    string,
    { band: AttentionBand; remaining: number; daysLeft: number | null; at: number; packageId: string }
  >();
  for (const pkg of input.packages) {
    if (DEAD_PACKAGE.has(lower(pkg.status))) continue;
    /*
     * v1 · a pack that has ALREADY BEEN RENEWED raises nothing: the client holds
     * a newer running pack of the same service. Without this, Meera's old pack
     * keeps saying "ends in 2 sessions" the moment after she paid for the next
     * twelve, and the row invites a second sale.
     */
    if (pkg.service && input.packages.some((o) =>
      o.id !== pkg.id && o.clientId === pkg.clientId && o.service === pkg.service
      && !DEAD_PACKAGE.has(lower(o.status)) && !o.pausedAt && o.updatedAt > pkg.updatedAt)) continue;
    /*
     * V30 · a PAUSED pack raises nothing.
     *
     * Not because renewing a paused pack is wrong, but because the row would be
     * a lie that gets louder. `daysLeft` is `endDate` against today, and a pause
     * freezes `endDate` while today keeps moving — so a client three weeks in
     * Kerala slides from "expires in 9 days" to "expires today" and then sits at
     * the top of the queue every morning, about an expiry that is not running,
     * for somebody who cannot train. Resuming pushes `endDate` out by exactly
     * the days the pause cost and the row comes back honest.
     *
     * Deliberately NOT folded into `DEAD_PACKAGE`: a paused pack is very much
     * alive — it is the client's current arrangement and the money on it is
     * still owed — and every other read here should keep counting it.
     */
    if (pkg.pausedAt) continue;
    if (typeof pkg.sessionsRemaining !== 'number') continue;
    const endsAt = parseDay(pkg.endDate ?? undefined);
    // Floor at 0, so an already-lapsed date reads as "today" rather than as a
    // negative number that would sort below a pack expiring next week.
    const daysLeft = endsAt === null ? null : Math.max(0, daysBetween(now, endsAt));
    const band = packBand(pkg.sessionsRemaining, daysLeft);
    if (!band) continue;
    const seen = worst.get(pkg.clientId);
    if (seen === undefined || BAND_VALUE[band] > BAND_VALUE[seen.band]) {
      worst.set(pkg.clientId, {
        band,
        remaining: pkg.sessionsRemaining,
        daysLeft,
        at: pkg.updatedAt,
        packageId: pkg.id,
      });
    }
  }
  for (const [clientId, { band, remaining, daysLeft, at, packageId }] of worst) {
    const client = byId.get(clientId);
    if (!client) continue;
    /*
     * The sentence follows the BAND, not the data. A pack in `pack-expiring`
     * landed there because of its date, so it says the date; one in
     * `pack-ending` landed there because of its sessions, so it says those. The
     * alternative — saying both — is a row that states two numbers and leaves
     * the trainer to work out which one put it in front of them.
     */
    const line =
      band === 'pack-expiring' && daysLeft !== null
        ? packExpiryLine(daysLeft, WEEKDAYS_LONG[isoWeekday(now + daysLeft * DAY_MS)])
        : packLine(remaining);
    items.push({
      key: `pack:${clientId}`,
      kind: 'pack',
      band,
      clientId,
      clientName: client.name?.trim() || 'Client',
      line,
      severity: attentionSeverity(band),
      action: 'Renew',
      packageId,
      /*
       * Fewer left is more urgent inside the two session bands; fewer DAYS left
       * is more urgent inside the date band. Same axis, different unit, and the
       * magnitude never crosses a band because `attentionWeight` clamps it.
       */
      weight: attentionWeight(
        band,
        band === 'pack-expiring' && daysLeft !== null
          ? PACK_EXPIRING_DAYS - daysLeft
          : PACK_ENDING - remaining,
      ),
      at,
    });
  }

  /* --- two sessions missed in a row ---
   *
   * `no_show` ONLY, and not the rest of `DEAD_SESSION`. A cancelled session was
   * called off — by either side, with notice — and says nothing about whether the
   * client is drifting; counting it would raise this row for the most considerate
   * clients on the roster. A session still sitting at `scheduled` in the past says
   * nothing either, because nobody has marked it: that is the `unmarked` band's
   * row, and it is a fact about the trainer.
   *
   * So the streak is computed over SETTLED sessions — done or no-show — newest
   * first, counting no-shows until a delivered one stops it. Two delivered
   * sessions with a no-show between them is not a streak, and a client who missed
   * two and then came back is not either. */
  const settledPast = new Map<string, DeckScheduled[]>();
  for (const s of input.sessions) {
    if (s.scheduledAt >= now) continue;
    const status = lower(s.status);
    if (!DONE_SESSION.has(status) && status !== 'no_show') continue;
    const list = settledPast.get(s.clientId);
    if (list) list.push(s);
    else settledPast.set(s.clientId, [s]);
  }
  /*
   * The server's streak wins when the roster carries it (v1, L3): it is counted
   * over every settled session, so a client whose last two no-shows fell before
   * the window is still raised. The window is then used only to DATE the row.
   * Without it (an older wire), the streak is walked from the window as before.
   */
  const serverStreak = input.clients.some((c) => c.missedStreak !== undefined);
  const missedClients = serverStreak
    ? input.clients.filter((c) => (c.missedStreak ?? 0) >= MISSED_STREAK).map((c) => c.id)
    : [...settledPast.keys()];
  const windowStart = input.sessions.reduce((min, s) => Math.min(min, s.scheduledAt), now);
  for (const clientId of missedClients) {
    const client = byId.get(clientId);
    if (!client) continue;
    const list = settledPast.get(clientId) ?? [];
    list.sort((a, b) => b.scheduledAt - a.scheduledAt);
    let streak = 0;
    if (serverStreak) {
      streak = client.missedStreak ?? 0;
    } else {
      for (const s of list) {
        if (lower(s.status) !== 'no_show') break;
        streak += 1;
      }
    }
    if (streak < MISSED_STREAK) continue;
    // The newest absence in the window; a streak entirely older than the window
    // is dated from the window's start — "at least this long ago".
    const lastAbsence = list.find((s) => lower(s.status) === 'no_show')?.scheduledAt ?? windowStart;
    items.push({
      key: `missed:${clientId}`,
      kind: 'missed',
      band: 'missed',
      clientId,
      clientName: client.name?.trim() || 'Client',
      line: missedLine(streak),
      severity: attentionSeverity('missed'),
      action: 'Check in',
      // A longer streak is more urgent, and it saturates fast on purpose: four
      // missed in a row and five are the same conversation.
      weight: attentionWeight('missed', streak),
      // The most recent absence, so the row dates from the last time they did not
      // turn up rather than from the first.
      at: lastAbsence,
    });
  }

  /* --- training, and no plan to train to ---
   *
   * Guarded on ENGAGEMENT, exactly as `quiet` is, and for a sharper version of
   * the same reason. Unguarded, this fires on every client the moment they are
   * created — a row that says "you have not finished setting this person up" to a
   * trainer who is halfway through setting them up, on the screen they are least
   * likely to be looking at. So it waits until the client is either paying or
   * booked: a live pack, or a session in the diary.
   *
   * The verb NAVIGATES. There is no request that gives a client a program — one is
   * built exercise by exercise or applied from a template with a per-client
   * schedule that has to be chosen at apply time (V24's ordinal day slots; the
   * count must match or the apply 400s). A row cannot commit that in one click,
   * and one that appeared to would be lying about what it did. */
  const booked = new Set(input.sessions.map((s) => s.clientId));
  const planned = new Set<string>();
  for (const p of input.programs) if (!DEAD_PROGRAM.has(lower(p.status))) planned.add(p.clientId);
  const packed = new Set<string>();
  for (const pkg of input.packages) if (!DEAD_PACKAGE.has(lower(pkg.status))) packed.add(pkg.clientId);

  for (const client of input.clients) {
    if (lower(client.status) !== 'active') continue;
    if (planned.has(client.id)) continue;
    if (!packed.has(client.id) && !booked.has(client.id)) continue;
    // The soonest thing on their diary dates the row; failing that, today. It is
    // "since when has this person been training without a plan", and the first
    // booking is the closest thing on this wire to an answer.
    const firstBooking = input.sessions
      .filter((s) => s.clientId === client.id)
      .reduce<number | null>((min, s) => (min === null ? s.scheduledAt : Math.min(min, s.scheduledAt)), null);
    items.push({
      key: `no-program:${client.id}`,
      kind: 'no-program',
      band: 'no-program',
      clientId: client.id,
      clientName: client.name?.trim() || 'Client',
      line: noProgramLine(),
      severity: attentionSeverity('no-program'),
      action: 'Assign',
      href: `/clients/${client.id}/programs`,
      // Nothing to order by inside the band — every row here is the same fact
      // with a different name on it, so the name breaks the tie, which is what
      // the sort already does.
      weight: attentionWeight('no-program'),
      at: firstBooking ?? now,
    });
  }

  /* --- an assessment due, and the client is not in today ---
   *
   * When they ARE in today the hero card carries an *Assessment due* chip on the
   * very session the tape comes out in (MUST-21), so a row as well would say it
   * twice. Only ACTIVE clients: a paused or archived client is not somebody to
   * measure. The verb navigates to the take screen, and there is no dismissal —
   * see the band's note. */
  const inToday = new Set(
    input.sessions
      .filter((s) => s.scheduledAt >= startOfDay(now) && s.scheduledAt < startOfDay(now) + DAY_MS)
      .filter((s) => !DEAD_SESSION.has(lower(s.status)))
      .map((s) => s.clientId),
  );
  const activeById = new Map(input.clients.map((c) => [c.id, c]));
  for (const a of input.assessments ?? []) {
    const client = activeById.get(a.clientId);
    if (!client || lower(client.status) !== 'active' || inToday.has(a.clientId)) continue;
    const dueAt = new Date(`${a.dueOn}T00:00:00`).getTime();
    const daysLate = Math.max(0, Math.round((startOfDay(now) - dueAt) / DAY_MS));
    items.push({
      key: `assess:${a.id}`,
      kind: 'assess',
      band: 'assessment-due',
      clientId: a.clientId,
      clientName: client.name?.trim() || 'Client',
      line: assessmentLine(a.name, daysLate),
      severity: attentionSeverity('assessment-due'),
      action: 'Take',
      href: `/clients/assessments/${a.id}/take?from=${encodeURIComponent(a.clientId)}`,
      // The longer it has been owed, the nearer the top of its band.
      weight: attentionWeight('assessment-due', daysLate),
      at: dueAt,
    });
  }

  /* --- yesterday's sessions nobody marked ---
   *
   * A past booking still sitting at `scheduled`: nobody said whether it happened.
   * It is not free housekeeping — `POST /v1/sessions/{id}/done` is what decrements
   * the pack — so an unmarked session is a pack that is quietly one session wrong,
   * and every other pack figure on this screen is wrong with it.
   *
   * ── THE WINDOW IS A WEEK, AND THE LINE NAMES THE DAY ────────────────────────
   *
   * The brief says "sessions from yesterday", and `DeckWeek.unmarked`'s own
   * docstring is the reason this reads back further: eleven of them piled up over
   * a week on real data. A row that only ever looks at yesterday clears one day
   * of a backlog and leaves the rest to be found by nobody. A week is the
   * trainer's own rhythm and it is where this stops — past that the pack figure
   * has already been wrong long enough that fixing it is a money-book job, not a
   * one-click row.
   *
   * So the line names the OLDEST day rather than saying "yesterday", because on
   * every Monday of the year "yesterday" would be a lie about a Sunday. */
  const unmarkedFrom = startOfDay(now) - 7 * DAY_MS;
  const yesterday = startOfDay(now) - DAY_MS;
  const unmarkedByClient = new Map<string, DeckScheduled[]>();
  for (const s of input.sessions) {
    if (s.scheduledAt >= startOfDay(now) || s.scheduledAt < unmarkedFrom) continue;
    const status = lower(s.status);
    if (DONE_SESSION.has(status) || DEAD_SESSION.has(status)) continue;
    const list = unmarkedByClient.get(s.clientId);
    if (list) list.push(s);
    else unmarkedByClient.set(s.clientId, [s]);
  }
  for (const [clientId, list] of unmarkedByClient) {
    const client = byId.get(clientId);
    if (!client) continue;
    list.sort((a, b) => a.scheduledAt - b.scheduledAt);
    const oldest = list[0].scheduledAt;
    const label =
      startOfDay(oldest) === yesterday ? null : WEEKDAYS_LONG[isoWeekday(oldest)];
    items.push({
      key: `unmarked:${clientId}`,
      kind: 'unmarked',
      band: 'unmarked',
      clientId,
      clientName: client.name?.trim() || 'Client',
      line: unmarkedLine(list.length, label),
      severity: attentionSeverity('unmarked'),
      action: 'Mark',
      // Newest first inside the day, because `POST /v1/sessions/{id}/done`
      // decrements the pack once per call and the order it is called in is the
      // order the pack was consumed in.
      sessionIds: list.map((s) => s.id),
      // Age, not count. Two from this morning are less wrong than one from last
      // Tuesday — the same magnitude `log-open` uses, for the same reason.
      weight: attentionWeight('unmarked', Math.max(0, daysBetween(oldest, now))),
      at: oldest,
    });
  }

  /* --- something worth saying well done about ---
   *
   * Every hundredth delivered session, and only while it is still recent. See
   * `MILESTONE_EVERY` for the two thirds of this trigger that are NOT built —
   * a birthday has no column in this schema and a weight milestone is not on this
   * screen's wire — and `MILESTONE_FRESH_DAYS` for why a window is not optional:
   * the count never goes back down, so without one this row could only ever be
   * cleared by sending the message. */
  const deliveredByClient = new Map<string, { count: number; newest: number }>();
  for (const w of input.workouts) {
    const at = parseDay(w.sessionDate) ?? w.createdAt;
    const seen = deliveredByClient.get(w.clientId);
    if (seen) {
      seen.count += 1;
      seen.newest = Math.max(seen.newest, at);
    } else {
      deliveredByClient.set(w.clientId, { count: 1, newest: at });
    }
  }
  // v1: the server counts every delivered session, not just the fetched window.
  for (const c of input.clients) {
    if (c.sessionsDone === undefined) continue;
    if (c.sessionsDone > 0 && c.lastDoneAt) {
      deliveredByClient.set(c.id, { count: c.sessionsDone, newest: c.lastDoneAt });
    } else {
      deliveredByClient.delete(c.id);
    }
  }
  for (const [clientId, { count, newest }] of deliveredByClient) {
    if (count === 0 || count % MILESTONE_EVERY !== 0) continue;
    if (daysBetween(newest, now) > MILESTONE_FRESH_DAYS) continue;
    const client = byId.get(clientId);
    if (!client) continue;
    items.push({
      key: `milestone:${clientId}`,
      kind: 'milestone',
      band: 'milestone',
      clientId,
      clientName: client.name?.trim() || 'Client',
      line: milestoneLine(count),
      severity: attentionSeverity('milestone'),
      action: 'Wish',
      // A bigger milestone outranks a smaller one on the same morning, which is
      // a tie two clients will essentially never reach — and the alternative is
      // an arbitrary one.
      weight: attentionWeight('milestone', count / MILESTONE_EVERY),
      at: newest,
    });
  }

  // --- a log nobody closed ---
  for (const [clientId, logs] of staleOpenLogs(input, now)) {
    const client = byId.get(clientId);
    if (!client) continue;
    const days = Math.max(0, daysBetween(logs[0].at, now));
    items.push({
      key: `log:${clientId}`,
      kind: 'log',
      band: 'log-open',
      clientId,
      clientName: client.name?.trim() || 'Client',
      line: logLine(logs.length, days),
      severity: attentionSeverity('log-open'),
      // Instant, and the only verb here that writes nothing anybody reads —
      // see `closeLogs` in actions.ts for why it is not held.
      action: 'Close',
      // Age orders them inside the band, the same magnitude `quiet` uses. The
      // count deliberately does not: two logs from this morning are less overdue
      // than one from last week, and this band is about what got forgotten.
      weight: attentionWeight('log-open', days),
      at: logs[0].at,
    });
  }

  return rankAttention(items, input.nudges ?? [], now);
}

/**
 * The kinds whose verb hands a message to a client — and therefore the only
 * kinds a recent nudge can quieten.
 *
 * `unmarked`, `no-program` and `log` are deliberately absent. Their verbs are
 * *Mark*, *Assign* and *Close*: the trainer's own housekeeping, which nobody
 * outside this account ever finds out about. Messaging Meera on Monday does not
 * mark their Tuesday session done, so demoting the row that says so would be the
 * cooldown reaching into work it has nothing to do with.
 *
 * `milestone` IS here. Its verb is *Wish*, which sends — and a well-done landing
 * the morning after a payment chase is the one pairing this rule most obviously
 * exists to space out.
 */
const MESSAGE_KINDS = new Set<AttentionKind>([
  'pack',
  'overdue',
  'missed',
  'quiet',
  'milestone',
]);

/**
 * Rank the queue, and push anybody already contacted this week to the back.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A TIER ABOVE THE WEIGHT, NOT A CHANGE TO IT
 *
 * The same shape `lib/clients/roster.ts` uses for its own ordering, and for the
 * same reason: every phrasing, severity and within-band ranking is still
 * `attentionWeight`'s, so a row is worded and coloured identically whether it is
 * at the top of the queue or behind the disclosure. What changed is only which
 * side of `QUEUE_CAP` it falls on.
 *
 * Contacted rows sort last **regardless of band**, which is the strong version of
 * the rule and the one the brief asks for: *"so the Today screen doesn't re-nag
 * about a client the trainer contacted yesterday."* A ₹9,000 debt on somebody
 * reminded on Monday genuinely is less actionable this morning than a ₹3,000 one
 * on somebody who has heard nothing — not because it matters less, but because
 * the next useful thing a trainer can do about it is wait.
 *
 * Ties inside the contacted group break on WHO WAS CONTACTED LONGEST AGO, so the
 * first row to come back into the queue as the week turns is the one whose
 * silence has run longest.
 */
function rankAttention(
  items: AttentionItem[],
  nudges: DeckNudge[],
  now: number,
): AttentionItem[] {
  const lastByClient = new Map<string, number>();
  for (const n of nudges) {
    const seen = lastByClient.get(n.clientId);
    if (seen === undefined || n.sentAt > seen) lastByClient.set(n.clientId, n.sentAt);
  }

  const stamped = items.map((item) => {
    if (!MESSAGE_KINDS.has(item.kind)) return item;
    const at = lastByClient.get(item.clientId);
    if (at === undefined || now - at >= COOLDOWN_DAYS * DAY_MS) return item;
    return { ...item, contactedAt: at };
  });

  return stamped.sort((a, b) => {
    const ac = a.contactedAt !== undefined ? 1 : 0;
    const bc = b.contactedAt !== undefined ? 1 : 0;
    if (ac !== bc) return ac - bc;
    if (ac === 1) {
      // Both contacted: oldest contact first, so the queue refills in the order
      // the cooldowns lapse.
      const diff = (a.contactedAt ?? 0) - (b.contactedAt ?? 0);
      if (diff !== 0) return diff;
    }
    return b.weight - a.weight || a.clientName.localeCompare(b.clientName);
  });
}

/**
 * A log nobody closed — the rule, in one place, because two callers need it.
 *
 * `buildAttention` needs it to raise the row; `getToday` needs it to hand the
 * queue the ids that row's verb will close. Recomputing it in `api.ts` would be a
 * second opinion about which logs are stale, and the two could disagree — a row
 * offering to close nothing, or a Close that reached a log the row never showed.
 *
 * ── TWO CLAUSES, AND NEITHER ONE IS ENOUGH ───────────────────────────────────
 *
 * **A · the session is marked done.** A done session cannot still be in progress,
 * so its log is stale the instant the trainer marks it — no grace period, because
 * `buildRunning` already refuses to call it running for exactly this reason
 * (`s.live && !s.done`). This is the clause that fires on the common case, and it
 * is the one that found the bug: a finished session whose log stayed open read as
 * *running* in the ribbon's footing while the hero said the day was closed.
 *
 * **B · the log is dated before today.** Clause A can only see the sessions
 * `api.ts` fetched, which is Monday through tomorrow — a done session from three
 * weeks ago is not in that window and never will be, because widening it is the
 * cost this screen is arranged to avoid. So age alone closes the gap, and it
 * catches the case clause A structurally cannot: a log with no scheduled session
 * behind it at all, which is what an ad-hoc session leaves behind.
 *
 * A session genuinely under way fails both — dated today, status `scheduled` —
 * which is what keeps the hero's live log out of the queue. That is the one
 * property of this function worth testing, and it is why the clauses are written
 * as an OR of two positives rather than a duration with an exception.
 */
export interface StaleLog {
  workoutId: string;
  clientId: string;
  /** When it should have been closed. Dated day, or the log's own creation. */
  at: number;
}

export function staleOpenLogs(input: DeckInput, now: number): Map<string, StaleLog[]> {
  const doneSessions = new Set(
    input.sessions.filter((s) => DONE_SESSION.has(lower(s.status))).map((s) => s.id),
  );
  const dayStart = startOfDay(now);
  const out = new Map<string, StaleLog[]>();

  for (const w of input.workouts) {
    if (w.endedAt) continue;
    const dated = parseDay(w.sessionDate);
    const byStatus = w.scheduledSessionId !== undefined && doneSessions.has(w.scheduledSessionId);
    const byAge = dated !== null && dated < dayStart;
    if (!byStatus && !byAge) continue;

    const entry = out.get(w.clientId);
    const row: StaleLog = { workoutId: w.id, clientId: w.clientId, at: dated ?? w.createdAt };
    if (entry) entry.push(row);
    else out.set(w.clientId, [row]);
  }

  // Oldest first, so the row's age is `[0]` and Close works down the list.
  for (const rows of out.values()) rows.sort((a, b) => a.at - b.at);
  return out;
}

/**
 * Which of today's sessions has an open workout log against it.
 *
 * The pair has to be found together — `buildRunning`'s comment on the phone:
 * "an early session left unmarked would then mask a later one that is genuinely
 * under way." There is no explicit *in progress* status in the schema, and
 * inventing one would mean a session could be left running forever by a phone
 * that died mid-set.
 *
 * The `endedAt` test is what makes the phone's *Later* honest: finishing the log
 * and closing the money are two different facts, and a trainer who finished the
 * log but left the money for tomorrow should not still be told they are
 * mid-session.
 */
function openLogs(input: DeckInput): Map<string, DeckWorkout> {
  const out = new Map<string, DeckWorkout>();
  for (const w of input.workouts) {
    if (!w.scheduledSessionId || w.endedAt) continue;
    const seen = out.get(w.scheduledSessionId);
    if (!seen || w.createdAt > seen.createdAt) out.set(w.scheduledSessionId, w);
  }
  return out;
}

function buildRunning(
  today: DeckSession[],
  logs: Map<string, DeckWorkout>,
  input: DeckInput,
): RunningSession | null {
  const live = today.find((s) => s.live && !s.done && !s.dead);
  if (!live) return null;
  const workout = logs.get(live.id);
  if (!workout) return null;

  const sets = input.setLogs.filter((l) => l.workoutSessionId === workout.id);
  const summed = workout.setsDone === undefined;
  const volume = summed
    ? sets.reduce((sum, l) => sum + (l.loadKg || 0) * (l.reps || 0), 0)
    : workout.volumeKg ?? 0;
  const lastSetAt = summed
    ? sets.reduce<number | undefined>(
      (best, l) => (best === undefined || l.createdAt > best ? l.createdAt : best),
      undefined,
    )
    : workout.lastSetAt ?? undefined;

  return {
    scheduledId: live.id,
    workoutId: workout.id,
    clientId: live.clientId,
    clientName: live.clientName,
    programId: live.programId,
    templateDay: live.templateDay,
    startedAt: workout.createdAt,
    scheduledAt: live.at,
    durationMinutes: live.minutes,
    mode: live.mode,
    detail: live.detail,
    setsLogged: summed ? sets.length : workout.setsDone ?? 0,
    volumeKg: Math.round(volume),
    lastSetAt,
  };
}

/**
 * The month, four ways.
 *
 * `billed`, `collected`, `pending`, `yours` — and `yours` is `billed − cut`, NOT
 * `collected − cut`. That distinction is worth stating because getting it wrong
 * closes: on a real August the money screen's *collected* happened to equal its
 * *floor billing*, so `collected − cut` and `floor − cut` were the same
 * subtraction and the wrong base produced an answer that balanced. It was out by
 * the whole of the month's remote work — ₹18,000 of ₹75,500.
 *
 * `cut` is summed off the rows rather than computed from a percentage, because
 * V11 stamps the gym's share onto each payment at record time: a contract that
 * changes in October must not move September's split.
 */
function buildMoney(input: DeckInput, now: number): DeckMoney {
  // v1: the server's month summary (api-contract R4) — billed is packages sold
  // this month, collected is payments paid this month, pending is owed now.
  const summary = input.moneySummary;
  if (summary && summary.length > 0) {
    const [month, previous] = summary;
    return {
      monthLabel: monthName(now),
      billed: month.billed,
      collected: month.collected,
      pending: month.pending,
      cut: month.gymCut,
      yours: month.yours,
      trendPercent: previous && previous.billed > 0
        ? Math.round(((month.billed - previous.billed) / previous.billed) * 100)
        : null,
      clientsOwing: month.clientsOwing,
    };
  }

  const monthStart = startOfMonth(now);
  const previousStart = startOfMonth(monthStart - 1);

  let billed = 0;
  let collected = 0;
  let pending = 0;
  let cut = 0;
  let previous = 0;
  const owing = new Set<string>();

  for (const p of input.payments) {
    const at = p.createdAt;
    const amount = p.amount || 0;
    const status = lower(p.status);
    if (at >= monthStart) {
      billed += amount;
      cut += p.gymShareAmount ?? 0;
      if (PAID_PAYMENT.has(status)) collected += amount;
      else if (DUE_PAYMENT.has(status)) pending += amount;
    } else if (at >= previousStart) {
      previous += amount;
    }
    // Deliberately outside the month test: a debt from July is still owed today,
    // and "3 clients still owe you" is a fact about now rather than about August.
    if (DUE_PAYMENT.has(status)) owing.add(p.clientId);
  }

  return {
    monthLabel: monthName(now),
    billed,
    collected,
    pending,
    cut,
    yours: Math.max(0, billed - cut),
    trendPercent: previous > 0 ? Math.round(((billed - previous) / previous) * 100) : null,
    clientsOwing: owing.size,
  };
}

/**
 * This week, so far — and "so far" is the whole difference from the phone.
 *
 * The phone's `buildWeek` counts done over everything SCHEDULED for the week,
 * which on a Tuesday morning is a fraction whose denominator is mostly in the
 * future: at 09:12 on the second day it reads as a 33% adherence rate for a week
 * that is going fine. That is survivable on a phone, where the figure is a row of
 * seven bars nobody reads as a percentage. It is not survivable in a card whose
 * headline is a percentage.
 *
 * So the rate here is delivered over what has SETTLED — delivered plus no-shows —
 * and everything else is stated as its own number rather than folded into a
 * denominator. A session that has not started yet is not a session you failed to
 * deliver.
 */
/**
 * The feed, newest first, over `ACTIVITY_DAYS`.
 *
 * A workout row is what was logged; a payment row is what came in. They are built
 * separately and merged on `at` rather than walked together, because "what
 * happened" is one timeline and a trainer reading it does not care which table a
 * fact came out of — the phone's `buildActivity` makes the same call.
 *
 * Only PAID payments. A pending one has not happened yet: it is a debt, it is
 * already in the attention queue as one, and putting it here as an event would
 * report money that has not arrived twice on one screen.
 */
function buildActivity(input: DeckInput, now: number): DeckActivity[] {
  const since = startOfDay(now) - (ACTIVITY_DAYS - 1) * DAY_MS;
  const byId = new Map(input.clients.map((c) => [c.id, c]));
  const out: DeckActivity[] = [];

  const setsByWorkout = new Map<string, DeckSetLog[]>();
  for (const l of input.setLogs) {
    const list = setsByWorkout.get(l.workoutSessionId);
    if (list) list.push(l);
    else setsByWorkout.set(l.workoutSessionId, [l]);
  }
  const sessionsById = new Map(input.sessions.map((s) => [s.id, s]));

  for (const w of input.workouts) {
    const at = w.createdAt;
    if (at < since) continue;
    const client = byId.get(w.clientId);
    if (!client) continue;
    const logs = setsByWorkout.get(w.id) ?? [];
    const setCount = w.setsDone ?? logs.length;
    const volume = Math.round(
      w.volumeKg ?? logs.reduce((sum, l) => sum + (l.loadKg || 0) * (l.reps || 0), 0),
    );
    const label = w.scheduledSessionId
      ? sessionsById.get(w.scheduledSessionId)?.dayLabel?.trim()
      : undefined;
    const { time, meridiem } = clockParts(at);
    out.push({
      key: `workout:${w.id}`,
      at,
      clientId: w.clientId,
      clientName: client.name?.trim() || 'Client',
      // The day's own name when the session had one — "finished Full Body B" is
      // a fact about a plan, and "logged a workout" is all that is left without
      // it. Never a made-up label.
      body: label ? `finished ${label}` : 'logged a workout',
      meta: `${setCount} set${setCount === 1 ? '' : 's'}${
        volume > 0 ? ` · ${volume.toLocaleString('en-IN')} kg` : ''
      } · ${time} ${meridiem}`,
      // An open log is a session still running, which the hero above already
      // says in a card of its own. Here it is the difference between "finished"
      // and "started", and the tag is the only place the row can say which.
      tag: w.endedAt ? undefined : { label: 'Open', tone: 'info' },
    });
  }

  for (const p of input.payments) {
    if (!PAID_PAYMENT.has(lower(p.status))) continue;
    const at = p.paidAt || p.createdAt;
    if (at < since) continue;
    const client = byId.get(p.clientId);
    if (!client) continue;
    const { time, meridiem } = clockParts(at);
    const ref = p.upiReference?.trim();
    out.push({
      key: `payment:${p.id}`,
      at,
      clientId: p.clientId,
      clientName: client.name?.trim() || 'Client',
      body: `paid ${rupees(p.amount || 0)}`,
      meta: [p.method?.trim() || 'Payment', ref ? `ref ${ref}` : null, `${time} ${meridiem}`]
        .filter(Boolean)
        .join(' · '),
      tag: { label: 'Paid', tone: 'ok' },
    });
  }

  return out.sort((a, b) => b.at - a.at);
}

/** Monday first, and both halves of the product draw these seven letters. */
const WEEK_BARS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function buildWeek(sessions: DeckScheduled[], now: number): DeckWeek {
  const weekStart = startOfWeek(now);
  const weekEnd = weekStart + 7 * DAY_MS;

  let scheduled = 0;
  let started = 0;
  let delivered = 0;
  let noShows = 0;
  let unmarked = 0;
  const perDay = new Array(7).fill(0);

  for (const s of sessions) {
    const at = s.scheduledAt;
    if (at < weekStart || at >= weekEnd) continue;
    const status = lower(s.status);
    const cancelled = status === 'cancelled' || status === 'canceled';
    if (cancelled) continue;
    scheduled += 1;
    if (at > now) continue;
    started += 1;
    if (DONE_SESSION.has(status)) {
      delivered += 1;
      // The bar is indexed off the start of the DAY, not off `at − weekStart`:
      // a 23:30 session and a 00:30 one are 60 minutes apart and belong to
      // different bars, and only the day boundary knows that.
      const index = Math.floor((startOfDay(at) - weekStart) / DAY_MS);
      if (index >= 0 && index <= 6) perDay[index] += 1;
    } else if (status === 'no_show') noShows += 1;
    else unmarked += 1;
  }

  const todayIndex = Math.floor((startOfDay(now) - weekStart) / DAY_MS);
  const settled = delivered + noShows;
  return {
    days: WEEK_BARS.map((label, i) => ({ label, value: perDay[i], on: i === todayIndex })),
    scheduled,
    started,
    delivered,
    noShows,
    unmarked,
    stillToCome: scheduled - started,
    percent: settled > 0 ? Math.round((delivered / settled) * 100) : 0,
  };
}

/* --------------------------------------------------------------------- deck */

/**
 * Is this row currently silenced?
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * A DISMISSAL IS NOT A BLINDFOLD, AND THIS IS THE LINE THAT MAKES THAT TRUE
 *
 * Two tests, and the second is the one worth reading twice.
 *
 *   1 · **Is the silence still in force?** A permanent dismissal always is; a
 *       snooze is until its stamp passes. The server already filters expired
 *       snoozes out of the list it returns, and this checks again anyway, because
 *       the browser re-derives the deck on a ticking clock: a snooze that lapses
 *       at 14:00 has to bring its row back at 14:00, not at the next full reload.
 *
 *   2 · **Has the condition got WORSE since?** If it has, the row comes back.
 *       "Pack ends in 2 sessions", dismissed on Monday, must not keep the row
 *       hidden when the pack hits zero on Thursday — that is a different and worse
 *       fact, and the trainer silenced the first one. Comparing the live band
 *       against the band recorded at dismissal time is the whole reason V28 stores
 *       a band at all.
 *
 * Note what a dismissal is keyed on: (client, kind), not the row's `key` and not
 * its band. So silencing a client's money leaves their empty pack alone, and a
 * pack that goes from `pack-ending` to `pack-expiring` — sideways, not worse —
 * stays silent.
 */
export function isSilenced(
  item: AttentionItem,
  dismissals: Map<string, DeckDismissal>,
  now: number,
): boolean {
  const d = dismissals.get(`${item.clientId}:${item.kind}`);
  if (!d) return false;
  if (d.snoozedUntil !== null && d.snoozedUntil <= now) return false;
  const wasAt = BAND_VALUE[d.band as AttentionBand];
  // An unrecognised band means a row silenced by a build that knew a band this
  // one does not. Left silent rather than resurfaced: the trainer said not now,
  // and a rolling deploy is not new information about the client.
  if (wasAt === undefined) return true;
  return BAND_VALUE[item.band] <= wasAt;
}

export function buildDeck(input: DeckInput, now: number): Deck {
  const clientsById = new Map(input.clients.map((c) => [c.id, c]));
  const programsById = new Map(input.programs.map((p) => [p.id, p]));
  const logs = openLogs(input);

  const dayStart = startOfDay(now);
  const dayEnd = dayStart + DAY_MS;

  const toSession = (s: DeckScheduled) =>
    toDeckSession(
      s,
      clientsById.get(s.clientId),
      s.programId ? programsById.get(s.programId) : undefined,
      new Set(logs.keys()),
      now,
    );

  const today = input.sessions
    .filter((s) => s.scheduledAt >= dayStart && s.scheduledAt < dayEnd)
    .map(toSession)
    .filter((s) => !s.dead)
    .sort((a, b) => a.at - b.at);

  const tomorrowRaw = input.sessions
    .filter((s) => s.scheduledAt >= dayEnd && s.scheduledAt < dayEnd + DAY_MS)
    .map(toSession)
    .filter((s) => !s.dead)
    .sort((a, b) => a.at - b.at);

  const running = buildRunning(today, logs, input);

  // The next session is the first one not yet done. It stays "next" for a grace
  // period after its start time — a trainer who is ten minutes late still wants
  // the same card, not the one after it.
  const next =
    running === null
      ? today.find((s) => !s.done && s.at + NEXT_GRACE_MS >= now) ?? null
      : null;

  const paidToday = input.payments
    .filter((p) => PAID_PAYMENT.has(lower(p.status)))
    .filter((p) => {
      const at = p.paidAt || p.createdAt;
      return at >= dayStart && at < dayEnd;
    })
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  // v1: owed money lives on the package (`amountDue`), not on pending payments.
  const pendingTotal = input.packages.some((p) => p.amountDue !== undefined)
    ? input.packages.reduce((sum, p) => sum + (p.amountDue ?? 0), 0)
    : input.payments
      .filter((p) => DUE_PAYMENT.has(lower(p.status)))
      .reduce((sum, p) => sum + (p.amount || 0), 0);

  /*
   * The queue is built whole and then filtered, rather than filtered as it is
   * built. `buildAttention` stays a pure statement of what is true about the
   * roster, and what the trainer has chosen to ignore is applied on top of it —
   * so `attentionSilenced` is a real count and not a subtraction of two numbers
   * that were never both computed.
   */
  const raised = buildAttention(input, now);
  const dismissals = new Map(
    input.dismissals.map((d) => [`${d.clientId}:${d.kind}`, d] as const),
  );
  const attention: AttentionItem[] = [];
  const silenced: AttentionItem[] = [];
  for (const item of raised) {
    if (isSilenced(item, dismissals, now)) {
      // Non-null: `isSilenced` returned true, which it cannot do without a
      // dismissal under this exact key.
      silenced.push({ ...item, dismissalId: dismissals.get(`${item.clientId}:${item.kind}`)!.id });
    } else {
      attention.push(item);
    }
  }

  /*
   * Distinct CLIENTS, not rows. One person whose pack is empty and who also owes
   * ₹6,000 is two jobs and one client at risk, and the figure is about people.
   */
  const atRisk = new Set(
    attention.filter((i) => RISK_BANDS.has(i.band)).map((i) => i.clientId),
  );

  /*
   * The next three, `next` first — and taken from the same predicate `next` uses
   * rather than from a second one. The grace period is what makes them agree: a
   * session ten minutes past its start is still first in this list, so the hero
   * and the cards beside it never disagree about which session is the one in
   * front of the trainer.
   */
  const upNext = running
    ? today.filter((s) => !s.done && s.at > running.scheduledAt).slice(0, 3)
    : today.filter((s) => !s.done && s.at + NEXT_GRACE_MS >= now).slice(0, 3);

  return {
    clientCount: input.clients.length,
    today,
    todayDone: today.filter((s) => s.done).length,
    next,
    upNext,
    nextIn: next ? relativeMinutes(next.at - now) : null,
    running,
    tomorrow: tomorrowRaw[0] ?? null,
    tomorrowSessions: tomorrowRaw,
    tomorrowCount: tomorrowRaw.length,
    tomorrowAt: dayEnd,
    roster: input.clients.map((c) => ({ id: c.id, name: c.name?.trim() || 'Client' })),
    attention,
    silenced,
    clientsAtRisk: atRisk.size,
    collectedToday: paidToday,
    pendingTotal,
    money: buildMoney(input, now),
    week: buildWeek(input.sessions, now),
    activity: buildActivity(input, now),
    firstRun: input.clients.length === 0,
  };
}
