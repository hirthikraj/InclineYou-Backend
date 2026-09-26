'use client';

import type { GymShareRow, GymShareStats } from '@/lib/money/compute';
import { periodProse, periodTag, type Period } from '@/lib/money/period';
import { rupees, initials, avatarToken } from '@/lib/today/time';
import type { MoneyTrainer } from '@/lib/money/api';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';
import { KeyValueRow } from '@/web-components/ui/KeyValue';
import { Stat } from '@/web-components/ui/Stat';
import { EmptyState } from '@/web-components/ui/EmptyState';

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
      <EmptyState
        icon={<><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M9 3v18M3 9h6M3 15h6"/>
          </svg></>}
        title="No gym on file"
        body="Add your gym name and share percentage in Settings. Until then, the gym&#8217;s share is tracked as ₹0 on every entry."
        style={{ marginTop: 64 }}
      />
    );
  }

  return (
    <>
      {/* `.mnystats` — see `LedgerTab`. Four clipped figures at 390px. */}
      <div className="stats stats--4 mnystats">
        <Stat
          label="Billed on the floor"
          value={rupees(stats.floorBilled)}
          detail={<>{stats.floorSessions} session{stats.floorSessions !== 1 ? 's' : ''}</>}
        />
        <Stat
          label={<>The gym&#8217;s {stats.gymCutPercent}%</>}
          value={rupees(stats.gymCut)}
          detail="Applied per entry, at record time"
          tone="warn"
        />
        <Stat
          label="Online"
          value={rupees(stats.remoteBilled)}
          detail={<>{stats.remoteSessions} session{stats.remoteSessions !== 1 ? 's' : ''} · they take nothing</>}
        />
        <Stat
          label={<>Yours, {periodTag(period)}</>}
          value={rupees(stats.yours)}
          detail={stats.floorBilled > 0
            ? `${Math.round((stats.yours / (stats.floorBilled + stats.remoteBilled)) * 100)}% of what you billed`
            : 'Nothing billed'}
          tone="acc"
        />
      </div>

      <div className="mny__grid mt4">
        <Card>
          <Card.Head title={<>Where the {stats.gymCutPercent}% went</>}>
            
            <Tag>Per entry</Tag>
          </Card.Head>

          {rows.length === 0 ? (
            <Card.Body>
              <p className="small" style={{ color: 'var(--tx-ink-3)' }}>
                No floor sessions recorded in {periodProse(period)}.
              </p>
            </Card.Body>
          ) : (
            <Card.Body flush>
              <div className="tblwrap">
                {/* `.mny__tbl--split` — the SAME card shell as Payments and the
                    pending list, and a different row 2, because this is the one
                    money table whose columns cannot lose their labels: three
                    bare figures side by side is exactly the case `.pk__tbl`
                    argues for keeping them. app.css carries the derivation. */}
                <table className="tbl mny__tbl mny__tbl--split">
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
                          <td className="mono" data-cell="when">{fmtDate(row.date)}</td>
                          <td data-cell="who">
                            <span className="who">
                              <span className="av av--sm" style={{ background: token }}>{initStr}</span>
                              <b>{row.clientName}</b>
                            </span>
                          </td>
                          <td className="num" data-cell="fig" data-l="Billed">{rupees(row.amount)}</td>
                          <td className="num" data-cell="fig" data-l="Gym’s cut" style={{ color: 'var(--tx-warn)' }}>
                            {row.isFloor ? `−${rupees(row.gymShareAmount)}` : '—'}
                          </td>
                          <td className="num" data-cell="fig" data-l="You keep" style={{ color: 'var(--tx-ok)' }}>
                            {rupees(row.yours)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="balm">
                      {/* The foot takes the same three columns on a phone, so the
                          totals land under the figures they total. */}
                      <td colSpan={2} data-cell="ftk"><span className="balm__k">TOTAL</span></td>
                      <td className="num" data-cell="fig" data-l="Billed"><span className="balm__v">{rupees(stats.floorBilled + stats.remoteBilled)}</span></td>
                      <td className="num" data-cell="fig" data-l="Gym’s cut"><span className="balm__v" style={{ color: 'var(--tx-warn)' }}>−{rupees(stats.gymCut)}</span></td>
                      <td className="num" data-cell="fig" data-l="You keep"><span className="balm__v" style={{ color: 'var(--tx-ok)' }}>{rupees(stats.yours)}</span></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card.Body>
          )}
        </Card>

        <Card>
          <Card.Head title="The arrangement" />
          <Card.Body>
            <KeyValueRow k="Gym">{trainer.gymName}</KeyValueRow>
            <KeyValueRow k="In-person split">{stats.gymCutPercent}% to gym</KeyValueRow>
            <KeyValueRow k="Online split">0% — all yours</KeyValueRow>
            <KeyValueRow k="Applies">Per entry, at record time</KeyValueRow>
          </Card.Body>
          <Card.Body style={{ borderTop: '1px solid var(--tx-line)' }}>
            <p className="small" style={{ color: 'var(--tx-ink-3)', lineHeight: 1.6 }}>
              The percentage is stored on each entry, not looked up later — a renegotiation
              in October never moves September&#8217;s split.
            </p>
          </Card.Body>
        </Card>
      </div>
    </>
  );
}
