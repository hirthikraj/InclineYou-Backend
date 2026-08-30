'use client';

import type { TrendBar } from '@/lib/money/compute';
import { rupees, rupeesShort } from '@/lib/today/time';

/**
 * THE MONTHLY TREND — six bars, and the restraint is the feature.
 *
 * The brief allows exactly this and says so: "a simple bar chart of the last 6
 * months. Nothing more." The temptation on a money screen is a second series —
 * billed against collected, this year against last — and every one of them turns
 * a chart a trainer reads in a glance into one they have to study. Six bars
 * answer the only question being asked here, which is *better or worse than
 * lately*, and the average line is the answer's yardstick.
 *
 * ── WHY IT LIVES ON THE LEDGER AND NOT IN REPORTS ────────────────────────────
 *
 * *Reports* is a stub, and putting the one chart a trainer wants behind an unbuilt
 * tab is how it stays unread. It also belongs beside the tiles it explains: the
 * three questions at the top of this screen are all about *now*, and a trend is
 * the sentence that tells you whether *now* is normal.
 *
 * ── AND WHY THE CURRENT MONTH IS DRAWN DIFFERENTLY ───────────────────────────
 *
 * The last bar is a month in progress, and a partial month next to five whole
 * ones reads as a collapse. It is drawn in the accent and labelled *so far*, and
 * `computeTrend` keeps it out of the average for the same reason — an average
 * dragged down by the 2nd of the month is a number that lies for four weeks.
 */
export function TrendChart({
  bars,
  best,
  averagePerMonth,
}: {
  bars: TrendBar[];
  best: number;
  averagePerMonth: number;
}) {
  /* A flat book is not a chart of nothing — it is a chart of zeroes, and a
     divisor of 1 keeps every bar at the floor instead of dividing by it. */
  const max = Math.max(best, 1);
  const n = bars.length;

  /* The chart body sits between the axis labels at the bottom and the top of the
     box; these are the same offsets `.chart` uses on the GST tab, so the two
     charts on this screen sit at the same height and read as one family. */
  const FLOOR = 22;
  const HEIGHT = 150;
  const CEILING = HEIGHT - FLOOR - 14;

  const heightOf = (amount: number) =>
    amount > 0 ? Math.max(3, Math.round((amount / max) * CEILING)) : 0;

  const avgOffset = averagePerMonth > 0 ? FLOOR + heightOf(averagePerMonth) : null;

  return (
    <div className="card">
      <div className="card__hd">
        <h2 className="card__t">Last {n} months</h2>
        <span className="tag">Your share, as it landed</span>
        {averagePerMonth > 0 && (
          <span className="card__acts small" style={{ color: 'var(--tx-ink-3)' }}>
            {rupees(averagePerMonth)}/month average
          </span>
        )}
      </div>

      <div className="card__b">
        <div className="chart" style={{ height: HEIGHT }}>
          <i className="chart__g" style={{ bottom: FLOOR }} />
          <i className="chart__g" style={{ bottom: FLOOR + CEILING / 2 }} />
          <i className="chart__g" style={{ bottom: FLOOR + CEILING }} />

          {/* The average, drawn across the bars it is the average of. Dashed so
              it cannot be mistaken for a seventh month or a grid line. */}
          {avgOffset !== null && avgOffset < HEIGHT && (
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

          {bars.map((bar, i) => (
            <i
              key={`${bar.year}-${bar.month}`}
              className="chart__b"
              style={{
                left: `calc(${(i / n) * 100}% + 16px)`,
                width: `calc(${(1 / n) * 100}% - 10px)`,
                bottom: FLOOR,
                height: heightOf(bar.amount),
                ...(bar.isCurrent ? { background: 'var(--tx-accent)' } : {}),
              }}
              title={`${bar.label} ${bar.year}: ${rupees(bar.amount)}${bar.isCurrent ? ' so far' : ''}`}
            >
              {/* The figure over the bar, short-formed. A trainer reading a chart
                  to compare months should not have to hover to get one. */}
              <b>{bar.amount > 0 ? rupeesShort(bar.amount) : '—'}</b>
            </i>
          ))}

          {bars.map((bar, i) => (
            <span
              key={`lbl-${bar.year}-${bar.month}`}
              className="chart__x"
              style={{
                left: `calc(${(i / n) * 100}% + 16px)`,
                width: `calc(${(1 / n) * 100}% - 10px)`,
                textAlign: 'center',
                ...(bar.isCurrent ? { color: 'var(--tx-accent)' } : {}),
              }}
            >
              {bar.label}
            </span>
          ))}
        </div>

        <p className="small" style={{ color: 'var(--tx-ink-3)', marginTop: 12, lineHeight: 1.6 }}>
          Money that <b>arrived</b>, by the month it arrived in — the gym&#8217;s cut already
          taken out. The ledger above counts what was <b>billed</b> in the period you picked,
          which is a different question and can be a different number.
          {bars[n - 1]?.isCurrent && ' The last bar is this month so far, and is not in the average.'}
        </p>
      </div>
    </div>
  );
}
