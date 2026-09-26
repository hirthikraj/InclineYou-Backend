'use client';

import type { GstMonthBar, GstStats } from '@/lib/money/compute';
import { rupees, rupeesShort } from '@/lib/today/time';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';
import { KeyValueRow } from '@/web-components/ui/KeyValue';
import { Stat } from '@/web-components/ui/Stat';
import { Table, Row } from '@/web-components/ui/Table';
import { Why } from '@/web-components/ui/Why';

interface Props {
  stats: GstStats;
  monthBars: GstMonthBar[];
}

export function GstTab({ stats, monthBars }: Props) {
  const maxBar = Math.max(...monthBars.map((b) => b.amount), 1);
  const fyToDate = monthBars.reduce((s, b) => s + b.amount, 0);
  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;

  return (
    <>
      {/* `.mnystats` — see `LedgerTab`. Four tiles pinned at every width put
          eight clipped strings on this tab at 390px. */}
      <div className="stats stats--4 mnystats">
        <Stat
          label="Your turnover · rolling 12mo"
          value={rupeesShort(stats.rolling12mo)}
          detail="Your share only, never the gym&#8217;s"
          tone="acc"
        />
        <Stat label="The registration line" value="₹20,00,000" detail="Services, all-India" />
        <Stat
          label="Headroom"
          value={rupeesShort(stats.headroom)}
          detail={stats.monthsToThreshold !== null
            ? `About ${stats.monthsToThreshold} month${stats.monthsToThreshold === 1 ? '' : 's'} at this rate`
            : stats.rolling12mo >= stats.gstThreshold
            ? 'Crossed — register now'
            : 'No income yet'}
          tone={stats.headroom < 200_000 ? 'danger' : stats.headroom < 500_000 ? 'warn' : undefined}
        />
        {/* THE FOURTH TILE WAS *BEST MONTH* AND IT WAS THE OVERVIEW'S FIGURE.
            `computeGst`'s `bestMonth` is the peak of the ROLLING TWELVE, which
            is the identical number `computePeakMonth` puts on the Overview —
            same window, same rows, same gym-cut subtraction — so the two pages
            printed one figure twice, and this was the page it meant least on. A
            best month is a fact about how the practice is going; nothing about
            it moves the threshold.

            What this page was missing is the figure its own chart is drawn in:
            the FINANCIAL YEAR, April to March, which is the window a return is
            filed against and the one `fyLabel` and `monthBars` already speak in.
            The rolling twelve above it is the REGISTRATION test and is a
            different span on purpose — the tile says so, because two turnover
            figures on one screen that differ need to say why.

            Summed from `monthBars` rather than computed again: those are the
            bars under it, so the tile and the chart cannot disagree.
            `stats.bestMonth` is left on `GstStats` — `computeGst` is the money
            book's arithmetic and an unused field is cheaper than a migration. */}
        <Stat
          label={<>This financial year · {stats.fyLabel}</>}
          value={rupeesShort(fyToDate)}
          detail="April to March — the span a return is filed against"
        />
      </div>

      {/* Warning if close to threshold */}
      {stats.rolling12mo >= stats.gstThreshold && (
        <Why heading="GST registration required" tone="warn" className="mt4">
          <p>
            Your rolling 12-month trainer share has crossed ₹20,00,000. You are required to
            register for GST. Share the export with your CA — they will need the monthly breakdown.
          </p>
        </Why>
      )}

      <div className="mny__grid mt4">
        {/* Bar chart */}
        <Card
          title={<>{stats.fyLabel} · your share, by month</>}
          aside={<><Tag>April to March</Tag></>}
        >
          <div className="chart" style={{ height: 150 }}>
            {/* Grid lines */}
            <i className="chart__g" style={{ bottom: 22 }}></i>
            <i className="chart__g" style={{ bottom: 70 }}></i>
            <i className="chart__g" style={{ bottom: 118 }}></i>

            {/* Bars */}
            {monthBars.map((bar, i) => {
              const barHeight = bar.amount > 0 ? Math.round(((bar.amount / maxBar) * 100) * 0.88) + 4 : 0;
              const isCurrent = bar.year === nowYear && bar.month === nowMonth;
              const isBeyond = new Date(bar.year, bar.month - 1, 1) > now;
              return (
                <i
                  key={`${bar.year}-${bar.month}`}
                  className={`chart__b${barHeight === 0 && !isBeyond ? ' chart__b--bad' : ''}`}
                  style={{
                    left: `calc(${(i / 12) * 100}% + 16px)`,
                    bottom: 22,
                    height: Math.max(barHeight, isBeyond ? 0 : barHeight > 0 ? barHeight : 0),
                    width: `calc(${(1 / 12) * 100}% - 4px)`,
                    ...(isCurrent ? { background: 'var(--tx-accent)' } : {}),
                    ...(isBeyond ? { background: 'var(--tx-surface-3)' } : {}),
                  }}
                  title={`${bar.label} ${bar.year}: ${rupees(bar.amount)}`}
                />
              );
            })}

            {/* X axis labels */}
            {monthBars.map((bar, i) => (
              <span
                key={`lbl-${bar.year}-${bar.month}`}
                className="chart__x"
                style={{ left: `calc(${(i / 12) * 100}% + 16px)`, width: `calc(${(1 / 12) * 100}% - 4px)`, textAlign: 'center' }}
              >
                {bar.label}
              </span>
            ))}
          </div>

          {/* GST threshold line indicator */}
          <KeyValueRow k="Rolling 12mo" style={{ marginTop: 16 }}>{rupees(stats.rolling12mo)}</KeyValueRow>
          <KeyValueRow k="Threshold">₹20,00,000</KeyValueRow>
          <div className="kv">
            <span className="kv__k">Headroom</span>
            <span className="kv__v" style={{
              color: stats.headroom < 200_000 ? 'var(--tx-danger)' :
                     stats.headroom < 500_000 ? 'var(--tx-warn)' : 'var(--tx-ok)',
            }}>
              {rupees(stats.headroom)}
            </span>
          </div>

          <div className="meter meter--lg" style={{ marginTop: 12 }}>
            <i
              style={{
                width: `${Math.min(100, (stats.rolling12mo / stats.gstThreshold) * 100)}%`,
                background: stats.rolling12mo >= stats.gstThreshold
                  ? 'var(--tx-danger)'
                  : stats.rolling12mo >= 1_500_000
                  ? 'var(--tx-warn)'
                  : undefined,
              }}
            />
          </div>
        </Card>

        {/* Month table */}
        <Card
          title="Month by month"
          flush
        >
          <Table
            caption="Your share, month by month"
            columns={[
              { key: 'month', label: 'Month' },
              { key: 'share', label: 'Your share', numeric: true },
            ]}
            style={{ fontSize: 13 }}
          >
            {monthBars.map((bar) => {
              const isCurrent = bar.year === nowYear && bar.month === nowMonth;
              const isBeyond = new Date(bar.year, bar.month - 1, 1) > now;
              return (
                <Row
                  key={`${bar.year}-${bar.month}`}
                  style={isCurrent ? { fontWeight: 600 } : isBeyond ? { color: 'var(--tx-ink-3)' } : undefined}
                  cells={[
                    { key: 'month', content: <>{bar.label} {bar.year}</>, className: 'mono' },
                    {
                      key: 'share',
                      content: isBeyond ? '—' : bar.amount === 0 ? '₹0' : rupees(bar.amount),
                      numeric: true,
                    },
                  ]}
                />
              );
            })}
          </Table>
        </Card>
      </div>

      <Why heading="What this number is" className="mt4">
        <p>
          <b>Your share only</b> — the gym&#8217;s cut is subtracted from every floor payment
          before this figure is built. A trainer who billed ₹6,000 on the floor with a 46% gym
          share counts ₹3,240 toward the threshold, not ₹6,000.
        </p>
      </Why>
    </>
  );
}
