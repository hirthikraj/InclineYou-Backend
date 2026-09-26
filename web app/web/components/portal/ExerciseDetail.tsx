import type { MeWire } from '@/lib/portal/api';
import { STATE_LABEL, unitFor, type ExerciseProgress } from '@/lib/portal/exercises';
import { progressTabHref } from '@/lib/portal/progress-tabs';
import { dayStamp } from '@/lib/today/time';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { Change } from '@/web-components/ui/Change';
import { InlineLink } from '@/web-components/ui/InlineLink';
import { Row, Table } from '@/web-components/ui/Table';
import { Tag } from '@/web-components/ui/Tag';
import { TrendChart } from '@/web-components/ui/TrendChart';

import { ExercisePicker } from './ExercisePicker';

/**
 * §3 · Progress → Exercises → **one movement**.
 *
 * Everything the overview row could not hold: the curve, the state said in
 * words, every session behind it, and the day the best was set.
 *
 * ── THE SESSION TABLE IS THE NEW THING, AND IT IS THE EVIDENCE ──────────────
 *
 * *"All the exercises we have recorded and how we are improving in that."* The
 * first version answered the second half with a chart and a from→to, which is
 * the SHAPE of the improvement and not the record of it — a client who wants to
 * know what they actually did on the 14th had nowhere to look.
 *
 * This is that record: one row per session, the top set, the reps at it, and
 * the step from the session before. It is the same relationship the
 * Measurements tab has between its chart and its reading table, and the same
 * one the Summary has with this whole tab — a claim, then its proof.
 *
 * ── THE STEP COLUMN CARRIES NO TONE ─────────────────────────────────────────
 *
 * A green +2.5 and a red −2.5 is the obvious rendering and it is wrong here for
 * §1's reason rather than `WEIGHT_HAS_NO_TONE`'s: a lighter session is very
 * often the plan — a deload, a technique week, a day the client was ill and
 * their trainer pulled the load — and this product does not hold the field that
 * says which. Colouring it red makes the app scold somebody for following
 * instructions.
 */
export function ExerciseDetail({
  me,
  row,
  all,
  workoutByDate,
}: {
  me: MeWire;
  row: ExerciseProgress;
  /** Every movement on record, for the picker. */
  all: ExerciseProgress[];
  workoutByDate: Record<string, string>;
}) {
  const first = me.trainer.name.split(' ')[0];
  const unit = unitFor(row);
  const name = row.name ?? 'A movement no longer on your plan';

  /* The day the best was set. `points` is parallel to `series`, so the index of
     the best IS the best's session — the same resolution the summary uses for
     its lead, and the same one `TrendChart` uses for `markIndex="peak"`, so the
     dot and the link cannot point at different days. */
  const bestIso =
    row.best === null ? null : (row.points[row.series.indexOf(row.best)]?.date ?? null);
  const bestWorkout = bestIso ? workoutByDate[bestIso] : undefined;

  return (
    <div className="portal col gap4">
      {/* ── the way back, and the way sideways ─────────────────────────────
          The tab strip above marks *Exercises* as current, which is true and
          is not a way out: it is the tab this screen is INSIDE. So the list
          gets an explicit link, and the picker beside it is the shortcut past
          it — see `ExercisePicker` for why the dropdown is here and not on the
          overview. */}
      <div className="pgxd__nav">
        <p className="small">
          <InlineLink href={progressTabHref('exercises')}>
            ‹ All {all.length} movements
          </InlineLink>
        </p>
        <ExercisePicker
          current={row.exerciseId}
          options={all.map((r) => ({ id: r.exerciseId, name: r.name ?? 'Unnamed movement' }))}
        />
      </div>

      <Card>
        <CardHead title={name}>
          {row.state === 'holding' && <Tag tone="info">{STATE_LABEL.holding}</Tag>}
          {row.fresh && row.state === 'climbing' && <Tag tone="pr">New best</Tag>}
        </CardHead>

        <CardBody>
          <div className="pgex__top">
            <div className="pgex__fig">
              {row.first !== null && row.best !== null && row.best > row.first ? (
                <Change
                  size="lg"
                  from={row.first}
                  to={row.best}
                  unit={unit}
                  /* The accent is on a GAIN and nowhere else. */
                  delta={row.delta ? `up ${row.delta} ${unit}` : undefined}
                />
              ) : row.repsProgress ? (
                /* The load stood still and the REPS moved — double progression,
                   and the headline has to say so or the card is a flat number
                   under a *Climbing* heading. `Change` is the right component
                   here for the reason it is the wrong one above: these are two
                   genuinely different figures. */
                <Change
                  size="lg"
                  from={row.repsProgress.from}
                  to={row.repsProgress.to}
                  unit="reps"
                  delta={`at ${row.latest} ${unit}`}
                />
              ) : (
                /* No gain to state. A `Change` from 60 to 60 would draw an arrow
                   between two identical numbers, which reads as a rendering
                   fault rather than as a fact. */
                <p className="h4" style={{ fontSize: 19 }}>
                  {row.latest} <span className="ink3">{unit}</span>
                </p>
              )}
              <p className="small mt2">
                {row.sessions} {row.sessions === 1 ? 'session' : 'sessions'} on record ·
                last on {dayStamp(row.lastAt)}
              </p>
            </div>

            {/* Two points cannot be a trend, and drawing them as one is a line
                with no information in it. The table below carries them. */}
            {row.series.length >= 3 && (
              <div className="pgex__chart">
                <TrendChart
                  values={row.series}
                  label={`${name} top set`}
                  markIndex="peak"
                  from={dayStamp(new Date(`${row.points[0].date}T00:00:00`).getTime())}
                  to={dayStamp(row.lastAt)}
                />
              </div>
            )}
          </div>
        </CardBody>

        {/* The state in words. `climbing` gets none — a card whose figure
            already says *up 7.5 kg* does not need a paragraph agreeing. */}
        {row.state !== 'climbing' && (
          <CardBody divided>
            <p className="small">
              {row.state === 'holding' && (
                <>
                  {/* Two ways of not moving, and they are different facts — see
                      `holdingFor`. A flat RUN is *the same weight four sessions
                      in a row*; the other is *up and down all window and no
                      further along than session one*, where quoting a run of
                      one would be nonsense. */}
                  <b className="ink2">
                    {row.holdingFor >= 3
                      ? `${row.latest} ${unit} for ${row.holdingFor} sessions running.`
                      : `Still at ${row.latest} ${unit} — no further along than your first session here.`}
                  </b>{' '}
                  Sometimes that is the plan. If it has been a while, it is worth
                  mentioning to {first} —{' '}
                  {row.measure === 'load'
                    ? 'they set the load.'
                    : 'they set what you are working towards.'}
                </>
              )}
              {row.state === 'new' && (
                <>
                  Only {row.sessions} {row.sessions === 1 ? 'session' : 'sessions'}{' '}
                  logged so far. A couple more and there will be a trend worth
                  reading.
                </>
              )}
              {row.state === 'resting' && (
                <>
                  Nothing logged since {dayStamp(row.lastAt)}. Movements come off
                  a plan all the time — {first} may have swapped this one out.
                </>
              )}
            </p>
          </CardBody>
        )}

        {bestWorkout && (
          <CardBody divided>
            <p className="small">
              <InlineLink href={`/me/workout/${bestWorkout}`}>
                See the day you hit {row.best} {unit}
              </InlineLink>
            </p>
          </CardBody>
        )}
      </Card>

      {/* ══ every session ══════════════════════════════════════════════════

          Newest first: the session a client is looking for is almost always the
          last one, which is the same ordering the Measurements tab's reading
          table takes for the same reason.

          `reps` is drawn as its own column rather than folded into the load,
          because at a fixed weight the reps ARE the progression — it is the
          rule `buildExercises` uses to decide a movement is climbing rather
          than holding, and a table that hid it would make that classification
          unauditable from the screen it appears on. */}
      <Card>
        <CardHead title="Every session" level={3}>
          <span className="small ink3">
            {row.points.length} {row.points.length === 1 ? 'session' : 'sessions'}
          </span>
        </CardHead>
        <CardBody flush>
          <Table
            caption={`${name}, every session's top set`}
            columns={[
              { key: 'when', label: 'When' },
              { key: 'top', label: unit === 'kg' ? 'Top set' : 'Reps', numeric: true },
              ...(row.measure === 'load'
                ? [{ key: 'reps', label: 'Reps', numeric: true }]
                : []),
              { key: 'step', label: 'Step', numeric: true },
            ]}
          >
            {row.points
              .map((p, i) => ({ p, i }))
              .reverse()
              .map(({ p, i }) => {
                const v = row.measure === 'load' ? p.loadKg : p.reps;
                const prevPoint = i > 0 ? row.points[i - 1] : null;
                const prev = prevPoint
                  ? row.measure === 'load'
                    ? prevPoint.loadKg
                    : prevPoint.reps
                  : null;
                const step =
                  v === null || prev === null ? null : Math.round((v - prev) * 10) / 10;
                const workout = workoutByDate[p.date];
                const when = dayStamp(new Date(`${p.date}T00:00:00`).getTime());
                return (
                  <Row
                    key={p.date}
                    /* The day links to its own log where there is one, which is
                       what makes every row of this table checkable rather than
                       merely stated. A session logged before the portal existed
                       has no workout and stays plain text. */
                    header={
                      workout ? (
                        <InlineLink href={`/me/workout/${workout}`}>{when}</InlineLink>
                      ) : (
                        when
                      )
                    }
                    cells={[
                      { key: 'top', numeric: true, content: v === null ? '—' : `${v}` },
                      ...(row.measure === 'load'
                        ? [
                            {
                              key: 'reps',
                              numeric: true,
                              className: 'ink3',
                              content: p.reps === null ? '—' : `× ${p.reps}`,
                            },
                          ]
                        : []),
                      {
                        key: 'step',
                        numeric: true,
                        className: 'ink3',
                        /* NO TONE — see this file's header. */
                        content:
                          step === null
                            ? '—'
                            : step === 0
                              ? '0'
                              : `${step > 0 ? '+' : '−'}${Math.abs(step)}`,
                      },
                    ]}
                  />
                );
              })}
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
