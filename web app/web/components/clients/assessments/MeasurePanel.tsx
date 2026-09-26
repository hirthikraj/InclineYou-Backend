'use client';

import { useMemo, useState } from 'react';

import {
  measureStats,
  signed,
  trim,
  type AssessmentDetailWire,
} from '@/lib/assessments/detail';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { Change } from '@/web-components/ui/Change';
import { FactList } from '@/web-components/ui/FactList';
import { Message } from '@/web-components/ui/Message';
import { Select } from '@/web-components/ui/Select';
import { TrendChart } from '@/web-components/ui/TrendChart';
import { CompareSelect } from './CompareSelect';
import { ReadingBar, type Track } from './ReadingBar';

/**
 * The **Measurements** tab — ONE MEASUREMENT, ACROSS EVERY CHECK-IN.
 *
 * The Summary answers *what came back this time*. This answers the question a
 * single reading cannot: *is it moving*. Same payload, different axis — the
 * history behind every tape in this check-in arrived with it, so nothing here
 * is fetched and the picker costs no round trip (`parseAssessmentTab` carries
 * why that keeps it out of the address).
 *
 * ── NOTHING ON THIS TAB CARRIES A TONE ──────────────────────────────────────
 *
 * `lib/assessments/detail.ts` opens with the rule and this is the screen it was
 * written for: a waist going up on a client putting on muscle is the plan
 * working, and the same number on a client cutting is not. There is no green,
 * no red, no arrow and no rate anywhere below — every change is a signed figure
 * and the reading is the trainer's.
 *
 * ── AND THE CHART IS A TREND, NOT THE READINGS ──────────────────────────────
 *
 * `TrendChart` smooths and cannot be made to draw the raw line — §3 of the
 * client spec, and the argument is in the component. What it means here is that
 * the line and the figures beside it are two different statements about the
 * same series: the figures are the readings, the line is the shape. The table
 * under it is the record, and it is where an exact number is read off.
 */
export function MeasurePanel({
  data,
  compareId,
  compare,
  onCompare,
}: {
  data: AssessmentDetailWire;
  compareId: string | null;
  compare: { at: string; values: Map<string, number> } | null;
  onCompare: (id: string | null) => void;
}) {
  /* The first tape in the catalogue's own order, which is body weight wherever
     the template asks for it — the one measurement a client asks about first.
     Not the biggest mover: picking by size of change would be the screen
     deciding which number matters, which is exactly the judgement it has no
     field to make. */
  const [key, setKey] = useState(data.readings[0]?.key ?? '');

  const reading = data.readings.find((r) => r.key === key) ?? data.readings[0];
  const history = data.history.find((h) => h.key === reading?.key);

  const stats = useMemo(
    () => measureStats(history?.points ?? [], data.id),
    [history, data.id],
  );

  if (!reading) return null;

  const unit = reading.unit;
  const only = stats.points.length < 2;

  /* ONE TRACK FOR THE WHOLE LIST, and that is what makes a column of bars a
     series rather than a set of gauges: every row below is the same
     measurement, so they are all scaled to the same two ends — which are the
     card's own *Lowest* and *Highest* rows, said once. */
  const record: Track | null =
    stats.low && stats.high
      ? { low: stats.low.value, high: stats.high.value, n: stats.points.length }
      : null;

  /* WHAT THE HEADLINE IS MEASURED AGAINST, and the default is the one before.
     A comparison chosen on the Summary arrives here through `?cmp=` and takes
     over the figure — which is the whole point of the control being on both
     tabs: *this block against the one in March* has to mean the same thing on
     the card that lists fifteen tapes and on the panel that charts one. With
     nothing chosen it falls back to the previous reading, which is the
     question a tape is taken to answer. */
  const against = compare
    ? stats.points.find((p) => p.assessmentId === compareId) ?? null
    : stats.previous;
  const chosen = compare !== null && against !== null;

  return (
    <div className="asmv__meas">
      <div className="asmv__pick">
        <Select
          label="Measurement"
          hideLabel
          /* The width is in `app.css`, not here — see `CompareSelect` for the
             trap that decides it. */
          value={reading.key}
          onChange={(e) => setKey(e.target.value)}
          options={data.readings.map((r) => ({ value: r.key, label: r.label }))}
        />
        {/* The same control the Summary's card head carries, reading the same
            parameter — one component, imported twice, so the two cannot come to
            offer different lists. */}
        <CompareSelect
          returned={data.returned}
          currentId={data.id}
          value={compareId}
          onChange={onCompare}
        />
        <p className="asmv__pickn">
          {stats.points.length} reading{stats.points.length === 1 ? '' : 's'} on record
        </p>
      </div>

      <div className="asmv__mcols">
        <Card className="asmv__card">
          <CardHead title={reading.label} />
          <CardBody>
            {/* `Change` and not two figures typed here: *65 kg → 62 kg* is the
                product's most-repeated shape and it was spelled two ways 300px
                apart on one screen before the component existed. It refuses a
                tone by design, which is this tab's own rule. */}
            {/* `from` is null on a first check-in, and `Change` draws the
                figure alone for it — a `72.2 → 72.2` would be a claim about a
                movement nobody measured. The prop exists because this screen
                hand-wrote a `.chg` for that case first and the design-system
                gate caught it. */}
            <Change
              from={against?.value ?? null}
              to={stats.current?.value ?? reading.value}
              unit={unit}
              /* The figure IS this card — see `Change`'s note on the size. */
              size="xl"
            />
            <p className="small asmv__sub">
              {against
                ? `Against ${DATE.format(new Date(against.at))}${
                    chosen ? ', the check-in you picked.' : ', the check-in before this one.'
                  }`
                : 'The first reading on record — there is nothing before it to compare against.'}
            </p>

            {/* Two points are not a trend. `TrendChart` draws a flat case
                honestly enough for one, and a line through two readings is a
                claim about a direction that two points cannot make. */}
            {stats.points.length >= 3 && (
              <div className="mt3">
                <TrendChart
                  values={stats.points.map((p) => p.value)}
                  label={`${reading.label} across every check-in`}
                  from={DATE.format(new Date(stats.points[0].at))}
                  to={DATE.format(new Date(stats.points[stats.points.length - 1].at))}
                  markIndex={stats.points.findIndex((p) => p.assessmentId === data.id)}
                  /* THE SCALE, LABELLED. Without it the only figures against a
                     300px plot are the two dates under it, so the line has a
                     shape and no size — and *what did the waist do between
                     March and today* is the whole question this panel exists
                     for. `TrendChart`'s own note carries why it is off
                     everywhere else. */
                  yAxis
                  unit={unit}
                />
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="asmv__card">
          <CardHead title="The record" />
          <CardBody>
            {only ? (
              <Message>
                One reading, taken on {DATE.format(new Date(stats.points[0]?.at ?? data.dueAt))}.
                The next check-in is what makes this a measurement rather than a
                number.
              </Message>
            ) : (
              /* `FactList` AND NOT `Figures`, which was the first draft.
                 Three numbers on one line is the right shape until each of
                 them needs a DATE under it — and *lowest 72.2* without one is
                 half a fact, since what a trainer does about it depends
                 entirely on whether it was last month or last spring.
                 `Figure` carries a label and a value; `FactList.Row` carries a
                 label, a value and the qualifier under it, which is this
                 card's whole content. */
              <FactList className="asmv__rec">
                {/* SINCE THE FIRST CHECK-IN and not "total change", which is
                    the same figure only while the check-in being read is the
                    newest one. Opened from March it would otherwise print
                    September's progress under March's heading. */}
                <FactList.Row
                  k="Since the first check-in"
                  note={stats.first ? DATE.format(new Date(stats.first.at)) : undefined}
                >
                  {stats.sinceFirst === null ? (
                    <FactList.Blank />
                  ) : (
                    <span className="asmv__fig">
                      {signed(stats.sinceFirst)}
                      {unit && <i>{unit}</i>}
                    </span>
                  )}
                </FactList.Row>
                <FactList.Row
                  k="Lowest reading"
                  note={stats.low ? DATE.format(new Date(stats.low.at)) : undefined}
                >
                  <span className="asmv__fig">
                    {stats.low ? trim(stats.low.value) : '—'}
                    {unit && <i>{unit}</i>}
                  </span>
                </FactList.Row>
                <FactList.Row
                  k="Highest reading"
                  note={stats.high ? DATE.format(new Date(stats.high.at)) : undefined}
                >
                  <span className="asmv__fig">
                    {stats.high ? trim(stats.high.value) : '—'}
                    {unit && <i>{unit}</i>}
                  </span>
                </FactList.Row>
              </FactList>
            )}
          </CardBody>

          {stats.points.length > 0 && (
            <CardBody flush divided>
              {/* THE RECORD IS A COLUMN OF BARS, NOT A TABLE, and it is the
                  Summary's row turned on its side.

                  A table of *date · reading · change* is three columns of
                  figures that a reader has to hold in their head to see a
                  shape — and the shape is the whole question this tab is
                  opened with. Every row here shares ONE track, because every
                  row is the same measurement, so the column reads as the
                  series: a long stretch is a block that moved, a short one is a
                  block that did not, and where each sits says whether it
                  happened at the top of the range or the bottom. The figures
                  are all still on the rows; nothing was traded away for it.

                  It is `ReadingBar` and not a second row written here — the
                  component's own note carries why two spellings of one row is
                  the drift this codebase keeps paying for.

                  `ends` is OFF: every bar on this list is scaled to the same
                  two numbers, and the card states them once, 40px up, as
                  *Lowest* and *Highest*. */}
              <ul className="asmv__bars asmv__bars--rec">
                {stats.points
                  .map((p, i) => ({ p, i }))
                  .reverse()
                  .map(({ p, i }) => {
                    /* Against the reading BEFORE it, so the bar reads as the
                       step each check-in made rather than as distance from a
                       baseline the card above already states. The oldest row
                       has nothing before it and says so. */
                    const prev = i > 0 ? stats.points[i - 1] : null;
                    const here = p.assessmentId === data.id;
                    const pick = compareId !== null && p.assessmentId === compareId;
                    return (
                      <ReadingBar
                        key={p.assessmentId}
                        label={DATE.format(new Date(p.at))}
                        value={p.value}
                        unit={unit}
                        from={prev?.value ?? null}
                        since={prev ? SHORT.format(new Date(prev.at)) : null}
                        track={record}
                        /* The row being READ and the row CHOSEN are both
                           marked, and differently: one is where you are, the
                           other is the far end of the figure at the top of the
                           card. A comparison whose second half cannot be found
                           in the list under it is a figure with one visible
                           end. */
                        note={here ? 'this one' : pick ? 'compared' : undefined}
                        mark={here ? 'here' : pick ? 'there' : undefined}
                      />
                    );
                  })}
              </ul>
            </CardBody>
          )}
        </Card>
      </div>
    </div>
  );
}

const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
/** Under a bar, where the year is already on the row's own label. */
const SHORT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
