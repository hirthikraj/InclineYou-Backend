'use client';

import { useState } from 'react';
import Link from 'next/link';

import type { LedgerFilter, LedgerRow, MoneySummary } from '@/lib/business/types';
import { periodChip, periodProse, type Period } from '@/lib/money/period';
import { rupees, initials, avatarToken } from '@/lib/today/time';
import { PaymentRowMenu } from './PaymentRowMenu';
import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';
import { Chip } from '@/web-components/ui/Chip';
import { Stat } from '@/web-components/ui/Stat';
import { EmptyState } from '@/web-components/ui/EmptyState';

/**
 * THE LEDGER — one page of `GET /v1/payments`, and the totals of the PERIOD.
 *
 * ── WHAT CHANGED WHEN THE BOOK STOPPED BEING HELD ────────────────────────────
 *
 * This tab used to receive every payment the trainer had and slice, filter, sum
 * and count them itself. It receives one page now (50 rows, a cursor) and a
 * `MoneySummary`, and every figure on it is the server's:
 *
 * - The tiles are `summary.total` — billed, collected, what was forgiven or given
 *   back — and `summary.now.pending`, which is owed AS OF TODAY and says so in its
 *   label. The old *Still pending* tile summed the period's pending rows, which is
 *   a different number from what is owed and was never labelled as one.
 * - The chips are server-side filters. They carry no counts any more: a count is
 *   a figure about rows this page does not hold, and the ledger has no per-status
 *   count to ask for (a wire gap, written up in the build report). A chip with no
 *   number is honest; a chip with the count of the ROWS ON SCREEN would be wrong
 *   the moment there was a second page.
 * - The foot says *1–50 of 138* from `includeTotal`, and Previous / Next walk the
 *   keyset cursors. There is no page 3 to jump to — a keyset has no offset — and
 *   a trainer does not want one: the period picker is how a ledger is narrowed.
 *
 * ── THE SPLIT IS THE SERVER'S ───────────────────────────────────────────────
 *
 * A gym-desk payment carries `split {gym, trainer}`, worked out from its package's
 * own trainer share. It is drawn under the method on that row. There is no
 * trainer-wide percentage anywhere on this page, because on a gym package the
 * trainer's cut varies with the price.
 */

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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function statusTag(status: LedgerRow['status']): { label: string; cls: string } {
  if (status === 'paid') return { label: 'Paid', cls: 'tag--ok' };
  if (status === 'pending') return { label: 'Pending', cls: 'tag--warn' };
  if (status === 'write_off') return { label: 'Written off', cls: 'tag' };
  return { label: 'Refunded', cls: 'tag' };
}

const METHOD: Record<string, string> = { upi: 'UPI', cash: 'Cash', bank_transfer: 'Bank transfer' };

/** *Gym front office* is not a method — the gym took it, so no method was recorded. */
function howLabel(row: LedgerRow): string {
  if (row.collectedBy === 'gym') return 'Gym front office';
  return row.method ? METHOD[row.method] ?? row.method : '—';
}

interface Props {
  summary: MoneySummary;
  rows: LedgerRow[];
  filter: LedgerFilter;
  onFilterChange: (f: LedgerFilter) => void;
  onRecord: () => void;
  onExport: () => void;
  /** After a row action succeeds: the parent re-reads the page it is on. */
  onChanged: () => void;
  hasGym: boolean;
  /** Any payment in ANY period — tells a brand-new book from a quiet month. */
  hasAnyPayments: boolean;
  period: Period;
  /** Where the pager stands. `total` is only known for the first page of a view. */
  paging: {
    index: number;
    pageSize: number;
    total: number | null;
    hasNext: boolean;
    busy: boolean;
    onPrev: () => void;
    onNext: () => void;
  };
  loadError: string | null;
}

export function LedgerTab({
  summary, rows, filter, onFilterChange, onRecord, onExport, onChanged, hasGym, hasAnyPayments, period, paging, loadError,
}: Props) {
  /* One message for the whole table, drawn between the tiles and the rows. A menu
     action unmounts its own menu, so the confirmation cannot live in the menu. */
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const t = summary.total;
  const forgiven = t.writtenOff + t.refunded;
  const first = paging.index * paging.pageSize + 1;
  const last = paging.index * paging.pageSize + rows.length;

  const chips: Array<{ key: LedgerFilter; label: string }> = [
    { key: null, label: 'All' },
    { key: 'collected', label: 'Collected' },
    { key: 'owed', label: 'Pending' },
    /* Present in a quiet month too: a trainer who came looking for the deleted
       *Write-offs* tab has to be able to see the control exists. */
    { key: 'writeoff', label: 'Written off' },
    ...(hasGym ? [{ key: 'gymshare' as const, label: 'Gym share' }] : []),
  ];

  /* The onboarding card is for a book with NOTHING in it. A quiet month in a book
     that has payments elsewhere is not "nothing recorded yet" — that told a
     trainer with a year of history that their data was gone. */
  const quiet = !hasAnyPayments && filter === null && rows.length === 0 && t.packagesSold === 0
    && t.paymentsCount === 0 && paging.index === 0;

  if (quiet) {
    return (
      <EmptyState
        icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="8" width="18" height="11" rx="2"/><path d="M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/>
          </svg>}
        title="Nothing recorded yet"
        body={<>InclineYou never holds your money — recording a payment is bookkeeping,
          not a transaction. Tap <b>Record payment</b> when money changes hands.</>}
        action={<Button variant="primary" style={{ marginTop: 16 }} onClick={onRecord}>
          Record payment
        </Button>}
        style={{ marginTop: 64 }}
      />
    );
  }

  return (
    <>
      {(notice || error || loadError) && (
        <p
          className={error || loadError ? 'msg msg--err' : 'msg msg--ok'}
          role="status"
          style={{ marginTop: 14, marginBottom: -4 }}
        >
          <span>{error ?? loadError ?? notice}</span>
        </p>
      )}

      {/* ── The period at a glance ── every figure here is the server's. */}
      <div className="stats stats--4 mnystats mt4">
        <Stat
          label={<>Billed · {periodChip(period)}</>}
          value={rupees(t.billed)}
          detail={`${t.packagesSold} pack${t.packagesSold === 1 ? '' : 's'} sold`}
        />
        <Stat
          label="Collected"
          value={rupees(t.collected)}
          tone="acc"
          detail={hasGym && t.gymCut > 0
            ? <>{rupees(t.takeHome)} yours after the gym&#8217;s cut</>
            : `${t.paymentsCount} payment${t.paymentsCount === 1 ? '' : 's'}`}
        />
        <Stat
          label="Written off or refunded"
          value={forgiven > 0 ? rupees(forgiven) : '—'}
          detail={forgiven > 0
            ? `${rupees(t.writtenOff)} forgiven · ${rupees(t.refunded)} given back`
            : 'Nothing forgiven or given back'}
        />
        <Stat
          label="Owed now"
          value={summary.now.pending > 0 ? rupees(summary.now.pending) : '—'}
          tone={summary.now.pending > 0 ? 'warn' : 'neutral'}
          detail={summary.now.pending > 0
            ? `${summary.now.clientsOwing} client${summary.now.clientsOwing === 1 ? '' : 's'} · as of today, whatever the period`
            : 'Everything billed is in'}
        />
      </div>

      <div className="mt3">
        <div className="card">
          <div className="card__hd mny__hd">
            <span className="card__t">Payments</span>
            <Tag>Append-only</Tag>
            {/* `.mny__dup` — both buttons have a second home below 900px (the page
                header's export glyph and the tab bar's + sheet). */}
            <span className="card__acts mny__dup">
              <Button variant="secondary" size="sm" onClick={onExport}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 4v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 19.5h15"/>
                </svg>
                CSV
              </Button>
              <Button variant="primary" size="sm" onClick={onRecord}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                Record payment
              </Button>
            </span>
          </div>

          <div className="card__band" role="group" aria-label="Filter the ledger">
            {chips.map((c) => (
              <Chip pressed={filter === c.key} key={c.label} onClick={() => onFilterChange(c.key)}>
                {c.label}
              </Chip>
            ))}
          </div>

          <div className="card__b card__b--flush" aria-busy={paging.busy}>
            <div className="tblwrap tblwrap--fit">
              <table className="tbl mny__tbl" style={{ opacity: paging.busy ? 0.6 : 1 }}>
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
                  {rows.length === 0 ? (
                    <tr>
                      {/* Two different emptinesses: a chip that matches nothing in
                          a period that was not quiet reads as a broken control. */}
                      <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--tx-ink-3)' }}>
                        {filter === null
                          ? <>Nothing in {periodProse(period)}.{' '}
                              <span style={{ display: 'block', marginTop: 4 }}>Pick another period above to see earlier payments.</span></>
                          : 'No entries match the filter'}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const { label: stLabel, cls: stCls } = statusTag(row.status);
                      const out = row.status === 'pending';
                      const off = row.status === 'write_off' || row.status === 'refund';
                      return (
                        <tr key={row.id}>
                          <td className="mono" data-cell="meta">{fmtDate(row.bookAt)}</td>
                          <td data-cell="who">
                            <Link className="who" href={`/clients/${row.clientId}`}>
                              <span className="av av--sm" style={{ background: avatarToken(row.clientId) }}>{initials(row.clientName)}</span>
                              <b>{row.clientName}</b>
                            </Link>
                          </td>
                          <td data-cell="meta">
                            {howLabel(row)}
                            <span className="small" style={{ display: 'block', color: 'var(--tx-ink-3)', marginTop: 2 }}>
                              {row.packageName}
                              {row.split && ` · gym ${rupees(row.split.gym)} · you ${rupees(row.split.trainer)}`}
                            </span>
                            {row.note && (
                              <span className="small" style={{ display: 'block', color: 'var(--tx-ink-3)', marginTop: 2 }}>
                                {row.note}
                              </span>
                            )}
                          </td>
                          <td className="num" data-cell="figure">
                            <span className={`dirn ${off ? 'dirn--off' : out ? 'dirn--out' : 'dirn--in'}`}>
                              {out ? UP_ARROW : DOWN_ARROW}
                              {rupees(row.amount)}
                            </span>
                          </td>
                          <td data-cell="state"><span className={`tag ${stCls}`}>{stLabel}</span></td>
                          <td className="mny__acts" data-cell="acts">
                            <PaymentRowMenu
                              paymentId={row.id}
                              clientId={row.clientId}
                              clientName={row.clientName}
                              amount={row.amount}
                              status={row.status}
                              collectedBy={row.collectedBy}
                              reference={row.reference}
                              method={row.method}
                              note={row.note}
                              paidAt={row.paidAt}
                              version={row.version}
                              onNotice={(m) => { setError(null); setNotice(m); onChanged(); }}
                              onError={(m) => { setNotice(null); setError(m); }}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {(paging.index > 0 || paging.hasNext || rows.length > 0) && (
              <nav className="pager" aria-label="Ledger pages">
                <span className="pager__n">
                  {rows.length === 0 ? '0' : `${first}–${last}`}
                  {paging.total !== null && <> of {paging.total}</>}
                </span>
                <Button variant="secondary" size="sm" onClick={paging.onPrev} disabled={paging.index === 0 || paging.busy}>
                  Previous
                </Button>
                <Button variant="secondary" size="sm" onClick={paging.onNext} disabled={!paging.hasNext || paging.busy}>
                  Next
                </Button>
              </nav>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
