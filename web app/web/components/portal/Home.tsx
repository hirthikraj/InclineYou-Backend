import Link from 'next/link';

import type { PortalHomeData } from '@/lib/portal/home';
import { CHECKIN_LABEL, CHECKIN_TONE, dueClause } from '@/lib/portal/checkin';
import type { MeWire } from '@/lib/portal/api';
import { relativePast } from '@/lib/today/time';
import { Calendar, Clock } from '@/components/shell/Icons';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { CoachNote } from '@/web-components/ui/CoachNote';
import { HeroCard } from '@/web-components/ui/HeroCard';
import { InlineLink } from '@/web-components/ui/InlineLink';
import { ListRow, ListRows } from '@/web-components/ui/ListRow';
import { Meter } from '@/web-components/ui/Meter';
import { Stat, Stats } from '@/web-components/ui/Stat';
import { Tag } from '@/web-components/ui/Tag';
import { WeekDots } from '@/web-components/ui/WeekDots';

import { StartButton } from './StartButton';

/**
 * A running total of kilos, at a size a 27px figure can hold.
 *
 * Tonnes above a tonne and kilos below it, one decimal either way — `18,463 kg`
 * is ~110px at `.stat__v`'s 27px Archivo and the tile's content box is 82px on
 * a 390px phone, which is the clipped headline figure `.mnystats` was fixed for.
 * A client's first month is genuinely in kilos, so the small case is real and
 * gets the unit that means something to them rather than `0.4 t`.
 *
 * `en-IN` on purpose: a four-figure kilo total is `4,250` in this product's own
 * grouping, which is the same call `lib/money`'s figures make.
 */
function formatVolume(kg: number): string {
  if (kg < 1000) return `${Math.round(kg).toLocaleString('en-IN')} kg`;
  const t = kg / 1000;
  return `${(t < 100 ? Math.round(t * 10) / 10 : Math.round(t)).toLocaleString('en-IN')} t`;
}

/**
 * §1 · Home — **"the screen that decides whether they open the app again
 * tomorrow."**
 *
 * ── ONE PRIMARY ACTION, AND EVERYTHING ELSE IS A FACT ────────────────────────
 *
 * §1's second design rule: *"One primary action. If everything is a button,
 * nothing gets tapped."* There is exactly one `btn--primary` on this screen and
 * it is inside the hero. The week is a figure, the pack is a sentence, the
 * trainer's note is prose with a `Tag` on it, and the quick log's button is a
 * secondary — a client who came to log a weight is not the client this screen
 * is arranged for.
 *
 * The three blocks added in the 7 Sep enhancement keep that count at one: the
 * *Coming up* row is a `ListRow` and not a booking control (§4 refuses a
 * booking engine outright), the foot's figures are three linked `Stat` tiles,
 * and the milestone is a `Tag`. Nothing new on this screen is a verb.
 *
 * ── THE ORDER IS THE SPEC'S AND IT IS NOT NEGOTIABLE ─────────────────────────
 *
 * Hero → trainer's note → this week → quick log → package. §1 lists them in
 * that order and the reason is the second item: *"If the trainer left a message
 * or updated the program, surface it here with their name and photo. This is
 * the single highest-value element on the screen and it costs almost nothing to
 * build."* It is second because it is what separates this from a free workout
 * app, and it goes above the consistency figure because a sentence from a person
 * beats a number about yourself.
 *
 * The package is LAST and quiet — §1: *"Quiet, factual, always visible."* It is
 * the commercial point of the whole portal and it is the least loud thing on the
 * screen, which is the design.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THE 7 SEP PASS INSERTED, AND WHERE THE COMPETITORS PUT IT
 *
 * The brief was to make this screen look like the trainer's half in components
 * and design, and to check it against what other client portals lead with. The
 * three surveyed all agree on five blocks, and this screen had three of them:
 *
 *   1 · **greet by name** — the `.ph` header, since the portal shipped
 *   2 · **what to do today** — the hero, and better than any of them, because
 *       the hero is a real appointment with a named person
 *   3 · **the coach, present** — the note, which is the differentiator
 *   4 · **figures at a glance, tappable** — ABSENT. Trainerize's dashboard puts
 *       bodyweight, body fat and resting heart rate on the client's first screen
 *       "with the latest entries visible and tappable to view graphs"; this
 *       screen had no figure on it at all and Progress was a tab away
 *   5 · **recognition** — ABSENT. Trainerize files personal bests and unlocked
 *       badges directly on the dashboard "to keep clients motivated"; this
 *       product MINTS milestones (`milestone`, back-filled by the seed and
 *       minted by the finish handler) and drew them only on Progress
 *
 * And one they all have that this had not, from §4 of our own spec rather than
 * from theirs: **what is coming**. `nav.tsx`'s table says Sessions became Plan
 * because *"§4 asks for what is coming, which is a different question and the
 * anxious one"* — and then Home said nothing about tomorrow at all, so on a rest
 * day or after today's session was in the book the answer to *when do I see my
 * trainer next* was a navigation away.
 *
 * ── AND ONE THING EVERY COMPETITOR DOES THAT THIS DELIBERATELY DOES NOT ──────
 *
 * A **streak**. Everfit ships challenges and leaderboards; the consumer trackers
 * lead with days-in-a-row. §1 refuses it in as many words — *"streaks punish one
 * bad week by erasing months of effort, and a broken streak is a common quit
 * trigger"* — so the figure is `WeekDots`' *3 of 4*, which resets on Monday and
 * cannot be lost. The `Stat` row at the foot is attendance over ninety days for
 * the same reason: a rate over a long window cannot be broken by one bad week.
 *
 * ── AND WHY THESE ARE DS COMPONENTS RATHER THAN NEW MARKUP ───────────────────
 *
 * Every block below is a `web-components/ui/` import, which is the standing
 * rule: a screen does not hand-write what the catalogue covers, and anything the
 * catalogue does not cover goes INTO it first. This pass added one component
 * (`CoachNote`, for the note that was three inline style properties) and
 * extended one (`Stat`, which gained the `href` the trainer's `Glance` had been
 * hand-writing as `<Link className="stat">` since it shipped).
 */
export function Home({
  me,
  data,
  now,
}: {
  me: MeWire;
  data: PortalHomeData;
  /**
   * The SERVER's instant, threaded from the guard rather than read here.
   *
   * `react-hooks`' purity rule refuses `Date.now()` during render and is right
   * twice over on this line: it is an impure read, and it is also the clock
   * disagreement `AGENTS.md` already records for `useNow` — a relative stamp
   * computed in the browser against a page rendered on the server can say
   * *in 3 minutes* about something that happened four minutes ago.
   */
  now: number;
}) {
  const { hero, week, pack, message, next, glance, milestone } = data;
  const first = me.trainer.name.split(' ')[0];

  return (
    <div className="portal portal--home col gap4">
      {/* ── TWO COLUMNS ONCE THERE IS ROOM, AND A PREFIX AND A SUFFIX ──────

          `.phome` is `display:contents` until its container clears 1060px, so
          on a phone these two wrappers are not in the tree at all and the seven
          blocks read out in exactly the order below — which is §1's order, and
          the order this file's own header calls not negotiable.

          That is what decides the split: it is the FIRST blocks and then the
          REST, never an interleave. A layout that put the package beside the
          hero would have had to reorder the source, and the phone — which is
          where a client actually opens this — would have paid for the desktop.

          Measured at the 1200px cap: 656 + 524 wide and ~680px tall against
          1270 in one column, which is the hero, the note, the week AND the
          weigh-in above the fold together instead of the hero alone. */}
      <div className="phome">
        <div className="phome__a col gap4">
          {/* ── the hero ───────────────────────────────────────────────────────

              `HeroCard`, the catalogue's own — which is the component `/today`'s
              hero already is, and it fits without a single new class: a kicker, a
              figure, a detail line, a chip row, a BAND and an action slot. Its
              docstring asks for `label` wherever there is a figure, because a reader
              given `7:00 AM` says "seven colon zero zero".

              `lead` on all three states and `live` on none. `card--acc` means *a
              log is open right now* on the trainer's half and it would be the wrong
              claim here — a client whose session starts in four hours is not in it.
              What `lead` says is *start reading here*, which is true of all three. */}
          <HeroCard
            lead
            kicker={hero.kicker}
            figure={hero.headline}
            label={`${hero.kicker}. ${hero.headline}. ${hero.detail}`}
            detail={hero.detail}
            chips={
              <>
                {hero.place && <Tag tone="floor">{hero.place}</Tag>}
                {hero.exerciseCount !== null && (
                  <Tag>{hero.exerciseCount} exercises</Tag>
                )}
                {hero.done && <Tag tone="ok">Done</Tag>}
              </>
            }
            /* ── the band, and the icon is the only half decided here ──────────

               `buildHero` returns the sentence and the tone; the glyph is JSX and
               a model file does not hold JSX. Two of them, and they are the two
               the trainer's own hero uses for the same two meanings: a clock for
               the band that is a state happening now, and the calendar for the one
               that is a fact about the plan. */
            band={
              hero.band
                ? {
                    icon: hero.band.tone === 'acc' ? <Clock size={16} /> : <Calendar size={16} />,
                    tone: hero.band.tone,
                    text: hero.band.text,
                  }
                : undefined
            }
            actions={
              /* ── the one button, and which verb it carries ──────────────────

                 Four cases, and only the first two are a primary:

                   · a log already open  → *Carry on* — resuming, not starting
                   · something to train  → *Start*
                   · finished today      → a quiet link to what they did, because
                     the work is done and a primary here would be asking for
                     something. §2's celebration belongs at the end of the flow.
                   · a rest day          → NOTHING. §1: "Never leave this blank" is
                     about the SCREEN, not about the button — the hero says *Rest
                     day. Recovery is part of the plan* and a button under it would
                     be inviting the client to train on a day the plan says not to. */
              hero.workoutId && !hero.done ? (
                <Button variant="primary" href={`/me/workout/${hero.workoutId}`}>
                  Carry on
                </Button>
              ) : hero.done ? (
                hero.workoutId ? (
                  <Button variant="ghost" href={`/me/workout/${hero.workoutId}`}>
                    See what you did
                  </Button>
                ) : null
              ) : hero.kind === 'rest' ? null : (
                <StartButton sessionId={hero.sessionId} />
              )
            }
          />

          {/* ── the check-ins waiting on them · §"assessments" ─────────────────

              ABSENT on the ordinary day, and that is the shape of the block
              rather than a missing empty state — the *Coming up* row below
              makes the same call for the same reason. Home has seven other
              blocks, and a card explaining that nobody has asked this client
              anything is a card about the product.

              ── WHY IT IS SECOND AND NOT LAST ────────────────────────────────

              This file's header calls §1's order non-negotiable, and it is:
              hero → the trainer's note → this week → quick log → package. This
              does not displace any of them, because it is not a new block in
              that list — it is the OTHER half of the hero's own question.
              The hero answers *what am I doing today*; a check-in your trainer
              sent is the only other thing on this screen the client is being
              ASKED to do, and it has a date on it. Under the pack it would be
              below the fold on a phone on the one day it matters.

              ── AND IT IS NOT A SECOND PRIMARY ───────────────────────────────

              §1's second rule is *one primary action*, and the hero holds it.
              The verb here is a `secondary` — which is the honest weight as
              well as the rule's: a client with a session in four hours should
              be going to the session, and the twenty minutes with a tape is a
              thing they will do at home. `ListRow`'s link form and not a table:
              two columns of `nowrap` in a 350px card is the reflow `AGENTS.md`
              already records for Plan's identical row. */}
          {data.checkIns.length > 0 && (
            <Card>
              <CardHead
                title={data.checkIns.length === 1 ? 'Your check-in' : 'Your check-ins'}
              >
                <span className="small ink3">from {first}</span>
              </CardHead>
              <CardBody flush divided>
                <ListRows label="Check-ins waiting for you">
                  {data.checkIns.map((c) => (
                    <ListRow
                      key={c.id}
                      href={`/me/checkin/${c.id}`}
                      title={c.name}
                      sub={dueClause(c.dueAt, now)}
                      rightInline
                      right={
                        <>
                          {/* Where they got to, and ONLY once they have
                              started. `0 of 26` on a check-in nobody has opened
                              reads as a failure and is not — `blockCount` on
                              the trainer's half refuses the same zero in the
                              same words. */}
                          {c.measurements.got + c.questions.got > 0 && (
                            <span className="small ink3">
                              {c.measurements.got + c.questions.got} of{' '}
                              {c.measurements.asked + c.questions.asked} answered
                            </span>
                          )}
                          <Tag tone={CHECKIN_TONE[c.status]}>{CHECKIN_LABEL[c.status]}</Tag>
                        </>
                      }
                    />
                  ))}
                </ListRows>
              </CardBody>
              <CardBody divided>
                <Button variant="secondary" href={`/me/checkin/${data.checkIns[0].id}`}>
                  {data.checkIns[0].measurements.got + data.checkIns[0].questions.got > 0
                    ? 'Carry on'
                    : 'Fill it in'}
                </Button>
                {/* The way to the record, and it is a link rather than a second
                    button: this card is about the one that is OPEN, and a
                    client who came to Home has not come to read July's. It is
                    here at all because the list is otherwise two taps away
                    behind a tab nobody has a reason to open yet — the same
                    argument the *See the rest of your plan* line makes under
                    *Coming up*. It lands on Progress → Assessments, which is
                    the list and the tape those check-ins fill in. */}
                <p className="small mt3">
                  <InlineLink href="/me/progress/assessments">
                    See the ones you have sent
                  </InlineLink>
                </p>
              </CardBody>
            </Card>
          )}

          {/* ── the trainer's note · §"Make the trainer present" ────────────────

              `CoachNote` — added to the catalogue in this pass, because this card
              was assembling it from a `.row.row--top`, an `<Avatar>` and three
              inline style declarations on the quote. §1 calls what it draws "the
              single highest-value element on the screen", so it is the last thing
              that should have been markup a second screen could rewrite. The 62ch
              measure it brought is the visible change: the quote was a 760px line
              holding 108 characters inside the portal's 920px cap. */}
          {message && (
            <Card>
              <CardHead title={`From ${first}`}>
                {/* Between the title and the actions slot, which is where §04's own
                    head puts a tag or a count. There are no actions on this card —
                    replying is WhatsApp's job, and §"What to cut" says why: "in-app
                    chat — you cannot beat WhatsApp; link to it." */}
                {message.readAt === null && <Tag tone="acc">New</Tag>}
                <span className="small ink3">{relativePast(message.at, now)}</span>
              </CardHead>
              <CardBody>
                <CoachNote
                  author={me.trainer.name}
                  authorId={me.trainer.id}
                  /* A program change gets a way to look at it; a note does not.
                     `mock/types.ts` carries why the kind is a column: the portal
                     draws each one differently, and a *Have a look at the plan*
                     line under a note about shoes would be a dead link. */
                  meta={
                    message.kind === 'program' ? (
                      <InlineLink href="/me/plan">See what changed in your plan</InlineLink>
                    ) : undefined
                  }
                >
                  {message.body}
                </CoachNote>
              </CardBody>
            </Card>
          )}

          <div className="grid2">
            {/* ── this week · §1's consistency indicator ─────────────────────── */}
            <Card>
              <CardHead title="This week" />
              <CardBody>
                <WeekDots days={week.days} done={week.done} planned={week.planned} />
                <p className="small mt3">
                  {/* Three sentences, and none of them is a reproach. The middle
                      one is the case §1 is most careful about — a week with
                      sessions still to come is not a week somebody is behind on. */}
                  {week.done >= week.planned
                    ? 'That is the week done. Everything from here is a bonus.'
                    : week.done === 0
                      ? 'Nothing yet this week — there is still time.'
                      : `${week.planned - week.done} to go this week.`}
                </p>
              </CardBody>
            </Card>

            {/* ── where the weigh-in was ──────────────────────────────────────

                There is no quick log: a body is measured in an assessment and
                nowhere else (backend V22 dropped `body_metric` and withdrew
                `POST /v1/me/metrics`). The half of the grid holds their progress
                instead — which is where those readings are drawn. */}
            <Card>
              <CardHead title="Your progress" />
              <CardBody>
                <p className="small">
                  Strength, consistency and your measurements are all on your
                  progress screen.
                </p>
                <p className="small mt3">
                  <InlineLink href="/me/progress">See how it is going</InlineLink>
                </p>
              </CardBody>
            </Card>
          </div>
        </div>

        {/* The suffix — what is ahead, what it costs, and how it is going. The
            four quiet blocks, in the order they were already in. */}
        <div className="phome__b col gap4">

          {/* ── coming up · §4's anxious question, one row of it ────────────────

              ABSENT when there is nothing booked, and that is the whole shape of
              this block. Plan's own empty state is an `EmptyState` reading *Nothing
              in the diary yet*, which is right on a reference screen somebody
              opened to look at the diary; here it would be a card on the home
              screen apologising for the diary to a client who cannot book anyway.
              §1's rule is *"never leave this blank"* about the SCREEN, and the
              screen has six other blocks.

              `ListRow` and not a `.tbl`, which is `AGENTS.md`'s own recorded fix
              for the identical row on Plan: three `nowrap` columns need 475px and
              the card is 350 on a phone, where `.lrow__t`/`.lrow__s` ellipsise at
              any width with no media query. One row, so `ListRows` labels a list of
              one — which is honest: it is a list that will have two in it the day
              this screen decides to draw two.

              The TIME is the trailing figure, `.lrow__n`'s tabular figures, exactly
              as Plan ranges it: it is the one thing on the row a client scans for. */}
          {next && (
            <Card>
              <CardHead title="Coming up">
                <span className="small ink3">
                  {next.inDays === 1 ? 'tomorrow' : `in ${next.inDays} days`}
                </span>
              </CardHead>
              <CardBody flush>
                <ListRows label="Your next session">
                  <ListRow
                    /* Not a link. There is nothing at the other end for a client —
                       `/sessions/:id` is the TRAINER's screen and `/me/plan` is the
                       whole diary, which the card's own foot already offers. A row
                       that navigated to a screen the client cannot read is the dead
                       affordance this codebase keeps deleting. */
                    title={next.inDays === 1 ? 'Tomorrow' : next.stamp}
                    sub={[
                      next.label ?? 'Session',
                      next.minutes ? `${next.minutes} min` : null,
                      next.remote ? 'Online' : next.place,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    right={
                      <span className="lrow__n">
                        {next.time} {next.meridiem}
                      </span>
                    }
                  />
                </ListRows>
              </CardBody>
              <CardBody divided>
                <p className="small">
                  <InlineLink href="/me/plan">See the rest of your plan</InlineLink>
                </p>
              </CardBody>
            </Card>
          )}

          {/* ── the package · §1's renewal conversation ────────────────────────

              A card and not a `Stat` tile, and not `BalanceStrip` either. Both of
              those are figures ranged for comparison, and there is nothing here to
              compare — it is one sentence a client reads once a fortnight and then
              mentions to their trainer. `.small` throughout: §1 asks for *quiet*,
              and the whole commercial mechanism is that the client raises it first.

              No *Buy* and no *Renew*. The design set's own portal frame states the
              promise this card would otherwise break — the client "is never sold
              anything here" — and renewing is a conversation their trainer has.

              ── AND A `Meter`, WHICH IS THE PORTAL'S OWN IDIOM TWICE OVER ────────

              `/me/plan`'s arc card and the workout flow's set counter are both a
              sentence with a bar under it, for the reason Plan's own comment gives:
              *"a client is not reading a percentage, they are reading how much of
              this is behind me, and a bar answers that at a glance where 62% needs
              arithmetic."* A pack is the same question about the same kind of whole,
              and it was the one of the three drawn as prose alone.

              It fills with what is LEFT rather than with what is spent, which is the
              opposite direction from those two — and deliberately, because the line
              directly above it reads *8 of 12 sessions left*. A bar disagreeing with
              the sentence beside it is worse than no bar: `AGENTS.md` records
              exactly that defect for the strength mark on Progress, where "the
              client trusts the picture and concludes the number is wrong". */}
          <Card>
            <CardHead title="Your package">
              {pack.due > 0 && <Tag tone="warn">Balance owing</Tag>}
            </CardHead>
            <CardBody>
              <p className="small ink2">{pack.line}</p>
              {pack.live && pack.sessionsLeft !== null && pack.live.sessionsTotal !== null && (
                <div className="mt3">
                  <Meter
                    label={`${pack.sessionsLeft} of ${pack.live.sessionsTotal} sessions left`}
                    /* Explicit, so the spent sessions are a real gap rather than a
                       short bar — the one case `Meter`'s docstring says a short bar
                       means something. */
                    total={pack.live.sessionsTotal}
                    segments={[{ tone: 'ok', value: pack.sessionsLeft, label: 'left' }]}
                  />
                </div>
              )}
              {pack.live && pack.sessionsLeft !== null && pack.sessionsLeft <= 2 && (
                <p className="small mt2">
                  Worth mentioning to {first} next time you see them.
                </p>
              )}
              <p className="small mt3">
                <InlineLink href="/me/account">See your package and payments</InlineLink>
              </p>
            </CardBody>
          </Card>

          {/* ── the figures, at the FOOT ────────────────────────────────────────

              Three linked `Stat` tiles, which is `components/today/PhoneStack.tsx`'s
              `Glance` — the trainer's own last block — and the position is the
              claim. `Today.tsx` states it: *"three figures at the FOOT, which is the
              opposite position and the opposite claim: what you check after the
              work, not what greets you before it."* A figure rail above the hero
              would be the report `deck.ts` refuses on the other half, and §1's order
              puts the commercial line last.

              Every tile is a DOOR — `href`, which `Stat` gained in this pass rather
              than each screen writing `<Link className="stat">` as the trainer's
              `Glance` had been doing. Trainerize's dashboard makes the same call for
              the same reason: the figures are "tappable to view graphs", because a
              number a client cannot open is a number they have to take on trust.

              `—` and never `0` where a figure has no answer, which is `Glance`'s own
              rule: "a bare zero in a warn-capable tile reads as a figure that failed
              to load". */}
          <div className="col gap3">
            {/* THE LABELS AND THE DETAILS ARE MEASURED, NOT WRITTEN.

                `.stat__k` is 10.5px mono at 0.11em tracking, and the first version
                of this row said *You turned up* (96.9px), *Workouts logged*
                (111.8px) and *Sessions left* (96.9px) into an 82px content box at
                390px — so every label wrapped to two lines and one DETAIL ran to
                **four**, making three tiles holding `91%`, `21` and `8` **174px
                tall**. `.stats--3` is a pinned count with no breakpoint and this is
                the third time this codebase has met that (`.cfstats`, `.cfprog`,
                `.rptstats`); the rung is in `app.css` under `.pstats`, and the copy
                is short enough that the rung only has to catch 360px. */}
            <Stats up={3} className="pstats">
              {/* Attendance, and the window is in the detail rather than implied.
                  Progress' own summary line says why: "a client reading 91%
                  attendance is owed the window it is over, because ninety days and
                  *ever* are different claims." */}
              <Stat
                label="Turned up"
                value={glance.offered > 0 ? `${Math.round((glance.attended / glance.offered) * 100)}%` : '—'}
                detail={
                  glance.offered > 0
                    ? `${glance.attended} of ${glance.offered} · ${glance.windowDays} days`
                    : `nothing booked in ${glance.windowDays} days`
                }
                href="/me/progress"
              />
              {/* Total volume, and see `PortalGlance.volumeKg` for why it is not the
                  workout count: the count was 21 beside an attendance tile reading
                  *21 of 23*, which reads as one figure being wrong rather than as
                  two facts. Tonnes above a tonne, because `18,463 kg` at 27px
                  Archivo is ~110px against an 82px content box at 390px and a
                  clipped headline figure is the defect `.mnystats` was fixed for. */}
              <Stat
                label="Lifted"
                value={glance.volumeKg > 0 ? formatVolume(glance.volumeKg) : '—'}
                detail={
                  glance.logged > 0
                    ? `across ${glance.logged} ${glance.logged === 1 ? 'workout' : 'workouts'}`
                    : 'nothing logged yet'
                }
                href="/me/progress"
              />
              {/* The one tile that can take a tone, and `warn` is the pack running
                  low rather than a judgement about the client. Two is the threshold
                  the card above already uses for its *worth mentioning* line, so
                  the tile and the sentence cannot disagree about when it is time. */}
              <Stat
                label="Sessions left"
                value={glance.sessionsLeft ?? '—'}
                detail={
                  glance.sessionsLeft === null
                    ? 'no pack running'
                    : pack.daysLeft !== null && pack.daysLeft >= 0
                      ? `${pack.daysLeft} days to run`
                      : 'on your pack'
                }
                tone={glance.sessionsLeft !== null && glance.sessionsLeft <= 2 ? 'warn' : 'neutral'}
                href="/me/account"
              />
            </Stats>

            {/* ── one milestone, and it is the only recognition on this screen ──

                §3 asks for milestones to be "triggered automatically" and they are —
                back-filled by the seed and minted by the finish handler — and until
                now they were drawn only on Progress, which is the screen a client
                opens on purpose. This is the screen they open by habit, and every
                competitor's client home carries this block for that reason.

                ONE, as a `Tag` with a date, because §"What to cut" caps the whole
                idea in as many words: *"gamification beyond simple milestones —
                badges wear off in two weeks and cost real build time."* Progress'
                row of six is the history; a second copy of it here would make both
                wallpaper.

                Nothing at all for a client who has not reached one, which is the
                never-shame rule arriving as a compliment's absence rather than as a
                card explaining that no milestone has fired. */}
            {milestone && (
              <p className="small">
                <Tag tone={milestone.kind === 'strength' ? 'pr' : 'acc'}>{milestone.label}</Tag>{' '}
                <span className="ink3">
                  {relativePast(milestone.at, now)} ·{' '}
                  <InlineLink href="/me/progress">everything you have hit so far</InlineLink>
                </span>
              </p>
            )}
          </div>

          {/* ── the promise, restated where it is easiest to doubt ─────────────

              Verbatim from the design set's portal frame, whose own note says why
              it is the last thing on the screen: *"The last card restates the
              promise in the interface where it is easiest to doubt."* It is also
              the answer to the one question a free app raises — what is the catch —
              and §"What to cut" is the list that makes it true. */}
          <Card>
            <CardBody>
              <p className="small">
                Your app is free, forever. There is nothing to upgrade to, no adverts, and
                InclineYou will never message you about anything except your training with{' '}
                {first}.{' '}
                <Link href="/me/account" className="lnk">
                  See exactly what {first} can and cannot see
                </Link>
                .
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
