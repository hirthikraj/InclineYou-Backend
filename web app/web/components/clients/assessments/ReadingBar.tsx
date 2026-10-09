import { signed, trim } from '@/lib/assessments/detail';
import { Meter } from '@/web-components/ui/Meter';

/**
 * ONE READING, AS A BAR — the row both tabs of a check-in are made of.
 *
 * ── WHY IT IS ONE COMPONENT AND NOT TWO ─────────────────────────────────────
 *
 * The Summary lists FIFTEEN MEASUREMENTS of one check-in; the Measurements tab
 * lists the SAME MEASUREMENT across every check-in. Different axis, identical
 * row — a label, a figure, what it moved, and a bar placing that move inside
 * the client's own record. Written twice they would drift the way every pair
 * in this codebase has drifted: `buildSummary` spelling `25kg → 27.5kg` while
 * the screen 300px away spelled `25 kg → 27.5 kg`, or `.cffact` and `.kv`
 * describing one stored record two ways for a week. Two call-sites is the
 * evidence the catalogue asks for, and this is where the second one arrived.
 *
 * It stays in this folder rather than going to `web-components/ui/`: the row is
 * the assessment vocabulary — a reading, a check-in, a record — and the family
 * it draws (`.asmv__bar*`) is this screen's. The moment a third screen wants a
 * value placed inside its own history, that is the pass that promotes it.
 *
 * ── WHAT THE BAR IS OF ──────────────────────────────────────────────────────
 *
 * The TRACK is the whole record — the lowest and the highest that measurement
 * has ever read for this client — and the LIT STRETCH is the move that
 * produced this reading. There is no honest absolute scale for a tape (no
 * maximum, no target, no healthy band, and this product refuses to hold one),
 * and the reading's own POSITION in that range was the first draft: it
 * measured 0% or 100% on fifteen rows out of fifteen, because the newest
 * check-in of a measurement that has moved one way all year is always at an end
 * of its own range.
 *
 * Every row in one list shares one track, which is the property that makes a
 * column of these readable: a long stretch is a block that moved and a short
 * one is a block that did not, without reading a number.
 *
 * ── AND NOTHING IN IT CARRIES A TONE ────────────────────────────────────────
 *
 * `lib/assessments/detail.ts` opens with the rule. The fill is `acc`, which is
 * `Meter`'s plain-quantity fill and exists precisely so a magnitude is not
 * drawn in a verdict colour; the DIRECTION is the sign beside the figure and
 * never the bar; and the bar's own length is the size of the move.
 */
export interface Track {
  low: number;
  high: number;
  /** How many readings the record holds. */
  n: number;
}

/**
 * A segment narrower than this is a bar that failed to draw rather than a block
 * that did not move, so a still measurement gets a findable tick at its own
 * position instead of nothing. 2.5% of a 300px track is 7px — visible, and
 * small enough that nobody reads it as a move.
 */
const MIN_MARK = 0.025;

export function ReadingBar({
  label,
  value,
  unit,
  from,
  since,
  track,
  ends = false,
  note,
  mark: flag,
  className,
  quiet = false,
}: {
  /** The measurement's name on the Summary; the check-in's date on the record. */
  label: string;
  value: number;
  unit: string;
  /** What this reading is measured against. Null where there is nothing before it. */
  from: number | null;
  /** The day `from` was taken, already formatted. */
  since: string | null;
  track: Track | null;
  /**
   * Whether to print the track's two ends under the bar.
   *
   * ON in a list of fifteen measurements, where every row has a range of its
   * own and the ends are the only thing saying what the bar is scaled to. OFF
   * in a list of one measurement's own history, where every row shares one
   * track and printing `63.1 … 66.5` four times is the same pair of numbers
   * four times — the card's own *Lowest* and *Highest* rows say it once.
   */
  ends?: boolean;
  /** A word beside the label — *this one*, *compared*. */
  note?: string;
  /** Lights the row: the check-in being read, or the one chosen to compare. */
  mark?: 'here' | 'there';
  className?: string;
  /** Say nothing under a row with no bar: the screen has already said once that this is the first reading. */
  quiet?: boolean;
}) {
  const span = track === null ? 0 : track.high - track.low;
  const step = from === null ? null : Math.round((value - from) * 10) / 10;

  return (
    <li
      className={['asmv__bar', flag ? `asmv__bar--${flag}` : null, className]
        .filter(Boolean)
        .join(' ')}
      aria-current={flag === 'here' ? 'true' : undefined}
    >
      <div className="asmv__barh">
        <span className="asmv__barn">
          {label}
          {note && <em>{note}</em>}
        </span>
        <span className="asmv__barv">
          <b className="asmv__fig">
            {trim(value)}
            {unit && <i>{unit}</i>}
          </b>
          {/* Not on the row that has no bar and therefore says *Unchanged
              across 4 check-ins* underneath: a *no change* chip beside the
              figure is then the same fact twice, 20px apart. */}
          {step !== null && !(span === 0 && step === 0) && (
            <em className="asmv__step">{signed(step)}</em>
          )}
        </span>
      </div>

      {span > 0 && track !== null ? (
        <>
          {/* THREE SEGMENTS, AND THE TWO `dim` ONES ARE THE TRACK SHOWING
              THROUGH. `.meter i.dim` is `--tx-surface-3`, which is the bar's
              own ground — so the lead-in and the tail are spacers that place
              the lit stretch rather than marks of their own, and the row needs
              no absolute positioning to do it. */}
          <Meter
            className="asmv__bart"
            segments={segments(value, from, track)}
            total={span}
            label={describe(label, value, unit, from, track, since)}
            /* The sentence above IS the whole of what this bar says; the
               segments are where the mark sits. See `Meter`'s own note. */
            describe={false}
          />
          {(ends || since !== null) && (
            <div className="asmv__barf">
              {/* The two ends of the record, and BETWEEN them the day the move
                  is measured from — not the figure it was, which is the one
                  thing this row already states twice over (the reading and the
                  signed change are both on the line above, and any two of the
                  three give you the third). */}
              {ends && track !== null && <span>{trim(track.low)}</span>}
              {since !== null && <span className="asmv__barw">since {since}</span>}
              {ends && track !== null && <span>{trim(track.high)}</span>}
            </div>
          )}
        </>
      ) : quiet && (track === null || track.n < 2) ? null : (
        <p className="asmv__barf asmv__barf--one">
          {track === null || track.n < 2
            ? 'The first reading on record'
            : `Unchanged across ${track.n} check-ins`}
        </p>
      )}
    </li>
  );
}

/** The lead-in, the lit stretch, and the tail — see the note above. */
function segments(
  value: number,
  from: number | null,
  track: Track,
): { tone: 'acc' | 'dim'; value: number; label?: string }[] {
  const span = track.high - track.low;
  const lo = from === null ? value : Math.min(value, from);
  const hi = from === null ? value : Math.max(value, from);
  const lit = Math.max(hi - lo, span * MIN_MARK);
  /* Clamped so a mark at the very top of the range cannot push the bar past
     its own end — `Meter` divides by the total, and a lead-in plus a minimum
     mark can sum past it on the reading that IS the highest. */
  const lead = Math.min(Math.max(lo - track.low, 0), Math.max(span - lit, 0));
  return [
    { tone: 'dim', value: lead, label: 'below' },
    { tone: 'acc', value: lit, label: from === null ? 'this reading' : 'this block' },
    { tone: 'dim', value: Math.max(span - lead - lit, 0), label: 'above' },
  ];
}

/** The whole accessible name — the bar carries no other. */
function describe(
  label: string,
  value: number,
  unit: string,
  from: number | null,
  track: Track,
  since: string | null,
): string {
  const where = `within a record of ${trim(track.low)} to ${trim(track.high)}${unit} across ${track.n} check-ins`;
  if (from === null) return `${label}: ${trim(value)}${unit}, ${where}`;
  const d = Math.round((value - from) * 10) / 10;
  const moved = d === 0 ? 'no change' : `${d > 0 ? 'up' : 'down'} ${trim(Math.abs(d))}${unit}`;
  return `${label}: ${trim(value)}${unit}, ${moved} since ${
    since ?? 'the check-in before'
  }, ${where}`;
}
