'use client';

import Link from 'next/link';

import type { MoneyData } from '@/lib/money/api';
import { computeTrend, computeUpcoming } from '@/lib/money/compute';
import { periodProse, periodRange, periodTag } from '@/lib/money/period';
import {
  computeActions,
  computeActivity,
  computeClientMetrics,
  computePeakMonth,
  computeRenewals,
  RENEWAL_WINDOW_DAYS,
  type ActionItem,
  type ActivityItem,
  type RenewalItem,
} from '@/lib/business/overview';
import { relativePast, rupees } from '@/lib/today/time';
import { TopBar } from '@/components/shell/TopBar';
import { TrendChart } from '@/components/money/TrendChart';
import { NudgeButton } from '@/components/nudge/NudgeButton';
import { Avatar } from '@/web-components/ui/Avatar';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { KeyValueRow } from '@/web-components/ui/KeyValue';
import { ListRow, ListRowNumber, ListRows } from '@/web-components/ui/ListRow';
import { Meter } from '@/web-components/ui/Meter';
import { Slab } from '@/web-components/ui/Slab';
import { Stat } from '@/web-components/ui/Stat';
import { Tag } from '@/web-components/ui/Tag';
import { Timeline } from '@/web-components/ui/Timeline';
import { BizHeader } from './BizHeader';
import { usePeriodScope } from './PeriodScope';

/**
 * OVERVIEW — the page Business did not have, and the reason the other five got
 * smaller.
 *
 * ── WHAT IT IS FOR ───────────────────────────────────────────────────────────
 *
 * Business used to open on a ledger table, which answers *what came in* and
 * nothing else. A trainer wanting to know who to chase, whose pack runs out this
 * week, or where the income actually comes from had to know which of seven tabs
 * to try — and two of those questions had no tab at all. This page is the five
 * questions, in the order a trainer asks them:
 *
 * | Section | The question |
 * | --- | --- |
 * | Needs you | what have I not done |
 * | What happened | what moved, and who moved it |
 * | Running out | who do I have to sell to again, and by when |
 * | Where the money comes from | which clients ARE the income |
 * | Over time | is it going up, and when was it best |
 *
 * ── THE RULE THIS PAGE IS BUILT TO: NO FIGURE IS STATED TWICE ────────────────
 *
 * An overview is the easiest screen in any product to fill with numbers that
 * already exist somewhere else, and it is the fastest way to make the pages
 * under it pointless. So the rule here is strict, and enforcing it is what moved
 * three things OFF other pages rather than copying them:
 *
 * - The six-bar trend and the three *You earned / Pending / Still to deliver*
 *   tiles LEFT the ledger. `LedgerTab.tsx` records the hole and why. Transactions
 *   keeps only figures that total the rows in front of you.
 * - The pending chase list LEFT its own tab, and only its ACTIONS came here —
 *   the overdue rows with their nudge buttons. The pending TOTAL is not printed
 *   on this page; *Needs you* links to the page that states it over the rows it
 *   totals.
 * - *Peak month* is twelve months where the chart is six, deliberately, so that
 *   it is a figure the Reports page does not carry. `lib/business/overview.ts`
 *   has that argument.
 *
 * Where this page and another genuinely want the same number, this page LINKS
 * rather than reprints. Every section head here is a door.
 *
 * ── FIVE SLABS AND NOT FIVE CARDS, WHICH IS THE SAME CALL `/today` MADE ──────
 *
 * `Slab.tsx` argues it in full and the argument transfers exactly: a stack of
 * boxes says *five equal things*, and these five are RANKED — by what it costs
 * to ignore them, which is why *Needs you* is first and *Over time* is last. A
 * box cannot say "third most important"; type and space can. The only `.card` on
 * this page is the one inside *Where the money comes from*, where a ranked list
 * of five people genuinely wants a ground of its own to sit on.
 *
 * ── AND IT HOLDS NO ROWS OF ITS OWN ──────────────────────────────────────────
 *
 * Nothing on this page is a record. Every list is capped, every list has a way
 * through to the page that owns the full set, and no list has a row menu. That
 * is the line between a summary and a second copy of a table, and it is the line
 * the deleted *Pending* tab was on the wrong side of.
 */
export function Overview({ data }: { data: MoneyData }) {
  const { period } = usePeriodScope();
  const range = periodRange(period, data.now);

  const actions = computeActions(data.payments, data.packages, data.clients, data.now);
  const activity = computeActivity(data.payments, data.packages, data.clients, SHOWN);
  const renewals = computeRenewals(data.packages, data.clients, data.now);
  const metrics = computeClientMetrics(data.payments, data.clients, range);
  const peak = computePeakMonth(data.payments, data.now);
  const upcoming = computeUpcoming(data.packages);
  /* Six bars, fixed, ignoring the picker — `computeTrend`'s own docstring argues
     the ceiling, and the section says so out loud so the one block on this page
     that does not move with the picker is not read as a bug. */
  const trend = computeTrend(data.payments, data.now, 6);

  const nothingAtAll = data.payments.length === 0 && data.packages.length === 0;

  return (
    <>
      <TopBar crumb="Business" title="Business" />
      <main className="main" id="main-content">
        <BizHeader
          title="Overview"
          subtitle={
            actions.count > 0
              ? <>{actions.count} thing{actions.count === 1 ? '' : 's'} need{actions.count === 1 ? 's' : ''} you · {rupees(metrics.revenue)} earned in {periodProse(period)}</>
              : <>Nothing outstanding · {rupees(metrics.revenue)} earned in {periodProse(period)}</>
          }
        />

        <div className="body">
          {nothingAtAll ? (
            <EmptyState
              icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="8" width="18" height="11" rx="2"/><path d="M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/>
              </svg>}
              title="Nothing to show yet"
              body={<>This page fills itself in as you sell packages and record payments.
                Start with the price list, then record money as it changes hands.</>}
              action={<Button variant="primary" href="/business/packages" style={{ marginTop: 16 }}>
                Set up your packages
              </Button>}
              style={{ marginTop: 64 }}
            />
          ) : (
            <>
              <NeedsYou actions={actions} now={data.now} />

              {/* TWO SECTIONS ON ONE BAND, AND IT IS A MEASUREMENT.
                  MEASURED 20 Sep 2026 at 1568×709, which gives `.body` 1245×586:
                  the five sections stacked ran to **2,023px**, three and a half
                  windows of scrolling on the page whose whole claim is that it
                  is a glance. *What happened* was 484 of it and *Running out*
                  190, each using about a third of a 1245px row and leaving the
                  other two thirds empty — so the page was paying in HEIGHT for
                  width it was not spending.

                  They are the pair that can share a band because they are the
                  matched pair: one is what already happened and one is what is
                  about to, both are short lists of people, and a trainer reads
                  them in one look. The other three cannot — *Needs you* is a
                  queue with a verb on every row, and the last two are figures
                  and a chart that want the full measure.

                  `.grid2` collapses at 900px. The short one leaves whitespace
                  under it rather than a void, because a `.slab` is a rule and a
                  heading with no box — there is no card edge for the surplus to
                  show up inside. That is the difference between this and the
                  two-track card grids that had to lift their odd child out. */}
              <div className="grid2">
                <WhatHappened items={activity} now={data.now} />
                <RunningOut
                  items={renewals.items}
                  value={renewals.value}
                  upcomingValue={upcoming.value}
                  pausedValue={upcoming.pausedValue}
                />
              </div>

              <WhereFrom metrics={metrics} period={periodTag(period)} />
              <OverTime trend={trend} peak={peak} />
            </>
          )}
        </div>
      </main>
    </>
  );
}

/* ---------------------------------------------------------------- needs you */

const SHOWN = 5;

/**
 * SECTION 1 — and it is first because it is the only one that asks for something
 * back.
 *
 * Everything else on this page is a reading. This is a queue, so it is drawn as
 * one: a row per thing, the severity named on the right, and the action itself
 * beside it rather than behind a menu. `computeActions` ranks them and this only
 * draws the ranking — a component that re-sorted would be a second opinion about
 * what is urgent.
 *
 * ── THE EMPTY STATE IS THE COMMON ONE AND IT IS NOT A SHRUG ──────────────────
 *
 * Most days this list is empty, which makes it the section a trainer sees in its
 * empty form most often. It says what it CHECKED rather than "nothing here",
 * because a queue that goes quiet without naming what it watches reads as a
 * queue that has stopped working.
 */
function NeedsYou({
  actions, now,
}: {
  actions: ReturnType<typeof computeActions>;
  now: number;
}) {
  const shown = actions.items.slice(0, SHOWN);

  return (
    <Slab
      first
      title="Needs you"
      count={actions.count > 0 ? actions.count : undefined}
      /* The chase total is NOT printed here. It is on the page this link goes
         to, whose *Pending* chip states it over the rows it totals. */
      action={actions.overdueCount > 0
        ? { label: 'The pending rows', href: '/business/transactions' }
        : undefined}
    >
      {actions.count === 0 ? (
        <p className="small">
          Nobody is overdue, every live pack still has sessions on it, and none
          has run past its end date.
        </p>
      ) : (
        <>
          <ListRows label="Things that need you">
            {shown.map((item) => <ActionRow key={item.id} item={item} now={now} />)}
          </ListRows>
          {actions.count > SHOWN && (
            <p className="small" style={{ marginTop: 10 }}>
              {actions.count - SHOWN} more, ranked below these — the oldest debts
              and the longest-empty packs are the {SHOWN} above.
            </p>
          )}
        </>
      )}
    </Slab>
  );
}

function ActionRow({ item, now }: { item: ActionItem; now: number }) {
  return (
    <ListRow
      avatar={<Avatar name={item.clientName} id={item.clientId} size="sm" />}
      /* The NAME is the title and the fact is the second line, which is the
         shape `.lrow` is built for — `.lrow__t` is `nowrap` with an ellipsis, so
         a title like *"Priya has finished their pack"* would have been truncated
         in the half-width case and the person's name lost with it. The fact
         survives truncation; a name does not. */
      title={item.clientName}
      sub={item.detail}
      /* One line, not a stack — `ListRow`'s own prop note carries the
         measurement. A row whose right group holds a verb cannot column. */
      rightInline
      right={
        <>
          {/* THE FIGURE IS ON THE RIGHT, AND THE TAG THAT WAS HERE IS GONE.
              MEASURED at 1568, where this slab is 1245px wide. The first drawing
              put everything on the left — name, days late and money at x≈356 —
              with the verb at x≈1430 and 1,070px of nothing between the fact and
              the action. The second moved the money right and added *Overdue* /
              *Pack empty* above the button, which made `.lrow__r` a THREE-item
              column: rows went 56px → 78px and the figure floated a line above
              the name it belonged to.

              The tag was the thing to cut, and the page's own rule says why. It
              restated the line under the name — *12 days past the invoice* is
              what *Overdue* means, and *All 8 sessions delivered · not renewed*
              is what *Pack empty* means — so it was a second spelling of a fact
              already on the row. What it was carrying besides the word is the
              RANK, and `computeActions` carries that: every overdue row sorts
              above every pack, oldest first inside each. */}
          {item.amount !== null && <ListRowNumber>{rupees(item.amount)}</ListRowNumber>}
          {/* The action a row deserves, and only one of them. An overdue invoice
              is a message; an empty or lapsed pack is a conversation on the
              client's own file, where the *Renew* control already lives — a
              second renew button here would be a second door to one write. */}
          {item.kind === 'overdue' ? (
            /* No `className`: the button's own default IS
               `btn btn--sm btn--secondary`, and restating it at a call-site is
               the hand-written `.btn` the component exists to remove. */
            <NudgeButton
              clientId={item.clientId}
              clientName={item.clientName}
              template="payment_reminder"
              now={now}
            />
          ) : (
            <Button variant="secondary" size="sm" href={`/clients/${item.clientId}`}>
              Open their file
            </Button>
          )}
        </>
      }
    />
  );
}

/* ------------------------------------------------------------ what happened */

/**
 * SECTION 2 — recent activity, and it is deliberately NOT a payments list.
 *
 * Transactions draws every payment with its method, its reference and its note.
 * A second copy of those rows up here would be the exact redundancy this page is
 * built to avoid, so this is a different SELECTION at a different grain: what
 * moved, across payments *and* packs, in the sentences a trainer remembers
 * things in. `computeActivity`'s docstring carries the argument, including why a
 * pack being sold — the one event with no home anywhere else in Business — is in
 * this list.
 *
 * A `Timeline` and not a table, because the answer to *what happened* is an
 * order, not a set of columns.
 */
function WhatHappened({ items, now }: { items: ActivityItem[]; now: number }) {
  return (
    <Slab
      title="What happened"
      action={{ label: 'All transactions', href: '/business/transactions' }}
    >
      {items.length === 0 ? (
        <p className="small">Nothing recorded yet.</p>
      ) : (
        <Timeline label="Recent activity across your clients">
          {items.map((it) => (
            <Timeline.Item
              key={it.id}
              /* `now` from the server's clock and not `Date.now()`: this string
                 is rendered on the server and again on the client, and a clock
                 read in the component body would produce two different answers
                 across a minute boundary. */
              mark={relativePast(it.at, now)}
              at={new Date(it.at).toISOString()}
              href={`/clients/${it.clientId}`}
              title={<>{it.clientName} {it.text}</>}
              /* Quiet ink for a write-off: it records an absence, which is
                 exactly what `dim` is for. */
              dim={it.kind === 'writeoff'}
              aside={
                it.kind === 'raised' ? <Tag className="tag--warn">Unpaid</Tag>
                : it.kind === 'writeoff' ? <Tag>Written off</Tag>
                : undefined
              }
              meta={it.amount !== null ? rupees(it.amount) : undefined}
            />
          ))}
        </Timeline>
      )}
    </Slab>
  );
}

/* -------------------------------------------------------------- running out */

/**
 * SECTION 3 — whose pack needs selling again inside the next seven days.
 *
 * ── AND IT IS THE SECTION THAT CARRIES *STILL TO DELIVER* ────────────────────
 *
 * That tile used to be the third of three above the ledger, where it was the odd
 * one out: the other two were about the period and it was about packs. It is the
 * opening line of this section now, which is the one actually about packs — the
 * value of coaching sold and not yet given, with the slice of it that is about
 * to run out listed underneath. One number, in the one place where the list
 * under it explains what it is made of.
 *
 * `computeRenewals` catches a pack two ways — a date inside the window, or two
 * sessions or fewer left — and each row says which caught it, so a pack found by
 * the count never reads as a pack that expires on Thursday.
 */
function RunningOut({
  items, value, upcomingValue, pausedValue,
}: {
  items: RenewalItem[];
  value: number;
  upcomingValue: number;
  pausedValue: number;
}) {
  return (
    <Slab
      title={`Running out · next ${RENEWAL_WINDOW_DAYS} days`}
      count={items.length > 0 ? items.length : undefined}
      action={{ label: 'The price list', href: '/business/packages' }}
    >
      <p className="small" style={{ marginBottom: items.length > 0 ? 10 : 0 }}>
        {rupees(upcomingValue)} of coaching is sold and not yet delivered
        {pausedValue > 0 && <>, {rupees(pausedValue)} of it on stopped clocks</>}.
        {items.length > 0 && <> {rupees(value)} is on the packs below.</>}
      </p>

      {items.length === 0 ? (
        <p className="small">
          No pack ends or runs low in the next {RENEWAL_WINDOW_DAYS} days.
        </p>
      ) : (
        <ListRows label="Packs running out">
          {items.slice(0, SHOWN).map((r) => (
            <ListRow
              key={r.id}
              avatar={<Avatar name={r.clientName} id={r.clientId} size="sm" />}
              title={r.clientName}
              rightInline
              sub={
                <>
                  {r.reason === 'ending'
                    ? (r.daysLeft === 0 ? 'Ends today' : `Ends in ${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'}`)
                    : `${r.sessionsLeft} session${r.sessionsLeft === 1 ? '' : 's'} left`}
                  {' · '}{r.packName}
                </>
              }
              right={
                <>
                  {/* A paused pack is not urgent — the clock is stopped, so the
                      date it was heading for has stopped meaning anything. Said
                      rather than filtered out, because the trainer is the one
                      who decides whether a pause is still real. */}
                  {r.paused && <Tag>Paused</Tag>}
                  <NudgeButton
                    clientId={r.clientId}
                    clientName={r.clientName}
                    template="renewal"
                  />
                </>
              }
            />
          ))}
        </ListRows>
      )}
    </Slab>
  );
}

/* --------------------------------------------------------------- where from */

/**
 * SECTION 4 — which clients ARE the income.
 *
 * Four figures and a ranked five, all of the trainer's OWN share with the gym's
 * cut already off — `computeClientMetrics` argues for that, and the short version
 * is that a top-client list ranked on gross promotes whoever happens to train on
 * a gym floor.
 *
 * ── THE FOURTH FIGURE IS THE ONE NOBODY ASKS FOR ─────────────────────────────
 *
 * *Paying clients*, *average per client* and *the biggest one* are the three a
 * trainer would list. The fourth is what share of the income the top three are,
 * and it is here because it is the only figure on this page that can be BAD news
 * at the same time as the other three are good: a strong month where 70% of it
 * came from three people is one phone call away from being a weak one. It is
 * toned by that threshold rather than drawn flat.
 */
function WhereFrom({
  metrics, period,
}: {
  metrics: ReturnType<typeof computeClientMetrics>;
  period: string;
}) {
  const quiet = metrics.totalClients - metrics.payingClients;

  return (
    <Slab title="Where the money comes from">
      {/* `.mnystats` steps 4 → 2 → 1 below the desk; without it the count is
          pinned at four and every figure clips at 390px. See app.css. */}
      <div className="stats stats--4 mnystats" style={{ marginTop: 0 }}>
        <Stat
          label={<>Paying clients · {period}</>}
          value={metrics.payingClients === 0 ? '—' : String(metrics.payingClients)}
          detail={
            metrics.payingClients === 0
              ? 'Nobody settled anything'
              : quiet > 0
                ? `${quiet} active client${quiet === 1 ? '' : 's'} paid nothing`
                : 'Everyone on the books paid'
          }
          tone="acc"
        />
        <Stat
          label="Average per client"
          value={metrics.averagePerClient > 0 ? rupees(metrics.averagePerClient) : '—'}
          detail={metrics.payingClients > 0
            ? `${rupees(metrics.revenue)} across ${metrics.payingClients}`
            : 'Nothing to average'}
        />
        <Stat
          label="Your biggest client"
          value={metrics.top[0] ? rupees(metrics.top[0].revenue) : '—'}
          detail={metrics.top[0]
            ? `${metrics.top[0].name} · ${metrics.top[0].share}% of the period`
            : 'No payments in this period'}
          href={metrics.top[0] ? `/clients/${metrics.top[0].clientId}` : undefined}
        />
        <Stat
          label="Top three are"
          value={metrics.topThreeShare > 0 ? `${metrics.topThreeShare}%` : '—'}
          detail={metrics.topThreeShare >= 60
            ? 'Most of your income rests on three people'
            : 'Your income is spread across the roster'}
          /* Ranked, not mixed: over 60% is the figure worth a colour, and under
             it the tile stays neutral rather than claiming good news. */
          tone={metrics.topThreeShare >= 60 ? 'warn' : 'neutral'}
        />
      </div>

      {metrics.top.length > 0 && (
        <Card as="section" title="Top clients" className="mt3">
          <div className="col" style={{ gap: 12 }}>
            {metrics.top.map((c) => (
              <div key={c.clientId}>
                <KeyValueRow
                  k={
                    <Link className="who" href={`/clients/${c.clientId}`}>
                      <Avatar name={c.name} id={c.clientId} size="sm" />
                      <b>{c.name}</b>
                    </Link>
                  }
                  style={{ border: 0, marginBottom: 5 }}
                >
                  {rupees(c.revenue)}
                </KeyValueRow>
                {/* The bar is the SHARE, and it is here to make the RANKING
                    readable at a glance — a column of rupee figures is not. The
                    percentage is not printed beside it: the top one is already
                    on the tile above, and the rest are a shape rather than a set
                    of numbers to read.

                    `describe={false}` and a `label` that names the person: the
                    default announcement would append *"this client 34%"* to a
                    row that has just said the name and the figure in words, and
                    the one thing the bar adds — where they stand in the five —
                    is in the label. */}
                <Meter
                  label={`${c.name}’s share of the period — ${c.share}%`}
                  describe={false}
                  segments={[{ tone: 'acc', value: Math.max(2, c.share) }]}
                  total={100}
                />
              </div>
            ))}
          </div>
        </Card>
      )}
    </Slab>
  );
}

/* ---------------------------------------------------------------- over time */

/**
 * SECTION 5 — is it going up, and when was it best.
 *
 * The chart is `computeTrend`'s six bars, moved here from the ledger. It ignores
 * the period picker, fixed at six months, and the section title says so — a
 * chart that does not move when the control above it moves is a chart a trainer
 * learns to distrust, and the fix is to state the window rather than to make the
 * window follow a picker whose whole point is to be changed.
 *
 * *Peak month* is twelve months, not six, and `computePeakMonth` argues for the
 * difference: a best-of-six is beaten every half year by definition, so it would
 * read as news when it is arithmetic. Twelve is also what keeps it off the
 * Reports page, which draws a year of revenue and names no best month in it.
 */
function OverTime({
  trend, peak,
}: {
  trend: ReturnType<typeof computeTrend>;
  peak: ReturnType<typeof computePeakMonth>;
}) {
  return (
    <Slab
      title="Over time · last 6 months"
      action={{ label: 'The full year', href: '/business/reports' }}
    >
      {/* 1.5fr / 1fr, collapsing at 1380 — the ledger's own grid, and the chart
          is the thing it was measured against. */}
      <div className="mny__grid">
        <TrendChart
          bars={trend.bars}
          best={trend.best}
          averagePerMonth={trend.averagePerMonth}
        />

        {/* `gap3`, and the tiles GROW. The column had neither: the two stat
            tiles sat edge to edge — two 1px borders touching, which reads as
            one badly drawn box rather than as two tiles — and then stopped
            94px short of the chart beside them, so the row ended in a void.
            12px is the grid's own gutter, and `flex:1` on each tile spends the
            leftover height on the tiles instead of leaving it under them. */}
        <div className="col gap3">
          <Stat
            className="sp"
            label="Best month · last 12"
            value={peak ? rupees(peak.amount) : '—'}
            detail={peak
              ? <>
                  {peak.label}
                  {peak.isCurrent
                    ? ' — and it is the one you are in'
                    : peak.aboveAverage !== null
                      ? ` · ${peak.aboveAverage}% above your average`
                      : ''}
                </>
              : 'Nothing collected in the last twelve months'}
            tone="acc"
          />
          <Stat
            className="sp"
            label="Monthly average"
            value={trend.averagePerMonth > 0 ? rupees(trend.averagePerMonth) : '—'}
            /* Whole months only, and the tile says so: the current month is a
               fraction of a month and averaging it in drags the figure down
               every time a trainer opens this on the 2nd. */
            detail="Whole months only — this one is still running"
          />
        </div>
      </div>
    </Slab>
  );
}
