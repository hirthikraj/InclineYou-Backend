'use client';

import { useState } from 'react';

import type { MoneyData } from '@/lib/money/api';
import type { PacksData } from '@/lib/packs/api';
import type { ReportsData } from '@/lib/business/report-api';
import { buildPracticeReport, reportCandidates } from '@/lib/business/report';
import {
  computeLedger,
  computeOwed,
  computeGymShare,
  computeGst,
  computeWriteOffs,
  computeTrend,
  computeUpcoming,
} from '@/lib/money/compute';
import { csvFilename, downloadCsv, ledgerCsv, owedCsv } from '@/lib/money/csv';
import {
  currentMonth,
  periodChip,
  periodProse,
  periodRange,
  periodSpanLabel,
  type Period,
} from '@/lib/money/period';
import { rupees } from '@/lib/today/time';
import { TopBar } from '@/components/shell/TopBar';
import { PageTabs } from '@/components/shell/PageTabs';
import { PeriodPicker } from '@/components/money/PeriodPicker';

import { LedgerTab, type LedgerFilter } from '@/components/money/LedgerTab';
import { OwedTab } from '@/components/money/OwedTab';
import { GymShareTab } from '@/components/money/GymShareTab';
import { GstTab } from '@/components/money/GstTab';
import { WriteOffsTab } from '@/components/money/WriteOffsTab';
import { RecordPanel } from '@/components/money/RecordPanel';
import { Packages } from '@/components/packages/Packages';
import { ReportsTab } from './ReportsTab';
import { BUSINESS_TABS, PERIODLESS_TABS, type BusinessTab } from './tabs';
import { LastContactProvider } from '@/components/nudge/LastContact';

/**
 * BUSINESS — *money, packages, reports*, and the fifth of the five destinations.
 *
 * This is `components/money/Money.tsx` renamed and widened. The rename is not
 * cosmetic: *Money* named a ledger, and a trainer looking for their price list or
 * their retention did not think to open it. **Business names the question rather
 * than the table**, which is the same move *Today* made over *Home*, and it is
 * what let two rail rows and a stub become tabs here instead of three
 * destinations competing for one slot on a phone.
 *
 * ── WHAT MOVED IN, AND WHAT WAS DELETED TO MAKE ROOM ─────────────────────────
 *
 * - **Packages** was `/packages`, a rail row in the `BUILD` group. It is the third
 *   tab and it is the REAL price list — `components/packages/Packages.tsx`,
 *   reading the `pack` table.
 * - The money book's OWN *Packages* tab is gone. It grouped sold rows into price
 *   points it inferred, and having both on one strip made the duplicate
 *   impossible to miss. What a client actually bought was always better answered
 *   on their file's Payments tab, and that is where it stays.
 * - **Reports** was `/reports`, a rail row pointing at a `NotBuilt` screen, then
 *   a notice inside this strip saying so. It is built: the practice's own year —
 *   revenue, sessions, clients, retention, attendance, acquisition and churn —
 *   and, kept firmly separate from all of it, the way in to the CLIENT-facing
 *   progress card at `/clients/:id/report`. `ReportsTab.tsx` carries the
 *   argument for why those two things share a tab and share no figure.
 *
 * ── THE TAB IS IN THE URL AND THE PERIOD IS NOT ──────────────────────────────
 *
 * `Money.tsx` held the active tab in `useState` seeded from a prop and moved it
 * with `router.replace`, so the param and the state could disagree and nobody
 * could link anyone to *Owed*. `tabs.ts` carries the reasoning; the short version
 * is that a tab which decides what is FETCHED — *Packages* does — cannot be
 * client state, and a strip where six tabs are state and one is a fetch is a
 * strip with two behaviours.
 *
 * The PERIOD went the other way, out of `/business/2026-08` and into the state
 * below, and it is the same test applied honestly: the month never decided what
 * was fetched. `getMoney()` pulls the book unwindowed and the `compute*`
 * functions slice it here, so a month in the path was a filter dressed as a
 * resource — one that cost a redirect on every bare `/business` and could only
 * ever spell one calendar month. Now it can also spell *last 3* and *last 6*.
 * `lib/money/period.ts` has the whole argument.
 *
 * The period survives a tab change because a tab change is a soft navigation:
 * the server component re-renders, this component keeps its place in the tree,
 * and React keeps its state. A hard reload lands on the current month, which is
 * the right default — a span is a lens, not a setting.
 *
 * ── AND THE RECORD PANEL CAN BE OPENED FROM A LINK ───────────────────────────
 *
 * `?record=<clientId>` opens it with that client already chosen. That parameter
 * exists for one caller: *Sell a pack* and *Renew the pack* on a client's file,
 * which used to be links to `/money` — they landed the trainer on a month view
 * with the panel shut and the client's name in their head rather than in the
 * form. See `PaymentsTab.tsx`.
 */
export function Business({
  data,
  packs,
  reports,
  tab,
  recordFor = null,
  lastContact = {},
}: {
  data: MoneyData;
  /** Fetched only when `tab === 'packages'` — a second API call on every ledger
   *  view would be a request nobody asked for. Null on every other tab. */
  packs: PacksData | null;
  /** Fetched only when `tab === 'reports'`, for the same reason and at a higher
   *  price: a year of the diary is the largest read on this half after the
   *  exercise library. `lib/business/report-api.ts` argues for paying it here
   *  and nowhere else. Null on every other tab. */
  reports: ReportsData | null;
  /** clientId → when they were last messaged. Read by the nudge buttons on the
   *  dues list and on the price list's *Ending soon* — see `LastContact.tsx`. */
  lastContact?: Record<string, number>;
  tab: BusinessTab;
  recordFor?: string | null;
}) {
  /* The slice of the book on screen: a calendar month, or the last 3 or 6.
     `data.now` and not `Date.now()` — the server's clock decides which month is
     current, so the first paint on the client agrees with the one it hydrates. */
  const [period, setPeriod] = useState<Period>(() => currentMonth(data.now));
  const range = periodRange(period, data.now);

  // Panels. `recordFor` seeds the record panel open — see the docstring.
  const [recordPanelOpen, setRecordPanelOpen] = useState(recordFor !== null);

  // Ledger filter: which chip is pressed (null = show all)
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>(null);

  const { stats: ledgerStats, rows: ledgerRows } = computeLedger(
    data.payments, data.clients, range,
  );
  /* Owed and GST take no range on purpose. Owed is "who has not paid, as of
     now" — a debt does not stop being owed because you looked at July — and GST
     is a rolling twelve months against a statutory threshold. Both were already
     period-blind; the picker is hidden on GST and `MONTHLESS_TABS` says why. */
  const { stats: owedStats, rows: owedRows } = computeOwed(
    data.payments, data.clients, data.packages, data.now,
  );
  const { stats: gymShareStats, rows: gymShareRows } = computeGymShare(
    data.payments, data.clients, data.trainer, range,
  );
  const { stats: gstStats, monthBars } = computeGst(data.payments, data.now);
  const { stats: writeOffStats, rows: writeOffRows } = computeWriteOffs(
    data.payments, data.clients, range,
  );
  /* The third question — sold coaching not yet delivered. Period-blind on
     purpose, like Owed: a pack with five sessions left has five sessions left
     whichever month you are looking at. */
  const upcoming = computeUpcoming(data.packages);
  /* And the trend, which is fixed at six months and ignores the picker for the
     reason the brief gives — it is the one chart on this screen, and a chart
     whose window moves is a chart you have to read the axis of every time. */
  const trend = computeTrend(data.payments, data.now, 6);

  /* The practice report, built once. Both halves of the Reports tab read the
     same rows — the year of the diary the page fetched, plus the payments every
     other tab is already using — so the input is assembled here rather than
     twice inside the JSX. Null on the six tabs that did not pay for it. */
  const reportInput = reports
    ? {
        clients: reports.clients,
        sessions: reports.sessions,
        workouts: reports.workouts,
        payments: data.payments,
        now: reports.now,
      }
    : null;
  const practice = reportInput ? buildPracticeReport(reportInput) : null;
  const candidates = reportInput ? reportCandidates(reportInput) : [];

  const href = (t: BusinessTab) => (t === 'ledger' ? '/business' : `/business?tab=${t}`);

  const owedCount = owedRows.length;
  const owedClientCount = new Set(owedRows.map((r) => r.clientId)).size;
  const writeOffCount = writeOffRows.length;
  // The price list's own length when this tab has it, and nothing when it does
  // not — the deleted tab inferred its count from sold rows, which is the defect
  // this fold-in exists to remove. Both lists are counted: a trainer at a gym
  // genuinely has two, and the tab badge answers "how many prices are on file".
  const packCount = packs ? packs.packs.filter((p) => p.status === 'active').length : null;

  const label: Record<BusinessTab, string> = {
    ledger: 'Ledger',
    owed: 'Owed',
    packages: 'Packages',
    gymshare: 'Gym share',
    gst: 'GST',
    writeoffs: 'Write-offs',
    reports: 'Reports',
  };

  const count: Partial<Record<BusinessTab, number | null>> = {
    owed: owedCount,
    packages: packCount,
    writeoffs: writeOffCount,
  };

  /**
   * The line under the title. It changes per tab because the title cannot —
   * *Business* is the destination's name on the rail and in the bar, and a page
   * that renamed itself per tab would give the trainer a different answer to
   * "where am I" than the thing they clicked.
   */
  const chip = periodChip(period);
  const span = periodSpanLabel(period, data.now);

  const subtitle: Record<BusinessTab, string> = {
    ledger: `${span ?? chip} · billed, collected, split and owed`,
    owed: owedRows.length > 0
      ? `${rupees(owedStats.lateAmount + owedStats.dueAmount)} across ${owedRows.length} client${owedRows.length === 1 ? '' : 's'}`
      : 'All settled',
    packages: 'What you sell, and what it is worth a session',
    gymshare: data.trainer.gymName
      ? `${data.trainer.gymName} · ${data.trainer.gymSharePercent ?? 0}% of floor`
      : 'No gym on file',
    gst: `${gstStats.fyLabel} · ${rupees(gstStats.rolling12mo)} of your own`,
    writeoffs: writeOffRows.length > 0
      ? `${writeOffStats.percentOfBilled}% of billed`
      : `None in ${periodProse(period)}`,
    reports: 'How the practice is doing',
  };

  /**
   * EXPORT FOR THE CA — and the tab decides what is in the file.
   *
   * The button was drawn on five tabs with no `onClick` at all, so a trainer who
   * pressed it got nothing and no error. It exports the rows the tab in front of
   * them is showing, which is the only export that can be checked against the
   * screen — *Owed* gives the chase list, everything else gives the ledger for
   * the period. `lib/money/csv.ts` carries the formatting decisions.
   */
  const handleExport = () => {
    const slug = periodChip(period);
    if (tab === 'owed') {
      downloadCsv(csvFilename('owed', 'as-of-today'), owedCsv(owedRows));
      return;
    }
    if (tab === 'writeoffs') {
      downloadCsv(csvFilename('write-offs', slug), ledgerCsv(
        ledgerRows.filter((r) => r.isWriteOff),
      ));
      return;
    }
    if (tab === 'gymshare') {
      downloadCsv(csvFilename('gym-share', slug), ledgerCsv(
        ledgerRows.filter((r) => (r.gymShareAmount ?? 0) > 0),
      ));
      return;
    }
    if (tab === 'gst') {
      /* A CA filing GST wants the whole year, not the period picker's slice —
         and the GST tab is a rolling twelve months for exactly that reason. */
      const twelveMonthsAgo = data.now - 365 * 86_400_000;
      const { rows: yearRows } = computeLedger(
        data.payments, data.clients, { from: twelveMonthsAgo, to: data.now + 1 },
      );
      downloadCsv(csvFilename('turnover', gstStats.fyLabel), ledgerCsv(yearRows));
      return;
    }
    downloadCsv(csvFilename('ledger', slug), ledgerCsv(ledgerRows));
  };

  const showsPeriod = !PERIODLESS_TABS.includes(tab);

  return (
    <LastContactProvider map={lastContact} now={data.now}>
      <TopBar crumb={tab === 'ledger' ? 'Business' : `Business / ${label[tab]}`} onSearch={() => {}} />

      <main className="main" id="main-content">
        <div className="ph">
          <div className="ph__row">
            <div className="ph__id">
              <h1 className="ph__t">Business</h1>
              <p className="ph__sub">{subtitle[tab]}</p>
            </div>
            <div className="ph__acts">
              {/* State, not a navigation — which is the reverse of what this
                  was. The month used to be a path segment and a pick used to be
                  `router.push`, so every month a trainer glanced at cost a
                  server round trip and a back-button entry, for a filter over a
                  payload that was already in the browser. */}
              {showsPeriod && (
                <PeriodPicker period={period} nowMs={data.now} onChange={setPeriod} />
              )}
              {/* Not drawn on Packages or Reports: a price list is not something a
                  chartered accountant is sent, and there is nothing to export from
                  a tab that has not been built. */}
              {tab !== 'packages' && tab !== 'reports' && (
                <button className="btn btn--secondary" type="button" onClick={handleExport}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 4v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 19.5h15"/>
                  </svg>
                  Export for my CA
                </button>
              )}
            </div>
          </div>

          <PageTabs
            label="Business sections"
            current={tab}
            replace
            tabs={BUSINESS_TABS.map((t) => ({
              key: t,
              label: label[t],
              href: href(t),
              count: count[t] ?? null,
            }))}
          />
        </div>

        <div className="body">
          {tab === 'ledger' && (
            <LedgerTab
              stats={ledgerStats}
              rows={ledgerRows}
              owed={owedStats}
              owedCount={owedClientCount}
              upcoming={upcoming}
              trend={trend}
              filter={ledgerFilter}
              onFilterChange={setLedgerFilter}
              onRecord={() => setRecordPanelOpen(true)}
              onExport={handleExport}
              trainer={data.trainer}
              period={period}
            />
          )}
          {tab === 'owed' && (
            <OwedTab stats={owedStats} rows={owedRows} />
          )}
          {/* The price list, whole — the component that used to be `/packages`.
              `packs` is null only if the fetch was refused, and the page draws
              `Unavailable` in that case rather than reaching here. */}
          {tab === 'packages' && packs && <Packages data={packs} />}
          {tab === 'gymshare' && (
            <GymShareTab
              stats={gymShareStats}
              rows={gymShareRows}
              trainer={data.trainer}
              period={period}
            />
          )}
          {tab === 'gst' && <GstTab stats={gstStats} monthBars={monthBars} />}
          {tab === 'writeoffs' && (
            <WriteOffsTab
              stats={writeOffStats}
              rows={writeOffRows}
              period={period}
            />
          )}
          {/* Two audiences on one tab and no figure crossing between them —
              the practice's own year, and the door to the client-facing card.
              Built here rather than on the server because both are pure over
              rows the page already holds; the only thing the server had to
              fetch is the year of sessions `reports` carries. */}
          {tab === 'reports' && practice && (
            <ReportsTab report={practice} candidates={candidates} />
          )}
        </div>
      </main>

      {recordPanelOpen && (
        <>
          <button
            className="scrim scrim--soft"
            type="button"
            aria-label="Close panel"
            onClick={() => setRecordPanelOpen(false)}
          />
          <RecordPanel
            clients={data.clients}
            packages={data.packages}
            trainer={data.trainer}
            initialClientId={recordFor}
            onClose={() => setRecordPanelOpen(false)}
          />
        </>
      )}
    </LastContactProvider>
  );
}
