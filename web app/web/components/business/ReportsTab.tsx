'use client';


import Link from 'next/link';

import {
  changePercent,
  wholeMonthAverage,
  type PracticeReport,
} from '@/lib/business/report';
import { rupees, rupeesShort } from '@/lib/today/time';
import { MonthBars } from './MonthBars';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';
import { KeyValueRow } from '@/web-components/ui/KeyValue';
import { Stat } from '@/web-components/ui/Stat';
import { EmptyState } from '@/web-components/ui/EmptyState';

/**
 * REPORTS — *how is the practice doing*.
 *
 * This was a `NotBuilt` notice, and before that a rail row pointing at a
 * full-page dead end. It is the brief's section 9, which opens with a warning
 * this file is arranged around: **"Two distinct audiences. Don't mix them."**
 *
 * So this screen is the trainer's business report and nothing else. Six
 * metrics, one screen, and the ceiling is the feature — *"a trainer is not an
 * analyst"*. Four headline figures with a direction on each, then three shapes
 * that say whether the figures are normal.
 *
 * The CLIENT's progress report used to be listed at the foot of this page, which
 * is the one place a trainer thinking about a client never looks. It is reached
 * from the client's file header, their Progress tab, and the renewal row on
 * Today — the moment the card exists for.
 *
 * ── WHY THE NUMBERS ARE NOT ALL OVER THE SAME WINDOW ────────────────────────
 *
 * Money and adherence are over ninety days; clients and retention are over
 * thirty. That is deliberate rather than sloppy, and `computeHeadline` carries
 * the argument: a quarter is what makes a noisy figure readable, and "how many
 * people am I training" is a question about *now* that a 90-day answer would
 * pad with everybody who left in June. Every tile says its own window.
 *
 * ── AND WHY THE CHARTS ARE TWELVE MONTHS ────────────────────────────────────
 *
 * A year is the shortest window that can show a trainer their own seasonality.
 * Indian gym floors empty in December and fill in January, and a trainer looking
 * at six months in February cannot tell a good month from a normal one.
 */
/**
 * A rule, said once and opened on demand.
 *
 * Every chart on this tab used to carry the whole of its own counting rule under
 * it — about fourteen lines of 12px grey across three charts and a card, so the
 * page read as documentation of itself. The line under a chart now says WHAT is
 * counted; the rest (why this month is out of the average, what *archived* does
 * and does not mean) is one press away, in a native `<details>` so it needs no
 * state and a keyboard and a reader get it for free.
 */
function Why({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="rpt-why">
      <summary>{summary}</summary>
      <p>{children}</p>
    </details>
  );
}

export function ReportsTab({ report }: { report: PracticeReport }) {
  const { headline: h, months: allMonths } = report;

  if (report.isEmpty) {
    return (
      <EmptyState
        icon={<><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 19.5V5" /><path d="M4 19.5h16" />
            <path d="M8 16v-5" /><path d="M13 16V7" /><path d="M18 16v-8" />
          </svg></>}
        title="Nothing to report yet"
        body="These figures are built out of delivered sessions and collected payments. Mark a session done or record a payment and the year fills in from there — nothing here is typed in by hand, so there is nothing to set up."
        action={<><Button href="/today" variant="primary" style={{ marginTop: 16 }}>
          Go to today
        </Button></>}
        style={{ marginTop: 64 }}
      />
    );
  }

  /* THE CHARTS START WHERE THE PRACTICE DOES. Twelve columns for a practice that
     began in July drew eight empty ones, so every chart was two-thirds blank and
     the four bars that mattered were squeezed into the right-hand third. The
     window opens at the first month with money or sessions in it (a client who joined and has not yet trained is not a month of practice), but never narrower than
     six months — three fat bars read as a different kind of chart. The headline
     figures and the CSV still speak for the whole year. */
  const any = (i: number) =>
    [report.takeHome, report.billed, report.collected, report.delivered, report.active]
      .some((series) => (series[i] ?? 0) !== 0);
  const first = allMonths.findIndex((_, i) => any(i));
  const lo = Math.max(0, Math.min(first === -1 ? 0 : first, allMonths.length - 6));
  const months = allMonths.slice(lo);
  const takeHome = report.takeHome.slice(lo);
  const delivered = report.delivered.slice(lo);
  const active = report.active.slice(lo);
  const joined = report.joined.slice(lo);
  const archived = report.archived.slice(lo);

  const revenueChange = changePercent(h.earned, h.earnedPrev);
  const clientChange = h.activeNow - h.activePrev;
  const totalJoined = report.joined.reduce((s, v) => s + v, 0);
  const totalLost = report.archived.reduce((s, v) => s + v, 0);
  const totalDelivered = report.delivered.reduce((s, v) => s + v, 0);
  const net = totalJoined - totalLost;
  const total = (xs: number[]) => xs.reduce((s, v) => s + v, 0);

  return (
    <>
      {/* The phone's way round a long page: four anchors, scrolling on one row.
          Hidden at a desk, where every section is on the first two screens. */}
      <nav className="rpt-jump" aria-label="Sections of this report">
        <a href="#rpt-money">Money</a>
        <a href="#rpt-work">Work</a>
        <a href="#rpt-clients">Clients</a>
        {report.topClients.length > 0 && <a href="#rpt-top">Top clients</a>}
      </nav>

      {/* ── 1 · the four figures ────────────────────────────────────────────── */}
      <div className="stats stats--4 rptstats">
        <Stat
          label="You earned · 3 months"
          value={rupees(h.earned)}
          detail={revenueChange === null
            ? 'No comparable quarter behind it'
            : <>
                <b>{growthLabel(revenueChange)}</b> on the 3 months before
                {' · '}{rupees(h.earnedPrev)}
              </>}
          tone="acc"
        />

        <Stat
          label="Training this month"
          value={h.activeNow}
          detail={h.prevLabel
            ? <>{h.activePrev} in {h.prevLabel}{clientChange !== 0 && <> · <b>{clientChange > 0 ? '+' : '−'}{Math.abs(clientChange)}</b></>}</>
            : 'So far this month'}
        />

        {/* Retention has no `stat--danger` variant and that is on purpose: a
            trainer's honest retention over a year is often 60-something, and
            painting the truth red every month is how a figure stops being read. */}
        <Stat
          label="Retention · 12 months"
          value={h.retention === null ? '—' : `${h.retention}%`}
          detail={h.retention === null
            ? 'Nobody was on your books a year ago'
            : 'Of the clients you had a year ago, still on your books'}
        />

        <Stat
          label="Attendance · 3 months"
          value={h.attendance === null ? '—' : `${h.attendance}%`}
          detail={h.attendance === null
            ? 'Nothing settled yet'
            : <><b>{h.attendanceDone}</b> kept of {h.attendanceSettled} that settled</>}
          tone={h.attendance !== null && h.attendance < 70 ? 'warn' : undefined}
        />
      </div>

      {lo > 0 && (
        <p className="rpt-from">
          Charts start at {allMonths[lo].label} {allMonths[lo].year}, your first month with a session or a payment.
        </p>
      )}

      {/* ── 2 · money, and the year in words ────────────────────────────────── */}
      <div className="rptgrid mt4">
        <Card id="rpt-money">
          <Card.Head title="Revenue, month by month" className="mny__hd">
            <Tag>{report.hasGym ? 'Your take-home, as it landed' : 'As it landed'}</Tag>
          </Card.Head>
          <Card.Body className="rptchart">
            <MonthBars
              months={months}
              values={takeHome}
              format={(v) => rupeesShort(v)}
              title={(m, v) => `${m.label} ${m.year}: ${rupees(v)}${m.isCurrent ? ' so far' : ''}`}
              average={wholeMonthAverage(takeHome, months)}
            />
            <p className="rpt-cap">
              Money by the month it arrived{report.hasGym ? ', with the gym’s cut already out' : ''}. Dashed line: average of whole months.
            </p>
            <Why summary="Why this month is not in the average">
              An average that includes the 2nd of the month lies for four weeks, so it is worked out
              from whole months only. Money counts when it <b>arrived</b>, not when a pack was sold.
            </Why>
          </Card.Body>
        </Card>

        <Card>
          <Card.Head title="The year in figures" />
          <Card.Body>
            <p className="rpt-g">Money · 12 months</p>
            {report.hasGym ? (
              <>
                <KeyValueRow k="Billed">{rupees(total(report.billed))}</KeyValueRow>
                <KeyValueRow k="Collected">{rupees(total(report.collected))}</KeyValueRow>
                <KeyValueRow k="Your take-home">{rupees(total(report.takeHome))}</KeyValueRow>
              </>
            ) : (
              <KeyValueRow k="Revenue">{rupees(total(report.takeHome))}</KeyValueRow>
            )}

            <p className="rpt-g">Work</p>
            <KeyValueRow k="Sessions delivered">{totalDelivered}</KeyValueRow>
            <KeyValueRow k="Busiest month">
              {h.busiestMonth ?? '—'}
              {h.busiestMonth && <>{' · '}{Math.max(...report.delivered)}</>}
            </KeyValueRow>
            {h.sessionsPerClientWeek !== null && (
              <KeyValueRow k="Sessions per client a week">{h.sessionsPerClientWeek}</KeyValueRow>
            )}

            <p className="rpt-g">Clients</p>
            <KeyValueRow k="Gained">{totalJoined > 0 ? `+${totalJoined}` : '0'}</KeyValueRow>
            <KeyValueRow k="Archived">{totalLost > 0 ? `−${totalLost}` : '0'}</KeyValueRow>
            <KeyValueRow k="Net">{net > 0 ? '+' : net < 0 ? '−' : ''}{Math.abs(net)}</KeyValueRow>
            <Why summary="What archived means">
              <b>Archived</b> is a client you moved off your books that month — a decision you made, so it
              can be read for the most recent months too. A client who simply stopped coming and was never
              archived is not counted here.
            </Why>
          </Card.Body>
        </Card>
      </div>

      {/* ── 3 · the work, and the people doing it ───────────────────────────── */}
      <div className="rptgrid rptgrid--even mt4">
        <Card id="rpt-work">
          <Card.Head title="Sessions delivered">
            <Tag>Marked or logged</Tag>
          </Card.Head>
          <Card.Body className="rptchart">
            <MonthBars
              months={months}
              values={delivered}
              format={(v) => String(v)}
              title={(m, v) => `${m.label} ${m.year}: ${v} session${v === 1 ? '' : 's'}`}
              average={wholeMonthAverage(delivered, months)}
            />
            <p className="rpt-cap">Ticked in the diary or logged in the console, counted once.</p>
          </Card.Body>
        </Card>

        <Card id="rpt-clients">
          <Card.Head title="Clients, month by month">
            <Tag>At least one session</Tag>
          </Card.Head>
          <Card.Body className="rptchart">
            <MonthBars
              months={months}
              values={active}
              format={(v) => String(v)}
              title={(m, v) => {
                const i = months.indexOf(m);
                return `${m.label} ${m.year}: ${v} client${v === 1 ? '' : 's'} · ${joined[i]} new, ${archived[i]} archived`;
              }}
              tone="quiet"
            />
            {/* Who came and who left, under the bars they explain rather than as
                a second chart. A month with neither is a quiet dot. */}
            <ul className="rptflow" aria-label="Clients gained and archived, by month">
              {months.map((m, i) => {
                const quiet = joined[i] === 0 && archived[i] === 0;
                return (
                  <li
                    key={`${m.year}-${m.month}`}
                    className={`rptflow__m${quiet ? ' rptflow__m--quiet' : ''}`}
                    title={`${m.label} ${m.year}: ${joined[i]} joined, ${archived[i]} archived`}
                  >
                    <span className="rptflow__l">{m.label}</span>
                    {quiet ? (
                      <span aria-label="no change">·</span>
                    ) : (
                      <span>
                        {joined[i] > 0 && <b className="rptflow__in">+{joined[i]}</b>}
                        {archived[i] > 0 && <b className="rptflow__out">−{archived[i]}</b>}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card.Body>
        </Card>
      </div>

      {report.topClients.length > 0 && (
        <Card className="mt4" id="rpt-top">
          <Card.Head title="Who the income comes from">
            <Tag>Last 12 months</Tag>
          </Card.Head>
          <Card.Body flush>
            <div className="tblwrap">
              <table className="tbl gsx-tbl rpt-top">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th className="num">Sessions</th>
                    <th className="num">Paid</th>
                    {report.hasGym && <th className="num">Yours</th>}
                  </tr>
                </thead>
                <tbody>
                  {report.topClients.map((c) => (
                    <tr key={c.clientId}>
                      <td data-l=""><Link className="who" href={`/clients/${c.clientId}`}><b>{c.name}</b></Link></td>
                      <td className="num" data-l="Sessions">{c.sessions}</td>
                      <td className="num" data-l="Paid">{rupees(c.collected)}</td>
                      {report.hasGym && <td className="num" data-l="Yours">{rupees(c.yours)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card.Body>
        </Card>
      )}
    </>
  );
}

function growthLabel(pct: number): string {
  if (pct >= 200) {
    const times = 1 + pct / 100;
    return `${times >= 10 ? Math.round(times) : times.toFixed(1).replace(/\.0$/, '')}×`;
  }
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`;
}
