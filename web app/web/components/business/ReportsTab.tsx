'use client';


import Link from 'next/link';

import {
  changePercent,
  wholeMonthAverage,
  type PracticeReport,
} from '@/lib/business/report';
import { csvFilename, downloadCsv } from '@/lib/money/csv';
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
export function ReportsTab({ report }: { report: PracticeReport }) {
  const { headline: h, months } = report;

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

  const revenueChange = changePercent(h.earned, h.earnedPrev);
  const clientChange = h.activeNow - h.activePrev;
  const totalJoined = report.joined.reduce((s, v) => s + v, 0);
  const totalLost = report.archived.reduce((s, v) => s + v, 0);
  const totalDelivered = report.delivered.reduce((s, v) => s + v, 0);

  /**
   * The twelve months as a spreadsheet.
   *
   * Not wired to the page's *Export for my CA* button, and `Business.tsx` says
   * why that button is not drawn on this tab: a practice report is not something
   * a chartered accountant is sent. This is the trainer's own copy — the one
   * they paste into whatever they use to think about a year.
   */
  const exportMonths = () => {
    const head = ['Month', 'Billed', 'Collected', 'Your take-home', 'Sessions delivered', 'Active clients', 'New clients', 'Clients archived'];
    const rows = months.map((m, i) => [
      `${m.label} ${m.year}`,
      String(report.billed[i]),
      String(report.collected[i]),
      String(report.takeHome[i]),
      String(report.delivered[i]),
      String(report.active[i]),
      String(report.joined[i]),
      String(report.archived[i]),
    ]);
    downloadCsv(
      csvFilename('practice', `${months[0].label}-${months[months.length - 1].label}-${months[months.length - 1].year}`),
      [head, ...rows].map((r) => r.join(',')).join('\n'),
    );
  };

  return (
    <>
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

      {/* ── 2 · money, and the year in words ────────────────────────────────── */}
      <div className="rptgrid mt4">
        <Card>
          {/* `.mny__hd` — see `OwedTab`. Title, tag and CSV run 33px past the
              card at 320px, and `.main` clips rather than scrolls. */}
          <Card.Head title="Revenue, month by month" actions={<><Button variant="secondary" size="sm" onClick={exportMonths}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 4v11" /><path d="M7.5 10.5 12 15l4.5-4.5" /><path d="M4.5 19.5h15" />
                </svg>
                CSV
              </Button></>} className="mny__hd">
            
            <Tag>{report.hasGym ? 'Your take-home, as it landed' : 'As it landed'}</Tag>
            
          </Card.Head>
          <Card.Body className="rptchart">
            <MonthBars
              months={months}
              values={report.takeHome}
              format={(v) => rupeesShort(v)}
              title={(m, v) => `${m.label} ${m.year}: ${rupees(v)}${m.isCurrent ? ' so far' : ''}`}
              average={wholeMonthAverage(report.takeHome, months)}
            />
            <p className="small" style={{ color: 'var(--tx-ink-3)', marginTop: 12, lineHeight: 1.6 }}>
              Money that <b>arrived</b>, by the month it arrived in
              {report.hasGym ? <>, with the gym&rsquo;s cut already out</> : null}. The dashed line is the average of the whole months —
              this month is not in it, because an average dragged down by the 2nd
              lies for four weeks.
            </p>
          </Card.Body>
        </Card>

        <Card>
          <Card.Head title="The year in figures" />
          <Card.Body>
            <KeyValueRow k="Sessions delivered">{totalDelivered}</KeyValueRow>
            <KeyValueRow k="Busiest month">
              {h.busiestMonth ?? '—'}
              {h.busiestMonth && <>{' · '}{Math.max(...report.delivered)}</>}
            </KeyValueRow>
            <KeyValueRow k="Clients gained">{totalJoined > 0 ? `+${totalJoined}` : '0'}</KeyValueRow>
            <KeyValueRow k="Clients archived">{totalLost > 0 ? `−${totalLost}` : '0'}</KeyValueRow>
            <KeyValueRow k="Net">
              {totalJoined - totalLost > 0 ? '+' : totalJoined - totalLost < 0 ? '−' : ''}
              {Math.abs(totalJoined - totalLost)}
            </KeyValueRow>
            {report.hasGym ? (
              <>
                <KeyValueRow k="Billed, 12 months">{rupees(report.billed.reduce((s, v) => s + v, 0))}</KeyValueRow>
                <KeyValueRow k="Collected, 12 months">{rupees(report.collected.reduce((s, v) => s + v, 0))}</KeyValueRow>
                <KeyValueRow k="Your take-home">{rupees(report.takeHome.reduce((s, v) => s + v, 0))}</KeyValueRow>
              </>
            ) : (
              <KeyValueRow k="Revenue, 12 months">{rupees(report.takeHome.reduce((s, v) => s + v, 0))}</KeyValueRow>
            )}
            {h.sessionsPerClientWeek !== null && (
              <KeyValueRow k="Sessions per client a week">{h.sessionsPerClientWeek}</KeyValueRow>
            )}
          </Card.Body>
          <Card.Body style={{ borderTop: '1px solid var(--tx-line)' }}>
            <p className="small" style={{ lineHeight: 1.6 }}>
              <b>Archived</b> is a client you moved off your books that month — a decision you
              made, so it can be read for the most recent months too. A client who simply
              stopped coming and was never archived is not counted here.
            </p>
          </Card.Body>
        </Card>
      </div>

      {/* ── 3 · the work, and the people doing it ───────────────────────────── */}
      <div className="rptgrid rptgrid--even mt4">
        <Card>
          <Card.Head title="Sessions delivered">
            
            <Tag>Marked or logged</Tag>
          </Card.Head>
          <Card.Body className="rptchart">
            <MonthBars
              months={months}
              values={report.delivered}
              format={(v) => String(v)}
              title={(m, v) => `${m.label} ${m.year}: ${v} session${v === 1 ? '' : 's'}`}
              average={wholeMonthAverage(report.delivered, months)}
            />
            <p className="small" style={{ color: 'var(--tx-ink-3)', marginTop: 12, lineHeight: 1.6 }}>
              A session counts once whether it was ticked off in the diary, logged in
              the console, or both — the roster&rsquo;s own rule for <i>last attended</i>.
            </p>
          </Card.Body>
        </Card>

        <Card>
          <Card.Head title="Clients, month by month">
            
            <Tag>At least one session</Tag>
          </Card.Head>
          <Card.Body className="rptchart">
            <MonthBars
              months={months}
              values={report.active}
              format={(v) => String(v)}
              title={(m, v) =>
                `${m.label} ${m.year}: ${v} client${v === 1 ? '' : 's'}` +
                ` · ${report.joined[months.indexOf(m)]} new, ${report.archived[months.indexOf(m)]} archived`
              }
              tone="quiet"
            />
            {/* Acquisition against churn, under the bars it explains rather than
                as a second chart. Two charts of the same twelve months, one of
                them made of small integers, is a screen a trainer has to study —
                and the brief's ceiling is a screen they can glance at. */}
            <div className="rptflow">
              {months.map((m, i) => (
                <span
                  key={`${m.year}-${m.month}`}
                  className="small mono"
                  style={{
                    minWidth: 52,
                    /* ink-3 / ink-2 and NOT ink-off / ink-3. A month with no
                       movement is still a month the trainer reads along the
                       strip to find the one that did move, and `--tx-ink-off`
                       measured 3.1:1 against the card — under 1.4.3. The quiet
                       step is carried one rung up instead, where both ends pass
                       (5.9:1 and 7.4:1) and the difference is still visible. */
                    color: report.joined[i] === 0 && report.archived[i] === 0
                      ? 'var(--tx-ink-3)'
                      : 'var(--tx-ink-2)',
                  }}
                  title={`${m.label} ${m.year}: ${report.joined[i]} joined, ${report.archived[i]} archived`}
                >
                  {m.label}{' '}
                  {report.joined[i] > 0 && (
                    <b style={{ color: 'var(--tx-accent-text)' }}>+{report.joined[i]}</b>
                  )}
                  {report.archived[i] > 0 && (
                    <b style={{ color: 'var(--tx-danger)' }}>
                      {report.joined[i] > 0 ? ' ' : ''}−{report.archived[i]}
                    </b>
                  )}
                  {report.joined[i] === 0 && report.archived[i] === 0 && '·'}
                </span>
              ))}
            </div>
          </Card.Body>
        </Card>
      </div>

      {report.topClients.length > 0 && (
        <Card className="mt4">
          <Card.Head title="Who the income comes from">
            <Tag>Last 12 months</Tag>
          </Card.Head>
          <Card.Body flush>
            <div className="tblwrap">
              <table className="tbl pk__tbl">
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

/**
 * A CHANGE A TRAINER CAN READ — and past a point that is not a percentage.
 *
 * A quarter measured against a nearly-empty one produces figures like **+1086%**,
 * which was on this tile against a previous quarter of ₹31,750. It is arithmetic
 * rather than information: nobody holds "eleven hundred per cent" as a quantity,
 * and the number is largest exactly when the baseline is least trustworthy.
 *
 * Past a tripling it is said as a MULTIPLE, which is how the growth is actually
 * described out loud — *12× the quarter before* — and the previous quarter's
 * rupees are printed beside it either way, so the reader can always check the
 * claim against the two numbers it came from.
 */
function growthLabel(pct: number): string {
  if (pct >= 200) {
    const times = 1 + pct / 100;
    return `${times >= 10 ? Math.round(times) : times.toFixed(1).replace(/\.0$/, '')}×`;
  }
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`;
}
