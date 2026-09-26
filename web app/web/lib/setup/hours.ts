/**
 * The working week — frame 5c, and the one step that justifies doing setup on a
 * laptop at all.
 *
 * The phone asks for days and a window and shows a summary line back. A 1440px
 * canvas can show the WEEK ITSELF, at the same one-pixel-per-minute the
 * schedule file draws, so the answer is visible as a shape before it is
 * committed. Everything in this file exists to make that band correct.
 *
 * The model is the phone's: ONE set of windows applied to every day picked, not
 * seven independent days. Per-day differences are real but rare on day one, and
 * seven tracks would promise a per-day model this screen does not have — the
 * full per-day editor is one click from the diary.
 */

import {
  formatMinute as clock,
  formatMinuteRange as clockRange,
  formatHourMark as hourMark,
} from '@/lib/today/time';

/* Re-exported so this file stays the single import for everything the hours
   screens format. The pickers need the machine form for `<input type="time">`;
   see `formatMinuteValue`'s own note on what happens when they don't get it. */
export { formatMinuteValue } from '@/lib/today/time';

/** Minutes in a day. 1440 is a legal window end, so a shift can close at midnight. */
export const MINUTES_IN_DAY = 1440;

export interface HourWindow {
  startMinute: number;
  endMinute: number;
}

/**
 * The band's range, and why it is this and not wider.
 *
 * The content box at 1440px is 1440 − 332 (the rail) − 104 (the pane's padding)
 * = **1004px**, and at one minute per pixel that caps the range at 1004 minutes.
 * The first version of this frame offered 05:00–22:00, which is 1020, and the
 * ruler's last label was scrolled out of sight — `21:00` rendered as `21`. So
 * the assertion is on the arithmetic rather than on the string: change either
 * bound and `RIBBON_MINUTES` has to stay under 1004.
 */
export const RIBBON_START = 5 * 60 + 30; // 05:30
export const RIBBON_END = 21 * 60 + 30; // 21:30
export const RIBBON_MINUTES = RIBBON_END - RIBBON_START; // 960
export const RIBBON_BUDGET = 1440 - 332 - 104; // 1004

/** Monday-first, which is how an Indian gym floor's week is read. */
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday–Saturday, Sunday off — the shape the phone's `HoursScreen` starts from. */
export const DEFAULT_DAYS = [0, 1, 2, 3, 4, 5];

/**
 * The week a brand-new trainer starts with.
 *
 * The same pair as `DEFAULT_WORKING_HOURS` in `app/src/db/diary.ts` and as
 * `backend/scripts/seed-sample-month.sql`, so a trainer who skips this step on
 * one half and looks at the diary on the other sees one week rather than two.
 */
export const DEFAULT_WINDOWS: HourWindow[] = [
  { startMinute: 6 * 60, endMinute: 11 * 60 },
  { startMinute: 17 * 60, endMinute: 21 * 60 },
];

/** A window shorter than this is a slip, not an answer. */
export const MIN_WINDOW_MINUTES = 30;

/** The common shapes, as one click — the same five the phone offers. */
export const WINDOW_PRESETS: { key: string; window: HourWindow }[] = [
  /* The labels were five hard-coded 24-hour strings sitting beside the minutes
     they describe — so they went on reading `17:00 – 21:00` after every other
     clock in the app had moved, and nothing would have caught it. Derived from
     the window now, which is the only copy that cannot drift. */
  { key: 'early', window: { startMinute: 300, endMinute: 540 } },
  { key: 'morning', window: { startMinute: 360, endMinute: 660 } },
  { key: 'midday', window: { startMinute: 660, endMinute: 900 } },
  { key: 'evening', window: { startMinute: 1020, endMinute: 1260 } },
  { key: 'late', window: { startMinute: 1140, endMinute: 1320 } },
];

/**
 * `6:00 AM`, clamped to the day. Re-exported from `lib/today/time` rather than
 * re-derived — the old body was a second copy of the same four lines under a
 * comment promising it matched, and a promise in a comment is how the two
 * halves of a clock drift apart. The clamp is the only thing this file adds.
 */
export function formatMinute(minute: number): string {
  return clock(Math.max(0, Math.min(MINUTES_IN_DAY, Math.round(minute))));
}

export function formatWindow(w: HourWindow): string {
  /* `clockRange` and not two `formatMinute`s joined by a dash: a window that
     starts and ends in the same half of the day says its meridiem once, which
     is what keeps `6:00 – 11:00 AM` the width `06:00 – 11:00` was. */
  return clockRange(
    Math.max(0, Math.min(MINUTES_IN_DAY, w.startMinute)),
    Math.max(0, Math.min(MINUTES_IN_DAY, w.endMinute)),
  );
}

/**
 * Overlapping and touching windows collapsed into the fewest that mean the same
 * thing — the web's copy of `mergeWindows` in `app/src/diary/diary.ts`.
 *
 * It runs before anything is written and before the band is drawn, so what the
 * trainer sees is what the diary will hold. Without it, picking the 06:00–11:00
 * and 11:00–15:00 presets would draw a hairline gap at 11:00 that is not there.
 */
export function mergeWindows(windows: HourWindow[]): HourWindow[] {
  const sorted = windows
    .filter((w) => w.endMinute > w.startMinute)
    .map((w) => ({ startMinute: w.startMinute, endMinute: w.endMinute }))
    .sort((a, b) => a.startMinute - b.startMinute);

  const out: HourWindow[] = [];
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

export function sameWindows(a: HourWindow[], b: HourWindow[]): boolean {
  return (
    a.length === b.length &&
    a.every((w, i) => w.startMinute === b[i].startMinute && w.endMinute === b[i].endMinute)
  );
}

/**
 * One end moves, the other gets out of the way — the same rule as the phone's
 * `editWindow` and as the full per-day editor. Dragging a start past its end
 * pushes the end rather than refusing the edit, because a field that silently
 * rejects a value reads as broken.
 */
export function moveEdge(
  window: HourWindow,
  edge: 'start' | 'end',
  value: number,
): HourWindow {
  if (edge === 'start') {
    const startMinute = Math.max(0, Math.min(value, MINUTES_IN_DAY - MIN_WINDOW_MINUTES));
    return {
      startMinute,
      endMinute: Math.max(window.endMinute, startMinute + MIN_WINDOW_MINUTES),
    };
  }
  const endMinute = Math.min(MINUTES_IN_DAY, Math.max(value, MIN_WINDOW_MINUTES));
  return {
    startMinute: Math.min(window.startMinute, endMinute - MIN_WINDOW_MINUTES),
    endMinute,
  };
}

/** Where the next added window starts: an hour after the latest one ends. */
export function nextWindowAfter(windows: HourWindow[]): HourWindow {
  const latest = windows.reduce((max, w) => Math.max(max, w.endMinute), 0);
  const startMinute = Math.min(
    windows.length > 0 ? latest + 60 : 6 * 60,
    MINUTES_IN_DAY - 2 * 60,
  );
  return { startMinute, endMinute: startMinute + 2 * 60 };
}

/* ─────────────────────────────────────────────────── the band's geometry ── */

export interface RibbonSegment {
  /** Pixels from the band's left edge. One pixel is one minute. */
  left: number;
  width: number;
}

export interface Ribbon {
  /** Working windows, clipped to the band. */
  windows: RibbonSegment[];
  /** Everything else, hatched. */
  off: RibbonSegment[];
  /** One label per window wide enough to hold one, centred in it. */
  labels: { left: number; text: string }[];
  /** Hourly gridlines. `edge` marks one that lands on a window boundary. */
  lines: { left: number; edge: boolean }[];
  /** Ruler labels, every two hours plus both ends. */
  ticks: { left: number; label: string; end?: 'first' | 'last' }[];
}

/**
 * Roughly the width of `06:00 – 10:00` in §22's 11.5px mono, plus the chip's own
 * padding. A window narrower than this gets no label, because a label wider than
 * the block it names reads as belonging to the block beside it.
 */
const LABEL_MIN_WIDTH = 96;

/**
 * Turns the answer into the band.
 *
 * **Each working window carries its own times, centred in it.** That is what
 * makes the band readable without a legend: the ruler underneath gives the scale
 * and the label on the block gives the answer, so a trainer checks a shape and a
 * pair of numbers rather than measuring against ticks. The hatch between them is
 * left unlabelled on purpose — it is the *absence* of an answer, and naming it
 * would make the gap look like a third window.
 */
export function ribbon(windows: HourWindow[]): Ribbon {
  const merged = mergeWindows(windows);
  const clip = (v: number) => Math.max(0, Math.min(RIBBON_MINUTES, v - RIBBON_START));

  const spans = merged
    .map((w) => ({ left: clip(w.startMinute), width: clip(w.endMinute) - clip(w.startMinute), w }))
    .filter((s) => s.width > 0);

  const off: RibbonSegment[] = [];
  const labels: { left: number; text: string }[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.left > cursor) off.push({ left: cursor, width: span.left - cursor });
    if (span.width >= LABEL_MIN_WIDTH) {
      // The window's real times, not the clipped ones: a shift that starts
      // before 05:30 must still say so, or the band would quietly redefine it.
      labels.push({ left: span.left + span.width / 2, text: formatWindow(span.w) });
    }
    cursor = Math.max(cursor, span.left + span.width);
  }
  if (cursor < RIBBON_MINUTES) off.push({ left: cursor, width: RIBBON_MINUTES - cursor });

  const edges = new Set(spans.flatMap((s) => [s.left, s.left + s.width]));
  const lines: { left: number; edge: boolean }[] = [];
  for (let left = 0; left <= RIBBON_MINUTES; left += 60) {
    lines.push({ left, edge: edges.has(left) });
  }

  const ticks: { left: number; label: string; end?: 'first' | 'last' }[] = [];
  for (let left = 0; left <= RIBBON_MINUTES; left += 120) {
    ticks.push({
      left,
      /* The axis form. These ticks are every two hours across a 16-hour band in
         a strip narrower than the schedule's gutter, so `5:30 AM` / `7:30 AM`
         would be seven characters where the hour is the only one that moves. */
      label: hourMark(RIBBON_START + left),
      // Both ends are pinned rather than centred: a centred label at 0 hangs
      // half of itself off the left of the band, and at the right edge the
      // last one is what gets clipped — the exact bug the range was narrowed
      // to fix, so it is fixed twice.
      end: left === 0 ? 'first' : left === RIBBON_MINUTES ? 'last' : undefined,
    });
  }

  return { windows: spans.map(({ left, width }) => ({ left, width })), off, labels, lines, ticks };
}

/** Total working minutes in one day. `8 h a day` on the band's summary line. */
export function minutesPerDay(windows: HourWindow[]): number {
  return mergeWindows(windows).reduce((sum, w) => sum + (w.endMinute - w.startMinute), 0);
}

/** `8 h`, `7 h 30 m`. Hours where it divides, hours and minutes where it does not. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}
