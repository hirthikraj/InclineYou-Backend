'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { deleteAssessment, moveAssessment } from '@/lib/assessments/actions';
import { assessmentHref, assessmentTabs, type AssessmentTab } from '@/lib/assessments/address';
import {
  answerText,
  answered,
  byGroup,
  type AssessmentDetailWire,
  type AnswerWire,
  type ReadingWire,
} from '@/lib/assessments/detail';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/assessments/vocab';
import { Calendar, Warn } from '@/components/shell/Icons';
import { TopBar } from '@/components/shell/TopBar';
import { PageTabs } from '@/components/shell/PageTabs';
import { Avatar } from '@/web-components/ui/Avatar';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { CountBadge } from '@/web-components/ui/CountBadge';
import { Crumbs } from '@/web-components/ui/Crumbs';
import { FactList } from '@/web-components/ui/FactList';
import { InlineLink } from '@/web-components/ui/InlineLink';
import { Message } from '@/web-components/ui/Message';
import { Meter } from '@/web-components/ui/Meter';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { Tag } from '@/web-components/ui/Tag';
import { TextField } from '@/web-components/ui/Field';
import { CompareSelect } from './CompareSelect';
import { ReadingBar, type Track } from './ReadingBar';
import { MeasurePanel } from './MeasurePanel';

/**
 * ONE CHECK-IN, READ — at `/clients/assessments/:id` from the book-wide list,
 * and at `/clients/:clientId/assessments/:id` from inside a client's file.
 *
 * The list answers *who owes me twenty minutes and a tape*. This screen is the
 * other half of that question and the only one a trainer opens twice: what came
 * back, and whether it moved.
 *
 * TWO ADDRESSES AND ONE SCREEN — the `within` prop is the whole difference and
 * its docstring carries why. Everything below this line is identical on both.
 *
 * ── THE ROUTE IS A STATIC-CHILD TRAP THAT IS ALREADY SPRUNG ─────────────────
 *
 * Trap 24 again, from the other side: `/clients/assessments/templates` is a
 * STATIC child and beats this dynamic one by App Router precedence, so an
 * assessment whose id were the string `templates` would be unreachable. Every
 * id on this wire is `asm_` + digits and a uuid on the real one, so it is safe
 * — and it is only safe because somebody checked, which is what the identical
 * note on the list's own page says about `/clients/assessments` itself.
 *
 * ── TWO TABS, AND THE REFERENCE HAS THREE ───────────────────────────────────
 *
 * The screen this was drawn from carries *Summary*, *Progress pictures* and
 * *Measurements*. The middle one is not built and is not a gap:
 * **no progress photos** is a standing rule of this product, filed in
 * `AssessmentTemplateRow` beside *no BMI category*, and the reasons are that a
 * photograph of somebody's body is a consent problem of a different kind from
 * a tape measurement and that there is no image store anywhere in this schema
 * to put one in. A tab with no bytes behind it is a promise a screen draws.
 *
 * What is here instead is the split that reference gets right: the SUMMARY is
 * this check-in — every tape and every answer, as they came back — and
 * MEASUREMENTS is one measurement across every check-in, which is the question
 * a single reading cannot answer.
 *
 * ── THE COMPARISON IS IN THE ADDRESS AND IT IS ON BOTH TABS ─────────────────
 *
 * `?cmp=` — `parseCompare` carries the argument. The short version is that a
 * tab change here is a NAVIGATION, so a comparison held in React state is one
 * the trainer loses on the way to the tab they picked it for.
 *
 * ── AND THE THREE STATES THAT ARE NOT *done* ARE NOT AN EMPTY SCREEN ────────
 *
 * A booked, waiting or missed check-in has no readings and no answers, and the
 * screen still has something true to draw: what it ASKS. A trainer opening a
 * check-in dated next Tuesday is almost always checking exactly that, and an
 * empty state saying *nothing here yet* would be a screen refusing to answer a
 * question it holds the answer to.
 */
export function Assessment({
  data,
  tab,
  compareId,
  within = null,
}: {
  data: AssessmentDetailWire;
  tab: AssessmentTab;
  compareId: string | null;
  /**
   * THE CLIENT FILE THIS CHECK-IN IS BEING READ INSIDE, or `null` for the
   * book-wide screen — the id out of `/clients/:clientId/assessments/:id`.
   *
   * ── ONE SCREEN, TWO ADDRESSES, AND THE ONLY DIFFERENCE IS THE WAY BACK ────
   *
   * Not a second component and not a `?from=`. The payload, the two tabs, the
   * comparison and every card below are identical — what changes is the three
   * controls that point OUT of this screen: the crumb, the phone's title, and
   * the tab strip's own links. A trainer who opened this from a person's file
   * came from that person and is going back to them; one who opened it from the
   * book-wide list came from a list of forty and is going back to the list.
   * Sending either of them to the other's shelf is the screen guessing.
   *
   * `assessmentBase` in `address.ts` carries why the scope is in the path.
   */
  within?: string | null;
}) {
  const router = useRouter();
  const [busy, startWrite] = useTransition();

  const client = data.client;
  const done = data.state === 'done';
  const hasTapes = data.readings.length > 0;
  /* A Measurements tab on a check-in with no tapes in it is a tab that opens
     on nothing. The strip stands down rather than drawing a door to an empty
     room, and the address falls back with it — a kept link to `?tab=
     measurements` on a check-in that came back with questions only lands on
     the Summary, which is the whole of what that check-in is. */
  const current: AssessmentTab = hasTapes ? tab : 'summary';

  const when = new Date(data.completedAt ?? Date.parse(`${data.dueOn}T00:00:00`));

  /* `replace`, not `push`. Trying four earlier check-ins against this one is
     one question asked four ways, and on `push` it is four presses of Back to
     leave the screen — `PageTabs`' own `replace` argument, made there for the
     money book's six tabs, applied to a control that is twiddled rather than
     travelled to. The TAB stays a push: that one is a destination. */
  const setCompare = (id: string | null) => {
    router.replace(assessmentHref(data.id, current, id, within), { scroll: false });
  };

  const compare = useMemo(() => {
    if (compareId === null) return null;
    const against = data.returned.find((r) => r.id === compareId);
    if (!against) return null;
    /* The other check-in's readings, pulled out of the history the chart
       already uses rather than fetched again: every point in it carries the id
       of the check-in it came back on, which is exactly this lookup. */
    const values = new Map<string, number>();
    for (const h of data.history) {
      const hit = h.points.find((p) => p.assessmentId === compareId);
      if (hit) values.set(h.key, hit.value);
    }
    return { at: against.at, values };
  }, [compareId, data.history, data.returned]);

  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState(data.dueOn);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The list this came from — the file's own tab inside a file, the book-wide list otherwise. */
  const back = within ? `/clients/${within}/assessments` : '/clients/assessments';

  function reschedule() {
    setError(null);
    startWrite(async () => {
      const res = await moveAssessment(data.id, data.version, date, data.clientId);
      if (!res.ok) return setError(res.message ?? 'That did not save.');
      setMoving(false);
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startWrite(async () => {
      const res = await deleteAssessment(data.id, data.clientId);
      if (!res.ok) return setError(res.message ?? 'That did not save.');
      router.push(back);
    });
  }

  return (
    <>
      {/* THE PHONE'S WAY OUT, and it is the door the trainer came in by.
          `titleHref` is `display:none` above 900px — the workspace plate took
          that slot — so this pair is the small screen's back control and the
          crumb below is the desk's. Read inside a file it points at that
          file's own Assessments tab and is LABELLED with the person, which is
          `titleHref`'s own rule: the pair is a return, so the word is the
          destination. Read book-wide it is the list, unchanged. */}
      {within && client ? (
        <TopBar
          crumb={`Clients · ${client.name}`}
          title={client.name}
          titleHref={`/clients/${within}/assessments`}
        />
      ) : (
        <TopBar crumb="Clients · Assessments" title={data.name} titleHref="/clients/assessments" />
      )}

      <main className="main body--flush asmv" id="main-content">
        <PageHeader
          className="ph--asmv"
          crumbs={
            /* THE WAY BACK, AND ON A DESK IT IS THE ONLY ONE. `TopBar`'s
               crumb and its `titleHref` are both `display:none` above 900px —
               the workspace plate took that slot — so a leaf screen that
               trusted them would be a dead end with a rail icon for a door.

               TWO SEGMENTS AND NOT THE CONSOLE'S THREE. A session's crumb
               carries the client because those five screens name them nowhere
               else; this header already does, as an avatar and a linked name in
               its own subtitle, which is where identity belongs when there is
               room for a face. So the crumb is the LIST and this check-in, the
               subtitle is the person, and neither is drawn twice. */
            <Crumbs
              className="asmv__crumbs"
              items={
                within && client
                  ? /* THREE LEVELS INSIDE A FILE, which is `ExerciseHistory`'s
                       crumb one folder along and the same sentence: the roster,
                       the person, the leaf. The person's level points at the
                       tab the row was clicked in rather than at the file's
                       Overview — a breadcrumb is a RETURN, and the shelf they
                       came off is the thing directly above this check-in. The
                       Overview is still one press away, on the linked name in
                       the subtitle below, so the two doors are two places and
                       neither is drawn twice. */
                    [
                      { label: 'Clients', href: '/clients' },
                      { label: client.name, href: `/clients/${within}/assessments` },
                      { label: data.name },
                    ]
                  : [
                      { label: 'Assessments', href: '/clients/assessments' },
                      { label: data.name },
                    ]
              }
            />
          }
          title={data.name}
          sub={
            <span className="asmv__who">
              {client && <Avatar name={client.name} id={client.id} size="sm" />}
              {client && (
                /* THE ONE DOOR TO THE PERSON on this screen — see the note on
                   the action row. `InlineLink` rather than a hand-written
                   anchor for the reason it exists: it picks `next/link` for an
                   in-app path, which every other name-to-file link here does. */
                <InlineLink href={`/clients/${client.id}`} className="asmv__name">
                  {client.name}
                </InlineLink>
              )}
              <span className="asmv__when">
                {done ? 'Answered' : 'Due'} {DATE.format(when)}
              </span>
              <Tag tone={STATUS_TONE[data.state]}>{STATUS_LABEL[data.state]}</Tag>
              {data.schedule && !data.schedule.endedAt && (
                <Tag>Every {data.schedule.intervalDays} days</Tag>
              )}
            </span>
          }
          actions={
            <>
              {/* THE VERBS THIS SCREEN OWNS. In v1 nothing is sent to the client
                  and nothing comes back on its own: the trainer TAKES the
                  assessment in the session, so the lead verb on one that is not
                  done is *Take*, and on a done one it is *Correct* (the same
                  screen, prefilled — a reading exists only here, so this is the
                  only way one is ever corrected). Date and delete are the
                  housekeeping; delete asks twice, in place, rather than in a
                  dialog. */}
              {!done && (
                <Button variant="primary" href={`/clients/assessments/${data.id}/take`}>
                  Take it
                </Button>
              )}
              {done && (
                <Button variant="secondary" href={`/clients/assessments/${data.id}/take`}>
                  Correct readings
                </Button>
              )}
              {!done && (
                <Button variant="secondary" disabled={busy} onClick={() => setMoving((v) => !v)}>
                  Change date
                </Button>
              )}
              {confirmDelete ? (
                <>
                  <Button variant="danger" disabled={busy} onClick={remove}>
                    Delete for good
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </Button>
                </>
              ) : (
                <Button variant="ghost" className="asmv__del" disabled={busy} onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              )}
            </>
          }
        >
          {hasTapes && (
            <PageTabs
              label="This check-in"
              current={current}
              tabs={assessmentTabs(
                data.id,
                current,
                { measurements: data.readings.length },
                compareId,
                within,
              )}
            />
          )}
        </PageHeader>

        <div className="asmv__body">
          {error && <Message tone="err">{error}</Message>}
          {moving && (
            <div className="asmv__move">
              <TextField type="date" label="New date" value={date} onChange={(e) => setDate(e.target.value)} />
              <Button variant="primary" disabled={busy || !date} onClick={reschedule}>
                Save date
              </Button>
            </div>
          )}
          {current === 'measurements' ? (
            <MeasurePanel
              data={data}
              compareId={compareId}
              compare={compare}
              onCompare={setCompare}
            />
          ) : (
            <Summary
              data={data}
              compare={compare}
              compareId={compareId}
              onCompare={setCompare}
            />
          )}
        </div>
      </main>
    </>
  );
}

/* ────────────────────────────────────────────────────────────── the summary ─ */

const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
/** Under a bar, where the year is already said twice in the header above. */
const SHORT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

function Summary({
  data,
  compare,
  compareId,
  onCompare,
}: {
  data: AssessmentDetailWire;
  compare: { at: number; values: Map<string, number> } | null;
  compareId: string | null;
  onCompare: (id: string | null) => void;
}) {
  if (data.state !== 'done') return <NotBack data={data} />;

  const answeredCount = data.answers.filter(answered).length;

  return (
    <div className="asmv__cols">
      {data.readings.length > 0 && (
        <Card className="asmv__card">
          {/* THE COUNT IS CONTENT AND THE PICKER IS AN ACTION, and the
              difference is 280px of void. MEASURED at 1536 before this: both
              were passed as `children`, so the select sat 149px from the title
              with the rest of a 615px head empty behind it. `CardHead`'s
              `actions` slot is the right-hand end of the row and exists for
              exactly this. */}
          <CardHead
            title="Measurements"
            actions={
              <CompareSelect
                returned={data.returned}
                currentId={data.id}
                value={compareId}
                onChange={onCompare}
              />
            }
          >
            <CountBadge
              n={data.readings.length}
              label={`${data.readings.length} measurements came back`}
            />
          </CardHead>

          <CardBody flush>
            <Tapes data={data} rows={data.readings} compare={compare} />
          </CardBody>
        </Card>
      )}

      {data.answers.length > 0 && (
        <Card className="asmv__card">
          <CardHead title="Answers">
            <CountBadge n={answeredCount} label={`${answeredCount} questions answered`} />
          </CardHead>
          <CardBody flush>
            <FactList>
              {data.answers.map((a) => (
                <FactList.Row
                  key={a.questionId}
                  k={a.text}
                  /* STACKED, because the value here is a sentence. The base
                     row is `nowrap` on the value — right for a figure, and
                     trap 9 for *Trap-bar deadlift. First time the second set
                     did not feel like a fight.* */
                  stack
                >
                  <Answer a={a} />
                </FactList.Row>
              ))}
            </FactList>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/**
 * ONE ANSWER — the words, and a bar UNDER THE ONES THAT ARE A SCALE.
 *
 * ── WHY NOT EVERY ANSWER GETS ONE ───────────────────────────────────────────
 *
 * A bar is a statement that the answer is a point on a line, and for a rating
 * that is exactly what it is: `AssessmentQuestionRow.scale` is 5, 10 or 20, the
 * trainer chose it for the next year of that client's check-ins, and *8 of 10*
 * drawn as eight tenths is the same fact in a shape the eye reads without
 * counting.
 *
 * The other three kinds are not that, and drawing them as bars would be the
 * screen inventing an order the model refuses to promise. `options` is
 * documented as "in the order they are SHOWN" — not ranked — so a bar at
 * two-of-four would claim *Illness* is twice *Travel*, on a question
 * (`q_blockers`) whose options are four unrelated categories and which takes
 * more than one of them at once. A yes is not a quantity, and a sentence about
 * a deadlift certainly is not.
 *
 * What comes out reads as the distinction it is: the questions with a bar are
 * the ones that can be put beside the same question eight weeks from now as a
 * number, and the ones without are the ones that have to be read.
 */
function Answer({ a }: { a: AnswerWire }) {
  const said = answerText(a);
  if (said === null) return <FactList.Blank />;
  if (a.kind !== 'rating' || a.rating == null) return <>{said}</>;

  const scale = a.scale ?? 10;
  return (
    <>
      {said}
      {/* `acc`, which is `Meter`'s own note: a magnitude needs a fill that is
          not a verdict. `ok` would paint a 6-of-10 recovery in success-green,
          which is the product deciding how somebody's month went. */}
      <Meter
        className="asmv__abar"
        segments={[{ tone: 'acc', value: a.rating ?? 0, label: 'answered' }]}
        total={scale}
        label={`${a.text} — ${a.rating} out of ${scale}`}
      />
    </>
  );
}

/**
 * THE TAPES, AS BARS — one row per measurement, banded by body area.
 *
 * ── WHAT THE BAR IS OF, WHICH IS THE ONLY INTERESTING DECISION HERE ─────────
 *
 * There is no honest answer to *66.5kg out of what*. A tape has no maximum, no
 * target and no healthy band — this product refuses to hold one (*no BMI
 * category, no health-risk band*) — so every absolute scale a bar could take
 * would be a number the screen invented.
 *
 * What it does have is THIS CLIENT'S OWN RECORD. So the TRACK is everything
 * they have ever recorded for that measurement, lowest to highest, and the LIT
 * STRETCH is the move that produced this reading: from the check-in before it
 * (or from the one the trainer picked to compare against) to this one.
 *
 * ── THE FIRST DRAFT FILLED THE BAR TO THE READING, AND IT WAS USELESS ───────
 *
 * MEASURED on `asm_021`, which is the newest check-in its client has: **every
 * bar came back 0% or 100%**. Of course it did — a measurement that has moved
 * one way all year has its newest reading AT an end of its own range, so
 * "where does this sit between the lowest and the highest" answers *at the
 * bottom* or *at the top* fifteen times and the column of bars carries one bit
 * of information. The reading's position was never the interesting part; the
 * MOVE is, and where in the record that move happened is what a track can say
 * that a signed number cannot.
 *
 * So: a long lit stretch is a block that moved a lot, a short one is a block
 * that barely moved, and where it sits says whether that happened at the top of
 * their range or the bottom. A reading with nothing before it lights a tick at
 * its own position instead — `MIN_MARK` — because a zero-width segment is a bar
 * that failed to draw.
 *
 * A measurement with ONE reading on record has no range at all and gets no bar:
 * a track needs two ends. It says so in words.
 *
 * ── AND NOTHING HERE CARRIES A TONE ─────────────────────────────────────────
 *
 * `lib/assessments/detail.ts` opens with the rule: a waist going up on somebody
 * adding muscle is the plan working and the same number on somebody cutting is
 * not. The fill is `acc` — `Meter`'s plain-quantity fill, which exists because
 * `ok` on a magnitude is the product taking a side — the DIRECTION is the sign
 * beside the figure and never the bar, and the bar itself is the size of the
 * move. No green, no red, no arrow.
 */
function Tapes({
  data,
  rows,
  compare,
}: {
  data: AssessmentDetailWire;
  rows: ReadingWire[];
  compare: { at: number; values: Map<string, number> } | null;
}) {
  /* The track and the move, per measurement, taken once rather than per row.
     `history` is in the payload already and already sorted oldest first, so
     the reading BEFORE this one is the point at `i - 1` — no second pass over
     dates, and no second definition of *previous* to disagree with
     `measureStats` on the other tab. */
  const track = useMemo(() => {
    const m = new Map<string, Track & { previous: number | null; previousAt: number | null }>();
    for (const h of data.history) {
      if (h.points.length === 0) continue;
      let low = h.points[0].value;
      let high = low;
      for (const p of h.points) {
        if (p.value < low) low = p.value;
        if (p.value > high) high = p.value;
      }
      const i = h.points.findIndex((p) => p.assessmentId === data.id);
      m.set(h.key, {
        low,
        high,
        n: h.points.length,
        previous: i > 0 ? h.points[i - 1].value : null,
        previousAt: i > 0 ? h.points[i - 1].at : null,
      });
    }
    return m;
  }, [data.history, data.id]);

  const first = data.client?.name.split(' ')[0];
  /* WHAT THE ROWS CAN SAY. A bar needs a record with a range; with only a first reading per tape there is
     no bar, so the footnote about bars described something that was not on the screen and every row said
     *The first reading on record* underneath its own figure. Said once instead, and the footnote only
     where a bar exists. */
  const anyBar = rows.some((r) => {
    const t = track.get(r.key);
    return !!t && t.high > t.low;
  });
  const allFirst = rows.every((r) => (track.get(r.key)?.n ?? 0) < 2);
  const compared = rows.map((r) => ({ r, from: compare?.values.get(r.key) ?? track.get(r.key)?.previous ?? null }));
  const withPrev = compared.filter((c) => c.from !== null);
  const moved = withPrev.filter((c) => Math.round((c.r.value - (c.from as number)) * 10) / 10 !== 0).length;

  return (
    <div className="asmv__bars">
      {/* THE LEAD: what a trainer opens this for. It was fifteen figures at equal weight with nothing to
          skim; now one sentence says how many moved, and the signed change is the heavy mark on each row. */}
      {withPrev.length > 0 && (
        <p className="asmv__lead">
          {moved} of {withPrev.length} {withPrev.length === 1 ? 'measurement' : 'measurements'} moved since{' '}
          {compare ? SHORT.format(new Date(compare.at)) : 'the last assessment'}
        </p>
      )}
      {byGroup(rows).map((g) => (
        <section key={g.group} className="asmv__grp" aria-label={g.group}>
          {/* The catalogue's own heading. The four groups are how the picker
              files a measurement and how a trainer takes one — top to bottom,
              round a body — so a run of fifteen tapes with no divisions is a
              list nobody can find the girths in. */}
          <h3 className="asmv__grpt">{g.group}</h3>
          <ul className="asmv__grpl">
            {g.rows.map((r) => {
              const t = track.get(r.key) ?? null;
              /* The chosen comparison wins over the check-in before this one.
                 That is what makes *Compare with* mean the same thing on both
                 tabs: pick March and every bar redraws as the move since
                 March, exactly as the Measurements panel's figure does. */
              const was = compare?.values.get(r.key);
              const from = was ?? t?.previous ?? null;
              return (
                <ReadingBar
                  key={r.key}
                  label={r.label}
                  value={r.value}
                  unit={r.unit}
                  from={from}
                  /* The day the comparison is against: the picked check-in
                     where there is one, the previous reading's own date
                     otherwise. A foot that said only *before* was a label
                     doing the work a date does better. */
                  since={
                    from === null
                      ? null
                      : compare
                        ? SHORT.format(new Date(compare.at))
                        : t?.previousAt
                          ? SHORT.format(new Date(t.previousAt))
                          : null
                  }
                  track={t}
                  quiet={allFirst}
                  /* ENDS ON, because every row here is a different measurement
                     with a range of its own — see `ReadingBar`. */
                  ends
                />
              );
            })}
          </ul>
        </section>
      ))}
      {/* Said once, at the foot, rather than under every bar. Fifteen copies of
          one sentence is fifteen lines of chrome on a card somebody opened to
          read fifteen numbers. */}
      {anyBar ? (
        <p className="asmv__barsn">
          Each bar runs from the lowest to the highest
          {first ? ` ${first} has` : ''} ever recorded for that measurement. The
          lit stretch is the move that produced this reading.
        </p>
      ) : allFirst ? (
        <p className="asmv__barsn">
          {first ? `${first}'s first assessment` : 'The first assessment'}: there is nothing before it to compare
          against. The next one shows how each measurement moved.
        </p>
      ) : null}
    </div>
  );
}

/**
 * A check-in that has not come back — and what it asks.
 *
 * Three states share this and the sentence differs on each, because the three
 * are three different things for a trainer to do: *booked* is not sent yet and
 * the verb is theirs, *waiting* is the client's twenty minutes and nobody
 * should be nagged about it, *missed* is the one to chase. The LIST already
 * draws that difference as a tag; this screen says it in words because it has
 * the room the cell did not.
 *
 * ── THE STATE IS A BAND AND NOT A CARD, WHICH IS WHAT FIXED THE SCREEN ──────
 *
 * It was a card, and the card was the defect. MEASURED at 1536 before this:
 * the sentence is ONE LINE, so *Nothing back yet* came back **726 x 121** — a
 * head, a rule and a body's padding around 19px of text — and because it was
 * the FIRST of three children in a two-track grid, the two lists behind it
 * auto-placed around it: the tapes on row 1 column 2, the questions pushed down
 * to row 2 column 1. Row 1 takes the height of the tallest thing in it, so the
 * gap under that 121px card was **726 x 234** on `asm_062`'s six-and-four
 * template and **616 x 657** on the fifteen-and-eleven one — a void taller than
 * the viewport, beside a card carrying a single sentence. That is the shape in
 * the screenshot this pass started from.
 *
 * A grid cannot fix it, because nothing is wrong with the grid: `.asmv__cols`
 * draws the *done* state's two cards correctly and this state's two lists are
 * the same two shelves. What was wrong is that a statement about the WHOLE
 * check-in was being filed as a peer of the two lists inside it. So it comes
 * out of the grid and sits full-width above it, which leaves the grid holding
 * exactly two children — the same two it holds when the check-in is done, in
 * the same two tracks, balanced (778 vs 849, and 341 vs 340 on the short
 * template). The states now read as one screen in two conditions rather than
 * two screens that happen to share a header.
 *
 * ── AND THE GLYPH IS THE COMPONENT'S OWN RULE, NOT DECORATION ───────────────
 *
 * `Message` says it in its docstring: colour alone carries the difference
 * between a warning and a note, colour alone is gone for anyone who cannot
 * separate the two hues, so a message that means something should say it twice
 * — the tone and the glyph. `.msg` reserves the space for one either way, so
 * the three states were paying 15px of gutter for no glyph at all. One each,
 * and they are the three the shell already has: a CALENDAR for a date on the
 * board, a CLOCK for somebody's twenty minutes still running, a WARN for the
 * one that went past. `missed` is the only one that takes a tone, because it
 * is the only one where something is wrong — a booked check-in dated next
 * Tuesday painted amber would be the screen inventing a problem.
 */
function NotBack({ data }: { data: AssessmentDetailWire }) {
  const name = data.client?.name.split(' ')[0] ?? 'Your client';
  const due = DATE.format(new Date(`${data.dueOn}T00:00:00`));
  const said =
    data.state === 'booked'
      ? `On the board for ${due}. Take it in the session — ${name} has not been measured yet.`
      : `${due} went past and nothing has been taken for ${name}.`;

  const tapes = data.asked.measurements;
  const questions = data.asked.questions;
  /* The template was deleted after this was cut from it. `asked` is stored on
     the check-in rather than read back through the template for exactly this
     case, and when both blocks are empty the deletion is the whole story —
     there are no lists to draw and the grid does not open. */
  const gone = tapes.length === 0 && questions.length === 0;

  return (
    <div className="asmv__wait">
      {/* THE STATE, FULL WIDTH, ABOVE BOTH SHELVES — see the note above for the
          234-to-657px void that putting this in the grid produced. No card: a
          `CardHead` over a one-line sentence is 60px of furniture around 19px
          of text, and the sentence is already titled by the tag in the header
          three lines up. */}
      <Message
        className="asmv__note"
        tone={data.state === 'missed' ? 'warn' : undefined}
        icon={data.state === 'booked' ? <Calendar size={15} /> : <Warn size={15} />}
      >
        {said}
      </Message>

      {gone ? (
        <Message className="asmv__note">
          The template this was cut from has been deleted, so what it asked for
          cannot be shown. The answers, if any come back, still can.
        </Message>
      ) : (
        <div className="asmv__cols">
          {tapes.length > 0 && (
            <Card className="asmv__card">
              {/* *Measurements* and *Questions*, which is what the done state
                  calls its own two cards bar one word. It was *What it asks
                  for* and *What it asks* — two titles a word apart, on two
                  cards side by side, where the word that differs is the one
                  carrying the whole distinction. A trainer reading the pair at
                  a glance got no distinction at all. The prospective framing is
                  in the counts under them and in the band above. */}
              <CardHead title="Measurements to take">
                <CountBadge n={tapes.length} label={`${tapes.length} measurements asked for`} />
              </CardHead>
              <CardBody flush>
                <FactList>
                  {tapes.map((m) => (
                    <FactList.Row key={m.key} k={m.label}>
                      <span className="asmv__unit">{m.unit || '—'}</span>
                    </FactList.Row>
                  ))}
                </FactList>
              </CardBody>
            </Card>
          )}

          {questions.length > 0 && (
            <Card className="asmv__card">
              <CardHead title="Questions to answer">
                <CountBadge n={questions.length} label={`${questions.length} questions asked`} />
              </CardHead>
              <CardBody flush>
                <FactList>
                  {questions.map((q) => (
                    <FactList.Row key={q.id} k={q.text} stack>
                      <span className="asmv__kind">
                        {q.kind === 'rating'
                          ? `A rating out of ${q.scale ?? 10}`
                          : q.kind === 'yesno'
                            ? 'Yes or no'
                            : q.kind === 'choice'
                              ? `${q.options.length} options${q.allowMultiple ? ', several allowed' : ''}`
                              : 'Written'}
                      </span>
                    </FactList.Row>
                  ))}
                </FactList>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
