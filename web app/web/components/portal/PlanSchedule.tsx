import type { MeWire } from '@/lib/portal/api';
import { planDayHref } from '@/lib/portal/plan-tabs';
import { PLAN_WINDOW_DAYS, type PortalPlanData, relativeDay } from '@/lib/portal/plan';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { InlineLink } from '@/web-components/ui/InlineLink';
import { ListRow, ListRows } from '@/web-components/ui/ListRow';
import { Row, Table } from '@/web-components/ui/Table';
import { Tag } from '@/web-components/ui/Tag';
import { WeekDots, type WeekDay } from '@/web-components/ui/WeekDots';

/**
 * §4 · Plan → **Schedule** — *"reduces the anxiety of not knowing what's
 * coming, which is a real cause of drop-off."*
 *
 * Two readings of the diary, deliberately kept side by side: what is BOOKED
 * (§4's *"upcoming sessions — next 2–4 weeks, with times and locations"*) and
 * what a week NORMALLY looks like (§4's *"this week's schedule"*). They are two
 * answers to one question and a client compares them — which is why they are
 * one tab rather than two, and it is the argument `plan-tabs.ts` gives for there
 * being three tabs and not four.
 *
 * ── THE NEXT SESSION LEADS, AND IT USED TO BE THE TWELFTH ROW ───────────────
 *
 * *When do I next see my trainer* is the most-asked question of this screen, and
 * the old flat list gave its answer exactly the weight of every other row. It is
 * a `card--lead` now: the design system's *start reading here* ground, which
 * `webapp.css` distinguishes from `card--acc` (*a log is open right now*) for
 * precisely this reason — this is emphasis, not status.
 *
 * **Not a `HeroCard`.** Home already owns a hero for today's session, and
 * `AGENTS.md` records why two identically grounded cards for one appointment is
 * how somebody starts the wrong one: *"the lack of a ground on the second card
 * is doing as much work as the wash on the first."* The same argument across two
 * screens.
 *
 * ── AND EVERY ROW LEADS INTO WHAT IS IN IT ──────────────────────────────────
 *
 * `PlanSession.templateDay` carries the argument at length. The short version:
 * a diary row saying *Thu · 11 — Lower A* and a card elsewhere on the site
 * saying *Lower A — 6 exercises* is one answer split in two, with the join left
 * to the client's memory.
 */
/**
 * `['Tue','Wed','Fri'] -> "Tue, Wed and Fri"`.
 *
 * An Oxford-less "and" rather than `join(', ')`, because the line is a SENTENCE
 * -- *Rest on Tue, Wed, Fri, Sat and Sun.* -- and that is the whole point of
 * collapsing five table rows into it. A list that still reads as a list would
 * just be the five rows with the borders taken off.
 */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function PlanSchedule({ me, data }: { me: MeWire; data: PortalPlanData }) {
  const first = me.trainer.name.split(' ')[0];
  const { next, upcoming, groups, week, venue, rescheduleHref, program } = data;

  /* ── THE TYPICAL WEEK, TWICE, AND ONLY ONE OF THEM IS EVER ON THE SCREEN ──

     The `.tbl` below 620px was the worst-spent 308px on this screen and the
     measurement is in `.plnwk--desk`'s block. It is fine on a desk, where
     seven labelled rows are seven labelled rows, so it stays there unchanged
     and the phone gets the strip instead.

     BOTH are rendered and CSS picks. `display:none` takes an element out of the
     accessibility tree as well as the layout, so a reader gets one week, not
     two -- which a `hidden` attribute driven by a media query could not
     guarantee without JavaScript this server component does not have. */
  const training = week.filter((d) => !d.rest);
  const resting = week.filter((d) => d.rest);
  /* `M T W T F S S`. Positional, and it is the ARRAY that is authoritative:
     `week` is `NAMES.map`ped in `plan.ts` and is seven, Monday-first, always. */
  const weekCells: WeekDay[] = week.map((d, i) => ({
    letter: 'MTWTFSS'[i],
    name: d.name,
    /* Two states out of the four. A template week has no record in it -- what
       HAPPENED is Progress' subject and `done`/`miss` would be this card
       answering a question it has not read the data for. */
    state: d.rest ? 'rest' : 'plan',
    /* `today` IS NOT PASSED, and `PlanWeekDay.today` carries why at length:
       `.wkd__d--now`'s 2px outline and `.wkd__c--plan`'s 1px ring are the same
       token, and in a strip with no lime fill in it they are one signal. A
       ringed rest-day Wednesday between a training Monday and a training
       Thursday read as three training days -- the strip saying the wrong shape,
       which is the only thing it is here to say. */
    href: d.templateDay !== null && program ? planDayHref(d.templateDay) : undefined,
  }));

  return (
    <div className="portal col gap4">
      {/* ── the next one ──────────────────────────────────────────────────── */}
      {next && (
        <Card tone="lead">
          {/* The head says WHEN and the tag says nothing the head already said.
              It carried `<Tag tone="acc">Today</Tag>` beside a title reading
              *Today* for one render, which is the defect this whole pass is
              about, committed inside the fix for it.

              What the tag says instead is the one thing the head cannot: the
              window has a day of slack on the near end, so the lead card can be
              a session that started forty minutes ago, and *at 8:04 AM* about
              something under way is the wrong tense. `PlanSession.started`
              carries the argument. */}
          <CardHead title={next.today ? 'Today' : next.stamp} level={2}>
            {next.started && <Tag tone="acc">Under way</Tag>}
          </CardHead>
          <CardBody>
            <div className="pln__next">
              <div className="col gap1">
                {/* The time is the figure, at the brand face, because it is what
                    a client is actually looking for. */}
                <p className="pln__time">
                  {next.time} <span className="pln__mer">{next.meridiem}</span>
                </p>
                <p className="small ink2">
                  {[
                    next.label ?? 'Session',
                    next.minutes ? `${next.minutes} min` : null,
                    next.remote ? 'Online' : next.place,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {/* The one control on the card, and it is the join. Withheld where
                  the booking carries no program day — an ad-hoc session has no
                  day to open, and a dead link is worse than no link. */}
              {next.templateDay !== null && program && (
                <Button variant="secondary" href={planDayHref(next.templateDay)}>
                  See what’s in {next.label ?? 'it'}
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── what is booked ────────────────────────────────────────────────── */}
      <Card>
        <CardHead title="Coming up">
          {/* The session count lives here now rather than in the page header,
              where it sat beside the arc and made one subtitle say two things.
              This is the card that has the sessions in it. */}
          <span className="small ink3">
            {upcoming.length === 0
              ? `next ${PLAN_WINDOW_DAYS} days`
              : `${upcoming.length} booked · next ${PLAN_WINDOW_DAYS} days`}
          </span>
        </CardHead>

        {/* ── THE VENUE, ONCE ────────────────────────────────────────────

            MEASURED: nine rows, nine times `Iron Yard, Anna Nagar`, in the
            widest slot on a 319px row -- while *how soon* was not on the row at
            all. `PortalPlanData.venue` carries the full argument; it is null
            the moment two sessions disagree, and then the rows keep their own
            places and this line is not drawn. */}
        {venue && upcoming.length > 0 && (
          <p className="small ink3 pln__venue">All at {venue}</p>
        )}

        {upcoming.length === 0 ? (
          <CardBody>
            {/* Nothing booked is a real and common state — between packs, or on
                a week the trainer has not filled in yet — and it is NOT an
                error. `EmptyState` with no primary button, because the client
                cannot book and offering them a control that opens WhatsApp
                under the words *nothing booked* would read as chasing. */}
            <EmptyState
              inCard
              title="Nothing in the diary yet"
              body={`${first} books your sessions. If you were expecting something here, a message is the quickest way to sort it.`}
            />
          </CardBody>
        ) : (
          <CardBody flush>
            {/* ── CHUNKED BY WEEK, AND STILL `ListRow` ──────────────────────

                Twelve dates in one flat list cross three week boundaries with
                nothing marking any of them, and a client scanning for *the week
                after next* has to count. The groups are the cheapest legibility
                win on this screen and they cost no new data.

                `ListRow` and NOT `.tbl`, which is the measurement the old
                screen recorded: three `nowrap` columns — when, what, where —
                need **475px** and the card is 350 on a phone. A `.tbl` cell
                does not wrap, it widens.

                The TIME is the trailing figure rather than part of the title:
                it is the one thing a client scans down the column for, and
                `.lrow__n` is tabular so the digits line up. */}
            {groups.map((g) => (
              <div key={g.label} className="pln__grp">
                <p className="micro pln__grpk">{g.label}</p>
                <ListRows label={`${g.label}, ${g.sessions.length} sessions`}>
                  {g.sessions.map((s) => (
                    <ListRow
                      key={s.id}
                      href={
                        s.templateDay !== null && program
                          ? planDayHref(s.templateDay)
                          : undefined
                      }
                      title={s.today ? 'Today' : s.stamp}
                      sub={
                        [
                          /* WHAT THE VENUE PAID FOR. `Thu · 1 Oct` is a date a
                             client has to hold against today's to turn into a
                             feeling, and §4 is about the feeling -- *"the
                             anxiety of not knowing what's coming"*. Null past a
                             week out, where the group heading is already the
                             orientation and *in 23 days* would be a second,
                             worse spelling of *Week of 12 Oct*.

                             Skipped on a row whose title already says *Today*:
                             that is the pair this whole pass exists to stop. */
                          s.today ? null : relativeDay(s.inDays),
                          s.label ?? 'Session',
                          s.minutes ? `${s.minutes} min` : null,
                          /* Only where it is not the standing line above. */
                          s.remote ? 'Online' : venue ? null : s.place,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      }
                      right={
                        <span className="lrow__n">
                          {s.time} {s.meridiem}
                        </span>
                      }
                    />
                  ))}
                </ListRows>
              </div>
            ))}
          </CardBody>
        )}

        {rescheduleHref && (
          <CardBody divided>
            <div className="row gap3" style={{ flexWrap: 'wrap' }}>
              {/* Off-site, so `Button` renders a plain `<a>` rather than a
                  prefetching `<Link>` — its own comment says why: prefetching
                  `wa.me` fires a request at WhatsApp every time the row scrolls
                  into view. */}
              <Button variant="secondary" href={rescheduleHref}>
                Ask {first} to move a session
              </Button>
              <p className="small" style={{ flex: 1, minWidth: '22ch' }}>
                Opens WhatsApp with a message ready. Nothing is sent until you send
                it.
              </p>
            </div>
          </CardBody>
        )}
      </Card>

      {/* ── the typical week ──────────────────────────────────────────────── */}
      <Card>
        <CardHead title="Your week">
          <span className="small ink3">how it usually runs</span>
        </CardHead>
        {/* ── THE PHONE'S WEEK: A RHYTHM, THEN THE DAYS THAT HAVE ONE ─────

            *How it usually runs* is a question about SHAPE -- two sessions,
            three days apart -- and seven stacked rows answer it by making the
            reader rebuild the shape from a column of words, five of which are
            the word "Rest". The strip is the shape drawn.

            `c-weekdots` and not a new family: its own docstring carries why
            (same person, same seven columns, and `plan`/`rest` are two of the
            four states it already had). The two props it grew are the two
            things a TEMPLATE week needs that a lived one does not -- a caption
            that is not a count, and a cell that opens. */}
        <CardBody className="plnwk--phone">
          {/* `caption={null}` -- no line over the strip. The card head two
              inches up already says *Your week / how it usually runs*, and
              *2 sessions a week* under it would be the heading said twice 40px
              apart, which is the defect this portal pass is named after. */}
          <WeekDots days={weekCells} caption={null} />
        </CardBody>
        <CardBody flush divided className="plnwk--phone">
          {/* The detail, for the days that have one -- the SAME `.tbl` as the
              desk's, at the same 44px a row, with the five rest rows taken out
              of it and the labels no longer links.

              Not `ListRow`, which was drawn first and measured **56px** a row
              for a two-line shape this content does not need: *Monday / Full A
              / 18:00* is three short values and a `.tbl` row sets them on one
              line. Twelve pixels a row, twice, and the shape reads as a week
              rather than as a shelf.

              The labels are PLAIN here. On the desk's copy they are the only
              way into a workout, so they are `InlineLink`s; on the phone the
              strip above is that way in at 41 x 62px, and a second link to the
              same place 30px below it at 35 x 16px is the small target this
              drawing exists to retire. */}
          <Table caption="Your typical training week">
            {training.map((d) => (
              <Row
                key={d.name}
                header={d.name}
                cells={[
                  { key: 'what', content: d.label ?? 'Training' },
                  {
                    key: 'count',
                    className: 'ink3 plnwk__c',
                    content: d.exerciseCount ? `${d.exerciseCount} exercises` : '',
                  },
                  { key: 'time', numeric: true, className: 'ink3', content: d.time ?? '' },
                ]}
              />
            ))}
          </Table>
          {/* §1 asks that a rest day is STATED rather than left blank, and it
              is -- once, in a sentence, instead of five 44px rows carrying one
              word each. The strip above has already drawn which days they are;
              this names them, which is the half a hollow cell cannot. */}
          {resting.length > 0 && (
            <p className="small ink3 pln__rest">
              Rest on {listNames(resting.map((d) => d.name.slice(0, 3)))}.
            </p>
          )}
        </CardBody>
        <CardBody flush className="plnwk--desk">
          {/* No `columns`, which `Table` supports and explains: "nine of the
              product's tables have no `<thead>` at all — a session list or a
              measurement log is read row by row, not compared down a column,
              and giving those a header row would be inventing one." Seven days
              with a label each is that shape. The caption still says what it
              is. */}
          <Table caption="Your typical training week">
            {week.map((d) => (
              <Row
                key={d.name}
                header={d.name}
                cells={[
                  {
                    key: 'what',
                    className: d.rest ? 'ink3' : undefined,
                    content: d.rest ? (
                      'Rest'
                    ) : d.templateDay !== null && program ? (
                      /* The second half of the join. A weekday and a day label
                         were two facts on two lists until this link existed. */
                      <InlineLink href={planDayHref(d.templateDay)}>
                        {d.label ?? 'Training'}
                      </InlineLink>
                    ) : (
                      (d.label ?? 'Training')
                    ),
                  },
                  {
                    /* ── THE FOURTH COLUMN, AND IT DOES NOT FIT A SMALL PHONE ──

                       MEASURED: `Wednesday · Upper A · 6 exercises · 07:00` is
                       a `.tbl` row, and §11 gives every cell `nowrap` — so it
                       does not wrap, it WIDENS. Against a 334px content box the
                       four columns run **20px past the card at 360 and 60px at
                       320**, and `.main` is `overflow:hidden` so it is clipped
                       rather than scrolled: `documentElement.scrollWidth`
                       reported zero throughout. Found by measuring cell rects
                       against the card, which is the only thing that sees it.

                       It stays at 390 — the reference width, where it fits with
                       room — and stands down below. The count is what tells a
                       client what the link opens, and it is also the least of
                       the four facts on the row: the weekday, the workout and
                       the time are all things they cannot get elsewhere on this
                       tab, and the count is one tap away on the day itself. */
                    key: 'count',
                    className: 'ink3 plnwk__c',
                    content: d.exerciseCount ? `${d.exerciseCount} exercises` : '',
                  },
                  { key: 'time', numeric: true, className: 'ink3', content: d.time ?? '' },
                ]}
              />
            ))}
          </Table>
        </CardBody>
      </Card>

      {!program && (
        <Card>
          <CardBody>
            <EmptyState
              inCard
              title="No plan assigned yet"
              body={`${first} has not written your programme in here yet. Your sessions still happen — this screen fills in when they do.`}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
