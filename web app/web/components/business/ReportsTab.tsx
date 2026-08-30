'use client';

import Link from 'next/link';

import {
  changePercent,
  wholeMonthAverage,
  type PracticeReport,
  type ReportCandidate,
} from '@/lib/business/report';
import { csvFilename, downloadCsv } from '@/lib/money/csv';
import { rupees, rupeesShort, initials, avatarToken } from '@/lib/today/time';
import { MonthBars } from './MonthBars';

/**
 * REPORTS — *how is the practice doing*, and the door to the other audience.
 *
 * This was a `NotBuilt` notice, and before that a rail row pointing at a
 * full-page dead end. It is the brief's section 9, which opens with a warning
 * this file is arranged around: **"Two distinct audiences. Don't mix them."**
 *
 * So the screen is two things stacked, with no figure crossing between them:
 *
 * 1. **The trainer's business report.** Six metrics, one screen, and the ceiling
 *    is the feature — *"a trainer is not an analyst"*. Four headline figures with
 *    a direction on each, then three shapes that say whether the figures are
 *    normal.
 * 2. **Client progress reports.** Not a metric and not on this page's axes: a
 *    list of the clients whose twelve weeks are worth showing them, each one
 *    linking to a card built for the CLIENT to read. The brief ranks it above
 *    most of the analytics above it, and it is a different screen entirely.
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
export function ReportsTab({
  report,
  candidates,
}: {
  report: PracticeReport;
  candidates: ReportCandidate[];
}) {
  const { headline: h, months } = report;

  if (report.isEmpty) {
    return (
      <div className="empty" style={{ marginTop: 64 }}>
        <div className="empty__ic">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 19.5V5" /><path d="M4 19.5h16" />
            <path d="M8 16v-5" /><path d="M13 16V7" /><path d="M18 16v-8" />
          </svg>
        </div>
        <p className="empty__t">Nothing to report yet</p>
        <p className="empty__b">
          These figures are built out of delivered sessions and collected payments.
          Mark a session done or record a payment and the year fills in from there —
          nothing here is typed in by hand, so there is nothing to set up.
        </p>
        <Link className="btn btn--primary" href="/today" style={{ marginTop: 16 }}>
          Go to today
        </Link>
      </div>
    );
  }

  const revenueChange = changePercent(h.revenue, h.revenuePrev);
  const clientChange = h.activeClients - h.activeClientsPrev;
  const totalJoined = report.joined.reduce((s, v) => s + v, 0);
  const totalLost = report.lost.reduce((s, v) => s + v, 0);
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
    const head = ['Month', 'Revenue (your share)', 'Sessions delivered', 'Active clients', 'New clients', 'Clients lost'];
    const rows = months.map((m, i) => [
      `${m.label} ${m.year}`,
      String(report.revenue[i]),
      String(report.delivered[i]),
      String(report.active[i]),
      String(report.joined[i]),
      String(report.lost[i]),
    ]);
    downloadCsv(
      csvFilename('practice', `${months[0].label}-${months[months.length - 1].label}-${months[months.length - 1].year}`),
      [head, ...rows].map((r) => r.join(',')).join('\n'),
    );
  };

  return (
    <>
      {/* ── Every rate here is a rate of what is KNOWN, and this is what makes
             that true. `webapp-reports.html`'s own rule: a past session nobody
             closed off is evidence the trainer was on a gym floor, not evidence
             the client stayed away — so it is in no denominator, and the screen
             names the hole rather than absorbing it. One wrong red figure is all
             it takes for a trainer to stop believing the tile. ── */}
      {h.unmarked > 0 && (
        <div className="msg msg--warn" style={{ marginBottom: 12 }}>
          <span>
            <b>{h.unmarked} session{h.unmarked === 1 ? '' : 's'}</b> in the last 90 days
            {h.unmarked === 1 ? ' was' : ' were'} never marked done or no-show.
            {h.unmarked === 1 ? ' It is' : ' They are'} in no figure on this screen —
            not in attendance, and not in sessions delivered.
          </span>
          <Link className="btn btn--sm btn--secondary" href="/today" style={{ marginLeft: 'auto' }}>
            Close them off
          </Link>
        </div>
      )}

      {/* ── 1 · the four figures ────────────────────────────────────────────── */}
      <div className="stats stats--4 rptstats">
        <div className="stat stat--acc">
          <p className="stat__k">You earned · 90 days</p>
          <p className="stat__v">{rupees(h.revenue)}</p>
          <p className="stat__d">
            {revenueChange === null
              ? 'No comparable quarter behind it'
              : <>
                  <b>{revenueChange > 0 ? '+' : '−'}{Math.abs(revenueChange)}%</b> on the quarter before
                  {' · '}{rupees(h.revenuePrev)}
                </>}
          </p>
        </div>

        <div className="stat">
          <p className="stat__k">Training now · 30 days</p>
          <p className="stat__v">{h.activeClients}</p>
          <p className="stat__d">
            {clientChange === 0
              ? 'Same as the 30 days before'
              : <><b>{clientChange > 0 ? '+' : '−'}{Math.abs(clientChange)}</b> on the 30 days before</>}
          </p>
        </div>

        {/* Retention has no `stat--danger` variant and that is on purpose: a
            trainer's honest retention over a quarter is often 60-something, and
            painting the truth red every month is how a figure stops being read.
            The sentence beneath is what makes it actionable. */}
        <div className="stat">
          <p className="stat__k">Retention</p>
          <p className="stat__v">{h.retention === null ? '—' : `${h.retention}%`}</p>
          <p className="stat__d">
            {h.retention === null
              ? 'Nobody was training three months ago'
              : <><b>{h.retentionKept} of {h.retentionBase}</b> training 3 months ago are still here</>}
          </p>
        </div>

        <div className={`stat${h.attendance !== null && h.attendance < 70 ? ' stat--warn' : ''}`}>
          <p className="stat__k">Attendance · 90 days</p>
          <p className="stat__v">{h.attendance === null ? '—' : `${h.attendance}%`}</p>
          <p className="stat__d">
            {h.attendance === null
              ? 'Nothing settled yet'
              : <><b>{h.attendanceDone}</b> kept of {h.attendanceSettled} that settled</>}
          </p>
        </div>
      </div>

      {/* ── 2 · money, and the year in words ────────────────────────────────── */}
      <div className="rptgrid mt4">
        <div className="card">
          <div className="card__hd">
            <h2 className="card__t">Revenue, month by month</h2>
            <span className="tag">Your share, as it landed</span>
            <span className="card__acts">
              <button className="btn btn--sm btn--secondary" type="button" onClick={exportMonths}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 4v11" /><path d="M7.5 10.5 12 15l4.5-4.5" /><path d="M4.5 19.5h15" />
                </svg>
                CSV
              </button>
            </span>
          </div>
          <div className="card__b rptchart">
            <MonthBars
              months={months}
              values={report.revenue}
              format={(v) => rupeesShort(v)}
              title={(m, v) => `${m.label} ${m.year}: ${rupees(v)}${m.isCurrent ? ' so far' : ''}`}
              average={wholeMonthAverage(report.revenue, months)}
            />
            <p className="small" style={{ color: 'var(--tx-ink-3)', marginTop: 12, lineHeight: 1.6 }}>
              Money that <b>arrived</b>, by the month it arrived in, with the gym&rsquo;s cut
              already out. The dashed line is the average of the whole months —
              this month is not in it, because an average dragged down by the 2nd
              lies for four weeks.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card__hd">
            <h2 className="card__t">The year in figures</h2>
          </div>
          <div className="card__b">
            <div className="kv">
              <span className="kv__k">Sessions delivered</span>
              <span className="kv__v mono">{totalDelivered}</span>
            </div>
            <div className="kv">
              <span className="kv__k">Busiest month</span>
              <span className="kv__v mono">
                {months[report.delivered.indexOf(Math.max(...report.delivered))]?.label ?? '—'}
                {' · '}{Math.max(...report.delivered)}
              </span>
            </div>
            <div className="kv">
              <span className="kv__k">Clients gained</span>
              <span className="kv__v mono">{totalJoined > 0 ? `+${totalJoined}` : '0'}</span>
            </div>
            <div className="kv">
              <span className="kv__k">Clients lost</span>
              <span className="kv__v mono">{totalLost > 0 ? `−${totalLost}` : '0'}</span>
            </div>
            <div className="kv">
              <span className="kv__k">Net</span>
              <span className="kv__v mono">
                {totalJoined - totalLost > 0 ? '+' : totalJoined - totalLost < 0 ? '−' : ''}
                {Math.abs(totalJoined - totalLost)}
              </span>
            </div>
            <div className="kv">
              <span className="kv__k">Revenue, 12 months</span>
              <span className="kv__v mono">{rupees(report.revenue.reduce((s, v) => s + v, 0))}</span>
            </div>
          </div>
          <div className="card__b" style={{ borderTop: '1px solid var(--tx-line)' }}>
            <p className="small" style={{ lineHeight: 1.6 }}>
              <b>Lost</b> is inferred, because nothing records a client leaving — it is
              somebody whose last session was that month and who has not trained in
              the 30 days since. So the most recent month or two cannot report it
              yet, and reads zero rather than guessing.
            </p>
          </div>
        </div>
      </div>

      {/* ── 3 · the work, and the people doing it ───────────────────────────── */}
      <div className="rptgrid rptgrid--even mt4">
        <div className="card">
          <div className="card__hd">
            <h2 className="card__t">Sessions delivered</h2>
            <span className="tag">Marked or logged</span>
          </div>
          <div className="card__b rptchart">
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
          </div>
        </div>

        <div className="card">
          <div className="card__hd">
            <h2 className="card__t">Clients, month by month</h2>
            <span className="tag">At least one session</span>
          </div>
          <div className="card__b rptchart">
            <MonthBars
              months={months}
              values={report.active}
              format={(v) => String(v)}
              title={(m, v) =>
                `${m.label} ${m.year}: ${v} client${v === 1 ? '' : 's'}` +
                ` · ${report.joined[months.indexOf(m)]} new, ${report.lost[months.indexOf(m)]} lost`
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
                    color: report.joined[i] === 0 && report.lost[i] === 0
                      ? 'var(--tx-ink-off)'
                      : 'var(--tx-ink-3)',
                  }}
                  title={`${m.label} ${m.year}: ${report.joined[i]} joined, ${report.lost[i]} lost`}
                >
                  {m.label}{' '}
                  {report.joined[i] > 0 && (
                    <b style={{ color: 'var(--tx-accent-text)' }}>+{report.joined[i]}</b>
                  )}
                  {report.lost[i] > 0 && (
                    <b style={{ color: 'var(--tx-danger)' }}>
                      {report.joined[i] > 0 ? ' ' : ''}−{report.lost[i]}
                    </b>
                  )}
                  {report.joined[i] === 0 && report.lost[i] === 0 && '·'}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── The OTHER audience. Separated by a rule and a heading, because the
             brief's first instruction about this section is not to mix them. ── */}
      <ClientReportsIndex candidates={candidates} />
    </>
  );
}

/**
 * THE SECOND AUDIENCE — and it is a door, not a report.
 *
 * The brief puts this above most of the analytics above it, and gives three
 * reasons in order: clients renew when they can see progress; it makes the
 * trainer look professional; and clients share it, which is free acquisition
 * from the most credible source there is.
 *
 * What belongs HERE is only the way in. The card itself is
 * `/clients/:id/report`, built for a reader who is not the trainer — no revenue,
 * no retention, nothing about the practice at all.
 *
 * Ranked by sessions in the last twelve weeks, because the card with the most on
 * it is the one most likely to renew somebody. Alphabetical would bury exactly
 * the client this feature was built for. A client with nothing delivered in the
 * window is not listed: their report would be a blank page with their name on
 * it, and sending that is worse than sending nothing.
 */
function ClientReportsIndex({ candidates }: { candidates: ReportCandidate[] }) {
  return (
    <div className="sect mt4">
      <div className="card">
        <div className="card__hd">
          <h2 className="card__t">Client progress reports</h2>
          <span className="tag">Last 12 weeks</span>
          <span className="card__acts small" style={{ color: 'var(--tx-ink-3)' }}>
            {candidates.length} with something to show
          </span>
        </div>

        <div className="card__b" style={{ borderBottom: '1px solid var(--tx-line)' }}>
          <p className="small" style={{ lineHeight: 1.6, maxWidth: '68ch' }}>
            A card for the <b>client</b> to read — sessions, measurements and the lifts
            that moved, with nothing about your business on it. Send it as an image on
            WhatsApp, or hand it over at the end of a session. Most people quit because
            progress feels invisible, not because it is absent.
          </p>
        </div>

        <div className="card__b card__b--flush">
          {candidates.length === 0 ? (
            <p className="small" style={{ padding: 24, textAlign: 'center', color: 'var(--tx-ink-3)' }}>
              Nobody has trained in the last twelve weeks, so there is no progress to
              report yet.
            </p>
          ) : (
            <div className="tblwrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table className="tbl rpttbl" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th className="num rptcol">Sessions</th>
                    <th className="rptcol">Last trained</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.clientId}>
                      <td>
                        <span className="who">
                          <span className="av av--sm" style={{ background: `var(${avatarToken(c.clientId)})` }}>
                            {initials(c.name)}
                          </span>
                          <b>{c.name}</b>
                        </span>
                        {/* The two figures again, as one line, for the narrow
                            reflow. `.tbl--stack` drops the header and this table
                            cannot afford that — a bare `24` under no column name
                            is not a number anybody can read. So the columns fold
                            INTO the client cell, where the words come with them,
                            and app.css hides whichever copy is not in play. */}
                        <span className="rptmeta">
                          {c.sessions} session{c.sessions === 1 ? '' : 's'} · last {whenLabel(c.lastAt)}
                        </span>
                      </td>
                      <td className="num rptcol">{c.sessions}</td>
                      <td className="rptcol" style={{ color: 'var(--tx-ink-3)' }}>{whenLabel(c.lastAt)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <Link className="btn btn--sm btn--secondary" href={`/clients/${c.clientId}/report`}>
                          Progress report
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function whenLabel(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
