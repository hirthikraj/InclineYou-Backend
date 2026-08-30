import {
  DAY_MS, formatMinute, isoWeekday, minuteOfDay, startOfDay,
} from '@/lib/today/time';
import {
  findGaps, mergeWindows, type Gap, type WorkWindow,
} from '@/lib/today/day';
import type { ScheduleSession } from './session';

/**
 * ONE MINUTE IS ONE PIXEL, AND EVERYTHING ELSE FOLLOWS FROM IT.
 *
 * `--cw-hour: 60px` in webapp.css is not a tuning value — it is the geometry, and
 * its own comment says so: a block's `top` is its start minute minus its
 * segment's, and its `height` is its duration in minutes. So this file computes
 * in MINUTES and nothing here multiplies by a scale factor. A 90-minute session
 * is 90.
 *
 * That identity is also why the responsive pass in `app/styles/app.css` never
 * touches `--cw-hour`. Narrowing a phone changes how much of a day is on screen
 * at once; it must not change what an hour is worth, because the moment it does,
 * two sessions of the same length stop being the same size and the one thing this
 * screen exists to show is gone. The week gets narrower COLUMNS on a phone and
 * scrolls sideways. It never gets a shorter hour.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
 * The design set's §01 is an eight-point audit of a first pass that drew the week
 * as a matrix of 48px hour cells, in which every one of its 102 sessions carried
 * the identical inline style `top:2px;height:42px`. A matrix has one resolution —
 * the hour — and the app has stored `session_duration_minutes` per client since
 * schema V2 and steps its time field by 15 minutes. There are no cells here.
 */

/** Below this, a run of dead time is not worth a seam. See `quietBands`. */
export const BAND_MIN = 120;

/**
 * The window a day is drawn on when there is nothing at all to derive one from —
 * no working hours answered and nothing booked.
 *
 * NOT a default week. `GET /v1/working-hours` deliberately returns `[]` for a
 * trainer who never answered the hours step, on the grounds that inventing
 * 06:00–11:00 "would draw a working window for somebody who never said so, and
 * price a gap inside it at a rate they never set". This is the *viewport* for an
 * empty grid, which is a different thing: no window is hatched and no gap is
 * priced, the day is simply drawn from six to nine so the screen is not blank.
 */
const EMPTY_FROM = 6 * 60;
const EMPTY_TO = 21 * 60;

/** The shortest extent worth drawing, so a single 30-minute session gets air. */
const MIN_EXTENT = 4 * 60;

/* ------------------------------------------------------------------- rows ── */

export interface Segment {
  kind: 'segment';
  from: number;
  to: number;
}

export interface QuietBand {
  kind: 'band';
  from: number;
  to: number;
  /**
   * Non-null when the band cannot be collapsed because something is booked
   * inside it, and names what. The band row is still drawn — it is the only
   * thing on the screen that can say "this looks like dead time and is not".
   */
  heldOpen: string | null;
  /** True while the trainer has expanded it; a segment is drawn as well. */
  open: boolean;
  /**
   * The sub-ranges of a held-open band that actually hold something, merged and
   * rounded out to the hour.
   *
   * FOUND BY RENDERING REAL ROWS. A band is `heldOpen` as soon as ONE session
   * sits anywhere inside it, and the first version answered that by unfolding the
   * whole range — so a trainer working 06:00–11:00 and 17:00–21:00 with a single
   * 10:30 session running ten minutes past eleven got the 11:00–17:00 band
   * expanded in full: **six hours, 360px, of empty hatched track**, on the one
   * row whose entire purpose is to spend no pixels on dead time.
   *
   * So a band that was opened BY ITS CONTENTS unfolds only where its contents
   * are. A band the trainer opened by hand still unfolds completely — they asked
   * for the range, not for the sessions in it.
   */
  held: { from: number; to: number }[];
}

export type GridRow = Segment | QuietBand;

/* ------------------------------------------------------------------ a day ── */

/** One positioned block: where it goes, and which lane it takes in a clash. */
export interface Placed {
  session: ScheduleSession;
  startMinute: number;
  endMinute: number;
  /** 0-based lane, and how many lanes are DRAWN — see `MAX_WEEK_LANES`. */
  lane: number;
  lanes: number;
  /** The other sessions this one overlaps, by name, for the block's label. */
  clashesWith: string[];
  /**
   * Folded into a `Stack` because the column ran out of lanes. Still present in
   * `placed`, because every count, every rupee and every gap on this screen is
   * summed from that list and a session that is not drawn is still booked.
   */
  hidden: boolean;
}

/**
 * The `+N` chip that stands in for the sessions a column had no room to draw.
 *
 * ── WHY A COLUMN CAN RUN OUT OF LANES, WHICH THE FIRST VERSION DENIED ────────
 *
 * `laneStyle` generalised the design's two-lane split to n, and the note above it
 * argued a third lane was the realistic ceiling — "two clients plus a handover,
 * or a double-booked import". MEASURED AGAINST REAL ROWS, that is simply wrong
 * about how this product is used: a floor trainer's 06:00 carries four clients
 * and their 19:00 carries six, every week, on purpose. Those are not clashes to
 * be resolved, they are the business.
 *
 * At six lanes a 156px week column gives each session **20.7px** — under WCAG
 * 2.5.8's 24px floor, and narrower than the four digits of its own start time.
 * The week was drawing 81 blocks of which 150 text nodes were clipped mid-glyph:
 * "06:0", "09:", "V…". Splitting further does not show more, it shows less, and
 * it costs the target size to do it.
 *
 * So the week caps its lanes and says so. Beyond the cap the sessions fold into
 * one chip carrying the count, and the DAY VIEW — one tap away at every width,
 * where a column is three times wider and nothing is capped — is where they are
 * read. That is the standard calendar answer, and it is honest in a way that
 * silently drawing a 20px sliver is not: `+4` is a number a trainer can act on.
 */
export interface Stack {
  startMinute: number;
  endMinute: number;
  lane: number;
  lanes: number;
  sessions: ScheduleSession[];
}

/**
 * Three columns of week, and the arithmetic is the whole argument.
 *
 * A week column is `minmax(124px, 1fr)`, so 124px is the narrowest it is ever
 * drawn. Three lanes there are `(124 - 4 - 4) / 3 = 38.7px`, which clears the
 * 24px target floor with room and still holds a tabular `06:00`. Four would be
 * 28px — over the floor, under the time. Three is where the time survives.
 *
 * The day view passes no cap. Its column is `42fr` of the width, about 470px at
 * 1440 and 340px on a phone once the context lane is dropped, so six lanes are
 * 76px and 55px — both wider than the week's uncapped THREE. Nothing needs to be
 * hidden there, which is exactly what makes it the right place to send a `+N`.
 */
export const MAX_WEEK_LANES = 3;

export interface ScheduleDay {
  /** Index inside the drawn grid — 0…6 for a week, 0…41 for a month. */
  index: number;
  /** Local midnight. */
  at: number;
  /** 0 = Monday … 6 = Sunday, `working_hours.weekday`'s convention. */
  weekday: number;
  dayOfMonth: number;
  isToday: boolean;
  isPast: boolean;
  /** Merged, so two windows meeting at 11:00 do not draw a seam that is not there. */
  windows: { startMinute: number; endMinute: number }[];
  workMinutes: number;
  /** Every live session, drawn or folded. Counts and money sum from here. */
  placed: Placed[];
  /** The `+N` chips standing in for what the column had no lane for. */
  stacks: Stack[];
  gaps: Gap[];
  /** Live sessions only — a cancelled one is not a session this day has. */
  count: number;
  bookedMinutes: number;
  floorMinutes: number;
  remoteMinutes: number;
  hasClash: boolean;
}

export interface ScheduleGrid {
  days: ScheduleDay[];
  /** The minute the grid starts and ends at, rounded out to the hour. */
  fromMinute: number;
  toMinute: number;
  rows: GridRow[];
  /** Sum over the drawn days, for the page header's subtitle. */
  totals: {
    sessions: number;
    booked: number;
    work: number;
    /** Booked over available, as a percentage. Null when no hours are answered. */
    utilisation: number | null;
    clashDays: number;
    gapMinutes: number;
    gapSlots: number;
  };
}

/* ----------------------------------------------------------------- lanes ── */

/**
 * Overlapping sessions side by side, never stacked.
 *
 * §01.4 of the design set is the whole reason this function exists: the matrix
 * drew both halves of a clash at `left:2px;right:2px` in the same cell, so the
 * second painted over the first and **the trainer saw one name**. One
 * `ev--conflict` in a 73 KB file, on a block whose partner was invisible. §04 of
 * the page it replaced had already stated the intent — *"A conflict is spatial.
 * Show it in space."* — and had no space to show it in.
 *
 * Standard interval partitioning: sessions sorted by start, each taking the
 * lowest lane free at its start minute. Then every session in a connected
 * overlap group is told the group's lane COUNT, so two clashing sessions each
 * take half the column rather than the first taking half and the second a third.
 *
 * `endMinute` is exclusive, which is `conflicts.ts`'s own rule and the reason
 * back-to-back is not a clash: a session ending at 08:00 and one starting at
 * 08:00 share a boundary, not a minute.
 */
export function placeDay(
  sessions: ScheduleSession[],
  maxLanes: number = Number.POSITIVE_INFINITY,
): { placed: Placed[]; stacks: Stack[] } {
  const live = sessions
    .filter((s) => !s.dead)
    .map((s) => ({
      session: s,
      startMinute: minuteOfDay(s.at),
      endMinute: minuteOfDay(s.at) + s.minutes,
    }))
    .sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute);

  const laneEnds: number[] = [];
  const lane: number[] = [];

  // Connected overlap groups. A group breaks when a session starts at or after
  // every lane's end — that is the point nothing is running, so nothing after it
  // can overlap anything before it.
  const groups: number[][] = [];
  let group: number[] = [];
  let groupEnd = -1;

  live.forEach((row, i) => {
    if (row.startMinute >= groupEnd) {
      if (group.length) groups.push(group);
      group = [];
      laneEnds.length = 0;
      groupEnd = row.endMinute;
    } else {
      groupEnd = Math.max(groupEnd, row.endMinute);
    }
    group.push(i);

    let l = laneEnds.findIndex((end) => end <= row.startMinute);
    if (l === -1) {
      l = laneEnds.length;
      laneEnds.push(row.endMinute);
    } else {
      laneEnds[l] = row.endMinute;
    }
    lane[i] = l;
  });
  if (group.length) groups.push(group);

  const lanes: number[] = [];
  for (const g of groups) {
    const n = Math.max(1, ...g.map((i) => lane[i] + 1));
    for (const i of g) lanes[i] = n;
  }

  const placed: Placed[] = live.map((row, i) => ({
    ...row,
    lane: lane[i],
    lanes: lanes[i],
    clashesWith:
      lanes[i] > 1
        ? live
            .filter(
              (o, j) =>
                j !== i && o.startMinute < row.endMinute && o.endMinute > row.startMinute,
            )
            .map((o) => o.session.clientName)
        : [],
    hidden: false,
  }));

  /*
   * The cap, applied per GROUP rather than per day: a morning that needs six
   * lanes must not narrow an evening that needs two. Groups are already the unit
   * `lanes` is computed over, so this is the same partition seen once more.
   *
   * The last drawn column is spent on the chip, so a group over the cap shows
   * `maxLanes - 1` sessions and one `+N`. Which sessions survive is decided by
   * lane index, and lane index comes from a start-ordered sweep — so the ones a
   * trainer sees are the ones that begin earliest, and the fold is stable
   * between renders rather than dependent on how the rows arrived.
   */
  const stacks: Stack[] = [];
  if (Number.isFinite(maxLanes) && maxLanes >= 2) {
    for (const g of groups) {
      const need = Math.max(1, ...g.map((i) => lane[i] + 1));
      if (need <= maxLanes) continue;

      const folded = g.filter((i) => lane[i] >= maxLanes - 1);
      if (!folded.length) continue;

      for (const i of g) {
        placed[i].lanes = maxLanes;
        if (lane[i] >= maxLanes - 1) placed[i].hidden = true;
      }
      stacks.push({
        startMinute: Math.min(...folded.map((i) => live[i].startMinute)),
        endMinute: Math.max(...folded.map((i) => live[i].endMinute)),
        lane: maxLanes - 1,
        lanes: maxLanes,
        sessions: folded.map((i) => live[i].session),
      });
    }
  }

  return { placed, stacks };
}

/**
 * The inline geometry for one lane, generalised from the two the design draws.
 *
 * webapp.css ships `.ev--sp1` / `.ev--sp2` and its comment is candid about the
 * limit — *"Two covers every case a one-to-one trainer can produce; the third is
 * a rounding error and gets the same rule."* A third IS producible (two clients
 * plus a batch, or a double-booked import), and "gets the same rule" would paint
 * it on top of one of the other two, which is the defect §01.4 is about.
 *
 * So the split is computed. At n = 2 it reproduces `.ev--sp1` / `.ev--sp2`
 * EXACTLY — `left:2px` / `width:calc(50% - 3px)` and `left:calc(50% + 1px)` —
 * which is checked arithmetic, not a coincidence: the track is `100% - 4px`, the
 * lanes are separated by 2px, so a lane is `(100% - 4px - (n-1)·2px) / n` and at
 * n = 2 that is `50% - 3px`. Nothing about the two-lane case changes.
 */
export function laneStyle(lane: number, lanes: number): React.CSSProperties {
  if (lanes <= 1) return {};
  const w = `calc((100% - ${4 + (lanes - 1) * 2}px) / ${lanes})`;
  return {
    left: lane === 0 ? '2px' : `calc(2px + ${lane} * (${w} + 2px))`,
    right: 'auto',
    width: w,
  };
}

/* ------------------------------------------------------------- the extent ── */

function coveredMinutes(windows: { startMinute: number; endMinute: number }[]): number {
  return windows.reduce((n, w) => n + Math.max(0, w.endMinute - w.startMinute), 0);
}

/**
 * The runs of the day that fall outside EVERY drawn day's working windows.
 *
 * Note *every*: a span is only dead if it is dead on all seven columns. A Tuesday
 * afternoon that one client trains in is not dead time, and collapsing it would
 * hide that client. This is also why the band is not a generic "hide empty hours"
 * — webapp.css says it outright: *"an empty hour inside working hours is the
 * sellable gap this screen exists to price, and collapsing that would hide the
 * money."*
 */
function offRuns(
  days: ScheduleDay[],
  from: number,
  to: number,
): { from: number; to: number }[] {
  const open = new Uint8Array(24 * 60 + 1);
  for (const day of days) {
    for (const w of day.windows) {
      for (let m = Math.max(0, w.startMinute); m < Math.min(24 * 60, w.endMinute); m += 1) {
        open[m] = 1;
      }
    }
  }

  const runs: { from: number; to: number }[] = [];
  let start: number | null = null;
  for (let m = from; m < to; m += 1) {
    if (!open[m]) {
      if (start === null) start = m;
    } else if (start !== null) {
      runs.push({ from: start, to: m });
      start = null;
    }
  }
  if (start !== null) runs.push({ from: start, to });
  return runs.filter((r) => r.to - r.from >= BAND_MIN);
}

/**
 * Segments and bands, in order, top to bottom.
 *
 * A run of dead time with a session inside it is HELD OPEN rather than collapsed,
 * and says why. That is not a nicety: the trainer's own working hours have never
 * constrained the trainer — `WorkingHoursScreen` states that rule on itself, and
 * webapp.css repeats it for the hatch (*"Hatched, never blocked"*) — so a session
 * outside them is an ordinary thing, and a band that swallowed it would be the
 * screen hiding a booking because of a preference the booking was allowed to
 * ignore.
 */
function buildRows(
  days: ScheduleDay[],
  from: number,
  to: number,
  openBands: Set<number>,
): GridRow[] {
  const runs = offRuns(days, from, to);

  const bands: QuietBand[] = runs.map((run) => {
    const inside = days
      .flatMap((d) => d.placed)
      .filter((p) => p.startMinute < run.to && p.endMinute > run.from);

    /*
     * The REASON only. The range is drawn as markup beside it, so the band's two
     * variants share one sentence shape and the half that has to truncate on a
     * narrow screen is the half that can afford to — found by rendering at 390px,
     * where the whole sentence ran off the side of a grid nine hundred pixels
     * wide and the trainer had to scroll sideways to read why a band was open.
     */
    const names = Array.from(new Set(inside.map((p) => p.session.clientName)));
    const heldOpen = names.length
      ? `${names.length === 1 ? names[0] + ' is' : names.length + ' sessions are'} booked in it`
      : null;

    // Merged, hour-aligned, clipped to the band. Hour-aligned because the
    // segment beneath draws hour rulings and a segment starting at 10:47 would
    // put its first ruling 13 minutes down, which is the one thing the gutter
    // must never do.
    const held: { from: number; to: number }[] = [];
    for (const p of inside
      .slice()
      .sort((a, b) => a.startMinute - b.startMinute)) {
      const lo = Math.max(run.from, Math.floor(p.startMinute / 60) * 60);
      const hi = Math.min(run.to, Math.ceil(p.endMinute / 60) * 60);
      if (hi <= lo) continue;
      const last = held[held.length - 1];
      if (last && lo <= last.to) last.to = Math.max(last.to, hi);
      else held.push({ from: lo, to: hi });
    }

    return {
      kind: 'band' as const,
      from: run.from,
      to: run.to,
      heldOpen,
      open: heldOpen !== null || openBands.has(run.from),
      held,
    };
  });

  const rows: GridRow[] = [];
  let cursor = from;
  for (const band of bands) {
    if (band.from > cursor) rows.push({ kind: 'segment', from: cursor, to: band.from });
    rows.push(band);
    /*
     * An open band draws track under its header, so the hours it holds are on the
     * same minute axis as everything else rather than in a list — but only the
     * hours it actually holds. `held` carries the reasoning; the short of it is
     * that a band opened BY a session unfolds around that session, and a band the
     * trainer opened by hand unfolds completely.
     */
    if (openBands.has(band.from)) {
      rows.push({ kind: 'segment', from: band.from, to: band.to });
    } else if (band.open) {
      for (const h of band.held) rows.push({ kind: 'segment', from: h.from, to: h.to });
    }
    cursor = band.to;
  }
  if (cursor < to) rows.push({ kind: 'segment', from: cursor, to });

  return rows;
}

/* ------------------------------------------------------------------ build ── */

export interface GridInput {
  /** The first day drawn, at local midnight. */
  start: number;
  dayCount: number;
  /** Every `working_hours` row, unfiltered — this picks the weekdays it draws. */
  hours: WorkWindow[];
  /** Every session in the fetched window, in any order. */
  sessions: ScheduleSession[];
  now: number;
  /** Which delivery modes are drawn. A hidden mode is hidden everywhere. */
  modes: { floor: boolean; remote: boolean };
  /** Band start minutes the trainer has expanded. */
  openBands?: Set<number>;
  /** A month never needs segments, and computing them over 42 days is waste. */
  withRows?: boolean;
  /**
   * How many lanes a column may draw before the rest fold into a `Stack`.
   * `MAX_WEEK_LANES` for the week; left undefined by the day view, which has the
   * width to draw every lane and is where a `+N` chip sends the trainer.
   */
  maxLanes?: number;
}

export function buildGrid(input: GridInput): ScheduleGrid {
  const { start, dayCount, hours, sessions, now, modes } = input;
  const today = startOfDay(now);

  const visible = sessions.filter((s) => (s.mode === 'remote' ? modes.remote : modes.floor));

  const byDay = new Map<number, ScheduleSession[]>();
  for (const s of visible) {
    const key = startOfDay(s.at);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(s);
    else byDay.set(key, [s]);
  }

  const days: ScheduleDay[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    const at = startOfDay(start + i * DAY_MS);
    const weekday = isoWeekday(at);
    const windows = mergeWindows(hours.filter((w) => w.weekday === weekday));
    const daySessions = byDay.get(at) ?? [];
    const { placed, stacks } = placeDay(daySessions, input.maxLanes);

    const isToday = at === today;
    const isPast = at < today;
    // A gap's `past` flag is a fact about the day as well as the clock: every gap
    // on Monday is behind you on Wednesday, and none of Friday's is.
    const nowMinute = isToday ? minuteOfDay(now) : isPast ? 24 * 60 + 1 : -1;

    let floorMinutes = 0;
    let remoteMinutes = 0;
    for (const p of placed) {
      if (p.session.mode === 'remote') remoteMinutes += p.session.minutes;
      else floorMinutes += p.session.minutes;
    }

    days.push({
      index: i,
      at,
      weekday,
      dayOfMonth: new Date(at).getDate(),
      isToday,
      isPast,
      windows,
      workMinutes: coveredMinutes(windows),
      placed,
      stacks,
      gaps: findGaps(windows, daySessions, nowMinute),
      count: placed.length,
      bookedMinutes: floorMinutes + remoteMinutes,
      floorMinutes,
      remoteMinutes,
      hasClash: placed.some((p) => p.lanes > 1),
    });
  }

  /*
   * THE EXTENT IS DERIVED, NOT HARD-CODED — §01.6.
   *
   * The first pass pinned the gutter at 06:00–19:00, "so a 19:30 remote session
   * with a client in another time zone has nowhere to go". The phone already did
   * better: `DayTimeline.tsx` runs 05:00–23:00 and stretches to the hour when a
   * window falls outside it, because *"a fixed 00:00–24:00 track would spend a
   * third of its pixels on hours no gym is open"*.
   *
   * So: the union of every drawn day's working windows and every drawn session,
   * rounded OUT to the hour. Nothing can be booked off the end of this grid.
   */
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const day of days) {
    for (const w of day.windows) {
      lo = Math.min(lo, w.startMinute);
      hi = Math.max(hi, w.endMinute);
    }
    for (const p of day.placed) {
      lo = Math.min(lo, p.startMinute);
      hi = Math.max(hi, p.endMinute);
    }
  }

  let fromMinute = Number.isFinite(lo) ? Math.floor(lo / 60) * 60 : EMPTY_FROM;
  let toMinute = Number.isFinite(hi) ? Math.ceil(hi / 60) * 60 : EMPTY_TO;
  if (toMinute - fromMinute < MIN_EXTENT) toMinute = fromMinute + MIN_EXTENT;
  fromMinute = Math.max(0, fromMinute);
  toMinute = Math.min(24 * 60, Math.max(toMinute, fromMinute + 60));

  const rows = input.withRows === false
    ? []
    : buildRows(days, fromMinute, toMinute, input.openBands ?? new Set());

  const booked = days.reduce((n, d) => n + d.bookedMinutes, 0);
  const work = days.reduce((n, d) => n + d.workMinutes, 0);
  const gapMinutes = days.reduce((n, d) => n + d.gaps.reduce((m, g) => m + g.minutes, 0), 0);
  const gapSlots = days.reduce((n, d) => n + d.gaps.reduce((m, g) => m + g.slots, 0), 0);

  return {
    days,
    fromMinute,
    toMinute,
    rows,
    totals: {
      sessions: days.reduce((n, d) => n + d.count, 0),
      booked,
      work,
      // Null rather than 0 when no hours are answered: a trainer who never told
      // us when they work is not 0% utilised, and printing that would be the
      // screen inventing the denominator `GET /v1/working-hours` refuses to.
      utilisation: work > 0 ? Math.round((100 * booked) / work) : null,
      clashDays: days.filter((d) => d.hasClash).length,
      gapMinutes,
      gapSlots,
    },
  };
}

/* ------------------------------------------------------------------ ticks ── */

/** The hour rulings inside one segment, and the label each one carries. */
export function ticksFor(seg: Segment): { minute: number; label: string; last: boolean }[] {
  const out: { minute: number; label: string; last: boolean }[] = [];
  for (let m = seg.from - (seg.from % 60) + 60; m <= seg.to; m += 60) {
    out.push({ minute: m, label: formatMinute(m), last: m === seg.to });
  }
  return out;
}

/** `06:00–10:00 · 16:30–20:30`, or the honest absence of an answer. */
export function windowsSentence(windows: { startMinute: number; endMinute: number }[]): string {
  if (!windows.length) return 'No working hours set';
  return windows.map((w) => `${formatMinute(w.startMinute)}–${formatMinute(w.endMinute)}`).join(' · ');
}

/** How many hours a run of minutes is, in the words a band row uses. */
export function hoursWord(minutes: number): string {
  const h = minutes / 60;
  const rounded = Math.round(h * 10) / 10;
  const n = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${n} ${rounded === 1 ? 'hour' : 'hours'}`;
}
