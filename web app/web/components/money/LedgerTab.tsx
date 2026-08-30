'use client';

import Link from 'next/link';

import type { LedgerRow, LedgerStats, OwedStats, TrendBar, UpcomingStats } from '@/lib/money/compute';
import { methodLabel } from '@/lib/money/compute';
import { periodChip, periodProse, periodTag, type Period } from '@/lib/money/period';
import { rupees, initials, avatarToken } from '@/lib/today/time';
import type { MoneyTrainer } from '@/lib/money/api';
import { TrendChart } from './TrendChart';

const DOWN_ARROW = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v13"/><path d="M6.5 12.5 12 18l5.5-5.5"/>
  </svg>
);

const UP_ARROW = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V6"/><path d="M6.5 11.5 12 6l5.5 5.5"/>
  </svg>
);

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function statusTag(status: string): { label: string; cls: string } {
  if (status === 'paid' || status === 'confirmed') return { label: 'Paid', cls: 'tag--ok' };
  if (status === 'pending') return { label: 'Pending', cls: 'tag--warn' };
  if (status === 'write_off') return { label: 'Written off', cls: 'tag' };
  return { label: status, cls: 'tag' };
}

function howLabel(row: LedgerRow): string {
  const method = methodLabel(row.method);
  const side = row.collectedBy === 'gym' || (row.gymShareAmount ?? 0) > 0 ? 'floor' : 'remote';
  return `${method} · ${side}`;
}

export type LedgerFilter = 'collected' | 'owed' | 'gymshare' | null;

interface Props {
  stats: LedgerStats;
  rows: LedgerRow[];
  /** As of NOW, across the whole book — not the period. See the tile's note. */
  owed: OwedStats;
  owedCount: number;
  upcoming: UpcomingStats;
  trend: { bars: TrendBar[]; best: number; averagePerMonth: number };
  filter: LedgerFilter;
  onFilterChange: (f: LedgerFilter) => void;
  onRecord: () => void;
  onExport: () => void;
  trainer: MoneyTrainer;
  /** What slice the figures cover. The tiles used to say "this month" flatly,
   *  which is a lie the moment the picker can say *last 6 months*. */
  period: Period;
}

/**
 * THE LEDGER, AND THE THREE QUESTIONS IT NOW OPENS WITH.
 *
 * A trainer opens this screen holding one of three questions, and the brief names
 * all three: *how much did I earn this month*, *who owes me*, and *what's coming*.
 * The tiles used to answer a different set — Billed, Collected, Gym share, Yours
 * — which is the book's own vocabulary rather than the trainer's, and which left
 * the third question unanswered anywhere in the product. The value of coaching
 * already sold and not yet delivered appeared on no screen.
 *
 * ── SO THE TILES ANSWER QUESTIONS AND THE CHIPS DO THE FILTERING ─────────────
 *
 * The old tiles were doing two jobs: they were the summary AND they were the
 * table's filter, which is why *Yours* — the one figure a trainer most wants —
 * had to be the inert fourth one. Splitting them frees the tiles to be the three
 * questions, and moves *Collected · Owed · Gym share* into chips on the ledger
 * card, next to the rows they narrow. Nothing was dropped: every filter that
 * existed still exists, in the place where its effect is visible.
 *
 * **Billed, Collected and the gym's cut are all still on screen** — in the side
 * card, where they were already drawn — because the summary is what makes the
 * headline figures argue-with-able.
 *
 * ── WHY *OWED* IS A LINK AND NOT A FILTER ────────────────────────────────────
 *
 * The other two tiles are about the period; this one cannot be. A debt does not
 * stop being owed because you looked at July, so it counts the whole book as of
 * now — which is `computeOwed`'s figure, the one *Owed* itself shows. Filtering
 * the period's rows by it would answer a narrower question than the tile asks, so
 * it goes to the tab that answers the question properly.
 */
export function LedgerTab({
  stats, rows, owed, owedCount, upcoming, trend,
  filter, onFilterChange, onRecord, onExport, trainer, period,
}: Props) {
  const filteredRows = filter === null ? rows
    : filter === 'collected' ? rows.filter((r) => r.status === 'paid' || r.status === 'confirmed')
    : filter === 'owed' ? rows.filter((r) => r.status === 'pending')
    : rows.filter((r) => (r.gymShareAmount ?? 0) > 0);

  const hasGym = trainer.gymName !== null;
  const owedTotal = owed.lateAmount + owed.dueAmount;

  if (rows.length === 0 && upcoming.packCount === 0 && owedCount === 0) {
    return (
      <div className="empty" style={{ marginTop: 64 }}>
        <div className="empty__ic">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="8" width="18" height="11" rx="2"/><path d="M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/>
          </svg>
        </div>
        <p className="empty__t">Nothing recorded yet</p>
        <p className="empty__b">
          X REP never holds your money — recording a payment is bookkeeping,
          not a transaction. Tap <b>Record payment</b> when money changes hands.
        </p>
        <button className="btn btn--primary" type="button" style={{ marginTop: 16 }} onClick={onRecord}>
          Record payment
        </button>
      </div>
    );
  }

  /* The chips. `gymshare` only where there is a gym — a filter that can only ever
     match nothing is a control that reads as broken. */
  const chips: Array<{ key: LedgerFilter; label: string }> = [
    { key: null, label: 'All' },
    { key: 'collected', label: 'Collected' },
    { key: 'owed', label: 'Pending' },
    ...(hasGym ? [{ key: 'gymshare' as const, label: 'Gym share' }] : []),
  ];

  return (
    <>
      {/* ── The three questions ─────────────────────────────────────────────── */}
      <div className="stats stats--3">
        {/* 1 · How much did I earn? */}
        <div className="stat stat--acc">
          <p className="stat__k">You earned · {periodTag(period)}</p>
          <p className="stat__v">{rupees(stats.yours)}</p>
          <p className="stat__d">
            {rupees(stats.collected)} collected
            {hasGym && stats.gymShare > 0 ? <> · {rupees(stats.gymShare)} to the gym</> : ''}
            {stats.collectedCount > 0 ? ` · ${stats.collectedCount} payment${stats.collectedCount === 1 ? '' : 's'}` : ''}
          </p>
        </div>

        {/* 2 · Who owes me? Whole book, as of now — see the docstring. */}
        <Link
          className={`stat${owed.lateCount > 0 ? ' stat--danger' : owedTotal > 0 ? ' stat--warn' : ''}`}
          href="/business?tab=owed"
          style={{ textDecoration: 'none' }}
        >
          <p className="stat__k">Owed to you</p>
          <p className="stat__v">{owedTotal > 0 ? rupees(owedTotal) : '—'}</p>
          <p className="stat__d">
            {owedTotal === 0
              ? 'Everyone is up to date'
              : <>
                  {owedCount} client{owedCount === 1 ? '' : 's'}
                  {owed.oldestDays > 0 ? ` · oldest ${owed.oldestDays} day${owed.oldestDays === 1 ? '' : 's'} overdue` : ''}
                </>}
          </p>
        </Link>

        {/* 3 · What's coming? */}
        <div className="stat">
          <p className="stat__k">Still to deliver</p>
          <p className="stat__v">{upcoming.value > 0 ? rupees(upcoming.value) : '—'}</p>
          <p className="stat__d">
            {upcoming.packCount === 0
              ? 'No live packages'
              : <>
                  {upcoming.sessionsRemaining > 0
                    ? `${upcoming.sessionsRemaining} session${upcoming.sessionsRemaining === 1 ? '' : 's'} sold`
                    : `${upcoming.packCount} pack${upcoming.packCount === 1 ? '' : 's'} running`}
                  {' · '}{upcoming.clientCount} client{upcoming.clientCount === 1 ? '' : 's'}
                  {upcoming.pausedCount > 0 && (
                    <> · <b>{rupees(upcoming.pausedValue)} paused</b></>
                  )}
                </>}
          </p>
        </div>
      </div>

      {/* ── Ledger + summary ────────────────────────────────────────────────── */}
      <div className="grid2 mt4" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)' }}>
        <div className="card">
          <div className="card__hd">
            <span className="card__t">Ledger</span>
            <span className="tag">Append-only</span>
            <span className="card__acts">
              <button
                className="btn btn--sm btn--secondary"
                type="button"
                onClick={onExport}
                disabled={filteredRows.length === 0}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 4v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 19.5h15"/>
                </svg>
                CSV
              </button>
              <button className="btn btn--sm btn--primary" type="button" onClick={onRecord}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                Record payment
              </button>
            </span>
          </div>

          {/* The filter, beside the rows it narrows rather than up in the tiles */}
          <div
            className="row gap2"
            role="group"
            aria-label="Filter the ledger"
            style={{ flexWrap: 'wrap', padding: '10px 16px 0' }}
          >
            {chips.map((c) => (
              <button
                key={c.label}
                className="chip"
                type="button"
                aria-pressed={filter === c.key}
                onClick={() => onFilterChange(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="card__b card__b--flush">
            <div className="tblwrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th aria-sort="descending">Date</th>
                    <th>Client</th>
                    <th>How</th>
                    <th className="num">Amount</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      {/* Two different emptinesses. "No entries match the filter"
                          over a period that was simply quiet reads as a broken
                          control, and sends the trainer clicking chips to find
                          rows that are not there. */}
                      <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--tx-ink-3)' }}>
                        {rows.length === 0
                          ? `Nothing billed in ${periodProse(period)}`
                          : 'No entries match the filter'}
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const initStr = initials(row.clientName);
                      const token = avatarToken(row.clientId);
                      const { label: stLabel, cls: stCls } = statusTag(row.status);
                      return (
                        <tr key={row.id}>
                          <td className="mono">{fmtDate(row.date)}</td>
                          <td>
                            <span className="who">
                              <span className="av av--sm" style={{ background: `var(${token})` }}>{initStr}</span>
                              <b>{row.clientName}</b>
                            </span>
                          </td>
                          <td>
                            {howLabel(row)}
                            {/* V11's note, finally readable. It is the sentence
                                that explains an odd amount — "paid ₹2,000, rest
                                on Tuesday" — and it lived in a column no screen
                                selected. */}
                            {row.note && (
                              <span className="small" style={{ display: 'block', color: 'var(--tx-ink-3)', marginTop: 2 }}>
                                {row.note}
                              </span>
                            )}
                          </td>
                          <td className="num">
                            {row.isWriteOff ? (
                              <span className="dirn dirn--off">
                                {DOWN_ARROW}
                                {rupees(row.amount)}
                              </span>
                            ) : row.status === 'pending' ? (
                              <span className="dirn dirn--out">
                                {UP_ARROW}
                                {rupees(row.amount)}
                              </span>
                            ) : (
                              <span className="dirn dirn--in">
                                {DOWN_ARROW}
                                {rupees(row.amount)}
                              </span>
                            )}
                          </td>
                          <td><span className={`tag ${stCls}`}>{stLabel}</span></td>
                          <td style={{ textAlign: 'right' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>
                            </svg>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredRows.length > 0 && (
                  <tfoot>
                    <tr className="balm">
                      <td colSpan={3}><span className="balm__k">SHOWING</span></td>
                      <td className="num"><span className="balm__v">{filteredRows.length} of {rows.length}</span></td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* Side summary card — the book's own vocabulary, kept whole */}
        <div>
          <div className="card">
            <div className="card__hd"><span className="card__t">{periodChip(period)}</span></div>
            <div className="card__b">
              <div className="kv"><span className="kv__k">Billed</span><span className="kv__v mono">{rupees(stats.billed)}</span></div>
              <div className="kv"><span className="kv__k">Collected</span><span className="kv__v mono acc">{rupees(stats.collected)}</span></div>
              {hasGym && (
                <div className="kv"><span className="kv__k">Gym&#8217;s cut</span><span className="kv__v mono warn">−{rupees(stats.gymShare)}</span></div>
              )}
              <div className="kv"><span className="kv__k">Yours</span><span className="kv__v mono acc">{rupees(stats.yours)}</span></div>
              {stats.owedAmount > 0 && (
                <div className="kv"><span className="kv__k">Still owed</span><span className="kv__v mono" style={{ color: 'var(--tx-warn)' }}>{rupees(stats.owedAmount)}</span></div>
              )}
            </div>
          </div>

          {stats.owedAmount > 0 && (
            <div className="card mt3">
              <div className="card__hd"><span className="card__t">Collection rate</span></div>
              <div className="card__b">
                <div className="meter meter--lg" style={{ marginBottom: 8 }}>
                  <i style={{ width: `${100 - stats.owedPercent}%` }}></i>
                </div>
                <p className="small" style={{ color: 'var(--tx-ink-3)' }}>
                  {100 - stats.owedPercent}% collected · {stats.owedPercent}% pending
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── The trend. Six bars, and nothing more. ──────────────────────────── */}
      <div className="mt4">
        <TrendChart bars={trend.bars} best={trend.best} averagePerMonth={trend.averagePerMonth} />
      </div>
    </>
  );
}
