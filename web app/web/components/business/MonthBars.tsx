'use client';

import type { ReportMonth } from '@/lib/business/report';

/**
 * TWELVE BARS, WRITTEN DOWN ONCE.
 *
 * Three charts on this tab draw the same shape over the same twelve months, and
 * three copies of the arithmetic is three places for an axis to drift. It is
 * `.chart` from §-the-metric-chart, which webapp.css already argues for: **bars,
 * not a line**, because a monthly total is a bucket rather than a reading, and
 * joining twelve buckets draws a slope nobody measured.
 *
 * ── THE CURRENT MONTH IS DRAWN DIFFERENTLY AND IS NOT IN THE AVERAGE ────────
 *
 * A month in progress beside eleven whole ones reads as a collapse. It takes the
 * accent and a *so far* in its title, and `wholeMonthAverage` leaves it out —
 * the same call `computeTrend` makes on Payments, for the same reason: an
 * average dragged down by the 2nd lies for four weeks.
 *
 * ── ONE THING IT DOES THAT THE TWO OLDER CHARTS DO NOT ──────────────────────
 *
 * The axis label sets `transform:none`. `.chart__x` carries a
 * `translateX(-50%)`, which is correct for the design's own markup — a label
 * positioned at the bar's CENTRE with no width — and wrong the moment a caller
 * gives the label a column width and centres the text inside it, because the box
 * then shifts half a column to the left of the bar it names. `TrendChart` and
 * `GstTab` both do exactly that and are both half a column out. They are not
 * touched here: a pass about this tab does not get to restyle two others, and it
 * is recorded in AGENTS.md instead.
 *
 * -- THE GEOMETRY IS A PROPORTION, SO THE PLOT TAKES THE ROOM IT IS GIVEN -----
 *
 * Every offset used to be a PIXEL derived from `height`, which pinned the plot
 * at 150 however much room the card had. `.rptgrid` is two tracks of unequal
 * natural height, so the revenue chart sat in a card 90-130px shorter than *The
 * year in figures* beside it at every desktop width and the row ended in dead
 * canvas. Stretching the card without this change would only have moved the hole
 * indoors: a 150px plot floating in a 260px body.
 *
 * So `height` is a FLOOR now and the plot is `100%` of whatever it lands in,
 * with every bar, gridline and the average rule stated as a fraction of one
 * `calc(100% - PLOT_INSET)`. Two consequences worth knowing:
 *
 * - a bar's floor is `max(3px, ...)` in CSS rather than `Math.max` in JS,
 *   because the number it is a fraction OF is not known until layout. Same
 *   floor, same reason: a real but tiny month must not render as nothing.
 * - in a parent with no height of its own, `height:100%` resolves to `auto`, and
 *   every bar is absolutely positioned, so the content height is zero and
 *   `minHeight` is what holds the box open. A caller that does not stretch
 *   therefore draws exactly what it drew before.
 *
 * -- AND A MONTH BEFORE THE FIRST ONE ON THE BOOKS IS NOT A ZERO --------------
 *
 * Twelve columns is deliberate: a year is the shortest window that can show a
 * trainer their own seasonality. But a practice six months old spends three
 * quarters of that window on months it did not exist for, and every one of them
 * printed an em-dash in the same ink as a real figure -- 9 of 12 on two of these
 * three charts, measured. An em-dash reads as MISSING, which on a chart is a
 * claim that something failed to load.
 *
 * Months before the first one carrying any data print nothing at all. A zero
 * INSIDE the trading period still prints one, because that zero is a fact the
 * trainer should see. Only the printed LABEL changes: every bar keeps the
 * caller's own `title`, so the exact figure for an empty month is still one
 * hover away and no reader is told less than before. Two emptinesses, told apart -- the rule `LedgerTab`'s own
 * table already follows for "nothing billed" against "nothing matches".
 */
export function MonthBars({
  months,
  values,
  format,
  title,
  height = 150,
  /** Drawn as a dashed rule across the bars. Dashed so it cannot be mistaken
   *  for a thirteenth month or a grid line. */
  average = null,
  tone = 'accent',
}: {
  months: ReportMonth[];
  values: number[];
  format: (value: number) => string;
  /** The `title=` on each bar — the whole sentence, since the printed figure is
   *  short-formed and a hover is where the exact number lives. */
  title: (month: ReportMonth, value: number) => string;
  height?: number;
  average?: number | null;
  tone?: 'accent' | 'quiet';
}) {
  /* A flat year is a chart of zeroes, not a chart of nothing — a divisor of 1
     keeps every bar on the floor instead of dividing by it. */
  const max = Math.max(...values, 1);
  const n = months.length;

  /* 22 for the axis strip, 16 of headroom for the value printed above the
     tallest bar. Everything below is a fraction of what is left. */
  const FLOOR = 22;
  const PLOT = `(100% - ${FLOOR + 16}px)`;

  /** A bar as a share of the plot — `max()` in CSS, because the plot's height
   *  is not known until layout. Zero returns zero: no bar, no floor. */
  const barHeight = (v: number) =>
    v > 0 ? `max(3px, calc(${PLOT} * ${(v / max).toFixed(4)}))` : '0px';
  const above = (frac: number) => `calc(${FLOOR}px + ${PLOT} * ${frac.toFixed(4)})`;

  const avgFrac = average !== null && average > 0 ? Math.min(average / max, 1) : null;

  /* The first month with anything in it. Everything before it is a month this
     practice did not trade in, which is not the same statement as a zero — see
     the docstring. `-1` when the whole year is empty, which correctly makes
     every column pre-history rather than twelve em-dashes on a blank chart. */
  const firstWithData = values.findIndex((v) => v > 0);

  return (
    <div className="chart" style={{ minHeight: height, height: '100%' }}>
      <i className="chart__g" style={{ bottom: FLOOR }} />
      <i className="chart__g" style={{ bottom: above(0.5) }} />
      <i className="chart__g" style={{ bottom: above(1) }} />

      {avgFrac !== null && (
        <i
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: above(avgFrac),
            height: 0,
            borderTop: '1px dashed var(--tx-accent)',
            opacity: 0.55,
          }}
        />
      )}

      {months.map((m, i) => (
        <i
          key={`${m.year}-${m.month}`}
          className="chart__b"
          style={{
            left: `calc(${(i / n) * 100}% + 16px)`,
            width: `calc(${(1 / n) * 100}% - 6px)`,
            bottom: FLOOR,
            height: barHeight(values[i] ?? 0),
            ...(tone === 'quiet' && !m.isCurrent ? { background: 'var(--tx-ink-off)' } : {}),
          }}
          /* The caller's own sentence on every month, including the empty
             ones. A pre-history override was tried and was WRONG on the clients
             chart: its `+2` captions show people joining in months this series
             has no bar for, because the series is "trained at least once" and
             joining is not training. The caller knows which question it asked;
             this component does not. */
          title={title(m, values[i] ?? 0)}
        >
          {/* Nothing before the practice's first recorded month; an em-dash for
              a zero inside it. See the docstring — the two are different facts
              and only one of them is the trainer's to act on. */}
          <b>
            {(values[i] ?? 0) > 0
              ? format(values[i])
              : firstWithData !== -1 && i > firstWithData
                ? '—'
                : ''}
          </b>
        </i>
      ))}

      {months.map((m, i) => (
        <span
          key={`x-${m.year}-${m.month}`}
          className="chart__x"
          style={{
            left: `calc(${(i / n) * 100}% + 16px)`,
            width: `calc(${(1 / n) * 100}% - 6px)`,
            transform: 'none',
            textAlign: 'center',
            ...(m.isCurrent ? { color: 'var(--tx-accent-text)' } : {}),
          }}
        >
          {m.label}
        </span>
      ))}
    </div>
  );
}
