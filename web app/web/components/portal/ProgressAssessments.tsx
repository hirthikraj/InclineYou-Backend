import type { MeWire } from '@/lib/portal/api';
import { CHECKIN_LABEL, CHECKIN_TONE, dueClause, type CheckInWire } from '@/lib/portal/checkin';
import type { MeasureSeries } from '@/lib/portal/progress';
import { dateStamp, dayStamp } from '@/lib/today/time';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { InlineLink } from '@/web-components/ui/InlineLink';
import { ListRow, ListRows } from '@/web-components/ui/ListRow';
import { Row, Table } from '@/web-components/ui/Table';
import { Tag } from '@/web-components/ui/Tag';
import { TrendChart } from '@/web-components/ui/TrendChart';

/**
 * §3 · Progress → **Assessments** — *what was measured, and what I said.*
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THIS IS TWO TABS FOLDED INTO ONE, AND THE FOLD IS THE POINT
 *
 * It was `Measurements` and `Check-ins`, side by side in the strip, and they are
 * the same event seen from two ends: **a check-in is WHEN the tape came out**,
 * and the tape is **what the readings say across all of them**. A client who
 * wanted to know whether their waist had moved had to read one tab; a client who
 * wanted to know what they had told their trainer in July read the other; and
 * the reading taken on the day of that check-in appeared on both with nothing
 * saying they were the same sitting.
 *
 * The trainer's half settled this first and settled it the same way. A client
 * file has `Progress` — what they lifted — and `Assessments` beside it, and one
 * assessment opens on two panels: the SUMMARY is *what came back this time* and
 * `MeasurePanel` is *one measurement across every check-in*. This tab is that
 * pairing at the list level, which is the level the portal has.
 *
 * ── THE ORDER IS ACT, THEN READ, THEN REMEMBER ──────────────────────────────
 *
 * 1. **To fill in** — the only thing on this screen that is work, and it is
 *    absent rather than empty when there is none. `ChecksTab` puts *Outstanding*
 *    at the top of the trainer's copy for the same reason: the next thing due is
 *    the next thing to do.
 * 2. **The tape** — the answer to the question that brings a client here, which
 *    is *am I changing shape*. Every measurement on record, in the body's own
 *    order.
 * 3. **Answered** — the record, newest first.
 *
 * ── AND NOTHING ON IT CARRIES A TONE ────────────────────────────────────────
 *
 * `WEIGHT_HAS_NO_TONE` in `lib/portal/progress.ts` states the rule and it
 * governs this whole tab rather than only the scale: **a waist going up on a
 * client putting on muscle is the plan working, and the same number on a client
 * cutting is not.** This product holds no field that tells them apart —
 * `client.goal` is the trainer's free text — so there is no green, no red, no
 * arrow and no rate anywhere below. `buildMeasureSeries` sorts by the body and
 * never by the size of the change, so the tab makes no pick about which number
 * matters either.
 *
 * ── WEIGHT IS ON IT NOW, AND THAT IS WHERE IT WENT ──────────────────────────
 *
 * The Summary tab drew a weight chart under the lifts, and the Measurements tab
 * drew the same readings again 2,000px away. Bodyweight is a body measurement —
 * which is the exact call the trainer's `ProgressTab` made on 20 Sep when it
 * dropped its own `Bodyweight` card — so it is one card in the grid below,
 * first, in the order the body list already puts it.
 */
export function ProgressAssessments({
  me,
  checkIns,
  series,
  hideWeight,
  now,
}: {
  me: MeWire;
  checkIns: CheckInWire[];
  /** Every reading on record. A tape is a record, so there is no window. */
  series: MeasureSeries[];
  hideWeight: boolean;
  /** The SERVER's instant, threaded down for `dueClause` — trap 20. */
  now: number;
}) {
  const first = me.trainer.name.split(' ')[0];

  /* Sorted HERE and not at the read, because the two lists want opposite orders
     and the wire can only carry one. The read is the shared one. */
  const open = checkIns
    .filter((r) => r.completedAt === null)
    .slice()
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const answered = checkIns
    .filter((r) => r.completedAt !== null)
    .slice()
    .sort((a, b) => Date.parse(b.completedAt!) - Date.parse(a.completedAt!));

  /* NOTHING AT ALL is one empty state, not three. A brand-new client has no
     check-in and no reading, and a tab drawing *no check-ins yet* over *nothing
     measured yet* over *nothing sent back yet* is the same fact said three
     times — which on §1's own terms reads as a screen listing what somebody has
     failed to do. */
  if (checkIns.length === 0 && series.length === 0) {
    return (
      <div className="portal col gap4">
        <EmptyState
          title="Nothing measured yet"
          body={`A check-in is a short form ${first} sends you every few weeks — some measurements they take with a tape, and a few questions about how the block went. When one arrives it shows up on your home screen, and everything that has ever been recorded stays here.`}
          action={
            <Button variant="secondary" href="/me/today">
              Back to home
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="portal col gap4">
      {/* ══ 1 · the one thing here that is work ═══════════════════════════
          ABSENT when there is nothing open, rather than an empty state saying
          so. Home makes the same call with the same block: a card apologising
          for having nothing to ask is a card about the product. */}
      {open.length > 0 && (
        <Card className="pgchk">
          <CardHead title="To fill in">
            <span className="small ink3">from {first}</span>
          </CardHead>
          <CardBody flush divided>
            <ListRows label="Check-ins waiting for you">
              {open.map((c) => {
                const got = c.measurements.got + c.questions.got;
                return (
                  <ListRow
                    key={c.id}
                    href={`/me/checkin/${c.id}`}
                    title={c.name}
                    sub={
                      got > 0
                        ? `${dueClause(c.dueAt, now)} · ${got} answered so far`
                        : dueClause(c.dueAt, now)
                    }
                    rightInline
                    right={<Tag tone={CHECKIN_TONE[c.status]}>{CHECKIN_LABEL[c.status]}</Tag>}
                  />
                );
              })}
            </ListRows>
          </CardBody>
        </Card>
      )}

      {/* ══ 2 · the tape ══════════════════════════════════════════════════

          ── WHY IT IS A HEADING AND A GRID RATHER THAN ONE CARD ─────────────

          The grid is `.pgtapes` and it is kept exactly as the Measurements tab
          drew it, because it was measured into that shape: six full-width cards
          put a nine-point monthly series across 886px of chart, and pairing the
          columns gives each ~437px, which turns three desk screens into one and
          makes the six deltas a glance rather than a scroll.

          What a fold into a single `Card` would cost is that pairing — six
          measurements inside one body is a list, not a pair of columns — so the
          section takes a heading instead. It is an `<h3>` because the two cards
          around it are `<h2>`-level card heads, and a document outline that
          skips a level is the defect `ui/Card.tsx`'s own `level` prop exists
          for. */}
      {series.length > 0 ? (
        <section className="pgasm" aria-labelledby="pgasm-tape">
          <div className="pgasm__hd">
            <h3 className="h5" id="pgasm-tape">
              Your measurements
            </h3>
            <span className="small ink3">
              {series.length} {series.length === 1 ? 'measurement' : 'measurements'} on record
            </span>
          </div>

          <div className="pgtapes">
            {series.map((m) => (
              <Card key={m.metricType} className="pgtape">
                <CardHead title={m.label} level={4}>
                  {/* The figure rides the HEAD rather than opening the body, so
                      the card's first line answers *where am I now* and the
                      chart starts immediately under it. It is also what makes
                      the pair of columns work: at 437px a head that is a name
                      and a number is one line, where a name over a 19px figure
                      is two. */}
                  <span className="pgtape__now">
                    {m.latest}
                    <i>{m.unit}</i>
                  </span>
                </CardHead>

                <CardBody>
                  <p className="small">
                    {/* NO TONE and no arrow — this file's opening rule. `No
                        change` rather than `0.0`, because a zero in a column of
                        signed figures reads as a missing value where the words
                        are a fact. */}
                    {m.delta === 0
                      ? 'No change'
                      : `${m.delta > 0 ? '+' : '−'}${Math.abs(m.delta)} ${m.unit}`}{' '}
                    since {dayStamp(m.dates[0])}
                  </p>

                  {/* Two points are not a trend. The folded table carries them. */}
                  {m.values.length >= 3 && (
                    <div className="mt3">
                      <TrendChart
                        values={m.values}
                        label={`${m.label} over time`}
                        from={dayStamp(m.dates[0])}
                        to={dayStamp(m.dates[m.dates.length - 1])}
                      />
                    </div>
                  )}
                </CardBody>

                {/* ── THE RECORD, FOLDED ─────────────────────────────────────
                    Native `<details>`, for the reason `Select` is a native
                    `<select>`: it needs no state, no JS and no role declared,
                    and it is reachable by every assistive technology without any
                    of those being claimed. The summary names its own count so
                    the fold says what it is withholding. */}
                <CardBody divided>
                  <details className="disc">
                    <summary className="disc__s">
                      All {m.values.length} {m.values.length === 1 ? 'reading' : 'readings'}
                    </summary>
                    <div className="mt3">
                      <Table
                        caption={`${m.label}, every reading ${first} has recorded`}
                        columns={[
                          { key: 'when', label: 'When' },
                          { key: 'value', label: m.unit, numeric: true },
                          { key: 'move', label: 'Move', numeric: true },
                        ]}
                      >
                        {m.values
                          .map((v, i) => ({ v, i }))
                          .reverse()
                          .map(({ v, i }) => {
                            /* Against the reading BEFORE it, so the column reads
                               as the step each visit made rather than as
                               distance from a baseline the card's own head
                               already states. The oldest row has nothing before
                               it and prints an em-dash. */
                            const prev = i > 0 ? m.values[i - 1] : null;
                            const step =
                              prev === null ? null : Math.round((v - prev) * 10) / 10;
                            return (
                              <Row
                                key={m.dates[i]}
                                header={dayStamp(m.dates[i])}
                                cells={[
                                  { key: 'value', numeric: true, content: `${v}` },
                                  {
                                    key: 'move',
                                    numeric: true,
                                    className: 'ink3',
                                    /* NO TONE, per this file's opening rule. */
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
                    </div>
                  </details>
                </CardBody>
              </Card>
            ))}
          </div>

          {/* Said once, at the foot, rather than on the cards. Every card is then
              the same three things — a figure, a change, a folded record — and
              the pair of columns reads as a pair rather than as one card that
              grew a paragraph. */}
          <p className="small">
            {series.some((m) => m.metricType !== 'weight')
              ? `${first} takes the tape at a check-in — whatever they record turns up here.`
              : ''}
            {series.some((m) => m.metricType === 'weight')
              ? ' Weight is your own reading, from the box on your home screen — it swings a kilo or two on water alone, so the shape over months is the part worth reading.'
              : ''}
            {hideWeight && (
              <>
                {' '}
                Weight is hidden on your account, so it is not on this tab. Turn
                it back on under <InlineLink href="/me/account">Me</InlineLink>{' '}
                whenever you like.
              </>
            )}
          </p>
        </section>
      ) : (
        /* Check-ins but no readings — a real state, and a common one on a client
           whose trainer asks questions and does not take a tape. It says what
           will happen rather than apologising for an empty grid. */
        <Card>
          <CardHead title="Nothing measured yet" />
          <CardBody>
            <p className="small">
              {first} takes the tape at a check-in — chest, arms, waist and hips
              — and whatever they record shows up here with its own history.
            </p>
            {hideWeight && (
              <p className="small mt3">
                You also have weight hidden. Turn it back on under{' '}
                <InlineLink href="/me/account">Me</InlineLink> whenever you like.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {/* ══ 3 · the record ════════════════════════════════════════════════ */}
      {checkIns.length > 0 && (
        <Card className="pgchk">
          <CardHead title="Answered">
            {/* The count is the length of the list under it and not a fraction
                of anything, so it is a fact rather than a score. */}
            {answered.length > 0 && <span className="small ink3">{answered.length} sent</span>}
          </CardHead>
          {answered.length === 0 ? (
            <CardBody>
              <p className="small">
                Nothing sent back yet. Once you fill one in it stays here, with
                everything you said in it.
              </p>
            </CardBody>
          ) : (
            <CardBody flush divided>
              <ListRows label="Check-ins you have sent">
                {answered.map((c) => (
                  <ListRow
                    key={c.id}
                    href={`/me/checkin/${c.id}`}
                    title={c.name}
                    /* The date it was ANSWERED, never the date it was due — the
                       row is a record of a thing somebody did, and the day they
                       did it is the day they will remember it by. */
                    sub={`Sent ${dateStamp(Date.parse(c.completedAt!))} · ${sizeOf(c)}`}
                    rightInline
                    right={<Tag tone="ok">Sent</Tag>}
                  />
                ))}
              </ListRows>
            </CardBody>
          )}
        </Card>
      )}
    </div>
  );
}

/**
 * *6 measurements and 4 answers* — what went, in its own words.
 *
 * `got`, never `asked`. The fraction is the trainer's column: *you answered 5 of
 * 26* is a score, and §1's never-shame rule refuses to put one on a client's own
 * record. A short check-in is still a check-in.
 */
function sizeOf(c: CheckInWire): string {
  const parts: string[] = [];
  if (c.measurements.got > 0) {
    parts.push(`${c.measurements.got} measurement${c.measurements.got === 1 ? '' : 's'}`);
  }
  if (c.questions.got > 0) {
    parts.push(`${c.questions.got} answer${c.questions.got === 1 ? '' : 's'}`);
  }
  /* A check-in cannot be sent empty — the server refuses it — so this fallback
     is for a row that predates that rule rather than for a state the product can
     reach today. It says what it knows instead of drawing an empty half. */
  return parts.length === 0 ? 'nothing recorded' : parts.join(' and ');
}
