import type { MeWire, PortalProgramWire } from '@/lib/portal/api';
import { planTabHref } from '@/lib/portal/plan-tabs';
import { ranLabel } from '@/lib/portal/plan';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { InlineLink } from '@/web-components/ui/InlineLink';
import { Tag } from '@/web-components/ui/Tag';

import { ExerciseRow } from './ExerciseRow';

/**
 * §4 · Plan → Past plans → **one earlier block**.
 *
 * ── ITS DAYS ARE SECTIONS, NOT ROUTES ───────────────────────────────────────
 *
 * The live plan gives every day its own screen, and `planDayHref` carries why:
 * a client is about to DO that day and wants the cues in full, on a phone, at a
 * rack. **None of that is true here.** An earlier plan is browsed — *what was I
 * doing in the spring* — so its days are sections on one page and the third
 * level of nesting is not spent. `pastPlanHref`'s own note states the split.
 *
 * ── AND IT IS IN THE PAST TENSE ─────────────────────────────────────────────
 *
 * `PortalProgramWire.week` is null on anything that is not the live block, and
 * deliberately not clamped to its last week: *Week 8 of 8* about a plan somebody
 * finished in June is a sentence in the wrong tense. What says when it ran is its
 * dates, which is the true version of the same fact.
 *
 * There is **no completion figure**, here or on the list — `PlanHistory` carries
 * §1's rule at length, and it applies harder on the screen holding the movements
 * somebody may or may not have got through.
 */
export function PastPlan({
  me,
  program,
}: {
  me: MeWire;
  program: PortalProgramWire;
}) {
  const first = me.trainer.name.split(' ')[0];
  const ran = ranLabel(program.startDate, program.endDate);
  const total = program.days.reduce((n, d) => n + d.exercises.length, 0);

  return (
    <div className="portal col gap4">
      <p className="small">
        <InlineLink href={planTabHref('history')}>‹ All your earlier plans</InlineLink>
      </p>

      <Card level={2}>
        <CardHead title={program.name}>
          <Tag>Finished</Tag>
        </CardHead>
        <CardBody>
          <p className="small ink2">
            {[
              ran,
              program.weeks ? `${program.weeks} weeks` : null,
              `${program.days.length} ${program.days.length === 1 ? 'day' : 'days'} a week`,
              program.goal,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="small mt3">
            This is exactly what {first} had you doing. Everything you logged on it
            is still on your Progress screen.
          </p>
        </CardBody>
      </Card>

      {program.days.length === 0 || total === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              inCard
              title="Nothing was written into this one"
              body="The block was set up and the movements were never filled in. Your sessions still happened."
            />
          </CardBody>
        </Card>
      ) : (
        program.days.map((day) => (
          <Card key={day.templateDay}>
            <CardHead title={day.label}>
              <span className="small ink3">
                {day.exercises.length}{' '}
                {day.exercises.length === 1 ? 'exercise' : 'exercises'}
              </span>
            </CardHead>
            <CardBody flush divided>
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
          </Card>
        ))
      )}
    </div>
  );
}
