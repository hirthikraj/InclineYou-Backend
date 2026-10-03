'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { loadLedgerPage, loadLedgerView, loadSummary } from '@/lib/business/actions';
import {
  ledgerFilterParams,
  ledgerWindow,
  summaryQuery,
  type LedgerFilter,
  type LedgerPage,
  type MoneySummary,
} from '@/lib/business/types';
import { currentMonth, periodProse } from '@/lib/money/period';
import { rupees } from '@/lib/today/time';
import { TopBar } from '@/components/shell/TopBar';
import { LedgerTab } from '@/components/money/LedgerTab';
import { RecordPanel } from '@/components/money/RecordPanel';
import { BizHeader } from './BizHeader';
import { usePeriodScope } from './PeriodScope';

/**
 * TRANSACTIONS — the book itself, and the only page in Business that draws rows.
 *
 * ── IT HOLDS ONE PAGE, NOT THE BOOK ──────────────────────────────────────────
 *
 * It used to receive every payment and slice them in the browser. It receives the
 * first page of the current month from the server (`getLedgerStart`) and asks for
 * everything else: a new period or chip is a new view (first page, with the
 * count), Next and Previous walk the keyset cursors, and a write re-reads the page
 * the trainer is on. The period is state in a layout the server cannot see, which
 * is why these reads are server actions rather than props.
 *
 * ── PREVIOUS NEEDS A STACK, BECAUSE A KEYSET HAS NO OFFSET ───────────────────
 *
 * `nextCursor` says where the page AFTER this one starts and nothing says where
 * the one before did, so the cursor each visited page was fetched with is kept in
 * `cursors`. Going back is reading the earlier entry; there is no "page 7".
 *
 * ── AND THE EXPORT IS A DOWNLOAD, NOT A BIG PAGE ─────────────────────────────
 *
 * The CSV button navigates to `/api/payments/export` with the same window and
 * chip, and that route streams the backend's file. The browser never holds a
 * token and Next never holds the file: the old `size=5000` read into memory is
 * gone (contract R86).
 */

type View = {
  /** What this view was fetched for — period and chip — so a late answer can be recognised as stale. */
  key: string;
  summary: MoneySummary;
  page: LedgerPage;
  /** The cursor each visited page was fetched with; `cursors[0]` is always null. */
  cursors: (string | null)[];
  index: number;
};

const PAGE_SIZE = 50;

export function Transactions({
  start,
  recordFor = null,
  initialFilter = null,
}: {
  start: { now: number; hasGym: boolean; hasAnyPayments: boolean; summary: MoneySummary; page: LedgerPage };
  /**
   * `?record=<clientId>` opens the panel with that client already chosen — *Sell a
   * pack* / *Renew the pack* on a client's file, and the tab bar's +.
   */
  recordFor?: string | null;
  /** Which chip is pressed on arrival: `/business?tab=owed` and `?tab=writeoffs` redirect here with `?filter=`. */
  initialFilter?: LedgerFilter;
}) {
  const { period, now } = usePeriodScope();

  const [filter, setFilter] = useState<LedgerFilter>(initialFilter);
  const key = `${summaryQuery(period)}|${filter ?? ''}`;

  const [view, setView] = useState<View>(() => ({
    key: `${summaryQuery(currentMonth(start.now))}|`,
    summary: start.summary,
    page: start.page,
    cursors: [null],
    index: 0,
  }));
  /* Paging is a press, so it is set from the handler; a new period or chip is the
     key moving ahead of the view, so it is DERIVED — an effect that set it would
     render twice to say what the two keys already say. */
  const [paging, setPaging] = useState(false);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const busy = paging || (key !== view.key && failedKey !== key);
  const [loadError, setLoadError] = useState<string | null>(null);
  /* The key the screen is on NOW, so an answer for an earlier one can be recognised
     as stale and dropped. Written after render, never during it. */
  const latest = useRef(key);
  useEffect(() => { latest.current = key; }, [key]);

  /* A new period or chip: the first page again, with its count. The server
     rendered the current month with no chip, so on arrival there is nothing to
     fetch unless a `?filter=` seeded a chip. */
  useEffect(() => {
    if (key === view.key) return;
    let cancelled = false;
    loadLedgerView({ period, now, filter }).then((res) => {
      if (cancelled || latest.current !== key) return;
      if (!res.ok) { setFailedKey(key); setLoadError(res.message); return; }
      setLoadError(null);
      setView({ key, summary: res.data.summary, page: res.data.page, cursors: [null], index: 0 });
    });
    return () => { cancelled = true; };
  }, [key, view.key, period, now, filter]);

  const go = useCallback(async (to: number, cursors: (string | null)[]) => {
    const asked = latest.current;
    setPaging(true);
    const res = await loadLedgerPage({ period, now, filter, cursor: cursors[to] });
    if (latest.current !== asked) return;
    setPaging(false);
    if (!res.ok) { setLoadError(res.message); return; }
    setLoadError(null);
    // The count belongs to the view, not the page, so it is carried across.
    setView((v) => ({ ...v, page: { ...res.data, total: v.page.total }, cursors, index: to }));
  }, [period, now, filter]);

  const next = () => {
    if (!view.page.nextCursor) return;
    void go(view.index + 1, [...view.cursors.slice(0, view.index + 1), view.page.nextCursor]);
  };
  const prev = () => {
    if (view.index > 0) void go(view.index - 1, view.cursors);
  };

  /* After a write: the page the trainer is on, the tiles AND THE COUNT, re-read. A row
     that just stopped matching its chip (a pending one marked paid under *Pending*)
     falls out of the page, which is the right answer and not a glitch. The count is
     re-asked for here and nowhere else: carried over from before the write it read
     "1–1 of 0" for the first payment of a month, and a deleted row left it too high. */
  const reload = useCallback(async () => {
    const asked = latest.current;
    const [page, summary] = await Promise.all([
      loadLedgerPage({ period, now, filter, cursor: view.cursors[view.index], includeTotal: true }),
      loadSummary(period),
    ]);
    if (latest.current !== asked || !page.ok || !summary.ok) return;
    setView((v) => ({ ...v, summary: summary.data, page: page.data }));
  }, [period, now, filter, view.cursors, view.index]);

  const [recordPanelOpen, setRecordPanelOpen] = useState(recordFor !== null);

  /* ARRIVING HERE FROM HERE. The initialiser above runs once per mount, which is
     enough for a client's file and NOT enough for the tab bar's + — pressing it on
     this page is a soft navigation inside the same segment, so this component
     stays mounted. The parameter is then STRIPPED, so a second press is a real
     navigation rather than one to an identical URL. Render-time adjustment, not an
     effect, so nothing paints the shut panel for a frame first. */
  const [recordSeen, setRecordSeen] = useState(recordFor);
  if (recordFor !== recordSeen) {
    setRecordSeen(recordFor);
    if (recordFor !== null) setRecordPanelOpen(true);
  }
  const router = useRouter();
  useEffect(() => {
    if (recordFor !== null) router.replace('/business/transactions', { scroll: false });
  }, [recordFor, router]);

  const handleExport = () => {
    const { from, to } = ledgerWindow(period, now);
    const q = new URLSearchParams({ from, to, ...ledgerFilterParams(filter) });
    /* A download, not a navigation: the route answers `Content-Disposition:
       attachment`, so the page stays where it is. An anchor with `download` says so
       to the browser and keeps it off Next's router, which this URL is not a page of. */
    const a = document.createElement('a');
    a.href = `/api/payments/export?${q}`;
    a.download = '';
    a.click();
  };

  const t = view.summary.total;

  return (
    <>
      <TopBar crumb="Business / Transactions" title="Business" />
      <main className="main" id="main-content">
        <BizHeader
          title="Transactions"
          subtitle={
            t.packagesSold === 0 && t.paymentsCount === 0 && view.page.rows.length === 0
              ? `Nothing billed in ${periodProse(period)}`
              : <>
                  {view.page.total !== null ? `${view.page.total} entr${view.page.total === 1 ? 'y' : 'ies'} · ` : ''}
                  {rupees(t.billed)} billed · {rupees(t.collected)} collected
                </>
          }
          onExport={handleExport}
        />

        <div className="body">
          <LedgerTab
            summary={view.summary}
            rows={view.page.rows}
            filter={filter}
            onFilterChange={setFilter}
            onRecord={() => setRecordPanelOpen(true)}
            onExport={handleExport}
            onChanged={() => { void reload(); }}
            hasGym={start.hasGym}
            hasAnyPayments={start.hasAnyPayments}
            period={period}
            paging={{
              index: view.index,
              pageSize: PAGE_SIZE,
              total: view.page.total,
              hasNext: view.page.nextCursor !== null,
              busy,
              onPrev: prev,
              onNext: next,
            }}
            loadError={loadError}
          />
        </div>
      </main>

      {recordPanelOpen && (
        <RecordPanel
          initialClientId={recordFor}
          onClose={() => setRecordPanelOpen(false)}
          onRecorded={() => { void reload(); }}
        />
      )}
    </>
  );
}
