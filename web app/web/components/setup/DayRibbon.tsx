import {
  RIBBON_MINUTES,
  formatWindow,
  ribbon,
  type HourWindow,
} from '@/lib/setup/hours';
import { WEEKDAY_SHORT } from '@/lib/setup/hours';

/**
 * The week, at one pixel per minute — §22's `.dr`, and the reason a trainer
 * would do setup on a laptop at all.
 *
 * The phone asks for days and a window and shows a summary line back. A 1440px
 * canvas can show the **shape**, at the same one-pixel-per-minute the schedule
 * file draws, so the answer is visible before it is committed.
 *
 * **One track standing for every chosen day, not seven.** Seven tracks would
 * promise a per-day model this screen does not have — one set of windows applied
 * to every day picked is the whole model, and per-day differences belong to the
 * full editor in the diary.
 *
 * Each working window carries its own times, centred in it, so the band is
 * readable without a legend — the ruler gives the scale, the label gives the
 * answer. The band is a single `role="img"` with the whole week in its label: a
 * screen reader announcing forty absolutely-positioned divs would be reading out
 * a rendering rather than a week.
 */
export function DayRibbon({ days, windows }: { days: number[]; windows: HourWindow[] }) {
  const bands = ribbon(windows);
  const dayNames = days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_SHORT[d])
    .join(', ');
  const spoken = bands.windows.length
    ? `${dayNames}: ${windows.map(formatWindow).join(' and ')}`
    : `${dayNames}: no hours set`;

  return (
    // The band is a fixed 960px because it is a MEASUREMENT, not a layout: one
    // pixel is one minute, so it cannot flex with the window without the scale
    // becoming a lie. A narrow window scrolls it instead — in `.dr__scroll`,
    // which is the band's own scrollport in §22 rather than the inline
    // `overflowX:'auto'` this carried. See the class: the inline version left
    // `overflow-y` computing to `auto` and grew a vertical scrollbar beside a
    // 52px band, and it had no edge shading, so a clipped day read as a whole
    // one.
    <>
    <div className="dr__scroll">
      <div className="dr" style={{ width: RIBBON_MINUTES }} role="img" aria-label={spoken}>
        {bands.off.map((seg) => (
          <div
            key={`off-${seg.left}`}
            className="dr__off"
            aria-hidden="true"
            style={{ left: seg.left, width: seg.width }}
          />
        ))}
        {bands.windows.map((seg) => (
          <div
            key={`win-${seg.left}`}
            className="dr__win"
            aria-hidden="true"
            style={{ left: seg.left, width: seg.width }}
          />
        ))}
        {/* `.dr__hole` is the schedule file's class for labelling a GAP; frame
            5c reuses it to label a window, which is why the background is
            overridden to `--tx-surface` — the window's own ground, so the chip
            reads as part of the block rather than as something laid over it. */}
        {bands.labels.map((label) => (
          <div
            key={`lbl-${label.left}`}
            className="dr__hole"
            style={{ left: label.left, background: 'var(--tx-surface)' }}
          >
            <b>{label.text}</b>
          </div>
        ))}
        {bands.lines.map((line) => (
          <div
            key={`l-${line.left}`}
            className={`dr__l${line.edge ? ' dr__l--h' : ''}`}
            aria-hidden="true"
            style={{ left: line.left }}
          />
        ))}
      </div>
      <div className="dr__ax" style={{ width: RIBBON_MINUTES }}>
        {bands.ticks.map((tick) => (
          <span
            key={`t-${tick.left}`}
            className="dr__t"
            style={
              // Both ends are pinned rather than centred. A centred label at 0
              // hangs half of itself off the band; at the right edge it is the
              // one that gets clipped, which is the bug the range was narrowed
              // to 05:30–21:30 to fix in the first place.
              tick.end === 'first'
                ? { left: 0, transform: 'none' }
                : tick.end === 'last'
                  ? { left: 'auto', right: 0, transform: 'none' }
                  : { left: tick.left }
            }
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
    {/* The affordance the clip was missing. A 960px band cut off at 360px reads
        as the whole day, so a trainer whose evening window starts past the
        visible edge would see it vanish and conclude it had not saved — on the
        one step whose entire job is showing the answer back before it is
        committed. Shown only where it is true (app.css, under 1080px). */}
    <p className="small dr__hint">
      05:30 to 21:30, one pixel a minute. Scroll the band sideways for the rest of the day.
    </p>
    </>
  );
}
