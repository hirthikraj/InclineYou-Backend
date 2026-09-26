import type { MeWire } from '@/lib/portal/api';
import type { PortalProgressData } from '@/lib/portal/progress';
import { progressTabHref } from '@/lib/portal/progress-tabs';
import { RANGE_IN, RANGE_OVER, RANGE_PROSE } from '@/lib/portal/range';
import { dayStamp } from '@/lib/today/time';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { Change } from '@/web-components/ui/Change';
import { InlineLink } from '@/web-components/ui/InlineLink';
import { KeyValueList } from '@/web-components/ui/KeyValue';
import { Stat, Stats } from '@/web-components/ui/Stat';
import { Tag } from '@/web-components/ui/Tag';
import { VolumeBars } from '@/web-components/ui/VolumeBars';

import { ProgressRanges } from './ProgressRanges';

/** `13375` → `13,375`. The same formatter on the axis and on the bar. */
function inr(n: number): string {
  return n.toLocaleString('en-IN');
}

/**
 * `2026-09-07` → a timestamp, so `dayStamp` can spell it.
 *
 * `TrainingWeek.weekOf` is an ISO day because that is what the builder joins on;
 * `dayStamp` takes an instant. Parsed at local midnight rather than through
 * `Date.parse` on the bare string, which reads `YYYY-MM-DD` as UTC and draws the
 * Monday as the Sunday before it anywhere west of Greenwich.
 */
function dateOfIso(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/**
 * §3 · Progress → **Summary** — *"a tight overview of what happened over the
 * time"*.
 *
 * ── THE ORDER IS §3'S, AND THE TAB IS WHAT MAKES IT KEEPABLE ────────────────
 *
 * §3 opens with an instruction about order and it is followed literally: *"Lead
 * with a plain-language summary, not a chart. Charts go below. Most clients want
 * the sentence, not the graph."* And its table: *"Strength — 'Your squat is up
 * 22kg.' The most motivating number for beginners, and the one most apps bury.
 * **Lead with it.**"*
 *
 * That order was already right and was being drowned: it sat at the top of a
 * page five desktop screens tall, so *the summary leads* was true of the markup
 * and false of the experience. What this tab is, is that order with nothing
 * underneath it but its own evidence — the lifts as ROWS rather than charts, the
 * tape as a figure rather than a table, the history as a count rather than a
 * list. Each of those has a tab where it is drawn in full.
 *
 * ── WEIGHT IS LAST, AND THAT IS RULE 4 ──────────────────────────────────────
 *
 * `lib/portal/progress.ts`'s header carries the four rules §3's weight
 * paragraph is made of, and the fourth decides this file's shape: *"something
 * else is always visible … a client whose scale has not moved in six weeks
 * cannot open this screen and find only the number that has not moved."* So the
 * chart is the last thing on the tab, under the goal, the figures, the lifts and
 * the milestones.
 */
export function ProgressSummary({
  me,
  data,
}: {
  me: MeWire;
  data: PortalProgressData;
}) {
  const first = me.trainer.name.split(' ')[0];
  const { summary, consistency, strength, training, milestones, arrangement } = data;
  /* ── THE RANGE CHIPS ARE THIS TAB'S, AND THEY ARE IN ITS BODY ──────────────

     They lived in the shared page header and windowed all four tabs; the other
     three only read the range in order to window themselves, and each turned
     out to be better off not doing it — see the tab layout for the argument
     per tab. So the control belongs to the one tab whose headline figures
     genuinely change with it: *what has moved in eight weeks* against *since
     you started* is a real question about strength, attendance and the scale.

     In the BODY rather than back in the header, where History's own filters
     already sit — a client meets one control shape per tab, in one place.

     It is drawn before every branch below, the empty range included: that
     branch's whole instruction is *widen it*, and a screen that says so with
     the control missing is a dead end. */
  const { range, emptyRange, lead2, historyTotal, exerciseCount, holdingCount } = data;
  const chips = <ProgressRanges choices={data.choices} />;
  const window = RANGE_PROSE[range];
  /* Preposition-carrying forms, so a sentence never reads *in since you
     started* — see `RANGE_IN`'s own note on the copy bug that produced it. */
  const inWindow = RANGE_IN[range];
  const overWindow = RANGE_OVER[range];

  /* Nothing to show yet. A brand-new client has no sets, no second measurement
     and no attendance to average, and every card below would draw an empty
     frame — which reads as *the app has lost your data* rather than as *you
     have just started*. §1's "never shame" rule applies here more than
     anywhere: this is the screen somebody opens hoping to see something. */
  /* `weight.values.length < 2` was the second conjunct here and it has gone
     with the weight card: this tab is exercise progress, so *nothing to show
     yet* is a claim about the TRAINING. A client who has weighed themselves
     twice and never trained is exactly who that copy is addressed to, and the
     old test refused to draw it for them. */
  const bare =
    strength.length === 0 &&
    training.movements.length === 0 &&
    consistency.attended === 0 &&
    historyTotal === 0;

  /* The last week in the series, for the volume tile's own sentence. `weeks` is
     empty on a client with nothing logged, so this is null rather than a read
     off `at(-1)` that would be `undefined` on the tile's busiest branch. */
  const latestWeek = training.weeks.length
    ? training.weeks[training.weeks.length - 1]
    : null;

  /* An empty RANGE is not an empty account, and it is checked first — `bare`
     is computed over the windowed data and would otherwise tell a client
     sixty-one weeks in that "after two or three sessions it will show what is
     getting stronger". The way out is the chip row directly above, still on
     screen, so this names it rather than drawing a second control. */
  if (emptyRange) {
    return (
      <div className="portal col gap4">
        {chips}
        <Card>
          <CardHead title={`Nothing ${inWindow}`} />
          <CardBody>
            <p className="small">
              You have trained plenty — just not inside the window this screen is
              set to. Widen it above and it all comes back.
            </p>
            <p className="small mt3">
              <InlineLink href="/me/progress">Show everything since you started</InlineLink>
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (bare) {
    return (
      <div className="portal col gap4">
        {chips}
        <Card>
          <CardHead title="Nothing to show yet" />
          <CardBody>
            <p className="small">
              This screen fills up as you train. After two or three sessions it will
              show what is getting stronger, how consistent you have been, and
              whatever {first} measures.
            </p>
            <p className="small mt3">
              <InlineLink href="/me/today">Back to today</InlineLink>
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="portal col gap4">
      {chips}

      {/* ══ the lead, and its supporting figures ═══════════════════════════
          A 19px figure with its delta in the one accent §3 sanctions, beside a
          column of 13px rows. That is the hierarchy: a lead you cannot miss and
          a key column you scan. `buildSummary` picks the lead, because the
          screen should not be deciding which of six figures matters — and its
          own ranking puts the lifts a beginner names out loud ahead of a
          proportional gain on an accessory. */}
      <Card level={2} className="pgsum">
        <CardBody>
          <div className="grid2">
            <div className="col gap2">
              {/* The window used to be a kicker here — *THE LAST 8 WEEKS* —
                  and with the chips moved into this tab's body it sat twelve
                  pixels under the pressed chip saying the same words. That is
                  `.ph--today`'s rule about a heading repeating the line above
                  it, at a smaller scale: a filled lime chip is not a caption
                  that needs a second copy. The lead's own sentence still
                  carries the window, and so does the *Sessions* tile. */}
              {lead2 ? (
                <>
                  <p className="h4" style={{ fontSize: 15 }}>{lead2.label}</p>
                  <Change
                    size="lg"
                    from={lead2.from}
                    to={lead2.to}
                    unit={lead2.unit}
                    delta={lead2.delta}
                  />
                  <p className="small">
                    Your biggest gain {inWindow}.{' '}
                    <InlineLink href={progressTabHref('exercises')}>
                      Every movement is on Exercises
                    </InlineLink>
                    .
                  </p>
                </>
              ) : (
                /* No qualifying lift in the range. NOT an apology — §1's
                   never-shame rule — and not an empty column either. */
                <p className="small">
                  No lift has a clear gain {inWindow} yet. Everything you have
                  done is still here, and the range above widens it.
                </p>
              )}
            </div>

            {/* The supporting figures. A row links only where its detail lives
                on ANOTHER tab — see `SummaryRow.href`. An anchor to a card
                300px below on this same short tab would be a control that
                appears to navigate and does not. */}
            <KeyValueList
              rows={summary.map((r) => ({
                k: r.href ? <a href={r.href}>{r.key}</a> : r.key,
                v: r.value,
              }))}
            />
          </div>
        </CardBody>
      </Card>

      {/* ══ the goal and the arrangement ═══════════════════════════════════

          Asked for as *"our goal and target set by a trainer"*, and
          `buildArrangement` carries what the schema can honestly answer: the
          goal is free text, the agreed frequency is a real number, and a
          numeric target does not exist anywhere in this product.

          The card is drawn only when there is something on it. A frame reading
          *Your goal* over three em-dashes would be worse than its absence: it
          would tell the client their trainer had left something blank, on a
          screen whose whole job is to be encouraging. */}
      {(arrangement.goal || arrangement.programName || arrangement.perWeekTarget) && (
        <Card>
          <CardHead title="What you are working on" />
          <CardBody>
            <div className="grid2">
              <div className="col gap2">
                <p className="micro">Your goal</p>
                {arrangement.goal ? (
                  <p className="h4">{arrangement.goal}</p>
                ) : (
                  <p className="small">
                    {first} has not written one down yet — worth asking at your
                    next session.
                  </p>
                )}
                {arrangement.programName && (
                  <p className="small">
                    On <b className="ink2">{arrangement.programName}</b>
                    {arrangement.arc ? ` · ${arrangement.arc}` : ''}
                  </p>
                )}
              </div>

              {arrangement.perWeekTarget !== null && (
                <div className="col gap2">
                  <p className="micro">Sessions a week</p>
                  {/* AGREED against ACTUAL, and the agreed figure is the one
                      the client signed up to rather than one this screen
                      invented. `buildWeek`'s own rule: the denominator is the
                      arrangement and not the diary, so a trainer's cancellation
                      cannot quietly shrink the target.

                      NO TONE on the comparison. A client under their number
                      this month may have been ill, travelling, or told to rest,
                      and a red figure would be the product taking a side in a
                      conversation it was not in — the same refusal
                      `WEIGHT_HAS_NO_TONE` makes one card down. */}
                  <p className="h4">
                    {arrangement.perWeekActual.toFixed(1)}
                    <span className="ink3" style={{ fontWeight: 600 }}>
                      {' '}
                      of {arrangement.perWeekTarget}
                    </span>
                  </p>
                  <p className="small">
                    You and {first} agreed on {arrangement.perWeekTarget} a week.
                    This is your average {overWindow}.
                  </p>
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* ══ what the training WAS ═════════════════════════════════════════

          ── FOUR FIGURES, AND THEY ARE THE TRAINER'S OWN FOUR ────────────────

          `components/log/Progress.tsx` draws exactly this row on the client
          file's Progress tab, and this is the portal taking it: *"in the
          trainer's view we show exercise progress alone as progress — the same
          kind of UI should be applied for the client."* Sessions, sets, records
          and the latest week's volume, over the range the chips above are set
          to.

          What is NOT copied is the tone. The trainer's row accents `Records`
          when there are any and this one does the same — a record is
          unambiguous in one direction, which is the same test §3 applies to a
          strength gain — and nothing else here is coloured, because a set count
          a client reads about themselves is a figure and not a score.

          ── AND *RECORDS* IS COUNTED IN THE RANGE, JUDGED OUTSIDE IT ─────────

          `buildTraining`'s rule 2, and it is the one figure here the chips move
          for a reason worth knowing: a record is a claim about the whole
          history, so judging it inside a window hands one out for beating a
          number that was never the best. The COUNT is the opposite question —
          *how many did I set in these eight weeks* — so the walk sees
          everything and the tally is conditional. */}
      <Card>
        <CardHead title="What you did">
          <span className="small ink3">{window}</span>
        </CardHead>
        <CardBody>
          <Stats up={4} className="pgtstats">
            <Stat label="Sessions" value={String(training.sessions)} detail="with something logged" />
            <Stat
              label="Sets"
              value={String(training.sets)}
              detail={`across ${training.exerciseCount} ${
                training.exerciseCount === 1 ? 'movement' : 'movements'
              }`}
            />
            <Stat
              label="Records"
              value={String(training.records)}
              detail="your own best, beaten"
              tone={training.records ? 'acc' : 'neutral'}
            />
            {/* ── *VOLUME THIS WEEK* IS NOT ALWAYS THIS WEEK ─────────────────
                `volumeNow` is the LAST week in the series and the series stops
                at the last week with something in it — so on a client who
                trained last in early September this tile read *Volume this
                week* about a week they did nothing in. The window may not move,
                so the SENTENCE does. `weeks.at(-1).current` is the test and it
                is already computed. */}
            <Stat
              label={latestWeek?.current ? 'Lifted this week' : 'Lifted, latest week'}
              value={inr(training.volumeNow)}
              detail={
                latestWeek && !latestWeek.current
                  ? `kg · week of ${dayStamp(dateOfIso(latestWeek.weekOf))}`
                  : 'kg'
              }
            />
          </Stats>
        </CardBody>
      </Card>

      {/* ══ the chart ═══════════════════════════════════════════════

          ── VOLUME GETS A BAR, AND IT IS THE ONLY FIGURE HERE THAT DOES ─────

          The trainer's tab opens with this argument and it transfers whole:
          volume is a SUM, so a bar from zero tells the truth about it. A load
          is not a sum — from a zero baseline a 2.5 kg week is two pixels and
          from a 50 kg baseline it is everything — so a top set is written out
          as the sequence of numbers it actually is, in the card below this one,
          which is also what a coach says out loud.

          ── FULL WIDTH, AND THAT IS A MEASUREMENT ──────────────────────────

          It was the left track of a `.wk2--wide` pair with the sequence card
          beside it, which is how the trainer's tab draws the two. MEASURED at
          1536 on the seeded client: the portal's column is **920px**, so the
          two tracks came out 513 and 395 — and the sequence card was 208px
          against the chart's 394, leaving a **186px void** in its own column on
          every client. That is `odd-child-in-a-two-track-grid` verbatim, and
          the fix that memory records is to lift the short card out rather than
          restyle the grid.

          The chart is the one that wanted the width anyway: at 886px nine bars
          carry their own readouts, where at 480 they were 40px apart. */}
      {training.weeks.length > 0 && (
        <Card>
          <CardHead
            title={`Volume, ${training.weeks.length} ${training.weeks.length === 1 ? 'week' : 'weeks'}`}
          >
            <span className="small mono ink3">kg lifted per week</span>
          </CardHead>
          <CardBody>
            <VolumeBars
              label="Volume per week"
              unit="kg"
              format={inr}
              weeks={training.weeks.map((w) => ({
                label: w.label,
                value: w.volumeKg,
                fraction: w.fraction,
                current: w.current,
                when: dayStamp(dateOfIso(w.weekOf)),
              }))}
              note={
                <>
                  <b>A week with nothing in it keeps its bar.</b> A gap that
                  closes up is a gap that never happened. Point at one to read
                  it.
                </>
              }
            />
            {training.volumeDelta && (
              <p className="small mt2">
                {/* NO TONE. Volume is not a direction a client is supposed to
                    be going in — a deload week is the plan working, and this
                    product holds no field that would tell that apart from a
                    week somebody skipped. The figure is a figure. */}
                The latest week is <b className="ink2">{training.volumeDelta}</b>.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {/* ══ A SEPARATE *YOUR TOP SETS* CARD WAS HERE, AND IT WAS FOLDED ══

          It drew the three most-logged movements with their last five top sets
          each — the trainer's sequence card, made plural. MEASURED on the
          seeded client, it was **291px** and it put a SECOND per-movement list
          on this tab, 300px above *What is getting stronger*: two of the three
          movements appeared in both, once as `42.5 → 45 → 45 → 45` and once as
          `42.5 kg → 45 kg, up 2.5 kg`. One movement, two sets of numbers, one
          screen — which is the two-spellings defect `ui/Change.tsx` was written
          to end, arriving in a pass that was trying to add information.

          `StrengthGain.series` is every session's top set and was already on
          the wire, so the sequence belongs on the row that already names the
          movement. One list, one movement per row, the gain and the run of
          numbers behind it. The tab lost 291px and gained the sequence on five
          movements instead of three. */}

      {/* ══ turning up ═════════════════════════════════════════════════════
          §3's *"something they always control"* — and the three tiles ARE
          figures ranged for comparison, which is what `Stats` is for and what
          the summary rows above are not. */}
      <Card>
        <CardHead title="Turning up" />
        <CardBody>
          <Stats up={3} className="pgrstats">
            <Stat
              label="Sessions"
              value={String(consistency.attended)}
              detail={window}
            />
            <Stat label="A week" value={consistency.perWeek.toFixed(1)} detail="on average" />
            <Stat
              label="Turned up"
              /* Null when nothing has settled, and it prints an em-dash rather
                 than 0% — a client with no settled sessions has not missed
                 anything, and `0%` would be the screen inventing a failure. */
              value={consistency.rate === null ? '—' : `${Math.round(consistency.rate * 100)}%`}
              detail={consistency.rate === null ? 'nothing settled yet' : 'of your sessions'}
              tone={consistency.rate !== null && consistency.rate >= 0.8 ? 'acc' : 'neutral'}
            />
          </Stats>
          <p className="small mt3">
            Cancelled sessions are in neither number — you did not miss those.{' '}
            {/* A DOOR WITH NO COUNT ON IT, WHICH IT USED TO HAVE.

                This read *See all {historyTotal} workouts*, and `historyTotal`
                is windowed like everything else on this card. History is not
                windowed any more, so on *8 weeks* the link promised twenty and
                opened a list of twenty-one — a link whose own label is
                contradicted by the screen it opens. The count is one tile to
                the left and correctly captioned there; the link is a way in. */}
            {historyTotal > 0 && (
              <InlineLink href={progressTabHref('history')}>
                See every session you have logged
              </InlineLink>
            )}
          </p>
        </CardBody>
      </Card>

      {/* ══ the top lifts, as ROWS ═════════════════════════════════════════

          Asked for as *"top 5 exercises and their improvements"*, and five ROWS
          rather than five charts, which is the one refinement this block makes
          to the brief. Three charts already measured 962px — the tallest block
          on the old page — so five would rebuild inside this tab the exact
          scroll problem the tabs were created to fix. A from→to per row answers
          *which lifts are moving* in one glance; the shape of each curve is the
          Exercises tab, one tap away, where it has the room.

          `Change` and not a hand-built string: §3's *"show change, not data"*
          makes `25 kg → 27.5 kg` the portal's most-repeated shape, and it was
          once drawn on this screen in two different spellings 300px apart. */}
      {strength.length > 0 && (
        <Card>
          <CardHead title="What is getting stronger">
            <span className="small ink3">
              {strength.length < exerciseCount
                ? `${Math.min(5, strength.length)} of ${exerciseCount} movements`
                : `${strength.length} of ${strength.length}`}
            </span>
          </CardHead>
          <CardBody flush>
            <ul className="pglifts">
              {strength.slice(0, 5).map((g) => {
                /* ── THE LAST FIVE TOP SETS, UNDER THE NAME ─────────────────
                   The trainer's tab draws this as a card of its own with an
                   exercise picker above it, because a trainer is choosing which
                   of somebody else's movements to look at. A client has one
                   list and it is this one, so the sequence is the row's second
                   line — see the folded card above for the measurement that
                   moved it here.

                   Five, and off the END of the series: `series` is every
                   session's top set oldest-first, and the interesting run is
                   the recent one. Drawn only where there are two or more,
                   because a sequence of one number is a number. */
                const run = g.series.slice(-5);
                return (
                  <li key={g.exerciseId} className="pglifts__i">
                    <span className="pglifts__m">
                      <span className="pglifts__n">
                        {/* ── THE NAME IS AN ELEMENT, AND IT HAD TO BECOME ONE
                             ──────────────────────────────────────────
                            `.pglifts__n > :first-child` carries the ellipsis and
                            its comment says *the name is the half that gives
                            way*. The name was a bare TEXT NODE, so `:first-child`
                            was the `New best` TAG — the rule had been shrinking
                            the wrong element since it was written. MEASURED at
                            430, where the row is still horizontal: the tag was
                            clipped by **16px**, reading *New be…*, and
                            `documentElement.scrollWidth` was 430 with nothing
                            painting past any card.

                            Wrapping the name makes the selector mean what it
                            says. The tag is pinned in `app.css` beside it. */}
                        <span>{g.name}</span>
                        {g.fresh && <Tag tone="pr">New best</Tag>}
                      </span>
                      {run.length > 1 && (
                        <span className="seq pglifts__q">
                          {run.map((v, i, all) => (
                            <span key={`${v}-${i}`}>
                              {i > 0 ? ' → ' : ''}
                              {i === all.length - 1 ? <b>{v}</b> : v}
                            </span>
                          ))}{' '}
                          kg
                        </span>
                      )}
                    </span>
                    <Change from={g.from} to={g.to} unit="kg" delta={`up ${g.delta} kg`} />
                  </li>
                );
              })}
            </ul>
          </CardBody>
          <CardBody divided>
            {/* ── THE TWO FIGURES ON A ROW ARE DIFFERENT QUESTIONS ──────────
                The pair on the right is your FIRST session against your BEST,
                which is the gain; the run under the name is your LAST FIVE
                sessions, which is what the lift is doing now. On a client whose
                best came in the middle of a block those two do not start at the
                same number — *62.5 kg → 67.5 kg* beside *65 → 65 → 67.5* — and
                a reader who has not been told reads that as an error. One
                sentence is cheaper than dropping either figure. */}
            <p className="small ink3">
              On the right is your first session against your best. Under each
              name is your last five sessions.
            </p>
            <p className="small mt2">
              {/* The plateau count, on the SUMMARY, because it is the one thing
                  here a client would want to know without going looking — and
                  burying it a tab deep means only the clients who already
                  suspected it ever see it. A count and a door, never the rows.

                  §1's never-shame rule is honoured in the WORD and the tone:
                  *holding*, in plain ink, not *stuck* in red. */}
              {holdingCount > 0 ? (
                <>
                  {holdingCount === 1 ? 'One movement has' : `${holdingCount} movements have`} been
                  at the same weight for a while.{' '}
                  <InlineLink href={progressTabHref('exercises')}>
                    See which
                  </InlineLink>
                  .
                </>
              ) : (
                <>
                  Every movement you are training is still moving.{' '}
                  <InlineLink href={progressTabHref('exercises')}>
                    See all {exerciseCount}
                  </InlineLink>
                  .
                </>
              )}
            </p>
          </CardBody>
        </Card>
      )}

      {/* ══ milestones ═════════════════════════════════════════════════════

          §"What to cut" caps this hard: *"gamification beyond simple milestones
          — badges wear off in two weeks and cost real build time."* So they are
          tags with dates, not trophies.

          Deliberately not links, and it was tried: `.tag--link`'s hover is
          `background:var(--tx-surface-2);color:var(--tx-ink)`, which FLATTENS
          whatever tone the tag was carrying — so a `pr`-toned milestone would
          turn grey when pointed at and lose the one thing saying what kind of
          milestone it was. That is a design-system condition and fixing it is a
          change to a trainer surface. The History tab is the better door
          anyway: it reaches every day, not the six with a milestone on them. */}
      {milestones.length > 0 && (
        <Card>
          <CardHead title="Along the way" />
          <CardBody>
            <div className="row gap2" style={{ flexWrap: 'wrap' }}>
              {milestones.slice(0, 6).map((m) => (
                <Tag key={m.id} tone={m.kind === 'strength' ? 'pr' : 'acc'}>
                  {m.label}
                </Tag>
              ))}
            </div>
            <p className="small mt3">
              {milestones.length > 6
                ? `And ${milestones.length - 6} more before those.`
                : 'Each one happened on a day you turned up.'}
            </p>
          </CardBody>
        </Card>
      )}

      {/* ══ WEIGHT WAS HERE, AND IT IS ON ASSESSMENTS NOW ═════════════════

          This card was the last thing on the tab — §3's rule 4, *something else
          is always visible*, which put the scale under the goal, the figures,
          the lifts and the milestones so that a client whose weight has been
          flat for six weeks could not open Progress and find only the number
          that has not moved.

          That rule is honoured better by the tab split than it ever was by the
          ordering. **Bodyweight is a body measurement**, it is drawn in full on
          Assessments beside the tape taken at the same sittings, and this tab is
          what the client LIFTED. The trainer's half made exactly this call on
          20 Sep, for one of exactly these reasons: the card drew a figure the
          measurements table restated four hundred pixels lower.

          Nothing replaced it, and no link stands in for it. A pointer from here
          to the scale would be the preview-of-another-screen shape the
          supporting rows were trimmed for — the strip at the top of the page is
          the door, and it is one tap from every screen on Progress. */}
    </div>
  );
}
