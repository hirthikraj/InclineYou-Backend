'use client';

import type { WriteOffRow, WriteOffStats } from '@/lib/money/compute';
import { periodProse, periodTag, type Period } from '@/lib/money/period';
import { rupees, initials, avatarToken } from '@/lib/today/time';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

interface Props {
  stats: WriteOffStats;
  rows: WriteOffRow[];
  period: Period;
}

export function WriteOffsTab({ stats, rows, period }: Props) {
  if (rows.length === 0) {
    return (
      <div className="empty" style={{ marginTop: 64 }}>
        <div className="empty__ic">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <path d="M22 4 12 14.01l-3-3"/>
          </svg>
        </div>
        <p className="empty__t">No write-offs in {periodProse(period)}</p>
        <p className="empty__b">
          Write-offs are struck through in the ledger, never deleted — the append-only
          record shows exactly what happened.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="stats stats--3">
        <div className="stat">
          <p className="stat__k">Written off · {periodTag(period)}</p>
          <p className="stat__v">{rupees(stats.totalWriteOff)}</p>
          <p className="stat__d">{stats.count} entr{stats.count === 1 ? 'y' : 'ies'}</p>
        </div>
        <div className="stat">
          <p className="stat__k">As a share of billed</p>
          <p className="stat__v">{stats.percentOfBilled}%</p>
          <p className="stat__d">Of what was billed in {periodProse(period)}</p>
        </div>
        <div className="stat">
          <p className="stat__k">Rule</p>
          <p className="stat__v">Struck</p>
          <p className="stat__d">Never deleted · append-only</p>
        </div>
      </div>

      <div className="card mt4">
        <div className="card__hd">
          <h2 className="card__t">Written off · {periodTag(period)}</h2>
          <span className="tag">Append-only</span>
        </div>

        <div className="card__b card__b--flush">
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th aria-sort="descending">Date</th>
                  <th>Client</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const initStr = initials(row.clientName);
                  const token = avatarToken(row.clientId);
                  return (
                    <tr key={row.id}>
                      <td className="mono" style={{ color: 'var(--tx-ink-3)' }}>
                        {fmtDate(row.date)}
                      </td>
                      <td>
                        <span className="who">
                          <span className="av av--sm" style={{ background: `var(${token})`, opacity: 0.6 }}>{initStr}</span>
                          <b style={{ textDecoration: 'line-through', color: 'var(--tx-ink-3)' }}>{row.clientName}</b>
                        </span>
                      </td>
                      <td className="num">
                        <span className="dirn dirn--off">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 5v13"/><path d="M6.5 12.5 12 18l5.5-5.5"/>
                          </svg>
                          {rupees(row.amount)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="balm">
                  <td colSpan={2}><span className="balm__k">TOTAL WRITTEN OFF</span></td>
                  <td className="num"><span className="balm__v">{rupees(stats.totalWriteOff)}</span></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <div className="why mt4">
        <p className="why__k">Write-offs stay in the ledger</p>
        <p>
          A write-off is struck through in the ledger, not removed. The number that follows —
          {stats.percentOfBilled}% of what was billed in {periodProse(period)} — is the number that
          tells you whether you have a collection problem or one unlucky month. A deletion-based
          ledger can never show it.
        </p>
      </div>
    </>
  );
}
