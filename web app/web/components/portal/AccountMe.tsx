import type {
  MeWire,
  PortalMessageWire,
  PortalPackageWire,
  PortalPaymentWire,
} from '@/lib/portal/api';
import { buildArrangement, daysLeftOn } from '@/lib/portal/account';
import { dayStamp, relativePast, rupees } from '@/lib/today/time';
import { Avatar } from '@/web-components/ui/Avatar';
import { Markup } from '@/web-components/ui/Markup';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { CoachNote } from '@/web-components/ui/CoachNote';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { InlineLink } from '@/web-components/ui/InlineLink';
import { KeyValueList } from '@/web-components/ui/KeyValue';
import { ListRow, ListRows } from '@/web-components/ui/ListRow';
import { Meter } from '@/web-components/ui/Meter';
import { Row, Table } from '@/web-components/ui/Table';
import { Tag } from '@/web-components/ui/Tag';

import { RosterSwitch } from './RosterSwitch';

/** §8's own cap. Ten is a year of a trainer who writes monthly. */
const NOTES_SHOWN = 10;

/**
 * §5 · Me — the trainer, the arrangement, the package and the notes.
 *
 * ── THE TRAINER CARD IS FIRST, AND THE SPEC SAYS BY HOW MUCH ────────────────
 *
 * §5: *"Trainer card, prominent — photo, name, WhatsApp button. The most-used
 * element on this screen by a wide margin."* So it is the first card on the
 * default tab, it carries the only primary button on the destination, and the
 * WhatsApp verb is a plain `wa.me` link.
 *
 * ── AND IT IS BUILT LIKE A HERO NOW, WHICH IT WAS NOT ───────────────────────
 *
 * It rendered as a plain `Card level={2}` — visually the quietest card in the
 * portal, while `/me/today` gives a real `HeroCard` to a smaller job. `tone`
 * fixes that with the design system's own emphasis rather than a new one:
 * `.card--lead` is the corner wash `webapp.css` describes as meaning **start
 * reading here**, which is what the spec's sentence asks for. It is deliberately
 * NOT `.card--acc`, whose flat tint means *something is happening right now*.
 *
 * `HeroCard` was the obvious component and is the wrong shape: it is built
 * around a `figure` and a `kicker` for a session, and it has no avatar slot at
 * all. A trainer card is an identity, not a measurement.
 *
 * ── AND THE WHATSAPP LINK LOGS NOTHING, WHICH IS A RULE THIS PRODUCT HAS ────
 *
 * `Header.tsx` on the trainer half made the same call and stated it: routing a
 * conversation through `POST /v1/clients/{id}/nudge` writes a `nudge_log` row,
 * and the phone computes a once-per-client-per-seven-days cooldown from that
 * table — so a client saying *are we on for Tuesday* would silently spend the
 * reminder an overdue invoice needs three days later. It is a link.
 *
 * ── BOTH OUTBOUND LINKS OPEN A NEW TAB, AND THE COST IS NAMED ───────────────
 *
 * Neither had `target` or `rel`. On a phone the OS hands off and nothing is
 * lost; on a desktop a client reading the privacy card loses the screen they
 * were reading, and there is no in-app way back to the tab they were on.
 *
 * The trade is real in the other direction and is worth stating rather than
 * pretending away: `_blank` on a `wa.me` link that the OS intercepts can leave
 * an empty tab behind on some mobile browsers. An empty tab is a tidiness
 * problem; losing the screen is a navigation problem, so `newTab` wins. Both go
 * through `Button`'s `rest` spread and `InlineLink`, which is the one place in
 * this product that pairs `target="_blank"` with `rel="noopener noreferrer"`
 * — its own docstring says why that pair has "a security answer rather than a
 * taste answer" — and which appends a clipped *(opens in a new tab)* so the new
 * tab is announced rather than sprung.
 */
export function AccountMe({
  me,
  packages,
  payments,
  messages,
  now,
}: {
  me: MeWire;
  packages: PortalPackageWire[];
  payments: PortalPaymentWire[];
  messages: PortalMessageWire[];
  now: number;
}) {
  const first = me.trainer.name.split(' ')[0];
  const live = packages.find((p) => p.status === 'active') ?? null;
  const past = packages.filter((p) => p.status !== 'active');
  const arrangement = buildArrangement(me);

  const digits = (me.trainer.phone ?? '').replace(/\D/g, '').slice(-10);
  const whatsapp =
    digits.length === 10
      ? `https://wa.me/91${digits}?text=${encodeURIComponent(
          `Hi ${first}, it's ${me.client.name.split(' ')[0]}.`,
        )}`
      : null;

  const paidTotal = payments.reduce((n, p) => n + p.amount, 0);
  const daysLeft = live ? daysLeftOn(live, now) : null;

  const shown = messages.slice(0, NOTES_SHOWN);
  const older = messages.length - shown.length;

  return (
    <div className="portal col gap4">
      {/* ── the trainer · §5's most-used element ───────────────────────────── */}
      <Card level={2} tone="lead">
        <CardBody>
          <div className="row row--top gap4">
            <Avatar name={me.trainer.name} id={me.trainer.id} size="lg" />
            <div className="col gap2" style={{ flex: 1, minWidth: 0 }}>
              {/* An `<h2>` and not a `<p className="h4">`. This is the first
                  heading in the panel and it was the one element on the old
                  screen carrying `.h4` — so a reader walking the destination by
                  structure met the page title and then nothing until the second
                  card. `.h4` is pure type and `webapp.css`'s reset zeroes
                  heading margins, so the swap moves nothing. */}
              <h2 className="h4" style={{ fontSize: 19 }}>
                {me.trainer.name}
              </h2>
              {me.trainer.headline && <p className="small ink2">{me.trainer.headline}</p>}
              {me.trainer.gymName && (
                <p className="small ink3">
                  {me.trainer.gymName}
                  {me.trainer.mapLink && (
                    <>
                      {' · '}
                      <InlineLink href={me.trainer.mapLink} newTab>
                        Directions
                      </InlineLink>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
          {/* ── the two verbs, and the second one is the one India reaches for

              §5 asks for the WhatsApp button and gets it as the primary. `tel:`
              is beside it because a client standing outside a locked gym at
              6:25am does not want a message — and `Button` already routes a
              `tel:` href to a plain anchor, so it is one call-site and no new
              machinery.

              A `.row` with `flex-wrap` rather than two `wide` buttons stacked:
              stacked, the secondary is as loud as the primary at 390px, and §5
              is explicit about which of the two is the most-used element. They
              share a line and the primary takes the slack. */}
          {(whatsapp || digits.length === 10) && (
            <div className="row gap3 mt4" style={{ flexWrap: 'wrap' }}>
              {whatsapp && (
                <Button
                  variant="primary"
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ flex: '1 1 auto' }}
                >
                  Message {first} on WhatsApp
                  <span className="vh"> (opens in a new tab)</span>
                </Button>
              )}
              {digits.length === 10 && (
                <Button variant="secondary" href={`tel:+91${digits}`}>
                  Call
                </Button>
              )}
            </div>
          )}
        </CardBody>

        {/* ── §9 · a client on two rosters, and the switch that existed ───── */}
        <RosterSwitch rosters={me.rosters} activeClientId={me.client.id} />
      </Card>

      {/* ── §9 · your arrangement · four facts that were on the wire and on no
             screen. `lib/portal/account.ts` carries why they are read-only. ── */}
      {arrangement.length > 0 && (
        <Card>
          <CardHead title="Your arrangement" />
          <CardBody>
            <KeyValueList rows={arrangement} />
          </CardBody>
          <CardBody divided>
            <p className="small">
              {first} sets these — message them if any of it has changed. They are
              not yours to edit here, and that is deliberate: a training
              arrangement is agreed between two people.
            </p>
          </CardBody>
        </Card>
      )}

      {/* ── my package · §5's *sessions remaining, expiry, history* ─────────

          The Payments column is `.num`, and the totals are the client's own —
          what THEY paid. `collectedBy` and `gymShareAmount` never reach this
          screen: `mock/portal.ts` withholds them at the projection, on the
          grounds that whether the gym took a cut is the trainer's business
          arrangement and the visibility screen promises a short list.

          ── THE CARD WAS THINNER THAN THE HOME SUMMARY THAT LINKS TO IT ─────

          `Home`'s package card draws a `Meter`, a low-sessions nudge and a link
          reading *See your package and payments*. The destination had no meter,
          no start date, no days remaining and no total paid — a four-row list
          and a three-row table. A link that promises more and delivers less
          teaches people to stop following links, so the meter came across and
          the three figures that were on the wire are drawn.

          ── AND THE HEAD GAVE UP ITS TAG ───────────────────────────────────

          It carried `{rupees(amountDue)} owing`, which is now the second half of
          `.ph__sub` about 130px above it. `.ph--today`'s rule: the duplicated
          string goes to the header once. `Still to pay` stays in the list,
          because a header stating the screen's state and a ledger naming the
          line it comes from are two different jobs. */}
      <Card>
        <CardHead title="Your package" />
        {live ? (
          <>
              {/* The meter first, because it is the answer. It fills with what
                  is LEFT rather than with what is spent — the direction `Home`
                  chose and stated: the caption beside it reads *8 of 12 left*,
                  and a bar disagreeing with its own sentence is worse than no
                  bar. `total` is explicit so the spent sessions are a real gap,
                  which `Meter`'s docstring calls the one case a short bar means
                  something.

                  `Meter`'s `label` is `aria-label` and paints no ink — the
                  defect the Plan pass recorded — so the caption is drawn. */}
            {live.sessionsRemaining !== null && live.sessionsTotal !== null && (
              <CardBody>
                <div>
                  <Meter
                    label={`${live.sessionsRemaining} of ${live.sessionsTotal} sessions left`}
                    total={live.sessionsTotal}
                    segments={[{ tone: 'ok', value: live.sessionsRemaining, label: 'left' }]}
                  />
                  <p className="small mt2" style={{ color: 'var(--tx-ink)' }}>
                    {live.sessionsRemaining} of {live.sessionsTotal} sessions left
                  </p>
                </div>
              </CardBody>
            )}
              {/* ── THE CAPTION AND THE LIST WERE TOUCHING, MEASURED AT 0px ───

                  The bar's caption is a sentence ABOUT the bar; the list under
                  it is a different kind of thing entirely. At 390px the gap
                  between the caption's bottom and the list's top measured
                  **exactly 0.0px** — `.mt3` on the list is spent closing the
                  caption's own line-box slack and nothing is left over — so
                  *6 of 12 sessions left* read as a fourth key with its value
                  missing, directly above *What you are on · Gym 12-pack*.

                  A rule rather than more margin: the two are separated because
                  they are different, and `Card`'s own divider is how this sheet
                  says so everywhere else. */}

            <CardBody divided={live.sessionsRemaining !== null}>
              <KeyValueList
                rows={[
                  { k: 'What you are on', v: live.name },
                  ...(live.startDate
                    ? [
                        {
                          k: 'Started',
                          v: dayStamp(new Date(`${live.startDate}T00:00:00`).getTime()),
                        },
                      ]
                    : []),
                  ...(live.endDate
                    ? [
                        {
                          k: 'Runs until',
                          /* The days remaining go in the SAME row as the date
                             rather than in one of their own: they are two
                             readings of one fact, and a client reads whichever
                             of the two they think in. */
                          v:
                            daysLeft !== null
                              ? `${dayStamp(new Date(`${live.endDate}T00:00:00`).getTime())} · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`
                              : dayStamp(new Date(`${live.endDate}T00:00:00`).getTime()),
                        },
                      ]
                    : []),
                  { k: 'Paid', v: rupees(live.amountPaid) },
                  ...(live.amountDue > 0
                    ? [{ k: 'Still to pay', v: rupees(live.amountDue) }]
                    : []),
                ]}
              />
            </CardBody>
          </>
        ) : (
          <CardBody>
            {/* `EmptyState`, per the catalogue rule — this was a bare `<p>`, and
                `AGENTS.md` is explicit that a screen does not hand-write what the
                catalogue covers. The COPY is unchanged and is the good part: it
                refuses to become a storefront, which is the design set's own
                promise that a client "is never sold anything here". */}
            <EmptyState
              kind="first-run"
              inCard
              title="No package running just now"
              body={`${first} sets these up — there is nothing to buy in here.`}
            />
          </CardBody>
        )}

        {payments.length > 0 && (
          <CardBody flush divided>
            {/* A real `Table`, and this is the one on this screen that IS a
                table: three short columns of figures somebody runs their eye
                down. `Table`'s own docstring draws that boundary — "a table is
                for COMPARING; a list row is for FINDING" — and it is why the
                notes and the visibility rows are neither.

                The total row is the `foot` prop, which this pass added to the
                component: a payments table with no total makes a client add up
                their own three payments to answer *what have I paid this
                trainer*, which is the question the table is for. */}
            <Table
              /* ── NO STICKY HEAD ON A TABLE THIS SHORT ──────────────────────

                 §11's `.tbl thead th` is sticky, and it is right for the long
                 roster it was written for. This table is three rows inside a
                 card halfway down `.body`, and sticky is clamped to its own
                 table box — which still gave the head 160px of travel and it
                 used every pixel. Measured at 390px: `PAID / HOW / AMOUNT`
                 pinned itself to the top of the scroller while the first
                 payment slid under it and was clipped through the middle of its
                 own figures.

                 `tbl--flow` is the opt-out §11 grew for exactly this. */
              className="tbl--flow"
              caption={`Your payments, ${payments.length} recorded`}
              columns={[
                { key: 'paid', label: 'Paid' },
                { key: 'how', label: 'How' },
                { key: 'amount', label: 'Amount', numeric: true },
              ]}
              foot={
                <Row
                  header="Total"
                  cells={[
                    { key: 'how', content: '' },
                    {
                      key: 'amount',
                      numeric: true,
                      className: 'strong',
                      content: rupees(paidTotal),
                    },
                  ]}
                />
              }
            >
              {payments.map((p) => (
                <Row
                  key={p.id}
                  header={p.paidAt ? dayStamp(p.paidAt) : dayStamp(p.createdAt)}
                  cells={[
                    {
                      key: 'how',
                      className: 'ink3',
                      /* `Upi` was the trainer half's own defect here — a
                         `text-transform:capitalize` title-cased an acronym and
                         shouted a plain word. Cased in TS for the same reason. */
                      content:
                        p.method === 'upi'
                          ? 'UPI'
                          : p.method
                            ? p.method[0].toUpperCase() + p.method.slice(1)
                            : '—',
                    },
                    { key: 'amount', numeric: true, content: rupees(p.amount) },
                  ]}
                />
              ))}
            </Table>
          </CardBody>
        )}

        {past.length > 0 && (
          /* ── THE HISTORY WAS A SENTENCE THAT NAMED SOMETHING AND WENT
                NOWHERE ───────────────────────────────────────────────────────

             It read *"2 finished packages before this one."* — a count with no
             way to see what it counted, on a screen §5 asks to carry the
             package HISTORY. `past` was already in scope on the component.

             `ListRow`s, name and dates, and **no money arithmetic**: what a
             client paid for a pack that ended in March is on the payments table
             above, dated, and re-deriving it per row is how one screen ends up
             disagreeing with the other about a total. No `href` either — there
             is no per-package screen in this portal and there should not be one
             for a row this thin, which is what `ListRow` draws as a statement
             rather than a link. */
          <CardBody flush divided>
            <div style={{ padding: '12px 14px 4px' }}>
              <h3 className="h5">Packages before this one</h3>
            </div>
            <ListRows label="Finished packages">
              {past.map((p) => (
                <ListRow
                  key={p.id}
                  title={p.name}
                  sub={
                    p.startDate && p.endDate
                      ? `${dayStamp(new Date(`${p.startDate}T00:00:00`).getTime())} – ${dayStamp(new Date(`${p.endDate}T00:00:00`).getTime())}`
                      : p.endDate
                        ? `Ended ${dayStamp(new Date(`${p.endDate}T00:00:00`).getTime())}`
                        : undefined
                  }
                  right={
                    p.sessionsTotal !== null ? (
                      <span className="small ink3">{p.sessionsTotal} sessions</span>
                    ) : undefined
                  }
                />
              ))}
            </ListRows>
          </CardBody>
        )}
      </Card>

      {/* ── the trainer's notes to them, as a history ───────────────────────

          Home draws the newest one; this is the rest. It is on this tab rather
          than on Progress because a client reads it the way they read their
          package — occasionally, and looking for something specific.

          ── FOUR THINGS WERE WRONG WITH THIS BLOCK AND ONE WAS THE THRESHOLD ─

          It rendered on `messages.length > 1`, so **a client whose trainer has
          written to them exactly once had no notes card here at all** — Home
          shows the newest, this screen is "the rest", and at one note the rest
          is nothing. Reasonable in principle and wrong for the client it
          happens to: the one note they have is the one they want to re-read.
          `> 0` now, and the card's own copy carries the overlap.

          It also typed its own quotes, dropped `kind`, and was unbounded. */}
      {messages.length > 0 && (
        <Card>
          <CardHead title={`Notes from ${first}`}>
            {messages.length > NOTES_SHOWN && (
              <Tag>
                {shown.length} of {messages.length}
              </Tag>
            )}
          </CardHead>
          {/* ── PROSE IS NOT A TABLE, MEASURED AT 390px ────────────────────

              This was a two-column `.tbl` — a relative stamp beside the note —
              and it rendered **907px wide in a 350px card**, because §11 gives
              every cell `white-space:nowrap`: a `.tbl` cell does not wrap, it
              widens. Found by measuring, not by eye.

              A `CardBody` per note instead, with `divided` drawing the rule
              between them — which is what that prop is FOR, in `Card`'s own
              words. That structure is unchanged; what changed is what goes
              inside it.

              ── AND IT IS `CoachNote` NOW, WHICH THE CATALOGUE ALREADY HAD ──

              `Home` draws a trainer's note with `CoachNote` — attributed, with
              the avatar, and **quoted by the component rather than by the
              caller**, whose docstring says exactly why: *"two call-sites
              typing their own `&ldquo;` is two chances to use a straight one."*
              This screen was the second of those two call-sites and it was
              typing its own. That is the condition `check-components.mjs`
              exists to catch and could not, because `.cnote` was not in the
              markup to be counted.

              `kind` comes back with it. `mock/types.ts` made it a column
              precisely so the portal could tell a programme change from a
              coaching line, and this card rendered both identically. */}
          {shown.map((m, i) => (
            <CardBody key={m.id} divided={i > 0}>
              <CoachNote
                author={m.trainerName || me.trainer.name}
                authorId={me.trainer.id}
                meta={
                  <>
                    {relativePast(m.at, now)}
                    {m.kind === 'program' && (
                      <>
                        {' · '}
                        {/* Not a `tone`. `CoachNote` refuses one on the note
                            itself — *"a note from your trainer is not a
                            status"* — and this tag is about which KIND of note
                            it is, which is a label rather than a judgement. */}
                        <Tag>Plan change</Tag>
                      </>
                    )}
                    {m.kind === 'report' && (
                      <>
                        {' · '}
                        <Tag>Progress report</Tag>
                      </>
                    )}
                  </>
                }
              >
                {/* `Markup` and not the bare string. A trainer's note is written
                    in `MarkupField` on both paths that reach this list — the
                    line typed TO the client, and the private note whose share
                    switch was turned on — and `Markup` is the only thing that
                    reads the markers it writes. Printing `m.body` raw showed
                    the client `**landmine press**` with the asterisks in it,
                    which is the exact failure `Markup`'s own header names. */}
                <Markup value={m.body} />
              </CoachNote>
            </CardBody>
          ))}
          {older > 0 && (
            /* Bounded, never truncated — `AttentionQueue`'s rule on the trainer
               half. There is no *show earlier* control because there is nothing
               to show them ON: `/v1/me/messages` returns the lot and a portal
               with no notes screen has nowhere to route to. What this says is
               the honest half — the count, and who has the rest. Adding a
               screen for it is a decision, not a fix. */
            <CardBody divided>
              <p className="small">
                {older} older {older === 1 ? 'note' : 'notes'} before these. Ask {first} if you are
                looking for something they wrote a while ago.
              </p>
            </CardBody>
          )}
        </Card>
      )}
    </div>
  );
}
