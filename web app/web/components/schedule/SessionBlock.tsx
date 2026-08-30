'use client';

import { formatMinute, dayLong } from '@/lib/today/time';
import { laneStyle, type Placed } from '@/lib/schedule/grid';
import { Check } from '@/components/shell/Icons';
import { Cross, Remote, WarnTriangle } from './Icons';

/**
 * ONE SESSION. A `<button>`, and that is finding §01.5 of the design set.
 *
 * The file this replaces had 102 session blocks and 392 hour cells, all `<div>` —
 * so <kbd>Tab</kbd> walked past every session on the screen. The component
 * library had already published the contract it was failing: each block a cell
 * whose accessible name is the whole sentence, *"Tuesday 6am, Meera Krishnan,
 * Push A, floor session, done"*.
 *
 * That sentence is built here, in full, on every block. It is long on purpose —
 * a screen reader user cannot see that this button is at the intersection of
 * Tuesday and 06:00, and no amount of `aria-` scaffolding around the grid puts
 * that information into the button itself.
 *
 * ── THE CONTENT LADDER IS A HEIGHT LADDER ────────────────────────────────────
 *
 * A block's duration IS its height, so the four rungs webapp.css ships
 * (`ev--m30` … `ev--m90`) are a function of the room that height buys and nothing
 * else. They are measured in PIXELS rather than minutes, because the hour is no
 * longer worth a fixed sixty of them — see `useCwScale`. At the old scale of 1
 * the two are the same number, which is why the thresholds below are still 45,
 * 60 and 90: this reproduces the shipped behaviour exactly on a 1440×900 screen
 * and only diverges where there is more or less room than that screen had. The library published the ladder — *"a 30-minute session is 23px and
 * drops the plan line"*, *"min legible 23px — below that, time only"* — and
 * nothing could implement it, because in a 48px hour cell every session was 42px
 * whatever its length.
 *
 * The rungs are RANGES here rather than the four exact lengths the design tests,
 * and that is the one place this deviates. `session_duration_minutes` is an
 * integer column: an imported client can hold 40, and a block with a class the
 * stylesheet has no rule for is precisely what §01 exists to catch.
 */

/**
 * Which rung a drawn HEIGHT lands on.
 *
 * ── AND THE BOUNDARIES ARE LINE COUNTS, NOT THE FOUR LENGTHS ────────────────
 *
 * These were 45 / 60 / 90 — the four session lengths the design set tests, read
 * as pixels because an hour was worth sixty of them. That stops working the
 * moment the hour is measured: at a scale of 0.99 a 45-minute session is 44.6px,
 * falls under a boundary written as `< 45`, and every 45-minute block on the
 * screen drops a rung on a viewport one pixel off the reference one. A ladder
 * that flips a whole class of blocks at scale 0.99 is a ladder keyed to the wrong
 * thing.
 *
 * What the rungs actually govern is HOW MANY LINES OF TEXT FIT, so they are
 * derived from the line box: `.ev` is 11.5px at 1.35 = 15.5px a line, and it
 * spends 6–8px on vertical padding.
 *
 *   one line, no plan     ≥ 21px    →  30   time and name share the row
 *   two lines, no plan    ≥ 38px    →  45   31px of text plus the padding
 *   two lines and a plan  ≥ 54px    →  60   three line boxes is 46.5px
 *   and `.ev--m90`'s own 14px foot  →  90
 *
 * MEASURED against the shipped behaviour: at scale 1 the four canonical lengths
 * land on exactly the rungs they did before — 30→30, 45→45, 60→60, 90→90 — so
 * nothing moves on a 1440×900 screen. The boundaries only differ for lengths the
 * old ladder had rounded down: a 40-minute session used to be given one line and
 * genuinely holds two.
 */
function rung(px: number): 30 | 45 | 60 | 90 {
  if (px < 38) return 30;
  if (px < 54) return 45;
  if (px < 70) return 60;
  return 90;
}

export interface BlockProps {
  placed: Placed;
  /** The minute the segment starts at — a block's `top` is measured from it. */
  segFrom: number;
  /** Pixels per minute, from `useCwScale`. The grid's one shared vertical scale. */
  scale: number;
  onOpen: (id: string) => void;
  /** Dimmed while its own ghost is being dragged elsewhere. */
  dim?: boolean;
  /** Ringed for the ten seconds after a move, so the row that changed is findable. */
  just?: boolean;
  /** Set by the roving tab index — exactly one block in the grid is tabbable. */
  tabbable?: boolean;
  /** The column's own midnight. `useGridKeys` groups by it, so it must be the
   *  DAY and not the session's instant — otherwise every block is its own day
   *  and ↑/↓ move nowhere. */
  dayAt: number;
  /**
   * The segment this block is being drawn into, so a session that crosses a
   * segment boundary can be drawn in both halves instead of only the one it
   * starts in.
   *
   * ── FOUND BY RENDERING · THE BAND OPENED ONTO NOTHING ──────────────────────
   *
   * Blocks were filtered by `startMinute` alone, which is right until a quiet
   * band splits the axis underneath one. A 10:30 session running to 11:30 starts
   * in the 06:00–11:00 segment and ends inside the band below it — so it was
   * drawn once, clipped at 11:00, and the 11:00–12:00 segment that the band had
   * been HELD OPEN to reveal was empty. The band's own sentence said "Yamini
   * Rajan is booked in it" directly above a stretch of blank track.
   */
  segTo: number;
}

export function SessionBlock({
  placed, segFrom, segTo, scale, onOpen, dim, just, tabbable, dayAt,
}: BlockProps) {
  const { session: s, startMinute, endMinute, lane, lanes, clashesWith } = placed;

  const clash = lanes > 1;
  const split = lanes > 1;
  const minutes = endMinute - startMinute;

  // What this segment actually shows of it. The block keeps its true duration in
  // every label and every rung; only the drawn box is clipped.
  const top = Math.max(segFrom, startMinute);
  const bottom = Math.min(segTo, endMinute);
  const fromAbove = startMinute < segFrom;
  const runsOn = endMinute > segTo;

  /* The rung follows the block's full duration and not the clipped box, which is
     the rule this file already stated — *"the block keeps its true duration in
     every label and every rung; only the drawn box is clipped"* — now expressed
     in the pixels that duration is actually worth. */
  const drawnPx = minutes * scale;

  const classes = ['ev', `ev--m${rung(drawnPx)}`];
  if (s.mode === 'remote') classes.push('ev--remote');
  if (s.done) classes.push('ev--done');
  if (s.noShow) classes.push('ev--noshow');
  // Three rings, three meanings, and they are ranked rather than mixed: danger is
  // a clash, warn is a session that has run without being marked. `live` never
  // fires on this screen — it is a fact about `workout_session`, which the
  // schedule does not fetch, and `lib/schedule/api.ts` says so at length.
  if (clash) classes.push('ev--conflict');
  else if (s.late) classes.push('ev--late');
  if (split) classes.push('ev--split');
  // Three lanes or more: the block has no room for gutters, and 14px of
  // horizontal padding out of a 38px lane is a third of it. See `.ev--sp3`.
  if (lanes >= 3) classes.push('ev--sp3');
  if (just) classes.push('ev--just');
  // A cut edge is drawn square, so a block continuing past a seam does not look
  // like a block that ends there.
  if (fromAbove) classes.push('ev--from-above');
  if (runsOn) classes.push('ev--runs-on');

  /*
   * The end time is DRAWN as well as implied by the block's bottom edge, on any
   * block tall enough to hold it. The design set's own table says why in one
   * clause: "because an edge is not readable by a screen reader" — and it is
   * barely readable by eye either, on a block whose neighbour starts at the same
   * pixel.
   *
   * A split block loses it, because half a column cannot hold `07:00 – 08:00`.
   * The `aria-label` still carries both, which is the point of building the
   * sentence separately from the type.
   */
  /* Room for `07:00 – 08:00` rather than length: at 48px/hour an hour-long block
     is 48px and holds one line, at 90px/hour a 40-minute one holds two. */
  const wide = drawnPx >= 60 && !split;
  const when = wide
    ? `${formatMinute(startMinute)} – ${formatMinute(endMinute)}`
    : formatMinute(startMinute);

  /*
   * DELIVERY OUTRANKS THE CLASH, AND THE FIRST VERSION HAD IT THE OTHER WAY.
   *
   * FOUND BY RENDERING REAL ROWS. The clash sat above `remote` in this chain, so
   * a remote session that happened to share a minute with a floor one lost its
   * remote glyph to a warning triangle — and floor-against-remote is the single
   * colour axis this whole design set is built on. A trainer looking at Thursday
   * evening, which is five remote check-ins and one floor session at 19:00, saw
   * six triangles and no way to tell which was which.
   *
   * The trade is not close, because the clash is not being dropped — it is said
   * three other times, each somewhere the triangle was not: the danger ring
   * around this block, the bracket in the sticky gutter, and the underline on the
   * day head. Delivery mode was said HERE and nowhere else.
   */
  const glyph = s.done ? (
    <Check size={12} />
  ) : s.noShow ? (
    <Cross size={12} />
  ) : s.mode === 'remote' ? (
    <Remote size={12} />
  ) : clash ? (
    <WarnTriangle size={12} />
  ) : null;

  /*
   * "not marked", not "not started".
   *
   * `late` on this screen means the session's end time has passed and its status
   * is still `scheduled` — which the trainer can verify against the now-line. It
   * does NOT mean nobody opened a log, because that lives in a table this screen
   * deliberately does not fetch. The word has to be true at the resolution the
   * data supports; Today's block says "not started" because Today holds the logs.
   */
  const state = s.done
    ? 'done'
    : s.noShow
      ? 'no-show'
      : s.dead
        ? 'cancelled'
        : s.late
          ? 'not marked'
          : 'booked';

  const label = [
    `${dayLong(s.at)}, ${formatMinute(startMinute)} to ${formatMinute(endMinute)}`,
    `${minutes} minutes`,
    s.clientName,
    s.detail,
    s.mode === 'remote' ? 'remote' : 'floor',
    state,
    clash ? `clashes with ${clashesWith.join(', ')}` : null,
    just ? 'just moved, undo available' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      className={classes.join(' ')}
      aria-label={label}
      // The roving tab index. One block in the whole grid is in the tab sequence
      // and the arrow keys move between them — see `useGridKeys`. A week with
      // twenty-three sessions is twenty-three tab stops otherwise, on a screen a
      // keyboard user reaches by tabbing past the rail's ten destinations.
      tabIndex={tabbable && !fromAbove ? 0 : -1}
      /* The continuation half is not a second entry in the keyboard walk and not
         a second announcement: `useGridKeys` reads `data-block`, and two nodes
         carrying one id would make ↑/↓ stall on the same session twice. */
      data-block={fromAbove ? undefined : s.id}
      data-day={fromAbove ? undefined : dayAt}
      data-start={fromAbove ? undefined : startMinute}
      aria-hidden={fromAbove ? true : undefined}
      /*
       * WHAT THE WIDTH LADDER OWES BACK.
       *
       * At the tight rungs a block draws its time and not its name, and at the
       * bar rung it draws neither — which is honest about the room it has and
       * leaves a sighted mouse user with no way to read the block short of
       * opening it. A screen reader was never affected: `aria-label` above is
       * built from the session and not from what survived the ladder.
       *
       * So the same sentence goes in a `title`. Native, free, and the affordance
       * every calendar already trains for. On every block rather than only the
       * narrow ones, because a tooltip that appears on some blocks and not
       * others is a tooltip a trainer has to discover twice.
       */
      title={`${when} · ${s.clientName}${s.detail ? ` · ${s.detail}` : ''}`}
      style={{
        top: (top - segFrom) * scale,
        height: Math.max(1, (bottom - top) * scale),
        opacity: dim ? 0.4 : undefined,
        ...laneStyle(lane, lanes),
      }}
      onClick={() => onOpen(s.id)}
    >
      <span className="ev__t">{when}</span>
      <span className="ev__n">{s.clientName}</span>
      <span className="ev__p">{s.detail}</span>
      {glyph && <span className="ev__g">{glyph}</span>}
    </button>
  );
}
