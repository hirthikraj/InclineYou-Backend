import type { ExerciseSeriesWire } from '@/lib/portal/plan-api';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { Crumbs } from '@/web-components/ui/Crumbs';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { ListRow, ListRowNumber, ListRows } from '@/web-components/ui/ListRow';
import { Stat, Stats } from '@/web-components/ui/Stat';
import { TrendChart } from '@/web-components/ui/TrendChart';

import { day, num } from './format';

/**
 * One movement over time. The line is the estimated best set of each session for a weight × reps lift, and the effort itself (seconds,
 * reps, metres) for the rest. It carries no tone: a lighter week is a lighter week, not a fault — which is why the wire has no `trend`.
 *
 * ── 21 Nov 2026 ──────────────────────────────────────────────────────────────
 *
 *   · **The name is an `<h2>`.** It was an `<h1>` inside a card, under the layout's own *Your progress* `<h1>` — two top-level
 *     headings on one screen, which is the first thing a screen reader's heading list gets wrong.
 *   · **The way back is a crumb at the TOP** (`Progress / Exercises / {name}`), where it was a button under the last row of a list
 *     that can be fifty sessions long.
 *   · **The best set and the count are `Stat` tiles**, and *Session by session* is `ListRow`s with the set as the trailing figure.
 *   · **The chart says "strongest set"**, not "estimated best set" — the figure is still the estimate, and the tile beside it says
 *     what was actually on the bar.
 */
export function ExerciseProgress({ data }: { data: ExerciseSeriesWire }) {
  const { exercise, series, bests } = data;
  const estimated = series.some((p) => p.e1rm !== null);
  const values = series.map((p) => (estimated ? p.e1rm ?? 0 : p.effortValue ?? p.loadValue ?? 0));
  /* THE EFFORT HAS A UNIT (25 Nov 2026). A push-up's sessions read a bare *12* on the row and the chart's axis, and
     *reps* was only written after a load — so a bodyweight, timed or distance movement never said what its number
     was. The unit comes from the movement's own log type. */
  const unit = /time/.test(exercise.logType) ? 'sec' : /distance/.test(exercise.logType) ? 'm' : 'reps';
  /* …AND A BEST WITHOUT A LOAD (25 Nov 2026). `bests` is load-based (an estimated max, or the heaviest set), so a
     push-up's *Best set* read *—* above ten sessions of 12. With no load-based best, it is the session with the
     most reps (seconds, metres) — the earliest one to reach it, so the date is when it was first done. */
  const topEffort = series.reduce<(typeof series)[number] | null>(
    (top, p) => (p.effortValue !== null && (top === null || p.effortValue > (top.effortValue ?? -1)) ? p : top), null);
  const best = bests.e1rm ?? bests.load ?? (topEffort
    ? { loadValue: null, effortValue: topEffort.effortValue, on: topEffort.on }
    : null);
  const setText = (load: number | null, effort: number | null) =>
    [load !== null ? `${num(load)} kg` : null, effort !== null ? `${num(effort)} ${unit}` : null].filter(Boolean).join(' × ');

  return (
    <div className="portal col gap4">
      <Crumbs
        items={[
          { label: 'Progress', href: '/me/progress' },
          { label: 'Exercises', href: '/me/progress/exercises' },
          { label: exercise.name },
        ]}
      />
      <h2 className="pprog__h">{exercise.name}</h2>

      {series.length === 0 ? (
        <EmptyState title="Nothing logged for this yet" body="After you’ve finished a session with it, each one shows here." />
      ) : (
        <>
          <Stats up={2} className="pstats">
            <Stat
              label="Best set"
              value={best ? setText(best.loadValue, best.effortValue) || '—' : '—'}
              detail={best ? day(best.on, { day: 'numeric', month: 'short', year: 'numeric' }) : undefined}
            />
            <Stat label="Sessions" value={series.length} detail={`since ${day(series[0].on, { day: 'numeric', month: 'short', year: 'numeric' })}`} />
          </Stats>

          {series.length > 1 && (
            <Card>
              {/* SAID AS WHAT IT IS (22 Nov 2026): the line is each session's ESTIMATED one-rep max, and with the axis now
                  showing its figures (~28 kg) beside a best set of 22.5 kg, *your strongest set* read as two numbers that
                  disagree. The estimate is what makes sets of different reps comparable; the title says so. */}
              <CardHead title={estimated ? 'Estimated one-rep max, session by session' : 'Your best effort, session by session'}>
                {estimated && <span className="small ink3">from your best set each time</span>}
              </CardHead>
              <CardBody>
                <TrendChart
                  values={values}
                  label={`${exercise.name}, ${estimated ? 'strongest set' : 'best effort'} per session`}
                  from={day(series[0].on)}
                  to={day(series[series.length - 1].on)}
                  markIndex="last"
                  unit={estimated ? 'kg' : unit}
                  /* NUMBERS ON THE SIDE (22 Nov 2026): the line rose and fell between two dates with no figure anywhere,
                     so a client could see a change and not its size. The axis names the top, middle and bottom. */
                  yAxis
                />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHead title="Session by session">
              <span className="small ink3">newest first</span>
            </CardHead>
            <CardBody flush>
              <ListRows label={`${exercise.name}, every session`}>
                {[...series].reverse().map((p) => (
                  <ListRow
                    key={p.on}
                    title={day(p.on, { day: 'numeric', month: 'short', year: 'numeric' })}
                    sub={p.volume > 0 ? `${Math.round(p.volume).toLocaleString('en-IN')} kg moved` : undefined}
                    right={<ListRowNumber>{setText(p.loadValue, p.effortValue)}</ListRowNumber>}
                  />
                ))}
              </ListRows>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
