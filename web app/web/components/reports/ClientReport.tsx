'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useSyncExternalStore } from 'react';

import {
  REPORT_WEEKS,
  longDate,
  reportMessage,
  shortDate,
  trim,
  type ClientReport as Report,
  type MetricChange,
  type ReportWeeks,
} from '@/lib/reports/build';
import {
  copyCard,
  downloadCard,
  downloadReportPdf,
  shareCard,
  whatsappUrl,
  type ShareOutcome,
} from '@/lib/reports/share';
import { TopBar } from '@/components/shell/TopBar';
import { CardPreview } from './CardPreview';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Crumbs } from '@/web-components/ui/Crumbs';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Fold } from '@/web-components/ui/Fold';
import { Message } from '@/web-components/ui/Message';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { ProgressRow, ProgressRows } from '@/web-components/ui/ProgressRow';
import { Segment, SegmentButton } from '@/web-components/ui/Segment';
import { Sidecar } from '@/web-components/ui/Sidecar';
import { Strip, StripCell } from '@/web-components/ui/Strip';
import { Table, Row } from '@/web-components/ui/Table';
import { Tag } from '@/web-components/ui/Tag';
import { VolumeBars } from '@/web-components/ui/VolumeBars';

/**
 * Whether this browser has a native share sheet that will take a file.
 *
 * `useSyncExternalStore` and not a bare `typeof navigator` check in the render:
 * this component is server-rendered, so reading a browser capability during the
 * first render is a hydration mismatch on exactly the screen a trainer opens to
 * send something. `getServerSnapshot` answers false — the desk's buttons — and
 * the real answer arrives on the client's first render straight after. It is a
 * fact about the machine and never changes, so nothing subscribes.
 */
const NO_SUBSCRIBE = () => () => {};

/**
 * AND IT ASKS ABOUT FILES, NOT ABOUT THE FUNCTION.
 *
 * `typeof navigator.canShare === 'function'` was the test, and it answers the
 * wrong question: Chrome ships `canShare` on every platform and only some of
 * them will take a FILE. On a Linux desktop `canShare({files})` is false while
 * `typeof canShare` is `'function'`, so the old check drew *Share card and
 * report* there — a button whose whole outcome is the sentence *this browser
 * cannot do that one*, which is the thing this component's own note rejects:
 * a button that can never work is worse than no button.
 *
 * So it probes with the two file types it is actually going to hand over. A
 * one-byte `File` costs nothing, `canShare` is synchronous and touches no
 * permission, and the pair is asked for rather than the PNG alone because that
 * is what the button does — `shareCard` degrades to the image on its own if the
 * sheet refuses the pair, so a `true` here is a promise the share can keep.
 *
 * Wrapped, because a browser with no `File` constructor would throw during the
 * store's snapshot, which is a blank screen rather than a missing button.
 */
const canShareFiles = () => {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false;
  try {
    const byte = new Uint8Array(1);
    return navigator.canShare({
      files: [
        new File([byte], 'card.png', { type: 'image/png' }),
        new File([byte], 'report.pdf', { type: 'application/pdf' }),
      ],
    });
  } catch {
    return false;
  }
};

/**
 * THE CLIENT PROGRESS REPORT — the highest-leverage screen in the product, on
 * the brief's own ranking, and the reason is one sentence: **most clients quit
 * because progress feels invisible, not because it is absent.**
 *
 * Everything here is arranged around the report being an object that LEAVES. It
 * is not a dashboard the trainer reads; it is a thing they hand over, and the
 * three jobs of the screen are to make it true, make it beautiful, and get it
 * out in one tap.
 *
 * ── THE SCREEN IS A SIDECAR, AND THAT IS THE FIX FOR ITS WORST DEFECT ───────
 *
 * It was a two-column grid — card left, detail right — with both columns in
 * normal flow, and MEASURED at a 1536px window the left column was 766px tall
 * against the right's 1,500. Which means that from 766px of scroll onwards, the
 * screen was **a 734px-tall empty void beside a table**, and the four share
 * buttons — *the only actions on the page, the entire reason a trainer opened
 * it* — had scrolled away. A trainer who read to the bottom of the detail had
 * to scroll back up to send anything.
 *
 * `c-sidecar` exists for exactly this shape and its aside is already
 * `position:sticky`, so the card and its buttons now stand still while the
 * detail moves past them. The actions are ABOVE the preview inside that rail,
 * which is the other half of the fix: the rail is 750px tall in a 586px
 * viewport, so something has to be the part that is always on screen, and it
 * should be the buttons rather than the top third of a picture.
 *
 * `fill` was added to the component in the same pass. A capped 600px main
 * column left 361px of dead surface down the right of this screen while the
 * tables inside it crushed a date range onto three lines; the stylesheet's
 * `.sdc--fill` entry carries the numbers.
 *
 * ── THE RAIL IS THE CLIENT'S AND THE COLUMN IS THE TRAINER'S ────────────────
 *
 * **The rail** is what the client gets: the painted PNG exactly as it will
 * arrive, and the routes out. Nothing about the trainer's business is on it —
 * no revenue, no adherence framed as a failure, no attendance rate for a month
 * the client was ill.
 *
 * **The column** is the trainer's reading of the same window, and it holds three
 * things the client is never sent: how many sessions went unmarked, every
 * movement trained INCLUDING the ones that did not move, and what the window
 * actually measured. A trainer about to send somebody a number should be able to
 * see where it came from first, and neither the card nor the PDF can carry a
 * methodology note without stopping being what it is.
 *
 * ── AND EVERY FIGURE NOW SHOWS ITS SHAPE, NOT JUST ITS ENDS ─────────────────
 *
 * The measurements and the lifts were `c-table` rows — `Weight | 73.6 → 73.4 kg
 * | −0.2 | 3 readings` — and the second defect that pass found is in the
 * CONTENT rather than the geometry: `73.6 → 73.4` is two readings out of the
 * three the row itself admits to, and the middle one is the whole story. They
 * are `c-progrow` now, which draws the series beside the pair.
 *
 * ── AND NOTHING ON THIS SCREEN WRITES ───────────────────────────────────────
 *
 * No server action, no `nudge_log` row, nothing stored. The WhatsApp button is a
 * plain `wa.me` link exactly as the client file's is, and `lib/reports/share.ts`
 * carries the reason: `POST /v1/clients/{id}/nudge` spends the once-a-week
 * reminder that an overdue invoice needs three days later. Sending somebody
 * their progress must not cost the trainer that.
 */
export function ClientReport({ report }: { report: Report }) {
  const hasShareSheet = useSyncExternalStore(NO_SUBSCRIBE, canShareFiles, () => false);
  const router = useRouter();
  const params = useSearchParams();
  const [outcome, setOutcome] = useState<ShareOutcome | 'working' | null>(null);
  const [showMessage, setShowMessage] = useState(false);
  const [showCensus, setShowCensus] = useState(false);
  const [showMethod, setShowMethod] = useState(false);

  const setWeeks = (weeks: ReportWeeks) => {
    const next = new URLSearchParams(params.toString());
    next.set('weeks', String(weeks));
    router.replace(`/clients/${report.clientId}/report?${next}`, { scroll: false });
  };

  /**
   * One handler for the four actions that paint.
   *
   * `working` is set before the await because painting a 1080×1350 card, and
   * now three or four A4 sheets besides, takes a beat on a phone — and a share
   * button that looks inert for a second gets pressed twice, which on the
   * native sheet means two sheets.
   */
  const run = useCallback(
    async (action: (r: Report) => Promise<ShareOutcome>) => {
      setOutcome('working');
      setOutcome(await action(report));
    },
    [report],
  );

  const s = report.sessions;
  const metrics = [report.weight, ...report.measurements].filter(
    (m): m is MetricChange => m !== null,
  );
  /* `0` where they never trained, which matches no week's index and leaves the
     chart entirely grey — correct, since there is no latest week to accent. */
  const latestTrainedWeek = report.weekSeries.reduce(
    (latest, week) => (week.count > 0 ? week.index : latest),
    0,
  );

  return (
    <>
      {/* The way back is to the client's file, not to wherever the trainer came
          from — Today's renewal row, the header, the Progress tab all open this
          card about ONE client, and that client's file is where it belongs. The
          bar's title is the phone's back control; the crumbs are the desk's. */}
      <TopBar
        crumb={`Clients / ${report.clientName} / Progress report`}
        title={report.clientName}
        titleHref={`/clients/${report.clientId}`}
      />

      <main className="main" id="main-content">
        {/* `c-pageheader`, and it was three hand-written `.ph__*` divs until this
            pass — which `check-components` counted and could not fix, because a
            count is a ratchet and not a refactor. The window picker was three
            bare `<button className="btn btn--sm">` with an `aria-pressed` and no
            radio semantics, so a screen reader announced three unrelated toggle
            buttons where the truth is one control with three positions.
            `c-segment` in `single` mode announces a radiogroup and gives it
            arrow-key navigation, which those buttons never had. */}
        <PageHeader
          crumbs={
            <Crumbs
              items={[
                { label: 'Clients', href: '/clients' },
                { label: report.clientName, href: `/clients/${report.clientId}` },
                { label: 'Progress report' },
              ]}
            />
          }
          title={report.clientName}
          sub={
            <>
              {report.weeks} weeks · {longDate(report.from)} — {longDate(report.to)}
              {report.clientSince >= report.from && (
                <> · started with you {shortDate(report.clientSince)}</>
              )}
            </>
          }
          actions={
            <>
              <Segment label="How far back the report goes" mode="single">
                {REPORT_WEEKS.map((w) => (
                  <SegmentButton
                    key={w}
                    mode="single"
                    pressed={report.weeks === w}
                    onClick={() => setWeeks(w)}
                  >
                    {w}w
                  </SegmentButton>
                ))}
              </Segment>
              <Button href={`/clients/${report.clientId}`} variant="secondary">
                Open their file
              </Button>
            </>
          }
        />

        <div className="body">
          {report.isThin ? (
            <ThinReport report={report} />
          ) : (
            <Sidecar
              fill
              asideLabel="The report as the client will get it, and how to send it"
              /* 420px, not the component's 380 default, and the figure is
                 `.rptcard`'s own: a 1080×1350 PNG stops being legible at a
                 glance and starts being a thumbnail below about 420 wide. The
                 track is a cap, so the container query still stacks the two
                 columns before it is ever squeezed past that. */
              style={{ '--w-sdc-side': '420px' } as React.CSSProperties}
              /* `pin`, not the first child of `aside`, and the difference is
                 the phone. The rail is 713px in a 530px window, so the send
                 panel has to be at its top or its buttons are below the fold
                 on arrival — and STACKED it has to be under the card, because
                 a trainer scrolling down reads *send this* before seeing what
                 they are sending. `.sdc__pin` swaps the two ends on the
                 container query that already decides which layout it is. */
              pin={
                <SendPanel
                  report={report}
                  hasShareSheet={hasShareSheet}
                  outcome={outcome}
                  run={run}
                />
              }
              aside={<CardPreview report={report} />}
            >
              {/* ── the six figures the whole report is made of ──────────── */}
              <Strip wrap style={{ marginBottom: 14 }}>
                <StripCell value={s.attended} label={s.attended === 1 ? 'Session' : 'Sessions'} />
                <StripCell
                  value={s.adherence === null ? '—' : s.adherence}
                  unit={s.adherence === null ? undefined : '%'}
                  /* `Adherence`, and the card says `Of what we booked`. The
                     two artefacts have two readers and this is the trainer's:
                     `adherence` is the word every other trainer-facing surface
                     uses for this figure, and the warm spelling exists because
                     a client should not have to learn it. It also FITS —
                     MEASURED at 1400px, six tiles are 137px with 109px of text
                     room and `OF WHAT WE BOOKED` is 121px, so it was the one
                     label of the six wrapping to two lines. */
                  label="Adherence"
                />
                <StripCell
                  value={report.bestStreak}
                  label={report.bestStreak === 1 ? 'Week in a row' : 'Weeks in a row'}
                />
                <StripCell
                  value={report.prCount}
                  label={report.prCount === 1 ? 'Personal best' : 'Personal bests'}
                />
                <StripCell value={report.exerciseCount} label="Movements" />
                <StripCell
                  value={
                    report.volumeKg >= 1000
                      ? (report.volumeKg / 1000).toFixed(1)
                      : report.volumeKg
                  }
                  unit={report.volumeKg >= 1000 ? 't' : 'kg'}
                  label="Load moved"
                />
              </Strip>

              {/* ── turning up ───────────────────────────────────────────── */}
              {report.bestWeek > 0 && (
                <Card>
                  <Card.Head title="Turning up" />
                  <Card.Body>
                    {/* `c-volumebars`, which the report used to draw a canvas
                        version of INSIDE the PNG and nowhere else — so the one
                        figure on the card a trainer could not read on their own
                        screen was the shape of their client's consistency. It
                        reports days trained rather than kilos, because the
                        question this chart answers is whether somebody kept
                        turning up. */}
                    <VolumeBars
                      size="sm"
                      label={`Days trained each week over ${report.weeks} weeks`}
                      unit="days"
                      weeks={report.weekSeries.map((week) => ({
                        label: `w${week.index}`,
                        value: week.count,
                        fraction: report.bestWeek > 0 ? week.count / report.bestWeek : 0,
                        when: shortDate(week.from),
                        /* THE ACCENT GOES ON THE MOST RECENT WEEK THEY TRAINED,
                           and without this the whole chart was grey.

                           `current` is documented as *this week*, and the
                           component's own note records why that is the wrong
                           anchor for a pinned LABEL: a client who last trained a
                           fortnight ago has no current week in the series at
                           all. The same hole makes it the wrong anchor for the
                           COLOUR here — this window ends today, so nothing was
                           ever `current`, and MEASURED every one of the twelve
                           columns came out `--tx-surface-3` grey. Which is also
                           the palette's weakest: nothing in the grey scale
                           reaches 3:1 against the surface behind it.

                           So the accent is on the LATEST week with a session in
                           it, which is a claim that stays true whenever the
                           report is generated. */
                        current: week.index === latestTrainedWeek,
                      }))}
                      note={
                        report.trainedWeeks === report.weeks ? (
                          <>
                            <b>Every week.</b> There is no week in this window they did not
                            train in — which is the single most persuasive line the card has,
                            and it is why the streak is one of the six figures above.
                          </>
                        ) : (
                          <>
                            Trained in <b>{report.trainedWeeks} of {report.weeks} weeks</b>,
                            with a best run of <b>{report.bestStreak}</b> in a row. An empty
                            week keeps its bar rather than leaving a gap: a hole in a row of
                            columns reads as missing data, and a week off is not missing data.
                          </>
                        )
                      }
                    />
                  </Card.Body>

                  {/* The one thing the client is NOT sent about attendance. A
                      trainer should see where a rate came from before they hand
                      it to somebody. */}
                  <Card.Body style={{ borderTop: '1px solid var(--tx-line)' }}>
                    {s.unmarked > 0 ? (
                      <Message tone="warn">
                        <b>
                          {s.unmarked} past session{s.unmarked === 1 ? '' : 's'}
                        </b>{' '}
                        in this window {s.unmarked === 1 ? 'was' : 'were'} never marked.{' '}
                        {s.unmarked === 1 ? 'It is' : 'They are'} in neither figure — not
                        counted as done, and not counted against them.
                      </Message>
                    ) : (
                      <p className="small" style={{ lineHeight: 1.6 }}>
                        Adherence is over sessions that <b>settled</b> — done or no-show.
                        Every booking in this window was marked one way or the other, so
                        nothing is missing from it.
                      </p>
                    )}
                  </Card.Body>
                </Card>
              )}

              {/* ── the body ─────────────────────────────────────────────── */}
              {metrics.length > 0 && (
                <Card style={{ marginTop: 14 }}>
                  <Card.Head title="Measurements">
                    <Tag>{metrics.length} measured</Tag>
                    <span className="small mono" style={{ marginLeft: 'auto' }}>
                      start → latest
                    </span>
                  </Card.Head>
                  <Card.Body>
                    <ProgressRows>
                      {metrics.map((m) => (
                        <ProgressRow
                          key={m.type}
                          name={m.label}
                          meta={
                            m.baselineIsOlder
                              ? `one reading in the window · measured from ${shortDate(
                                  m.firstAt,
                                )}, before it opened`
                              : `${m.readings} readings · ${shortDate(m.firstAt)} to ${shortDate(
                                  m.lastAt,
                                )}`
                          }
                          series={m.series.map((p) => p.value)}
                          from={m.from}
                          to={m.to}
                          unit={m.unit}
                          label={`${m.label} over ${report.weeks} weeks`}
                        />
                      ))}
                    </ProgressRows>
                  </Card.Body>
                  <Card.Body style={{ borderTop: '1px solid var(--tx-line)' }}>
                    <p className="small" style={{ lineHeight: 1.6 }}>
                      No colour on the change, on the card or here: the app has
                      <b> no opinion</b> about which way a client&rsquo;s numbers should go,
                      and a green arrow would be one. The line is accent because a shape is
                      not a verdict.
                    </p>
                  </Card.Body>
                </Card>
              )}

              {/* ── the lifts ────────────────────────────────────────────── */}
              {report.lifts.length > 0 && (
                <Card style={{ marginTop: 14 }}>
                  <Card.Head title="Getting stronger">
                    <Tag>{report.lifts.length} moved</Tag>
                  </Card.Head>
                  <Card.Body>
                    <ProgressRows>
                      {report.lifts.map((l) => (
                        <ProgressRow
                          key={l.exerciseId}
                          name={l.name}
                          meta={`${l.days} days · ${l.sets} sets`}
                          series={l.series.map((p) => p.value)}
                          from={l.from}
                          to={l.to}
                          unit={l.unit}
                          delta={`+${l.percent}%`}
                          label={`${l.name}, best set each session`}
                        />
                      ))}
                    </ProgressRows>
                  </Card.Body>
                  <Card.Body style={{ borderTop: '1px solid var(--tx-line)' }}>
                    <p className="small" style={{ lineHeight: 1.6 }}>
                      The pair is the best set on the <b>first day</b> of the window against
                      the best anywhere in it — not against the last day, because a block
                      often closes on a deload and a real gain would read as a loss. The line
                      beside it is every session&rsquo;s top set, deloads included, which is
                      what the pair deliberately looks past. Only the top four go on the card.
                    </p>
                  </Card.Body>
                </Card>
              )}

              {/* ── every movement, including the ones that did not move ─── */}
              {report.exercises.length > 0 && (
                <Fold
                  title="Every movement trained"
                  sub={
                    report.newExerciseCount > 0
                      ? `${report.exercises.length} in total, ${report.newExerciseCount} of them for the first time`
                      : `${report.exercises.length} in total, most-trained first`
                  }
                  open={showCensus}
                  onOpenChange={setShowCensus}
                  flush
                  style={{ marginTop: 14 }}
                >
                  {/* THE ROWS THAT DID NOT GAIN ARE THE POINT OF THIS TABLE.
                      `Getting stronger` is a shortlist by construction — the
                      builder drops anything that did not beat its own first day,
                      which is right for a card the client keeps and useless for
                      planning next month. A movement trained eighteen times that
                      has not moved is the most useful row on this screen, and
                      before this pass there was no way to see it at all.

                      Folded shut because it is reference rather than news: a
                      31-row table open by default is 1,300px of scroll between
                      the lifts and the method note. */}
                  <Table
                    caption="Every movement trained in the window, most-trained first"
                    columns={[
                      { key: 'what', label: 'Movement' },
                      { key: 'days', label: 'Days', numeric: true },
                      { key: 'sets', label: 'Sets', numeric: true },
                      { key: 'reps', label: 'Reps', numeric: true },
                      { key: 'load', label: 'Load', numeric: true },
                      { key: 'top', label: 'Top set', numeric: true },
                      { key: 'gain', label: 'Change', numeric: true },
                    ]}
                  >
                    {report.exercises.map((e) => (
                      <Row
                        key={e.exerciseId}
                        cells={[
                          {
                            key: 'what',
                            className: 'strong wrap',
                            content: (
                              <>
                                {e.name}
                                {e.isNew && (
                                  <>
                                    {' '}
                                    <Tag tone="acc">New</Tag>
                                  </>
                                )}
                              </>
                            ),
                          },
                          { key: 'days', content: e.days, numeric: true },
                          { key: 'sets', content: e.sets, numeric: true },
                          { key: 'reps', content: e.reps > 0 ? e.reps : '—', numeric: true },
                          {
                            key: 'load',
                            numeric: true,
                            content:
                              e.volumeKg > 0 ? `${e.volumeKg.toLocaleString('en-IN')} kg` : '—',
                          },
                          {
                            key: 'top',
                            numeric: true,
                            content:
                              e.topLoad !== null
                                ? `${trim(e.topLoad)} kg`
                                : e.topReps !== null
                                  ? `${e.topReps} reps`
                                  : '—',
                          },
                          {
                            key: 'gain',
                            numeric: true,
                            style:
                              e.gainPercent !== null
                                ? { color: 'var(--tx-accent-text)' }
                                : undefined,
                            content: e.gainPercent !== null ? `+${e.gainPercent}%` : '—',
                          },
                        ]}
                      />
                    ))}
                  </Table>
                </Fold>
              )}

              {/* ── the draft that goes with it ──────────────────────────── */}
              <Fold
                title="The message that goes with it"
                sub="A first draft — it opens in your own WhatsApp composer"
                open={showMessage}
                onOpenChange={setShowMessage}
                style={{ marginTop: 14 }}
              >
                {/* Folded rather than always open, and that IS a change of mind
                    about it. The old note said it was shown rather than hidden
                    because *"it is going out under the trainer's name"* and they
                    cannot edit what they have not read — which is true, and it
                    still cost 403px, the tallest card on the screen, to a
                    ten-line draft that never changes. The title says what is
                    inside it and one click opens it, which is a different thing
                    from hiding it. */}
                <pre
                  className="small mono"
                  style={{
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.65,
                    margin: 0,
                    color: 'var(--tx-ink-2)',
                  }}
                >
                  {reportMessage(report)}
                </pre>
              </Fold>

              {/* ── and how it was all worked out ──────────────────────

                  The third fold, and the three together are this page’s
                  reference shelf: what every movement did, what the message
                  says, and what each figure means. MEASURED open, the card
                  was 407px — the tallest thing on the screen after the two
                  lists it is a footnote to, and 407px of prose nobody reads
                  twice sat between the report and the end of the page. */}
              <Fold
                title="How this was measured"
                sub="What is in each figure, and what is deliberately not"
                open={showMethod}
                onOpenChange={setShowMethod}
                style={{ marginTop: 14 }}
              >
                <div className="col gap3">
                  <Method k="Adherence">
                    Over sessions that <b>settled</b> — done, or a no-show. A booking nobody
                    marked is in neither half of it, and is counted and named above instead
                    of quietly changing the rate.
                  </Method>
                  <Method k="Personal bests">
                    Against every set this client has ever logged, not against this window, so
                    a record is a record. Counted once per movement per day — working up 40,
                    45, 50 in one session is one best, not three.
                  </Method>
                  <Method k="Getting stronger">
                    The best set on the first day of the window against the best set anywhere
                    in it. Ranked by the <b>proportion</b> gained rather than the kilos: +5 kg
                    on a 20 kg curl is a bigger achievement than +5 kg on a 140 kg deadlift.
                  </Method>
                  <Method k="Measurements">
                    From the last reading taken <b>before</b> the window opened where there is
                    one, so a client weighed in January and again last week has a change
                    rather than a blank. The row says so when that is what happened.
                  </Method>
                  <Method k="What is not on it">
                    No injury, no condition, no PAR-Q answer, and there is no field for any of
                    them anywhere near this report. It is the one screen in the product built
                    to leave the building, which makes it the worst possible place for health
                    data.
                  </Method>
                </div>
              </Fold>
            </Sidecar>
          )}
        </div>
      </main>
    </>
  );
}

/** One line of the method note. `c-keyvalue` was the near miss: its value is
 *  ranged right for a figure, and every one of these is a sentence. */
function Method({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mono small" style={{ color: 'var(--tx-ink-3)', letterSpacing: '.08em' }}>
        {k.toUpperCase()}
      </p>
      <p className="small" style={{ lineHeight: 1.65, marginTop: 4 }}>
        {children}
      </p>
    </div>
  );
}

/**
 * THE ROUTES OUT, AND THEY ARE RANKED BY WHAT THE MACHINE CAN ACTUALLY DO.
 *
 * Two rows, because there are two kinds of button here and mixing them was the
 * old panel's problem: four buttons of equal weight in one wrapping row, so the
 * one genuinely-one-tap action and *Download* sat at the same rank and the row
 * re-flowed differently on every window.
 *
 * **Row one sends.** The native sheet where it exists — on a phone it is the
 * only route that takes the image, the PDF and the message together — then
 * WhatsApp, which every machine has. The sheet is hidden rather than disabled on
 * a desk: a button that can never work is worse than no button.
 *
 * **Row two hands over a file** for a trainer to attach themselves, which is
 * what a desk actually needs, since a `wa.me` link carries text and has never
 * carried an attachment.
 */
function SendPanel({
  report,
  hasShareSheet,
  outcome,
  run,
}: {
  report: Report;
  hasShareSheet: boolean;
  outcome: ShareOutcome | 'working' | null;
  run: (action: (r: Report) => Promise<ShareOutcome>) => void;
}) {
  const first = report.clientName.split(' ')[0];

  return (
    <Card
      title={`Send it to ${first}`}
      aside={<Tag>{report.clientPhone ? 'Number on file' : 'No number on file'}</Tag>}
    >
      <div className="row gap2" style={{ flexWrap: 'wrap' }}>
        {hasShareSheet && (
          <Button variant="primary" onClick={() => run(shareCard)}>
            Share card and report
          </Button>
        )}
        <Button
          href={whatsappUrl(report)}
          variant={hasShareSheet ? 'secondary' : 'primary'}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open WhatsApp
        </Button>
      </div>

      <p
        className="mono small"
        style={{ color: 'var(--tx-ink-3)', letterSpacing: '.08em', margin: '16px 0 8px' }}
      >
        OR TAKE THE FILES
      </p>
      <div className="row gap2" style={{ flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={() => run(copyCard)}>
          Copy the card
        </Button>
        <Button variant="secondary" onClick={() => run(downloadCard)}>
          Save image
        </Button>
        <Button variant="secondary" onClick={() => run(downloadReportPdf)}>
          Save PDF
        </Button>
      </div>

      {/* `c-message`, which is the component behind the `.msg` this used to
          hand-write — and the hand-written one carried a note about needing a
          single `<span>` inside it, because `.msg` is `display:flex` with a gap
          and every inline child becomes a flex ITEM. That is precisely the
          paragraph a component exists to stop every call-site writing. */}
      <Message style={{ marginTop: 16 }}>
        <span aria-live="polite">
          {outcome === 'working' && 'Drawing the card and the report…'}
          {outcome === 'copied' && 'Card copied. Paste it straight into the chat.'}
          {outcome === 'downloaded' && 'Card saved to your downloads as a PNG.'}
          {outcome === 'saved-pdf' && 'Report saved to your downloads as a PDF.'}
          {outcome === 'shared' && 'Handed to your phone’s share sheet.'}
          {outcome === 'cancelled' && 'Nothing sent.'}
          {outcome === 'unsupported' && 'This browser cannot do that one — Save still works.'}
          {outcome === 'failed' && 'That did not go through. Save still works.'}
          {outcome === null && (
            <>
              <b>WhatsApp takes text, not attachments, from a link.</b> On a desk: open the
              chat, then paste the card or attach the PDF. On a phone,{' '}
              <i>Share card and report</i> sends all three at once.
            </>
          )}
        </span>
      </Message>
    </Card>
  );
}

/**
 * NOTHING TO REPORT, AND THE SCREEN SAYS SO RATHER THAN DRAWING A BLANK CARD.
 *
 * A card with a name on it and no figures under it is worse than no card: the
 * trainer sends it, the client reads it as "you have done nothing", and a
 * retention tool has cost a renewal. So the report refuses to be generated and
 * names what would fill it.
 */
function ThinReport({ report }: { report: Report }) {
  return (
    <EmptyState
      icon={
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      }
      title={<>Nothing to show {report.clientName} yet</>}
      body={
        <>
          There are no delivered sessions, measurements or logged sets in the last{' '}
          {report.weeks} weeks. A card with a name on it and no figures under it reads as{' '}
          <i>you have done nothing</i>, so this one is not generated.
        </>
      }
      action={
        <div className="row gap2" style={{ marginTop: 16 }}>
          {REPORT_WEEKS.filter((w) => w !== report.weeks).map((w) => (
            <Button
              href={`/clients/${report.clientId}/report?weeks=${w}`}
              variant="secondary"
              key={w}
            >
              Try {w} weeks
            </Button>
          ))}
          <Button href={`/clients/${report.clientId}`} variant="primary">
            Open their file
          </Button>
        </div>
      }
      style={{ marginTop: 48 }}
    />
  );
}
