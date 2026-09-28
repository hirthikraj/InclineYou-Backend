'use client';


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
          <Button href="/today" variant="secondary" size="sm" style={{ marginLeft: 'auto' }}>
            Close them off
          </Button>
        </div>
      )}

      {/* ── 1 · the four figures ────────────────────────────────────────────── */}
      <div className="stats stats--4 rptstats">
        <Stat
          label="You earned · 90 days"
          value={rupees(h.revenue)}
          detail={revenueChange === null
            ? 'No comparable quarter behind it'
            : <>
                <b>{growthLabel(revenueChange)}</b> on the quarter before
                {' · '}{rupees(h.revenuePrev)}
              </>}
          tone="acc"
        />

        <Stat
          label="Training now · 30 days"
          value={h.activeClients}
          detail={clientChange === 0
            ? 'Same as the 30 days before'
            : <><b>{clientChange > 0 ? '+' : '−'}{Math.abs(clientChange)}</b> on the 30 days before</>}
        />

        {/* Retention has no `stat--danger` variant and that is on purpose: a
            trainer's honest retention over a quarter is often 60-something, and
            painting the truth red every month is how a figure stops being read.
            The sentence beneath is what makes it actionable. */}
        <Stat
          label="Retention"
          value={h.retention === null ? '—' : `${h.retention}%`}
          detail={h.retention === null
            ? 'Nobody was training three months ago'
            : <><b>{h.retentionKept} of {h.retentionBase}</b> training 3 months ago are still here</>}
        />

        <Stat
          label="Attendance · 90 days"
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
            
            <Tag>Your share, as it landed</Tag>
            
          </Card.Head>
          <Card.Body className="rptchart">
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
          </Card.Body>
        </Card>

        <Card>
          <Card.Head title="The year in figures" />
          <Card.Body>
            <KeyValueRow k="Sessions delivered">{totalDelivered}</KeyValueRow>
            <KeyValueRow k="Busiest month">
              {months[report.delivered.indexOf(Math.max(...report.delivered))]?.label ?? '—'}
              {' · '}{Math.max(...report.delivered)}
            </KeyValueRow>
            <KeyValueRow k="Clients gained">{totalJoined > 0 ? `+${totalJoined}` : '0'}</KeyValueRow>
            <KeyValueRow k="Clients lost">{totalLost > 0 ? `−${totalLost}` : '0'}</KeyValueRow>
            <KeyValueRow k="Net">
              {totalJoined - totalLost > 0 ? '+' : totalJoined - totalLost < 0 ? '−' : ''}
              {Math.abs(totalJoined - totalLost)}
            </KeyValueRow>
            <KeyValueRow k="Revenue, 12 months">{rupees(report.revenue.reduce((s, v) => s + v, 0))}</KeyValueRow>
          </Card.Body>
          <Card.Body style={{ borderTop: '1px solid var(--tx-line)' }}>
            <p className="small" style={{ lineHeight: 1.6 }}>
              <b>Lost</b> is inferred, because nothing records a client leaving — it is
              somebody whose last session was that month and who has not trained in
              the 30 days since. So the most recent month or two cannot report it
              yet, and reads zero rather than guessing.
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
                    /* ink-3 / ink-2 and NOT ink-off / ink-3. A month with no
                       movement is still a month the trainer reads along the
                       strip to find the one that did move, and `--tx-ink-off`
                       measured 3.1:1 against the card — under 1.4.3. The quiet
                       step is carried one rung up instead, where both ends pass
                       (5.9:1 and 7.4:1) and the difference is still visible. */
                    color: report.joined[i] === 0 && report.lost[i] === 0
                      ? 'var(--tx-ink-3)'
                      : 'var(--tx-ink-2)',
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
          </Card.Body>
        </Card>
      </div>
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
