import type { MeWire } from '@/lib/portal/api';
import { planDayHref } from '@/lib/portal/plan-tabs';
import type { PortalPlanData } from '@/lib/portal/plan';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { ListRow, ListRows } from '@/web-components/ui/ListRow';
import { Meter } from '@/web-components/ui/Meter';
import { Tag } from '@/web-components/ui/Tag';

/**
 * §4 · Plan → **Workouts** — the plan itself, and where the arc lives.
 *
 * ── THE ARC MOVED HERE, AND THAT IS NOT A TIDY-UP ───────────────────────────
 *
 * It was the first card on the old single page, headed with the same string the
 * page header's subtitle carried — see `plan/layout.tsx` for the duplication and
 * why it is the third instance of that defect in this portal.
 *
 * Splitting it was not the only option; the arc could have stayed on the
 * *Schedule* tab. It belongs here because **the arc is a fact about the plan and
 * this tab IS the plan**: *Week 5 of 8* qualifies the days listed below it, and
 * on a tab about the diary it would be qualifying somebody's Tuesday.
 *
 * The header's subtitle still says the arc as a sentence, on all three tabs,
 * because it frames all three. What this card adds is the program's NAME — which
 * the subtitle does not say — and the shape of the block as a bar.
 *
 * ── THE METER LABEL SAYS WHAT IS LEFT, NOT WHERE WE ARE ─────────────────────
 *
 * It used to read `Week 5 of 8`, which is the header's own sentence a third
 * time on one screen. `Meter`'s label is a fact the header does not state:
 * *3 weeks to go*, or *Last week* at the end. Same bar, no repeat.
 *
 * ── AND A DAY NAMES THE WEEKDAYS IT LANDS ON ────────────────────────────────
 *
 * `Upper A` is jargon until a client knows when Upper A happens, and the old
 * screen made them find that out from a table three cards away. `PlanDaySummary
 * .weekdays` comes off the arrangement, so the label and the day are one fact.
 */
export function PlanWorkouts({ me, data }: { me: MeWire; data: PortalPlanData }) {
  const first = me.trainer.name.split(' ')[0];
  const { program, days } = data;

  if (!program) {
    return (
      <div className="portal">
        <Card>
          <CardBody>
            <EmptyState
              inCard
              title="No plan assigned yet"
              body={`${first} has not written your programme in here yet. Your sessions still happen — this screen fills in when they do.`}
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  const left =
    program.week !== null && program.weeks !== null ? program.weeks - program.week : null;

  return (
    <div className="portal col gap4">
      {/* ── the block ─────────────────────────────────────────────────────── */}
      <Card level={2}>
        <CardHead title={program.name}>
          {left !== null && left <= 0 && <Tag tone="ok">Last week</Tag>}
        </CardHead>
        <CardBody>
          {program.week !== null && program.weeks !== null && (
            <>
              <Meter
                size="lg"
                /* Amounts, not percentages — `Meter`'s own contract. `total` is
                   named explicitly so the unspent weeks are a real gap rather
                   than a short bar, which is the one case its docstring says a
                   short bar means something. */
                label={
                  left !== null && left > 0
                    ? `${left} ${left === 1 ? 'week' : 'weeks'} to go`
                    : 'Last week of this block'
                }
                total={program.weeks}
                segments={[{ tone: 'ok', value: program.week, label: 'done' }]}
              />
              {/* ── AND THE CAPTION IS DRAWN, BECAUSE `Meter`'s IS NOT ────────

                  `label` is the component's `aria-label` and nothing else — it
                  paints no ink. So the first version of this card rendered a
                  bar with no number anywhere near it, and the sentence arguing
                  that the label *"says what is left"* was true only for a
                  screen reader. Caught by reading the rendered text rather than
                  the source.

                  Drawn only while there IS something left: at the end the head's
                  `Last week` tag says it, and a line under the bar repeating
                  that tag is the duplication this whole pass is about. */}
              {left !== null && left > 0 && (
                <p className="small ink2 mt2">
                  {left} {left === 1 ? 'week' : 'weeks'} to go
                </p>
              )}
            </>
          )}
          <p className="small mt3">
            {first} wrote this block for you. It changes when they change it —
            there is nothing to keep up with here.
          </p>
        </CardBody>
      </Card>

      {/* ── the days ──────────────────────────────────────────────────────── */}
      <Card>
        {/* NOT *N days a week*, which is what this said and which contradicted
            the diary one tab over: `Upper / Lower · 4 day` has four workouts in
            it and this client trains three times a week, rotating through them.
            The program's day count and the client's weekly frequency are two
            different numbers and only one of them belongs on a list of the
            program's days. */}
        <CardHead title="Your workouts">
          <span className="small ink3">
            {days.length} in this block
          </span>
        </CardHead>
        {days.length === 0 ? (
          <CardBody>
            {/* A program with training days declared and no movements on any of
                them. Real — a trainer can lay out the week before filling it —
                and the honest thing is to say so rather than draw empty rows. */}
            <EmptyState
              inCard
              title="Nothing written in yet"
              body={`${first} has set up the shape of your week and has not filled in the movements. It will appear here.`}
            />
          </CardBody>
        ) : (
          <CardBody flush>
            {/* `ListRow` again, and here it is exactly the component's own case:
                a title, a second line, a trailing figure, and it opens. The
                page it opens is where a sentence can live — see
                `ExerciseRow` for why the cue could not be on this row. */}
            <ListRows label="The days in your plan">
              {days.map((d) => (
                <ListRow
                  key={d.templateDay}
                  href={planDayHref(d.templateDay)}
                  title={d.label}
                  sub={
                    [
                      d.weekdays.length > 0 ? d.weekdays.join(' & ') : null,
                      `${d.exerciseCount} ${d.exerciseCount === 1 ? 'exercise' : 'exercises'}`,
                      /* Only where the diary or the arrangement answers it.
                         `PlanDaySummary.minutes` carries why nothing is derived
                         from sets and rest times. */
                      d.minutes ? `${d.minutes} min` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  }
                />
              ))}
            </ListRows>
          </CardBody>
        )}
      </Card>
    </div>
  );
}
