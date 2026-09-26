'use client';

import { useState } from 'react';
import Link from 'next/link';

import type { LedgerRow, LedgerStats } from '@/lib/money/compute';
import { methodLabel } from '@/lib/money/compute';
import { periodChip, periodProse, type Period } from '@/lib/money/period';
import { rupees, initials, avatarToken } from '@/lib/today/time';
import type { MoneyTrainer } from '@/lib/money/api';
import { PaymentRowMenu } from './PaymentRowMenu';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';
import { Chip } from '@/web-components/ui/Chip';
import { KeyValueRow } from '@/web-components/ui/KeyValue';
import { EmptyState } from '@/web-components/ui/EmptyState';

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

/**
 * THE CHIPS, AND THEY ABSORBED TWO TABS.
 *
 * `collected | owed | gymshare` were already here when Business drew a *Pending*
 * tab and a *Write-offs* tab in the strip above this card — so the same slice of
 * the same rows had two controls at two altitudes, and pressing the chip and
 * opening the tab gave two different screens of one fact. The tabs are gone
 * (`components/shell/nav.tsx` carries that argument) and `writeoff` joins the
 * chips, which is where the missing fourth always belonged.
 */
export type LedgerFilter = 'collected' | 'owed' | 'gymshare' | 'writeoff' | null;

interface Props {
  stats: LedgerStats;
  rows: LedgerRow[];
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
 * now — which is `computeOwed`'s figure, the one *Pending* itself shows. Filtering
 * the period's rows by it would answer a narrower question than the tile asks, so
 * it goes to the tab that answers the question properly.
 */
export function LedgerTab({
  stats, rows,
  filter, onFilterChange, onRecord, onExport, trainer, period,
}: Props) {
  /* What the last row action did, said once at the top of the tab rather than
     in each of six places a menu can be opened from. The ROW itself is the real
     feedback — a pending row turns *Paid* under the pointer — and this names the
     figure and the person so a mis-click is visible rather than merely undone. */
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredRows = filter === null ? rows
    : filter === 'collected' ? rows.filter((r) => r.status === 'paid' || r.status === 'confirmed')
    : filter === 'owed' ? rows.filter((r) => r.status === 'pending')
    : filter === 'writeoff' ? rows.filter((r) => r.isWriteOff)
    : rows.filter((r) => (r.gymShareAmount ?? 0) > 0);

  const hasGym = trainer.gymName !== null;
  /* `stats.billed` already excludes write-offs — `computeLedger` sums
     `billableRows` — so the share is of what was actually billable, which is the
     denominator `computeWriteOffs` used and the only one the sentence can mean. */
  const writtenOff = rows.filter((r) => r.isWriteOff).reduce((s, r) => s + r.amount, 0);
  const writeOffPercent = stats.billed > 0 ? Math.round((writtenOff / stats.billed) * 100) : 0;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="8" width="18" height="11" rx="2"/><path d="M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/>
          </svg></>}
        title="Nothing recorded yet"
        body={<>InclineYou never holds your money — recording a payment is bookkeeping,
          not a transaction. Tap <b>Record payment</b> when money changes hands.</>}
        action={<><Button variant="primary" style={{ marginTop: 16 }} onClick={onRecord}>
          Record payment
        </Button></>}
        style={{ marginTop: 64 }}
      />
    );
  }

  /* The chips. `gymshare` only where there is a gym — a filter that can only ever
     match nothing is a control that reads as broken. */
  const chips: Array<{ key: LedgerFilter; label: string; n: number }> = [
    { key: null, label: 'All', n: rows.length },
    { key: 'collected', label: 'Collected', n: rows.filter((r) => r.status === 'paid' || r.status === 'confirmed').length },
    { key: 'owed', label: 'Pending', n: rows.filter((r) => r.status === 'pending').length },
    /* Drawn whether or not the period has any, unlike `gymshare` below — a
       trainer who came looking for the deleted *Write-offs* tab has to be able
       to see that the control exists and that the answer is none, and a chip
       that is absent in a quiet month is a chip they conclude was removed. */
    { key: 'writeoff', label: 'Written off', n: rows.filter((r) => r.isWriteOff).length },
    /* `gymshare` only where there is a gym: a filter that can only ever match
       nothing is a control that reads as broken. */
    ...(hasGym ? [{ key: 'gymshare' as const, label: 'Gym share', n: rows.filter((r) => (r.gymShareAmount ?? 0) > 0).length }] : []),
  ];

  return (
    <>
      {/* THE THREE TILES THAT USED TO OPEN THIS TAB ARE ON THE OVERVIEW.

          *You earned*, *Pending* and *Still to deliver* were drawn here, above
          the ledger, and two of the three were never about the ledger: pending
          is the whole book as of now — its own tile said so — and undelivered
          coaching is a fact about packs, not about payments. They were three
          summaries sitting on top of the one page in Business that is not a
          summary, and the Overview is the page that is. See
          `components/business/Overview.tsx`.

          What is left on this page is the table and the card beside it, and
          every figure in that card is the total of the rows on screen. */}
      {/* Between the tiles and the table, not at the top of the tab: a message
          about a row belongs within a glance of the row. `role="status"` so it
          is announced wherever the trainer's focus actually is. */}
      {(notice || error) && (
        <p
          className={error ? 'msg msg--err' : 'msg msg--ok'}
          role="status"
          style={{ marginTop: 14, marginBottom: -4 }}
        >
          <span>{error ?? notice}</span>
        </p>
      )}

      {/* ── Ledger + summary ────────────────────────────────────────────────── */}
      <div className="mny__grid mt4">
        <div className="card">
          {/* `.mny__hd` — see `OwedTab`. *Record payment* was 24px past the
              card's right edge at 390px, and `.main` is `overflow:hidden`, so it
              was clipped rather than reachable by a scroll. */}
          <div className="card__hd mny__hd">
            <span className="card__t">Payments</span>
            <Tag>Append-only</Tag>
            {/* The WHOLE group carries `.mny__dup` and stands down below 900px,
                because both of its buttons have a second home there: *CSV* calls
                the SAME `handleExport` as the page header's export glyph 90px
                above it, and *Record payment* is a live row in the tab bar's +
                sheet, two taps from any screen and in the thumb's arc. Four
                controls in a 350px header is what made the wrapped version read
                as a mistake rather than as a layout. */}
            <span className="card__acts mny__dup">
              <Button
                variant="secondary"
                size="sm"
                onClick={onExport}
                disabled={filteredRows.length === 0}
              >
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

          {/* The filter, beside the rows it narrows rather than up in the tiles */}
          {/* `.card__band`, not an inline `padding: '10px 16px 0'`. The 16 was a
              third copy of the card's gutter and the only one a breakpoint could
              not reach — so on a phone, where the card narrows to 13px, the chips
              stood 3px right of the title above them and the table below. */}
          <div className="card__band" role="group" aria-label="Filter the ledger">
            {chips.map((c) => (
              <Chip
                pressed={filter === c.key}
                key={c.label}
                onClick={() => onFilterChange(c.key)}
              >
                {c.label}
                {/* The figure the chip is about to leave on screen, so a trainer
                    can see there are no write-offs without pressing the chip to
                    find out. Not drawn on *All*, where it would be the same
                    number the table foot already prints. */}
                {c.key !== null && c.n > 0 && <span className="rail__n">{c.n}</span>}
              </Chip>
            ))}
          </div>

          <div className="card__b card__b--flush">
            {/* `--fit`: the 23-row ledger made this card 1214px tall inside a
                530px scrollport, so the column heads, the chips and the summary
                card beside it all left the screen to read the last row. app.css
                carries the measurement. The rows scroll here now, under the
                sticky head the table always had. */}
            <div className="tblwrap tblwrap--fit">
              {/* `.mny__tbl` and a `data-cell` role on every cell: below 900px
                  the row stops being a table row and becomes a CARD. 312px of
                  this table — `Status` and the whole action column — was behind a
                  horizontal scrollbar at 390px. app.css lays out the card and
                  argues why the number is 900. */}
              <table className="tbl mny__tbl">
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
                          <td className="mono" data-cell="meta">{fmtDate(row.date)}</td>
                          {/* `data-cell` names what each cell IS, not which
                              column it is in — below 900px the row stops being a
                              table row and app.css lays these five out as a card:
                              the client heads it, the money and the status form a
                              right rail, the date and the method are one quiet
                              line under the name. Keyed on the ROLE and not on the
                              header's text, so a copy change cannot move a cell. */}
                          <td data-cell="who">
                            {/* A name in a book is a person with a file. It was
                                a `<span>` on all four money tables while the
                                queue's was already a link — and app.css's own
                                `.tbl .who` delta exists to style exactly this,
                                hover and focus ring included. */}
                            <Link className="who" href={`/clients/${row.clientId}`}>
                              <span className="av av--sm" style={{ background: token }}>{initStr}</span>
                              <b>{row.clientName}</b>
                            </Link>
                          </td>
                          <td data-cell="meta">
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
                          <td className="num" data-cell="figure">
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
                          <td data-cell="state"><span className={`tag ${stCls}`}>{stLabel}</span></td>
                          {/* `.mny__acts`, not `style={{textAlign:'right'}}`.
                              An inline declaration outranks every selector
                              including a media query, and the phone's rule
                              needs this cell left-aligned and full width — the
                              trap app.css attributes five separate bugs to. */}
                          <td className="mny__acts" data-cell="acts">
                            <PaymentRowMenu
                              paymentId={row.id}
                              clientId={row.clientId}
                              clientName={row.clientName}
                              amount={row.amount}
                              status={row.status}
                              upiReference={row.upiReference}
                              onNotice={(m) => { setError(null); setNotice(m); }}
                              onError={(m) => { setNotice(null); setError(m); }}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredRows.length > 0 && (
                  <tfoot>
                    <tr className="balm">
                      {/* On a phone the foot stops being three cells of column
                          alignment and becomes one line, *SHOWING · 3 of 12*.
                          The trailing cell is empty and is dropped there rather
                          than left spending a flex gap. */}
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
          <Card title={<>{periodChip(period)}</>}>
            <KeyValueRow k="Billed">{rupees(stats.billed)}</KeyValueRow>
            <KeyValueRow k="Collected" valueClassName="acc">{rupees(stats.collected)}</KeyValueRow>
            {hasGym && (
              <KeyValueRow k="Gym&#8217;s cut" valueClassName="warn">−{rupees(stats.gymShare)}</KeyValueRow>
            )}
            <KeyValueRow k="Yours" valueClassName="acc">{rupees(stats.yours)}</KeyValueRow>
            {stats.owedAmount > 0 && (
              <div className="kv"><span className="kv__k">Still pending</span><span className="kv__v" style={{ color: 'var(--tx-warn)' }}>{rupees(stats.owedAmount)}</span></div>
            )}
            {/* THE DELETED *WRITE-OFFS* TAB'S ONE FIGURE.
                That tab drew three tiles over a filtered copy of this table, and
                two of the three were the count and the total — which the chip
                above already carries and the table already sums. The third was
                *as a share of billed*, a ratio nothing else states, and a ratio
                about the period belongs in the card that holds every other one.
                Drawn only where there are any: a `0%` line on a clean month is a
                row spent saying nothing happened. */}
            {writtenOff > 0 && (
              <div className="kv">
                <span className="kv__k">Written off</span>
                <span className="kv__v">
                  −{rupees(writtenOff)}
                  <span className="small" style={{ color: 'var(--tx-ink-3)' }}>
                    {' '}· {writeOffPercent}% of billed
                  </span>
                </span>
              </div>
            )}
          </Card>

          {stats.owedAmount > 0 && (
            <Card
              title="Collection rate"
              className="mt3"
            >
              <div className="meter meter--lg" style={{ marginBottom: 8 }}>
                <i style={{ width: `${100 - stats.owedPercent}%` }}></i>
              </div>
              <p className="small" style={{ color: 'var(--tx-ink-3)' }}>
                {100 - stats.owedPercent}% collected · {stats.owedPercent}% pending
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* THE SIX-BAR TREND MOVED TO THE OVERVIEW TOO, for the same reason as
          the tiles above: it is drawn from `computeTrend`, which windows on
          `settledAt` over a fixed six months and therefore ignores the period
          picker this page's every other figure obeys. A chart that does not
          move when the control above it moves is a chart a trainer learns to
          distrust; on the Overview it sits beside the peak month and the client
          metrics, which is company it belongs in. */}
    </>
  );
}
