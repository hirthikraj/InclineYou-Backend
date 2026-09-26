import type { ReactNode } from 'react';

import { Change } from './Change';
import { TrendChart } from './TrendChart';

/**
 * ONE THING THAT MOVED, WITH THE SHAPE OF HOW IT MOVED — `c-progrow`.
 *
 * A name, the series drawn small, and `c-change` on the end. It replaces a
 * four-column table on the progress report, and the stylesheet's own entry
 * carries the two measurements that decided it; the half worth repeating here
 * is the one about the CONTENT rather than the geometry:
 *
 * `73.6 → 73.4` is two readings out of the three the row itself admits to, and
 * the middle one is the whole story. A client who went 73.6 → 75.1 → 73.4 and
 * a client who went 73.6 → 73.5 → 73.4 print the identical row and are not the
 * same client. **The pair is the claim and the series is the evidence for it**,
 * and a report a trainer is about to put somebody's name on should carry both.
 *
 * ── A SERIES TOO SHORT TO CHART SAYS SO ─────────────────────────────────────
 *
 * Two points is a line segment, which draws a slope with no shape in it and
 * invites a client to read a trend off two tape measurements. So under three
 * readings the slot prints `too few readings` through `TrendChart`'s own
 * `hidden` prop rather than drawing one — the same call the portal's Exercises
 * tab makes, and it is the never-invent rule the report is built on: a chart of
 * two points is a claim about a trajectory that was never observed.
 *
 * ── THE DELTA IS THE ONLY THING THAT MAY CARRY COLOUR ───────────────────────
 *
 * `Change` states it and this component adds nothing to it: the pair is plain
 * ink whichever way it points, because a waist going up on a client putting on
 * muscle is the plan working and this product holds no field that tells that
 * apart from the same number on a client cutting. `delta` exists for a strength
 * gain, which is unambiguous in one direction, and the caller decides.
 */
export function ProgressRows({ children }: { children: ReactNode }) {
  /* `.pgrw` is the query container and `.pgrs` the list, and they are two
     elements rather than one for the reason `.sdcw` is: `container-type:
     inline-size` removes a box's content contribution on the inline axis, so a
     list that WAS the container measures zero the moment anything puts it in a
     flex row. */
  return (
    <div className="pgrw">
      <ul className="pgrs">{children}</ul>
    </div>
  );
}

export function ProgressRow({
  /** The movement, or the site on the body. Ellipses; the row never grows. */
  name,
  /** How the figure was arrived at — the readings behind it, the days it took. */
  meta,
  /** The series, oldest first. Under three points the chart is not drawn. */
  series,
  /** The baseline. `null` for a first reading — see `Change`. */
  from,
  to,
  unit,
  /** The accented clause, e.g. `+10%`. Strength gains only. */
  delta,
  /** What the series is of, for the chart's accessible name. Defaults to `name`. */
  label,
}: {
  name: ReactNode;
  meta?: ReactNode;
  series: number[];
  from: number | null;
  to: number;
  unit: string;
  delta?: string;
  label?: string;
}) {
  return (
    <li className="pgr">
      <div className="pgr__id">
        <span className="pgr__n">{name}</span>
        {meta ? <span className="pgr__m">{meta}</span> : null}
      </div>
      <div className="pgr__s">
        {series.length >= 3 ? (
          <TrendChart
            values={series}
            label={label ?? (typeof name === 'string' ? name : 'Progress')}
            unit={unit}
            size="sm"
          />
        ) : (
          /* `hidden` renders `.trend--off` — the slot, at the slot's height,
             saying why it is empty. Drawing nothing would let the rows either
             side of it close up and the column stop being a column. */
          <TrendChart values={[]} label={label ?? 'Progress'} size="sm" hidden="too few readings" />
        )}
      </div>
      <div className="pgr__f">
        <Change from={from} to={to} unit={unit} delta={delta} />
      </div>
    </li>
  );
}
