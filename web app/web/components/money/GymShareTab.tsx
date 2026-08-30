'use client';

import type { GymShareRow, GymShareStats } from '@/lib/money/compute';
import { periodProse, periodTag, type Period } from '@/lib/money/period';
import { rupees, initials, avatarToken } from '@/lib/today/time';
import type { MoneyTrainer } from '@/lib/money/api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

interface Props {
  stats: GymShareStats;
  rows: GymShareRow[];
  trainer: MoneyTrainer;
  period: Period;
}

export function GymShareTab({ stats, rows, trainer, period }: Props) {
  if (!trainer.gymName) {
    return (
      <div className="empty" style={{ marginTop: 64 }}>
        <div className="empty__ic">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M9 3v18M3 9h6M3 15h6"/>
          </svg>
        </div>
        <p className="empty__t">No gym on file</p>
        <p className="empty__b">
          Add your gym name and share percentage in Settings. Until then, the gym&#8217;s share
          is tracked as ₹0 on every entry.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="stats stats--4">
        <div className="stat">
          <p className="stat__k">Billed on the floor</p>
          <p className="stat__v">{rupees(stats.floorBilled)}</p>
          <p className="stat__d">{stats.floorSessions} session{stats.floorSessions !== 1 ? 's' : ''}</p>
        </div>
        <div className="stat stat--warn">
          <p className="stat__k">The gym&#8217;s {stats.gymCutPercent}%</p>
          <p className="stat__v">{rupees(stats.gymCut)}</p>
          <p className="stat__d">Applied per entry, at record time</p>
        </div>
        <div className="stat">
          <p className="stat__k">Remote</p>
          <p className="stat__v">{rupees(stats.remoteBilled)}</p>
          <p className="stat__d">{stats.remoteSessions} session{stats.remoteSessions !== 1 ? 's' : ''} · they take nothing</p>
        </div>
        <div className="stat stat--acc">
          <p className="stat__k">Yours, {periodTag(period)}</p>
          <p className="stat__v">{rupees(stats.yours)}</p>
          <p className="stat__d">
            {stats.floorBilled > 0
              ? `${Math.round((stats.yours / (stats.floorBilled + stats.remoteBilled)) * 100)}% of what you billed`
              : 'Nothing billed'}
          </p>
        </div>
      </div>

      <div className="grid2 mt4" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)' }}>
        <div className="card">
          <div className="card__hd">
            <h2 className="card__t">Where the {stats.gymCutPercent}% went</h2>
            <span className="tag">Per entry</span>
          </div>

          {rows.length === 0 ? (
            <div className="card__b">
              <p className="small" style={{ color: 'var(--tx-ink-3)' }}>
                No floor sessions recorded in {periodProse(period)}.
              </p>
            </div>
          ) : (
            <div className="card__b card__b--flush">
              <div className="tblwrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="mono">Date</th>
                      <th>Client</th>
                      <th className="num">Billed</th>
                      <th className="num">Gym&#8217;s cut</th>
                      <th className="num">You keep</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const initStr = initials(row.clientName);
                      const token = avatarToken(row.clientId);
                      return (
                        <tr key={row.id}>
                          <td className="mono">{fmtDate(row.date)}</td>
                          <td>
                            <span className="who">
                              <span className="av av--sm" style={{ background: `var(${token})` }}>{initStr}</span>
                              <b>{row.clientName}</b>
                            </span>
                          </td>
                          <td className="num mono">{rupees(row.amount)}</td>
                          <td className="num mono" style={{ color: 'var(--tx-warn)' }}>
                            {row.isFloor ? `−${rupees(row.gymShareAmount)}` : '—'}
                          </td>
                          <td className="num mono" style={{ color: 'var(--tx-ok)' }}>
                            {rupees(row.yours)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="balm">
                      <td colSpan={2}><span className="balm__k">TOTAL</span></td>
                      <td className="num"><span className="balm__v">{rupees(stats.floorBilled + stats.remoteBilled)}</span></td>
                      <td className="num"><span className="balm__v" style={{ color: 'var(--tx-warn)' }}>−{rupees(stats.gymCut)}</span></td>
                      <td className="num"><span className="balm__v" style={{ color: 'var(--tx-ok)' }}>{rupees(stats.yours)}</span></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card__hd"><h2 className="card__t">The arrangement</h2></div>
          <div className="card__b">
            <div className="kv">
              <span className="kv__k">Gym</span>
              <span className="kv__v">{trainer.gymName}</span>
            </div>
            <div className="kv">
              <span className="kv__k">Floor split</span>
              <span className="kv__v mono">{stats.gymCutPercent}% to gym</span>
            </div>
            <div className="kv">
              <span className="kv__k">Remote split</span>
              <span className="kv__v mono">0% — all yours</span>
            </div>
            <div className="kv">
              <span className="kv__k">Applies</span>
              <span className="kv__v">Per entry, at record time</span>
            </div>
          </div>
          <div className="card__b" style={{ borderTop: '1px solid var(--tx-line)' }}>
            <p className="small" style={{ color: 'var(--tx-ink-3)', lineHeight: 1.6 }}>
              The percentage is stored on each entry, not looked up later — a renegotiation
              in October never moves September&#8217;s split.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
