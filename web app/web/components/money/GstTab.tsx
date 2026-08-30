'use client';

import type { GstMonthBar, GstStats } from '@/lib/money/compute';
import { rupees, rupeesShort } from '@/lib/today/time';

interface Props {
  stats: GstStats;
  monthBars: GstMonthBar[];
}

export function GstTab({ stats, monthBars }: Props) {
  const maxBar = Math.max(...monthBars.map((b) => b.amount), 1);
  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;

  return (
    <>
      <div className="stats stats--4">
        <div className="stat stat--acc">
          <p className="stat__k">Your turnover · rolling 12mo</p>
          <p className="stat__v">{rupeesShort(stats.rolling12mo)}</p>
          <p className="stat__d">Your share only, never the gym&#8217;s</p>
        </div>
        <div className="stat">
          <p className="stat__k">The registration line</p>
          <p className="stat__v">₹20,00,000</p>
          <p className="stat__d">Services, all-India</p>
        </div>
        <div className={`stat${stats.headroom < 200_000 ? ' stat--danger' : stats.headroom < 500_000 ? ' stat--warn' : ''}`}>
          <p className="stat__k">Headroom</p>
          <p className="stat__v">{rupeesShort(stats.headroom)}</p>
          <p className="stat__d">
            {stats.monthsToThreshold !== null
              ? `About ${stats.monthsToThreshold} month${stats.monthsToThreshold === 1 ? '' : 's'} at this rate`
              : stats.rolling12mo >= stats.gstThreshold
              ? 'Crossed — register now'
              : 'No income yet'}
          </p>
        </div>
        <div className="stat">
          <p className="stat__k">Best month</p>
          <p className="stat__v">{rupees(stats.bestMonth)}</p>
          <p className="stat__d">{stats.bestMonthLabel}</p>
        </div>
      </div>

      {/* Warning if close to threshold */}
      {stats.rolling12mo >= stats.gstThreshold && (
        <div className="why why--warn mt4">
          <p className="why__k">GST registration required</p>
          <p>
            Your rolling 12-month trainer share has crossed ₹20,00,000. You are required to
            register for GST. Share the export with your CA — they will need the monthly breakdown.
          </p>
        </div>
      )}

      <div className="grid2 mt4" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)' }}>
        {/* Bar chart */}
        <div className="card">
          <div className="card__hd">
            <h2 className="card__t">{stats.fyLabel} · your share, by month</h2>
            <span className="tag">April to March</span>
          </div>
          <div className="card__b">
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
            <div className="kv" style={{ marginTop: 16 }}>
              <span className="kv__k">Rolling 12mo</span>
              <span className="kv__v mono">{rupees(stats.rolling12mo)}</span>
            </div>
            <div className="kv">
              <span className="kv__k">Threshold</span>
              <span className="kv__v mono">₹20,00,000</span>
            </div>
            <div className="kv">
              <span className="kv__k">Headroom</span>
              <span className="kv__v mono" style={{
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
          </div>
        </div>

        {/* Month table */}
        <div className="card">
          <div className="card__hd"><h2 className="card__t">Month by month</h2></div>
          <div className="card__b card__b--flush">
            <table className="tbl" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Your share</th>
                </tr>
              </thead>
              <tbody>
                {monthBars.map((bar) => {
                  const isCurrent = bar.year === nowYear && bar.month === nowMonth;
                  const isBeyond = new Date(bar.year, bar.month - 1, 1) > now;
                  return (
                    <tr
                      key={`${bar.year}-${bar.month}`}
                      style={isCurrent ? { fontWeight: 600 } : isBeyond ? { color: 'var(--tx-ink-3)' } : undefined}
                    >
                      <td className="mono">{bar.label} {bar.year}</td>
                      <td className="num mono">
                        {isBeyond ? '—' : bar.amount === 0 ? '₹0' : rupees(bar.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="why mt4">
        <p className="why__k">What this number is</p>
        <p>
          <b>Your share only</b> — the gym&#8217;s cut is subtracted from every floor payment
          before this figure is built. A trainer who billed ₹6,000 on the floor with a 46% gym
          share counts ₹3,240 toward the threshold, not ₹6,000.
        </p>
      </div>
    </>
  );
}
