/**
 * The day itself — the part of Today that has no counterpart on the phone.
 *
 * The phone draws the day as an agenda: sessions size to their content and the
 * empty hours collapse into one bar. That is the right shape for 390px, and
 * `app/src/diary/diary.ts` opens with the finding behind it.
 *
 * A 1144px content column can do the thing the agenda gives up: draw the day
 * TO SCALE. The schedule design's whole redesign was one sentence — **one minute
 * is one pixel** — drawn vertically, seven days across. Today needs the same
 * geometry rotated ninety degrees: a block's `left` is its start minute minus
 * the ribbon's, its `width` is its duration in minutes. No scale factor and no
 * rounding, which is what makes the arithmetic checkable with a ruler.
 *
 * ── THE ONE THING THIS COMPONENT COULD GET SERIOUSLY WRONG ────────────────────
 *
 * It does NOT fold the hours between two shifts. The week grid folds that span
 * to a 30px seam, because across seven days it holds nothing. On ONE day it is
 * the shape of the day — a personal trainer works 06:00–10:00 and 16:30–20:30 —
 * and a day that reads as continuous when it is split in two is the lie. So the
 * hole keeps its full width and gets a label, because 390px of hatch with nothing
 * written on it is a rendering error until it says what it is.
 *
 * ── AND THE REASON WORKING HOURS ARE FETCHED AT ALL ───────────────────────────
 *
 * Without them there is no ground under the blocks, no hole, and — the expensive
 * one — no *gap*. A sellable gap is by definition free time INSIDE a working
 * window; free time outside one is a trainer's evening. `GET /v1/working-hours`
 * was added for this file.
 */

import type { Deck, DeckSession } from './deck';
import {
  DAY_MS,
  formatMinute,
  formatSpan,
  isoWeekday,
  minuteOfDay,
  rupees,
  spanInWords,
  startOfDay,
} from './time';

/* ------------------------------------------------------------- thresholds */

/**
 * `GAP_FOLD_MIN` in `app/src/diary/diary.ts`, to the minute: "below this a gap
 * is just the space between two sessions, not lost revenue." A 30-minute seam
 * between two clients is not a gap; it is the seam.
 */
export const GAP_FOLD_MIN = 60;

/** `DEFAULT_SESSION_MIN` — what a free slot is offered at, and priced at. */
export const DEFAULT_SESSION_MIN = 60;

/**
 * A hole between two shifts narrower than this gets no label. The label is
 * ~230px of text and a label wider than the band it names reads as belonging to
 * the band beside it — the same rule `lib/setup/hours.ts` applies to its window
 * labels, and the same reason.
 */
const HOLE_LABEL_MIN = 150;

/* ----------------------------------------------------------------- windows */

/** One `working_hours` row, as the wire returns it. */
export interface WorkWindow {
  /** 0 = Monday … 6 = Sunday. `working_hours.weekday`, not `Date.getDay()`. */
  weekday: number;
  startMinute: number;
  endMinute: number;
}

/**
 * Overlapping and touching windows collapsed into the fewest that mean the same
 * thing — the same `mergeWindows` as `lib/setup/hours.ts` and the phone's diary.
 *
 * It runs before the ribbon is drawn, so the shape a trainer sees is the shape
 * the diary holds. Without it, two windows meeting at 11:00 draw a hairline seam
 * that is not there, and the gap finder would produce a zero-minute gap in it.
 */
export function mergeWindows(windows: { startMinute: number; endMinute: number }[]) {
  const sorted = windows
    .filter((w) => w.endMinute > w.startMinute)
    .map((w) => ({ startMinute: w.startMinute, endMinute: w.endMinute }))
    .sort((a, b) => a.startMinute - b.startMinute);

  const out: { startMinute: number; endMinute: number }[] = [];
  for (const window of sorted) {
    const last = out[out.length - 1];
    if (last && window.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, window.endMinute);
    } else {
      out.push({ ...window });
    }
  }
  return out;
}

/** Today's windows, merged. `at` is any instant inside the day. */
export function windowsFor(all: WorkWindow[], at: number) {
  const weekday = isoWeekday(at);
  return mergeWindows(all.filter((w) => w.weekday === weekday));
}

/* -------------------------------------------------------------------- gaps */

export interface Gap {
  startMinute: number;
  endMinute: number;
  minutes: number;
  /** How many sellable slots fit — what the gap is worth, in sessions. */
  slots: number;
  /** True once the gap is entirely in the past. Still drawn; see §1c. */
  past: boolean;
}

/**
 * The dead middle, found by subtraction: working hours minus booked sessions.
 *
 * Only the leftovers long enough to sell are returned. The phone's `findGaps`
 * comment is the reason: "a gap you cannot run a session in is not an
 * opportunity, and offering it teaches people to distrust the slots."
 *
 * A DONE session still occupies its slot. That looks like it should not matter —
 * the hour is over either way — but the alternative offers to book a gap where
 * a session already happened.
 */
export function findGaps(
  windows: { startMinute: number; endMinute: number }[],
  sessions: DeckSession[],
  nowMinute: number,
): Gap[] {
  const busy = sessions
    .filter((s) => !s.dead)
    .map((s) => ({ from: minuteOfDay(s.at), to: minuteOfDay(s.at) + s.minutes }))
    .sort((a, b) => a.from - b.from);

  const out: Gap[] = [];

  const push = (from: number, to: number) => {
    const minutes = to - from;
    if (minutes < GAP_FOLD_MIN) return;
    out.push({
      startMinute: from,
      endMinute: to,
      minutes,
      slots: Math.floor(minutes / DEFAULT_SESSION_MIN),
      past: to <= nowMinute,
    });
  };

  for (const window of windows) {
    let cursor = window.startMinute;
    for (const span of busy) {
      if (span.to <= cursor) continue;
      if (span.from >= window.endMinute) break;
      if (span.from > cursor) push(cursor, Math.min(span.from, window.endMinute));
      cursor = Math.max(cursor, span.to);
    }
    if (cursor < window.endMinute) push(cursor, window.endMinute);
  }

  return out;
}

/* ------------------------------------------------------------- the geometry */

export interface Band {
  left: number;
  width: number;
}

export interface DayRibbon {
  /** The ribbon's first and last minute, and its width in pixels — they are equal. */
  fromMinute: number;
  toMinute: number;
  span: number;
  /** Working windows: the ground. */
  windows: Band[];
  /** Everything else, hatched — computed as the complement, so a window that
   *  moves cannot leave a stripe behind. */
  off: Band[];
  /** Hourly gridlines. `edge` marks one landing on a window boundary. */
  lines: { left: number; edge: boolean }[];
  /** Ruler labels: every window edge, plus even hours that are not near one. */
  ticks: { left: number; label: string }[];
  /**
   * The span between two shifts, labelled. Empty on a single-shift day.
   *
   * TWO FIELDS, not one joined string. It was `label`, built here as
   * `"16:00 – 16:30 · between shifts, …"` and then split back apart on ` · ` in
   * the component so the range could be set in bold. A string assembled at one
   * end and re-parsed at the other is a format nobody owns — and this one breaks
   * silently the moment a note contains the separator.
   */
  holes: { left: number; minutes: number; range: string; note: string }[];
  /** Free time inside a window, long enough to sell. */
  gaps: (Gap & Band)[];
  /** Sessions, laid on their side. */
  blocks: (Band & { session: DeckSession })[];
  /** Null when `now` is outside the day — see below. */
  now: { left: number; label: string } | null;
}

/**
 * A tick label is ~34px wide, so an even hour within 34px of a window edge is
 * dropped: labelling both put `16:00` and `16:30` on top of each other, and
 * again at `20:00` / `20:30`.
 */
const TICK_CLEARANCE = 34;

/**
 * The whole day, in `span` pixels.
 *
 * The extent is the first thing that happens to the last: the earlier of the
 * first window and the first session, floored to the hour, to the later of the
 * last window's close and the last session's end, ceilinged to the hour. Floored
 * to the HOUR specifically so the hourly gridlines land on the hour — an extent
 * starting at 06:12 draws a grid nobody can read against a ruler.
 */
export function buildRibbon(
  windows: { startMinute: number; endMinute: number }[],
  sessions: DeckSession[],
  gaps: Gap[],
  nowMinute: number | null,
): DayRibbon {
  const live = sessions.filter((s) => !s.dead);
  const starts = [
    ...windows.map((w) => w.startMinute),
    ...live.map((s) => minuteOfDay(s.at)),
  ];
  const ends = [
    ...windows.map((w) => w.endMinute),
    ...live.map((s) => minuteOfDay(s.at) + s.minutes),
  ];

  // A trainer with no hours answered and no session today still gets a ribbon
  // rather than a zero-width div: 06:00–20:00 is the shape of this market's day
  // and it is drawn entirely hatched, which is the honest picture of a blank one.
  const fromMinute = starts.length > 0 ? Math.floor(Math.min(...starts) / 60) * 60 : 6 * 60;
  const toMinute = ends.length > 0 ? Math.ceil(Math.max(...ends) / 60) * 60 : 20 * 60;
  const span = Math.max(60, toMinute - fromMinute);
  const x = (minute: number) => Math.max(0, Math.min(span, minute - fromMinute));

  const windowBands: Band[] = windows
    .map((w) => ({ left: x(w.startMinute), width: x(w.endMinute) - x(w.startMinute) }))
    .filter((b) => b.width > 0);

  const off: Band[] = [];
  let cursor = 0;
  for (const band of windowBands) {
    if (band.left > cursor) off.push({ left: cursor, width: band.left - cursor });
    cursor = Math.max(cursor, band.left + band.width);
  }
  if (cursor < span) off.push({ left: cursor, width: span - cursor });

  const edgeMinutes = new Set(windows.flatMap((w) => [w.startMinute, w.endMinute]));

  const lines: { left: number; edge: boolean }[] = [];
  for (let m = fromMinute; m <= toMinute; m += 60) {
    lines.push({ left: x(m), edge: edgeMinutes.has(m) });
  }

  // A window edge always gets a label; an even hour gets one only if no edge is
  // already within a label's width of it.
  const edges = [...edgeMinutes].filter((m) => m >= fromMinute && m <= toMinute);
  const tickMinutes = new Set(edges);
  for (let m = fromMinute; m <= toMinute; m += 60) {
    if ((m / 60) % 2 !== 0) continue;
    if (edges.some((e) => Math.abs(m - e) <= TICK_CLEARANCE)) continue;
    tickMinutes.add(m);
  }
  const ticks = [...tickMinutes]
    .sort((a, b) => a - b)
    .map((m) => ({ left: x(m), label: formatMinute(m) }));

  // Between shifts, not merely outside hours. The band before the first window
  // and after the last one is the trainer's own morning and evening and is not
  // labelled; the one BETWEEN two windows is the split shift, and that is the
  // fact a day drawn to scale exists to show.
  const holes: { left: number; minutes: number; range: string; note: string }[] = [];
  for (let i = 1; i < windows.length; i += 1) {
    const from = windows[i - 1].endMinute;
    const to = windows[i].startMinute;
    const minutes = to - from;
    if (minutes < HOLE_LABEL_MIN) continue;
    holes.push({
      left: x(from) + (x(to) - x(from)) / 2,
      minutes,
      range: `${formatMinute(from)} – ${formatMinute(to)}`,
      note: `between shifts, ${spanInWords(minutes)} — not sellable`,
    });
  }

  return {
    fromMinute,
    toMinute,
    span,
    windows: windowBands,
    off,
    lines,
    ticks,
    holes,
    gaps: gaps.map((g) => ({
      ...g,
      left: x(g.startMinute),
      width: x(g.endMinute) - x(g.startMinute),
    })),
    blocks: live.map((s) => ({
      session: s,
      left: x(minuteOfDay(s.at)),
      width: Math.max(24, s.minutes),
    })),
    // ONLY when now is inside the day. At 20:52 on a ribbon that ends at 20:30
    // the marker sat past the end of the track: the line was clipped by the
    // track's overflow and the chip, which lives on the ruler, was not — so a
    // label reading 20:52 floated past the 20:00 tick. A day that is over has no
    // "now" on it, and the hero already says so.
    now:
      nowMinute !== null && nowMinute >= fromMinute && nowMinute <= toMinute
        ? { left: x(nowMinute), label: formatMinute(nowMinute) }
        : null,
  };
}

/* -------------------------------------------------------------- day's money */

/**
 * What a session is worth, and what is left of it.
 *
 * ── WHERE THE RATE COMES FROM, AND WHY IT IS NOT A SETTING ────────────────────
 *
 * `package.amount / package.sessionsTotal` — the price THIS client actually
 * agreed, divided by the sessions they bought. Not the trainer's price list:
 * `packs` is what is currently advertised, and half a roster is on last year's
 * rate. `perSession` in `lib/setup/money.ts` does the same division for the same
 * reason ("computed, never typed — it is the number a client asks about and the
 * number a trainer gets wrong in their head").
 *
 * ── AND WHY THE GYM'S CUT IS FLOOR-ONLY ──────────────────────────────────────
 *
 * A gym takes a share of work done on its floor. A remote check-in run from the
 * trainer's own desk is not on anybody's floor, and the money screen states the
 * arrangement in exactly those terms: "46% of floor · 0% of remote". Applying
 * the percentage to remote work would quietly hand a gym a cut of the sessions
 * it has nothing to do with — and it is the sort of error that is invisible,
 * because the total still looks plausible.
 *
 * A rate we cannot prove is a rate we do not print. A client with no package has
 * no per-session figure, so their session contributes nothing to the day's money
 * and `partial` says so — which is the difference between "you billed ₹3,200
 * today" and "you billed ₹3,200 of what we could price".
 */
export interface DayMoney {
  billed: number;
  /** After the gym's share of the floor work. */
  yours: number;
  cut: number;
  /** How many of the day's sessions could be priced, and how many there are. */
  priced: number;
  total: number;
  partial: boolean;
  /** The rate a gap is priced at: the commonest rate on the day. */
  gapRate: number | null;
}

export interface RateSource {
  /** clientId → per-session rupees, from their newest live package. */
  perSession: Map<string, number>;
  /** `trainer.gymSharePercent`, 0…100. Null means no gym, which is not 0%. */
  gymSharePercent: number | null;
}

export function dayMoney(sessions: DeckSession[], rates: RateSource): DayMoney {
  const share = rates.gymSharePercent != null ? Math.max(0, Math.min(100, rates.gymSharePercent)) : 0;
  const live = sessions.filter((s) => !s.dead);

  let billed = 0;
  let cut = 0;
  let priced = 0;
  const seen = new Map<number, number>();

  for (const s of live) {
    const rate = rates.perSession.get(s.clientId);
    if (rate === undefined || rate <= 0) continue;
    priced += 1;
    billed += rate;
    if (s.mode === 'floor') cut += Math.round((rate * share) / 100);
    seen.set(rate, (seen.get(rate) ?? 0) + 1);
  }

  // The commonest rate on the day, ties broken by the higher one — a gap priced
  // at the lower of two equally common rates understates what the hour is worth,
  // and this figure exists to make an empty hour feel expensive.
  let gapRate: number | null = null;
  let best = 0;
  for (const [rate, count] of seen) {
    if (count > best || (count === best && rate > (gapRate ?? 0))) {
      best = count;
      gapRate = rate;
    }
  }

  return {
    billed,
    cut,
    yours: billed - cut,
    priced,
    total: live.length,
    partial: priced < live.length,
    gapRate,
  };
}

/* ---------------------------------------------------------- the day, in words */

/**
 * The counts under the ribbon: what has happened to the day so far.
 *
 * Counts only. The money that follows them in the card's footing is composed
 * there, beside `DayMoney`, rather than being formatted in here — because money
 * appears twice on this screen at two scopes and **each one carries its scope in
 * its own label**. A helper that returned "3 done · ₹4,100 billed" as one string
 * would be the third place that label is written down.
 */
export function dayFooting(sessions: DeckSession[]): string {
  const live = sessions.filter((s) => !s.dead);
  const done = live.filter((s) => s.done).length;
  /*
   * `done` WINS OVER `live`, AND THAT IS A FIX FOUND BY RENDERING THIS.
   *
   * `s.live` means a workout log is open against the session — it does NOT mean
   * the session is under way. A trainer who marks a session done and never closes
   * its log leaves both flags true on one row, and `toDeckSession` makes only
   * `late` exclusive. So this counted that session twice: on a real Sunday with
   * seven sessions the footing read **1 done · 1 running · 6 unopened** — eight
   * states across seven rows — and `toGo` went to −1, which the guard below
   * silently swallowed rather than showing.
   *
   * Worse than the arithmetic: the hero on the same screen said *The day,
   * closed*, because `buildRunning` already requires `!s.done` for exactly this
   * reason. Two answers to "is anything running" on one screen is the defect this
   * whole module is arranged to avoid, so the count makes the same call the hero
   * does. `DayRibbon`'s block classes already did.
   */
  const running = live.filter((s) => s.live && !s.done).length;
  const late = live.filter((s) => s.late).length;
  // Floored, so a state this function has not thought of can never print a
  // negative count. The parts are exclusive now; the floor is the belt.
  const toGo = Math.max(0, live.length - done - running - late);

  const parts = [`${done} done`];
  if (running) parts.push(`${running} running`);
  if (late) parts.push(`${late} unopened`);
  if (toGo > 0) parts.push(`${toGo} to go`);
  return parts.join(' · ');
}

/** `06:00–10:00 · 16:30–20:30` — the tag in the day card's head. */
export function windowsLabel(windows: { startMinute: number; endMinute: number }[]): string {
  return windows
    .map((w) => `${formatMinute(w.startMinute)}–${formatMinute(w.endMinute)}`)
    .join(' · ');
}

/**
 * The sentence the second hero card is for: is there anything left to sell
 * before the day changes shape?
 *
 * The interesting case is the one the design set opens on. It is 09:12, the
 * running session ends at 09:30, and the morning shift closes at 10:00 — so
 * there are thirty minutes of working time left, which is under the hour a
 * session needs. The honest thing to say is that there is nothing to sell before
 * the evening, and then to name the evening's first sellable hour.
 */
export function sellableNote(
  windows: { startMinute: number; endMinute: number }[],
  gaps: Gap[],
  nowMinute: number,
): { closesAt: number | null; minutesLeft: number; next: Gap | null } {
  const current = windows.find((w) => nowMinute >= w.startMinute && nowMinute < w.endMinute);
  const upcoming = gaps.filter((g) => g.endMinute > nowMinute);
  return {
    closesAt: current?.endMinute ?? null,
    minutesLeft: current ? current.endMinute - nowMinute : 0,
    next: upcoming[0] ?? null,
  };
}

/** `₹800 billed, ₹432 yours` for one sellable hour. Used on the gap's label. */
export function gapWorth(gap: Gap, money: DayMoney, gymSharePercent: number | null): string | null {
  if (money.gapRate === null) return null;
  const billed = gap.slots * money.gapRate;
  const share = gymSharePercent != null ? Math.max(0, Math.min(100, gymSharePercent)) : 0;
  const kept = billed - Math.round((billed * share) / 100);
  return `${rupees(billed)} billed, ${rupees(kept)} yours`;
}

/** Re-exported so components take one import for the day's vocabulary. */
export { formatMinute, formatSpan, minuteOfDay, startOfDay, DAY_MS };
export type { Deck };

/* --------------------------------------------------------------- the clash */

export interface Clash {
  a: string;
  b: string;
  /** The minute the overlap starts. */
  from: number;
  minutes: number;
}

/**
 * The first pair of sessions that overlap, if any.
 *
 * Plain interval overlap with the end EXCLUSIVE — `slotClash` in
 * `app/src/clients/conflicts.ts`, to the character, so that back-to-back sessions
 * are fine on both halves. A 17:00–18:00 followed by an 18:00–19:00 is a trainer's
 * ordinary evening, and an app that called it a conflict would be unusable.
 *
 * The FIRST pair rather than all of them, because this feeds one sentence in the
 * hero's band. A day with three overlaps has a bigger problem than a sentence, and
 * the schedule screen is where it gets looked at.
 *
 * Sessions must already be sorted by start time — `buildDeck` sorts them, and
 * relying on that rather than re-sorting keeps this O(n²) over a handful of rows
 * instead of allocating a copy for a check that usually finds nothing.
 */
export function findClash(sessions: DeckSession[]): Clash | null {
  const live = sessions.filter((s) => !s.dead && !s.done);
  for (let i = 0; i < live.length; i += 1) {
    const a = live[i];
    const aStart = minuteOfDay(a.at);
    const aEnd = aStart + a.minutes;
    for (let j = i + 1; j < live.length; j += 1) {
      const b = live[j];
      const bStart = minuteOfDay(b.at);
      // Sorted, so once a later session starts after this one ends nothing
      // further can overlap it.
      if (bStart >= aEnd) break;
      const bEnd = bStart + b.minutes;
      if (aStart < bEnd && bStart < aEnd) {
        return {
          a: a.clientName,
          b: b.clientName,
          from: Math.max(aStart, bStart),
          minutes: Math.min(aEnd, bEnd) - Math.max(aStart, bStart),
        };
      }
    }
  }
  return null;
}
