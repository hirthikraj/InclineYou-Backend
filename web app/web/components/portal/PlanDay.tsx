import type { MeWire, PortalProgramWire } from '@/lib/portal/api';
import { planTabHref } from '@/lib/portal/plan-tabs';
import type { PlanDaySummary } from '@/lib/portal/plan';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { InlineLink } from '@/web-components/ui/InlineLink';
import { Stat, Stats } from '@/web-components/ui/Stat';
import { Tag } from '@/web-components/ui/Tag';

import { ExerciseRow } from './ExerciseRow';

/**
 * §4 · Plan → Workouts → **one day, in full**.
 *
 * ── THE SCREEN THAT DID NOT EXIST, AND WHAT IT IS FOR ───────────────────────
 *
 * §2 asks for a pre-workout overview and gives the reason: *"exercises, sets,
 * estimated time — reduces the 'what am I in for' hesitation that stops people
 * starting."* That was answered inside the workout flow only, which a client
 * reaches by pressing *Start*. This is the same question asked earlier, the
 * night before, from the screen whose whole job is *what is coming*.
 *
 * It is also the only place in the portal the trainer's per-movement cue can be
 * drawn in full outside a live session. `ExerciseRow` carries that argument.
 *
 * ── AND IT SAYS WHEN THE DAY LANDS ──────────────────────────────────────────
 *
 * *Upper A* means nothing to a client who has not learnt the label, and the old
 * screen made them learn it off a table elsewhere. The head names the weekdays,
 * the length, and — where the diary has one — the next date it actually happens.
 */
export function PlanDay({
  me,
  program,
  day,
  summary,
}: {
  me: MeWire;
  program: PortalProgramWire;
  day: PortalProgramWire['days'][number];
  summary: PlanDaySummary | null;
}) {
  const first = me.trainer.name.split(' ')[0];

  /* The prescribed set count, summed. A figure the flow prints too and this
     screen could not: *what am I in for* is partly *how many sets*. */
  const setCount = day.exercises.reduce((n, e) => n + (e.sets ?? 0), 0);

  return (
    <div className="portal col gap4">
      {/* ── the way back ───────────────────────────────────────────────────

          The tab strip above marks *Workouts* as current, which is true and is
          not a way out: it is the tab this screen is INSIDE. `ExerciseDetail`
          on Progress makes the same call and draws the same explicit link. */}
      <p className="small">
        <InlineLink href={planTabHref('workouts')}>
          ‹ All {program.days.length} {program.days.length === 1 ? 'day' : 'days'}
        </InlineLink>
      </p>

      <Card level={2}>
        <CardHead title={day.label}>
          {summary && summary.weekdays.length > 0 && (
            <Tag>{summary.weekdays.join(' & ')}</Tag>
          )}
        </CardHead>
        <CardBody>
          {/* ── THREE FIGURES, AND THE NARROW RUNG IS NOT OPTIONAL ─────────

              `.stats--3` is a pinned count with no breakpoint of its own, and
              this codebase has now met the resulting clipping six times
              (`.cfstats`, `.cfprog`, `.rptstats`, `.mnystats`, `.pgrstats`,
              `.pstats`). `.plnstats` in `app.css` is the seventh rung — a class
              per screen, which is the house rule, rather than editing the
              shared one. */}
          <Stats up={3} className="plnstats">
            {/* No `detail`. It carried the program's NAME, which the Workouts
                tab's own head says one level up and which is the longest string
                available for the narrowest slot on the screen — `.stat__d` in a
                90px tile at 321px. A tile with nothing useful to add says
                nothing. */}
            <Stat label="Exercises" value={day.exercises.length} />
            <Stat label="Sets" value={setCount || '—'} detail="as prescribed" />
            <Stat
              /* Where the trainer has booked one. Nothing derived from sets and
                 rest times — `PlanDaySummary.minutes` carries the argument. */
              label="Usually"
              value={summary?.minutes ? `${summary.minutes} min` : '—'}
              detail={summary?.minutes ? 'per session' : 'not set'}
            />
          </Stats>

          {/* ── WHEN THIS DAY NEXT HAPPENS ────────────────────────────────

              Three tenses, because two of them were one sentence and it read
              *"Next on today at 8:11 AM"* — which is not English, and which was
              also wrong about a session that had already started. The window
              keeps a day of slack on the near end (see `PlanSession.started`),
              so *under way* is a state this screen genuinely reaches. */}
          {summary?.next && (
            <p className="small mt3">
              {summary.next.started ? (
                <>
                  Under way since{' '}
                  <b className="ink">
                    {summary.next.time} {summary.next.meridiem}
                  </b>
                </>
              ) : summary.next.today ? (
                <>
                  Next up <b className="ink">today</b> at {summary.next.time}{' '}
                  {summary.next.meridiem}
                </>
              ) : (
                <>
                  Next on <b className="ink">{summary.next.stamp}</b> at{' '}
                  {summary.next.time} {summary.next.meridiem}
                </>
              )}
              {summary.next.remote
                ? ', online'
                : summary.next.place
                  ? `, ${summary.next.place}`
                  : ''}
              .
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHead title="What you’ll do" />
        {day.exercises.length === 0 ? (
          <CardBody>
            <EmptyState
              inCard
              title="Nothing written in for this day yet"
              body={`${first} has this day in your week and has not filled in the movements.`}
            />
          </CardBody>
        ) : (
          <CardBody flush divided>
            {/* NOT a `.tbl`. §11 gives every cell `nowrap`, and the old screen
                recorded what that cost: a cue in a cell made the name column
                909px and the table 1113 inside a 920px portal — 18px of
                horizontal scroll on the whole screen, invisible to a
                screenshot because a `nowrap` cell does not look broken, it
                looks wide. These are blocks that hold a sentence. */}
            {day.exercises.map((e, i) => (
              <ExerciseRow
                key={e.exercise?.id ?? `row-${i}`}
                index={i + 1}
                exercise={e.exercise}
                sets={e.sets}
                reps={e.reps}
                targetLoad={e.targetLoad}
                restSeconds={e.restSeconds}
                trainerFirstName={first}
              />
            ))}
          </CardBody>
        )}
      </Card>
    </div>
  );
}
