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
 * the same call `computeTrend` makes on the ledger, for the same reason: an
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

  const FLOOR = 22;
  const CEILING = height - FLOOR - 16;

  const heightOf = (v: number) => (v > 0 ? Math.max(3, Math.round((v / max) * CEILING)) : 0);
  const avgOffset = average !== null && average > 0 ? FLOOR + heightOf(average) : null;

  return (
    <div className="chart" style={{ height }}>
      <i className="chart__g" style={{ bottom: FLOOR }} />
      <i className="chart__g" style={{ bottom: FLOOR + CEILING / 2 }} />
      <i className="chart__g" style={{ bottom: FLOOR + CEILING }} />

      {avgOffset !== null && avgOffset < height && (
        <i
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: avgOffset,
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
            height: heightOf(values[i] ?? 0),
            ...(tone === 'quiet' && !m.isCurrent ? { background: 'var(--tx-ink-off)' } : {}),
          }}
          title={title(m, values[i] ?? 0)}
        >
          <b>{(values[i] ?? 0) > 0 ? format(values[i]) : '—'}</b>
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
