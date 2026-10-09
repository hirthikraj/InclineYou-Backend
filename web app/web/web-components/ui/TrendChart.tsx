import type { ReactNode } from 'react';

/**
 * TrendChart — a series, smoothed. Catalogue entry `c-trend`, `.trend`.
 *
 * ── THE COMPONENT SMOOTHS, AND THAT IS THE WHOLE DESIGN ──────────────────────
 *
 * §3 of the client spec: "Show a smoothed trend line, not raw daily readings.
 * Daily bodyweight swings 1–2kg on water alone, and showing that jagged line
 * makes people feel they're failing when they aren't."
 *
 * A component that took a pre-smoothed array would put that rule at every
 * call-site, which is the same mistake `Meter` fixed by taking amounts instead
 * of percentages: the second screen to draw a weight chart would smooth it
 * differently, or not at all, and the rule would have no home. So this takes the
 * RAW readings and it is not possible to make it draw them as a line — the raw
 * series becomes `.trend__b`, a soft band, and the mean is the only stroke in
 * the box.
 *
 * ── AND THE LINE IS `--tx-accent-text`, NOT `--tx-accent` ────────────────────
 *
 * The design frame draws `stroke="var(--tx-accent)"`, which is the stylesheet's
 * opening rule broken: #C6F24E is a fill, and it measures ~1.35:1 on the light
 * canvas. The class handles it; this note is here because the frame is what a
 * reader will copy from.
 *
 * ── WHAT IT IS NOT ───────────────────────────────────────────────────────────
 *
 * Not a charting library and not axes-with-ticks. Three grid lines, a band, a
 * line, a dot on the latest reading, and two labels under it. The trainer half's
 * `.vb` columns and `.spark` bars cover every other shape this product draws;
 * anything needing more than this wants a real chart and a different argument.
 */

/**
 * A centred moving mean, window 3, edges held.
 *
 * Exported because the SENTENCE beside a chart is derived from the same
 * smoothing — "Squat 40kg → 62.5kg" has to agree with where the line starts and
 * ends, and a screen that reads the raw first and last values while the chart
 * reads the smoothed ones prints two different stories about one series.
 *
 * Window 3 and not 7: a monthly reading smoothed over seven points is a
 * half-year lag, and this series is monthly. It is the smallest window that
 * removes a single-reading spike, which is the failure §3 names.
 */
export function smooth(values: number[], window = 3): number[] {
  if (values.length < 3) return [...values];
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(values.length - 1, i + half);
    let sum = 0;
    for (let j = from; j <= to; j += 1) sum += values[j];
    return sum / (to - from + 1);
  });
}

const W = 320;
const H = 130;
const PAD = 10;

export function TrendChart({
  values,
  label,
  from,
  to,
  hidden,
  markIndex,
  size = 'md',
  yAxis = false,
  unit,
  className,
}: {
  /**
   * The raw readings, oldest first. Two is the minimum that makes a line; one
   * renders as the flat case, which is deliberate — a client with one weigh-in
   * should see a chart with their reading in it, not an empty state that reads
   * as "we lost your data".
   */
  values: number[];
  /** What the series is of. The chart's accessible name — a line says nothing. */
  label: string;
  /** The two axis captions. Usually a month at each end. */
  from?: ReactNode;
  to?: ReactNode;
  /**
   * WHICH READING THE DOT MARKS. Defaults to the last.
   *
   * FOUND BY RENDERING, on a bench-press curve that peaked in August and
   * closed on a deload. The card's headline reads *40 kg → 42.5 kg* — the
   * BEST, because `lib/reports/build.ts`'s rule is that "a block often closes
   * on a deload, and a real gain would read as a loss" — while the dot sat on
   * the final, lower point. A mark and a sentence disagreeing about the same
   * series is worse than either alone: the client trusts the picture and
   * concludes the number is wrong.
   *
   * So the caller says which point its own prose is about. Weight keeps the
   * default, because there the latest reading IS the subject.
   *
   * `'peak'` is resolved against the SMOOTHED line rather than the raw
   * readings, and that distinction was also found by rendering: a deadlift
   * whose raw best fell on session 5 while the smoothed line plateaued through
   * session 6 put the mark half-way up a curve that visibly kept rising. A
   * mark on a drawn line has to sit at the top of the line a reader can see —
   * the raw best is a separate and equally true claim, and it belongs in the
   * prose, which is where the caller puts it.
   */
  markIndex?: number | 'last' | 'peak';
  /**
   * The client turned this metric off — §3's "let clients hide the weight metric
   * entirely if they prefer". A distinct state from *no readings*, because only
   * this one has a way back, and the caller supplies the way back as children of
   * its own message rather than this component guessing at a verb.
   */
  hidden?: ReactNode;
  /**
   * How tall the plot is. `md` is the 140px box a twelve-week trend is read in;
   * `sm` is the 78px one a chart gets when it sits BESIDE the figure it
   * qualifies rather than being the figure.
   *
   * A prop and not a `className`, because the height is carried by
   * `--trend-h`, and a caller that wrote that custom property inline would be
   * setting the component's geometry from outside it — the boundary this
   * folder's README draws. The stylesheet's own block already anticipated the
   * two sizes; this is the way to ask for the second one.
   */
  size?: 'sm' | 'md';
  /**
   * THE THREE GRID LINES, LABELLED WITH WHAT THEY ARE.
   *
   * Off by default and that is not timidity: on most of this component's
   * call-sites the numbers are already beside it — the portal's tape cards
   * print the latest reading in the head and the delta under it, and a client
   * reading *am I changing shape* is being asked to read a SHAPE. Three
   * figures down the left of a 78px chart there would be furniture.
   *
   * On by exception, and the exception is a chart somebody reads a VALUE off.
   * The check-in's Measurements panel is one: its whole question is *what did
   * the waist do between March and today*, the reference it was drawn from
   * carries the axis, and without it the only numbers on a 300px plot are the
   * two dates underneath — so the line has a shape and no size.
   *
   * There are exactly three, because the component draws exactly three grid
   * lines: the top of the range, the middle, the bottom. A fourth would need a
   * fourth line, and `TrendChart`'s own opening rule is that anything wanting
   * more than this wants a real chart and a different argument.
   */
  yAxis?: boolean;
  /**
   * `kg`, `cm` — said in the chart's ACCESSIBLE NAME, never drawn on a tick.
   *
   * It was drawn on the topmost one and MEASURED 40px wide against a 34px
   * column, so the one tick carrying it hung 6px left of the two under it —
   * three right-ranged figures with one of them out of line. Widening the
   * column for two letters buys nothing either: the unit is on the headline
   * 30px above the plot and on every row of the record below it, and the
   * reference this panel was drawn from labels its axis with bare numbers.
   *
   * In the accessible name it is doing real work, because there the scale is
   * read as a sentence and *rising from 63.1 to 66.5* has no unit in it.
   */
  unit?: string;
  className?: string;
}) {
  const sizeClass = size === 'sm' ? 'trend--sm' : null;
  if (hidden !== undefined) {
    return (
      <div className={['trend', 'trend--off', sizeClass, className].filter(Boolean).join(' ')}>
        {hidden}
      </div>
    );
  }
  if (values.length === 0) return null;

  const line = smooth(values);
  const all = [...values, ...line];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  /* A flat series has `hi === lo`, and dividing by that span puts every point at
     NaN — which renders as an empty `<svg>`, i.e. exactly the "you are failing"
     blank §3 warns about, on the client whose weight has held steady. A minimum
     span of 1 keeps the arithmetic finite. */
  const span = Math.max(hi - lo, 1);
  const flat = hi - lo < 0.5;

  const x = (i: number) =>
    values.length === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (values.length - 1);
  /* ── A FLAT LINE IS CENTRED, AND THE FLOOR ABOVE DID NOT DO THAT ───────────

     MEASURED. The `span` floor was documented as drawing a flat series "through
     the middle of the box" and it does not: with `hi === lo` the numerator
     `v - lo` is **zero**, so `y` returns `H - PAD` — the BOTTOM — whatever the
     span is floored to. The comment described the intent and the arithmetic
     never delivered it.

     It went unseen because nothing had charted a flat series before. The
     portal's only two callers were weight (which moves) and `buildStrength`,
     which DROPS a lift that has not gained (`if (to <= from) continue`), so the
     one case this branch exists for was unreachable from either. The Exercises
     tab charts every movement including the stalled ones, and a client's
     *Pull-Up · 8 reps for 7 sessions* rendered as a line pinned to the floor of
     an empty box — which reads as *at your minimum*, the opposite of *held
     steady*, on the row §1's never-shame rule most applies to.

     Centring is what the original comment promised and is the only honest
     position: with no variation there is no low and no high to be near. */
  const y = (v: number) =>
    flat ? H / 2 : H - PAD - ((v - lo) / span) * (H - PAD * 2);

  const path = line.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  /* The band is the raw series' envelope: the readings above the smoothed mean
     traced left to right, then the ones below traced back. It is a fill, so the
     lime is allowed, and it is what makes the smoothing visible as smoothing
     rather than as a claim. */
  const upper = values.map((v, i) => `${x(i).toFixed(1)},${Math.min(y(v), y(line[i])).toFixed(1)}`);
  const lower = values
    .map((v, i) => `${x(i).toFixed(1)},${Math.max(y(v), y(line[i])).toFixed(1)}`)
    .reverse();
  const band = `${upper.join(' ')} ${lower.join(' ')}`;

  const first = line[0];
  const last = line[line.length - 1];
  const dir = flat ? 'level' : last > first ? 'rising' : 'falling';

  /* THE DOT IS AN HTML ELEMENT, NOT AN `<circle>` — and this is the other half
     of the `preserveAspectRatio="none"` trade.

     A stretched viewBox scales x and y by different factors: 320 → ~886px is
     2.77x across and 130 → 140px is 1.08x down, so an `r="4"` circle renders
     as a 22 x 8.6 ELLIPSE. It was drawn that way and it looked like a smudge on
     the end of the line. `vector-effect` fixes a STROKE under a transform and
     cannot fix a radius.

     Percentages of the box are exact under any stretch, so the mark is
     positioned as a fraction of the same geometry the path uses and sized in
     px by CSS. It stays a circle at every column width. */
  const markAt =
    markIndex === 'peak'
      ? line.indexOf(Math.max(...line))
      : markIndex === 'last' || markIndex === undefined
        ? values.length - 1
        : Math.min(Math.max(markIndex, 0), values.length - 1);
  const markX = (x(markAt) / W) * 100;
  const markY = (y(line[markAt]) / H) * 100;

  /* The three grid lines are at `PAD`, `H/2` and `H - PAD` of the viewBox, and
     the svg is stretched (`preserveAspectRatio="none"`), so a label sits on its
     line at the same FRACTION of the box however wide the column gets. */
  const ticks = flat
    ? [{ at: 50, v: hi }]
    : [
        { at: (PAD / H) * 100, v: hi },
        { at: 50, v: (hi + lo) / 2 },
        { at: ((H - PAD) / H) * 100, v: lo },
      ];

  const plot = (
    /* `.trend__plot` wraps the svg ALONE, and the mark is positioned inside
       it. The stylesheet carries the measured bug this fixes: with the mark
       resolving against `.trend`, the axis captions were part of its
       containing block and a mid-range point landed 20px below its line.

       WHICH IS ALSO WHY THE Y AXIS IS ITS SIBLING AND NOT ITS PADDING: an
       absolutely positioned child resolves a percentage against its containing
       block's PADDING box, so padding the plot to make room for the labels
       would shift `.trend__p` left by exactly that padding while the svg it
       marks did not move. A flex row leaves the plot's box the svg's box. */
    <div className="trend__plot">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`${label}: ${dir} from ${first.toFixed(1)} to ${last.toFixed(1)}${
          unit ? ` ${unit}` : ''
        }${from && to ? `, ${from} to ${to}` : ''}`}
        preserveAspectRatio="none"
      >
        <g className="trend__g">
          <line x1="0" y1={PAD} x2={W} y2={PAD} />
          <line x1="0" y1={H / 2} x2={W} y2={H / 2} />
          <line x1="0" y1={H - PAD} x2={W} y2={H - PAD} />
        </g>
        {values.length > 2 && <polygon className="trend__b" points={band} />}
        <path className={`trend__l${flat ? ' trend__l--flat' : ''}`} d={path} vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className="trend__p"
        style={{ left: `${markX}%`, top: `${markY}%` }}
        aria-hidden="true"
      />
    </div>
  );

  return (
    <div
      className={['trend', sizeClass, yAxis ? 'trend--y' : null, className]
        .filter(Boolean)
        .join(' ')}
    >
      {yAxis ? (
        <div className="trend__row">
          {/* `aria-hidden`, because the svg's own label already says the
              series in words — *rising from 63.1 to 66.5* is the scale, read
              out, and three more figures after it is the same fact twice. */}
          <div className="trend__y" aria-hidden="true">
            {ticks.map((t) => (
              <span key={t.at} style={{ top: `${t.at}%` }}>
                {tick(t.v)}
              </span>
            ))}
          </div>
          {plot}
        </div>
      ) : (
        plot
      )}
      {(from !== undefined || to !== undefined) && (
        <div className="trend__ax">
          <span>{from}</span>
          <span>{to}</span>
        </div>
      )}
    </div>
  );
}

/**
 * A tick, at one decimal and never two.
 *
 * A grid line's value is a position on an axis, not a reading — `63.13` down
 * the side of a 300px plot is three characters of precision the eye cannot use
 * and the row under the chart already carries exactly. The readings keep every
 * digit they arrived with.
 */
function tick(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
