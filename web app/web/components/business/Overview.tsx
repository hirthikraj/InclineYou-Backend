'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { loadSummary } from '@/lib/business/actions';
import {
  activityLines,
  computeActions,
  computeConcentration,
  computePeakMonth,
  computeRenewals,
  computeUpcoming,
  RENEWAL_WINDOW_DAYS,
  trendBars,
  type ActionItem,
  type ActivityLine,
  type Concentration,
  type RenewalItem,
} from '@/lib/business/overview';
import { summaryQuery, type MoneySummary, type OverviewData } from '@/lib/business/types';
import { currentMonth, periodProse, periodRange, periodTag } from '@/lib/money/period';
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
export function Overview({ data }: { data: OverviewData }) {
  const { period } = usePeriodScope();

  /* The period is state in a layout, so the server rendered the CURRENT month and
     anything else is fetched here. Only the summary depends on the picker — the
     year, the feed, the packs and the client names do not — so a change costs one
     request, and the page keeps showing the old figures (dimmed by `stale`) until
     the new ones arrive rather than blanking. */
  const wanted = summaryQuery(period);
  const [loaded, setLoaded] = useState<{ key: string; summary: MoneySummary }>(
    () => ({ key: summaryQuery(currentMonth(data.now)), summary: data.period }),
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (wanted === loaded.key) return;
    let cancelled = false;
    loadSummary(period).then((res) => {
      if (cancelled) return;
      if (res.ok) { setFailed(false); setLoaded({ key: wanted, summary: res.data }); }
      else setFailed(true);
    });
    return () => { cancelled = true; };
  }, [wanted, loaded.key, period]);

  const summary = loaded.summary;
  const stale = wanted !== loaded.key && !failed;

  const actions = computeActions(data.packages, data.names, data.today, data.now);
  const activity = activityLines(data.activity);
  const renewals = computeRenewals(data.packages, data.names, data.today);
  const upcoming = computeUpcoming(data.packages);
  /* Six bars, fixed, ignoring the picker — the section says so out loud so the one
     block on this page that does not move with the picker is not read as a bug. */
  const trend = trendBars(data.year);
  const peak = computePeakMonth(data.year);
  const concentration = data.topClients
    ? computeConcentration(data.topClients.rows, data.topClients.totalYours)
    : null;

  const nothingAtAll = data.year.total.packagesSold === 0 && data.year.total.paymentsCount === 0
    && data.packages.length === 0;

  return (
    <>
      <TopBar crumb="Business" title="Business" />
      <main className="main" id="main-content">
        <BizHeader
          title="Business overview"
          subtitle={
            <>
              {actions.count > 0
                ? <>{actions.count} thing{actions.count === 1 ? '' : 's'} need{actions.count === 1 ? 's' : ''} you</>
                : <>Nothing outstanding</>}
              {' · '}{rupees(summary.total.takeHome)} {data.hasGym ? 'to you' : 'collected'} in {periodProse(period)}
            </>
          }
        />

        <div className="body" aria-busy={stale}>
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

              {/* TWO SECTIONS ON ONE BAND — measured 20 Sep 2026 (see git history of
                  this file for the numbers): they are the matched pair, one is what
                  already happened and one is what is about to, both short lists of
                  people. `.grid2` collapses at 900px. */}
              <div className="grid2">
                <WhatHappened items={activity} now={data.now} />
                <RunningOut
                  items={renewals.items}
                  value={renewals.value}
                  upcomingValue={upcoming.value}
                  pausedValue={upcoming.pausedValue}
                />
              </div>

              <WhereFrom
                summary={summary}
                tag={periodTag(period)}
                hasGym={data.hasGym}
                stale={stale}
                failed={failed}
                concentration={concentration}
                running={periodRange(period, data.now).to > data.now}
              />
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
/** A pack started and paid for on the same day by the same client is one event, not two. */
function mergeEvents(items: ActivityLine[]): Array<ActivityLine & { paid?: number }> {
  const out: Array<ActivityLine & { paid?: number }> = [];
  const day = (at: number) => new Date(at).toDateString();
  for (const it of items) {
    const prev = out[out.length - 1];
    const pair =
      prev &&
      prev.clientId === it.clientId &&
      day(prev.at) === day(it.at) &&
      ((prev.kind === 'sold' && it.kind === 'paid') || (prev.kind === 'paid' && it.kind === 'sold'));
    if (pair) {
      const sold = prev.kind === 'sold' ? prev : it;
      const paid = prev.kind === 'paid' ? prev : it;
      out[out.length - 1] = { ...sold, paid: paid.amount ?? 0 };
    } else out.push({ ...it });
  }
  return out;
}

const FEED_SHOWN = 6;

function WhatHappened({ items: all, now }: { items: ActivityLine[]; now: number }) {
  /* SIX LINES, MERGED. Eight rows (four of them a start and its payment) beside two renewals left half a page of void under
     the right-hand column; the full list is one link away. */
  const items = mergeEvents(all).slice(0, FEED_SHOWN);
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
              title={<>{it.clientName} {it.text}{it.paid !== undefined && <> · paid {rupees(it.paid)}</>}</>}
              /* Quiet ink for a write-off: it records an absence, which is
                 exactly what `dim` is for. */
              dim={it.kind === 'write_off'}
              aside={
                it.kind === 'write_off' ? <Tag>Written off</Tag>
                : it.kind === 'refund' ? <Tag>Refunded</Tag>
                : undefined
              }
              meta={it.kind !== 'sold' ? rupees(it.amount ?? 0) : undefined}
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
        {rupees(upcomingValue)} of coaching is sold but not yet delivered
        {pausedValue > 0 && <>, {rupees(pausedValue)} of it on paused packs</>}.
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
 * SECTION 4 — how the period went, and which clients ARE the income.
 *
 * ── TWO WINDOWS ON ONE SLAB, AND EACH ONE SAYS WHICH ─────────────────────────
 *
 * The four tiles obey the period picker: they are `GET /v1/money/summary` for the
 * span. The ranked list under them is the practice report's top ten, which takes
 * `months=N` and no dates — so it is the last TWELVE months and its heading says
 * so, rather than appearing to follow a control it cannot. That is a wire gap
 * (`/v1/reports/practice` has no `from`/`to`), recorded in the build report.
 *
 * ── TAKE-HOME FIRST, AND ONLY WHEN THERE IS A GYM ────────────────────────────
 *
 * On a gym package the trainer's cut is the package's own share, so what a
 * trainer banks is not what they billed. The first tile is the figure they are
 * actually asking about — what arrived, the gym's part already off — with the
 * gym's cut named under it. For a trainer with no gym it would be the same
 * number as *Collected* on Transactions, so it is not drawn: a figure that is
 * only ever a copy of another page's is the thing this page's rule forbids.
 *
 * *Collection rate* and *Overdue* are the two a pack-based coach reads to know
 * whether the books are healthy: the first is a ratio the server does not state
 * and the second is `now.overdue`, as of today and not of the span.
 */
function WhereFrom({
  summary, tag, hasGym, stale, failed, concentration, running,
}: {
  summary: MoneySummary;
  tag: string;
  hasGym: boolean;
  stale: boolean;
  failed: boolean;
  concentration: Concentration | null;
  /** The picked period has not ended: it is compared with nothing, not with a finished month. */
  running: boolean;
}) {
  const t = summary.total;
  const rate = t.billed > 0 ? Math.min(100, Math.round((t.collected / t.billed) * 100)) : null;
  const trend = t.trendPercent;
  const showGym = hasGym && t.gymCut > 0;
  const tileCount = showGym ? 4 : 3;

  return (
    <Slab title={`Where the money comes from · ${tag}`}>
      {failed && (
        <p className="msg msg--err" role="status" style={{ marginBottom: 10 }}>
          <span>That period did not load, so these figures are for the one before.</span>
        </p>
      )}
      <div
        className={`stats stats--${tileCount} mnystats`}
        style={{ marginTop: 0, opacity: stale ? 0.6 : 1 }}
      >
        {showGym && (
          <Stat
            label={<>Your take-home · {tag}</>}
            value={rupees(t.takeHome)}
            tone="acc"
            /* Collected-basis figures only. The old line said "after the gym's cut
               of ₹3,200 on ₹87,500 billed" under a take-home of what had ARRIVED,
               so the three numbers on the tile could not be made to add up: one
               was money in, one was money sold. The gym's cut OF BILLED is stated
               where billed is — under the collection rate. */
            detail={<>Collected {rupees(t.collected)}, less the gym&#8217;s {rupees(Math.max(0, t.collected - t.takeHome))}</>}
          />
        )}
        <Stat
          label="Collection rate"
          value={rate === null ? '—' : `${rate}%`}
          tone={rate !== null && rate < 70 ? 'warn' : 'acc'}
          detail={rate === null
            ? 'Nothing billed in this period'
            : <>
                of {rupees(t.billed)} billed has come in
                {showGym && <> · gym&#8217;s cut of billed {rupees(t.gymCut)}</>}
                <span className="meter" style={{ marginTop: 8 }} aria-hidden="true">
                  <i style={{ width: `${rate}%` }}></i>
                </span>
              </>}
        />
        <Stat
          label="Overdue now"
          value={summary.now.overdue > 0 ? rupees(summary.now.overdue) : '—'}
          tone={summary.now.overdue > 0 ? 'warn' : 'neutral'}
          detail={summary.now.overdue > 0
            ? `${summary.now.clientsOverdue} client${summary.now.clientsOverdue === 1 ? '' : 's'} · ${summary.now.clientsOwing} owe something in all`
            : 'Nobody is past their due date'}
          href={summary.now.overdue > 0 ? '/business/transactions?filter=owed' : undefined}
        />
        <Stat
          /* A MONTH IN PROGRESS IS NOT COMPARED WITH A FINISHED ONE. This tile said −97.3% in warning amber on the 5th, because
             ₹3,000 so far was set against all of September. The picker's range ends after today when the period is still
             running: the tile then states what has been billed so far and says there is nothing to compare yet. */
          label={running ? 'Billed so far' : 'Billed against the period before'}
          /* Otherwise: a percentage only when there is something billed NOW to compare. Billing nothing against a busy month
             is arithmetically −100%, which reads as a collapse when it is simply the 3rd. */
          value={
            running
              ? rupees(t.billed)
              : t.billed > 0 && trend !== null
                ? `${trend > 0 ? '+' : ''}${trend}%`
                : '—'
          }
          tone={!running && t.billed > 0 && trend !== null && trend < 0 ? 'warn' : 'neutral'}
          detail={
            running
              ? `${t.packagesSold} pack${t.packagesSold === 1 ? '' : 's'} sold · month in progress, nothing to compare yet`
              : t.billed <= 0
                ? 'Nothing billed this period'
                : trend === null
                  ? 'No earlier period to compare to'
                  : `${t.packagesSold} pack${t.packagesSold === 1 ? '' : 's'} sold`
          }
        />
      </div>

      {concentration && concentration.top.length > 0 && (
        <Card as="section" title="Top clients · last 12 months" className="mt3">
          <div className="col" style={{ gap: 12 }}>
            {concentration.top.map((c) => (
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
                  {rupees(c.yours)}
                </KeyValueRow>
                {/* The bar is the SHARE, there to make the ranking readable at a
                    glance. `describe={false}` and a label naming the person: the
                    default announcement would repeat what the row just said. */}
                {/* SCALED TO THE LARGEST, not to the year's total: against the total every bar was 10–13% wide and the
                    difference between the first client and the fifth could not be seen. The share is still in the label. */}
                <Meter
                  label={`${c.name}’s share of the last twelve months — ${c.share}%`}
                  describe={false}
                  segments={[{ tone: 'acc', value: Math.max(2, c.yours) }]}
                  total={Math.max(1, ...concentration.top.map((x) => x.yours))}
                />
              </div>
            ))}
          </div>
          <p className="small" style={{ marginTop: 12 }}>
            {concentration.topThreeShare >= 60
              ? `Your top three are ${concentration.topThreeShare}% of the year — most of your income rests on three people.`
              : `Your top three are ${concentration.topThreeShare}% of the year — your income is spread across the roster.`}
          </p>
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
  trend: ReturnType<typeof trendBars>;
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
