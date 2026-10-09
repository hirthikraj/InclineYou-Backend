import type { ReactNode } from 'react';

/**
 * VolumeBars — a week of work per column, from zero. Catalogue entry `c-vbars`,
 * `.vb`.
 *
 * ── WHY IT IS BARS AT ALL, WHEN `TrendChart` EXISTS ─────────────────────────
 *
 * `TrendChart`'s own opening rule sends anything needing more than a smoothed
 * line somewhere else, and this is the somewhere else. **Volume is a sum**, so
 * a bar from zero tells the truth about it, and §09 forbids a bar chart of
 * anything that is not one. A load is not a sum and never gets this shape —
 * `.seq` writes a top set out as numbers for exactly that reason.
 *
 * A week with nothing in it **keeps its bar**. A gap that closes up is a gap
 * that never happened, and the fortnight a client took off is the single most
 * useful thing on the chart.
 *
 * ── WHY IT IS A COMPONENT NOW ───────────────────────────────────────────────
 *
 * `.vb` was one of the class families living on a screen with no catalogue
 * entry behind it: two hand-written call-sites, one in the product and one in
 * the design frames, and nothing checking either. Promoting it is what let the
 * axis and the per-bar readout be added ONCE — the previous markup printed a
 * figure on the first bar and the current one and left the middle of the chart
 * unreadable, and a second screen drawing volume would have copied that.
 *
 * ── THE ACCESSIBLE READING IS THE SERIES, NOT THE PICTURE ───────────────────
 *
 * `role="img"` with the range, the peak and the latest week in words, the same
 * call `TrendChart` makes. The columns beneath it are decoration once that
 * sentence exists; a reader stepping through seven `<i>` elements learns
 * nothing a sentence did not already say.
 */

export type VolumeWeek = {
  /** `w1`, `w2` — what goes under the column. An index, not a date. */
  label: string;
  value: number;
  /** 0…1 against the tallest week. The caller owns the scale. */
  fraction: number;
  /** This week. One per series, and it takes the accent. */
  current?: boolean;
  /**
   * The day the week starts, said the way a person says it — "18 Aug".
   *
   * Drawn under the figure on hover and nowhere else. The x captions cannot
   * carry it: twenty-six of them in a 780px card is 30px a caption, and a date
   * does not fit in 30px at any size a person would read.
   */
  when?: string;
};

export function VolumeBars({
  weeks,
  /** `kg`, `reps`. Said on the axis' top tick and in the accessible name. */
  unit,
  /**
   * What the series is of — the chart's accessible name. "Volume per week" and
   * not "chart": a picture announced as a picture tells a reader nothing.
   */
  label,
  /** Formats a figure for the axis and the readout. Defaults to `toString`. */
  format = (n: number) => String(n),
  /**
   * How to READ the chart, under it — *a week with nothing in it keeps its
   * bar*. A prop rather than a sibling paragraph at the call-site, because the
   * one instruction this shape needs is the same wherever it is drawn, and a
   * caller writing its own `<p>` writes its own margin with it.
   */
  note,
  /**
   * `sm` — 140px of plot instead of 190.
   *
   * The default is sized for weekly VOLUME, where the figures are five digits
   * and the height IS the resolution. A series of small integers — days
   * trained, sessions kept — does not need it, and the stylesheet's `.vb--sm`
   * entry carries what 190px measured on the progress report: 262px of block
   * to say twelve numbers under five.
   */
  size = 'md',
  className,
}: {
  weeks: VolumeWeek[];
  unit?: string;
  label: string;
  format?: (n: number) => string;
  note?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}) {
  if (weeks.length === 0) return null;

  const peak = weeks.reduce((max, w) => Math.max(max, w.value), 0);
  const latest = weeks[weeks.length - 1];

  /* Three ticks, and the middle one is the arithmetic half rather than the
     median week: the axis describes the BOX, not the data in it, and a
     half-way rule that does not sit at half the peak makes every bar above it
     lie about its own height. `.trend`'s axis makes the same call. */
  const ticks = [
    { at: 0, v: peak },
    { at: 50, v: peak / 2 },
    { at: 100, v: 0 },
  ];

  /* EVERY FIGURE IS WRITTEN ON ITS BAR when there are eight weeks or fewer — they are ~90px
     apart on a desk, and a five-digit figure is 44px. Beyond that, or under 620px (the CSS
     un-pins the middle ones), only the first and last are, and the rest is the hidden table
     below: a figure that only appears under a pointer is unreachable by a keyboard, a screen
     reader and a thumb. */
  const showAll = weeks.length <= 8;
  /* Label every Nth week so the axis never has more than ~12 labels: `w10` is 19px and a
     26-week chart on a phone has 11px columns, which pushed the row 8-78px past its card. The
     LATEST is always labelled. */
  const step = Math.max(1, Math.ceil(weeks.length / 12));

  return (
    <div
      className={['vb', size === 'sm' ? 'vb--sm' : null, showAll ? 'vb--all' : null, className]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className="vb__row"
        role="img"
        aria-label={`${label}: ${weeks.length} week${weeks.length === 1 ? '' : 's'}, peak ${format(
          peak,
        )}${unit ? ` ${unit}` : ''}, latest ${format(latest.value)}${unit ? ` ${unit}` : ''}.`}
      >
        <div className="vb__y" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t.at} style={{ top: `${t.at}%` }}>
              {format(Math.round(t.v))}
            </span>
          ))}
        </div>
        <div className="vb__plot">
          <div className="vb__cols">
            {weeks.map((w, i) => {
              /* THE FIRST AND THE LAST ARE PINNED and the rest appear under
                 the pointer. Two figures is the most a 780px chart holds
                 without the labels colliding — at eight weeks they are 97px
                 apart and a five-digit volume is 44px wide — and those two are
                 the pair the card's own sentence is about.

                 THE LAST, not the current, and the difference is a defect this
                 caught: `current` means *the calendar week containing today*,
                 and a client who last trained a fortnight ago has no current
                 week in the series at all. Pinned on `current`, such a chart
                 printed ONE figure — the first — and the most recent week, the
                 one every sentence around the chart is about, was unlabelled.
                 The accent still goes on `current` alone, because that one is
                 a claim about today and has to stay true. */
              const pinned = i === 0 || i === weeks.length - 1;
              return (
                <i
                  className={[
                    'vb__c',
                    w.current ? 'vb__c--on' : null,
                    pinned ? 'vb__c--pin' : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={w.label}
                  /* `Math.max(1, …)` and not `0`: an empty week's bar is a 2px
                     tick on the baseline, which is what "it kept its bar"
                     means. A zero-height element is a week that vanished. */
                  style={{ height: `${Math.max(1, Math.round(w.fraction * 100))}%` }}
                >
                  <b>
                    {format(w.value)}
                    {w.when ? <em>{w.when}</em> : null}
                  </b>
                </i>
              );
            })}
          </div>
          <div className="vb__x">
            {weeks.map((w, i) => (
              <span key={w.label}>{(weeks.length - 1 - i) % step === 0 ? w.label : ''}</span>
            ))}
          </div>
        </div>
      </div>
      {/* The chart above is one image to a screen reader, so the weeks it is made of are a table
          beside it. Visually hidden, never `display:none` (trap 5). */}
      <table className="vh">
        <caption>{label}, by week</caption>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">{unit ? `Volume (${unit})` : 'Volume'}</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.label}>
              <th scope="row">
                {w.label}
                {w.when ? `, ${w.when}` : ''}
                {w.current ? ', this week' : ''}
              </th>
              <td>{format(w.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {note ? <p className="vb__note">{note}</p> : null}
    </div>
  );
}
