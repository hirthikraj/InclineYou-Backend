'use client';

import { useState, useTransition } from 'react';

import type { OwedRow, OwedStats } from '@/lib/money/compute';
import { sendReminder } from '@/lib/money/actions';
import { NudgeButton } from '@/components/nudge/NudgeButton';
import { rupees, initials, avatarToken } from '@/lib/today/time';

const UP_ARROW = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V6"/><path d="M6.5 11.5 12 6l5.5 5.5"/>
  </svg>
);

/**
 * *18 days overdue*, not *18 days late*.
 *
 * The brief's own wording, and the difference is not cosmetic: chasing money is
 * the most uncomfortable job a personal trainer has, and *late* is a word about
 * the client while *overdue* is a word about the invoice. A trainer reading this
 * list is about to press a button that messages a person they see three times a
 * week.
 */
function lateTag(days: number): { label: string; cls: string } {
  if (days > 7) return { label: `${days} days overdue`, cls: 'tag--danger' };
  if (days > 0) return { label: `${days} day${days === 1 ? '' : 's'} overdue`, cls: 'tag--warn' };
  return { label: 'Due', cls: 'tag' };
}

interface Props {
  stats: OwedStats;
  rows: OwedRow[];
}

/**
 * THE DUES LIST — and the one row on it that had two taps too many.
 *
 * *Remind* used to open a right-hand panel that explained what a reminder is and
 * then offered a button that drafted one. Three surfaces for one act, on the
 * screen a trainer opens specifically to chase eight people. The panel is gone
 * (`components/money/RemindPanel.tsx`, deleted) and the row drafts directly —
 * which is the whole rule this feature is built on: a nudge belongs next to the
 * thing that triggered it, and every step between the row and WhatsApp is a step
 * where the follow-up stops happening.
 *
 * Nothing the panel promised is lost. *XRep never messages on your behalf* is
 * true by construction — the button opens the trainer's own composer — and it is
 * said once, on the template library, rather than re-argued on every press.
 */
export function OwedTab({ stats, rows }: Props) {
  const [remindAllPending, startRemindAll] = useTransition();
  const [remindAllCount, setRemindAllCount] = useState(0);

  /*
   * DEDUPED BY CLIENT, because the rows are invoices and the reminder is a
   * message to a person. A client with two unpaid packs is two rows here and one
   * WhatsApp — sending twice opens two tabs at the same chat, writes two
   * `nudge_log` rows, and spends a client's once-per-7-days cap
   * (`app/src/nudges/rules.ts`) on a duplicate.
   */
  const remindableClientIds = Array.from(new Set(rows.map((r) => r.clientId)));

  const handleRemindAll = () => {
    startRemindAll(async () => {
      const results = await Promise.all(remindableClientIds.map((id) => sendReminder(id)));
      let sent = 0;
      for (const result of results) {
        if (result.ok && result.whatsappUrl) {
          window.open(result.whatsappUrl, '_blank', 'noopener,noreferrer');
          sent++;
        }
      }
      setRemindAllCount(sent);
    });
  };

  if (rows.length === 0) {
    return (
      <div className="empty" style={{ marginTop: 64 }}>
        <div className="empty__ic">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <path d="M22 4 12 14.01l-3-3"/>
          </svg>
        </div>
        <p className="empty__t">All settled</p>
        <p className="empty__b">No pending payments — everyone is up to date.</p>
      </div>
    );
  }

  const totalOwed = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <>
      {/* Stat tiles */}
      <div className="stats stats--3">
        <div className={`stat${stats.lateCount > 0 ? ' stat--danger' : ''}`}>
          <p className="stat__k">Late</p>
          <p className="stat__v">{rupees(stats.lateAmount)}</p>
          <p className="stat__d">
            {stats.lateCount} client{stats.lateCount !== 1 ? 's' : ''}, past the due date
          </p>
        </div>
        <div className={`stat${stats.dueCount > 0 ? ' stat--warn' : ''}`}>
          <p className="stat__k">Due, not yet late</p>
          <p className="stat__v">{rupees(stats.dueAmount)}</p>
          <p className="stat__d">{stats.dueCount} client{stats.dueCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="stat">
          <p className="stat__k">Oldest</p>
          <p className="stat__v">{stats.oldestDays}d</p>
          <p className="stat__d">
            {stats.oldestClientName || '—'}
          </p>
        </div>
      </div>

      <div className="card mt4">
        <div className="card__hd">
          <h2 className="card__t">Still owed</h2>
          <span className="tag tag--warn">Sorted by how late</span>
          <span className="card__acts">
            {remindAllCount > 0 && (
              <span className="tag tag--ok">{remindAllCount} WhatsApp{remindAllCount === 1 ? '' : 's'} opened</span>
            )}
            <button
              className="btn btn--sm btn--primary"
              type="button"
              onClick={handleRemindAll}
              disabled={remindAllPending}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 3 10.5 13.5"/><path d="M21 3l-6.8 18-3.7-7.5L3 9.8Z"/>
              </svg>
              {remindAllPending ? 'Sending…' : `Remind all ${remindableClientIds.length}`}
            </button>
          </span>
        </div>

        <div className="card__b card__b--flush">
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>For</th>
                  <th aria-sort="descending">How late</th>
                  <th className="num">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const initStr = initials(row.clientName);
                  const token = avatarToken(row.clientId);
                  const { label: ltLabel, cls: ltCls } = lateTag(row.daysLate);
                  return (
                    <tr key={row.id}>
                      <td>
                        <span className="who">
                          <span className="av av--sm" style={{ background: `var(${token})` }}>{initStr}</span>
                          <b>{row.clientName}</b>
                        </span>
                      </td>
                      <td>{row.packageName}</td>
                      <td><span className={`tag ${ltCls}`}>{ltLabel}</span></td>
                      <td className="num">
                        <span className="dirn dirn--out">
                          {UP_ARROW}
                          {rupees(row.amount)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <NudgeButton
                          clientId={row.clientId}
                          clientName={row.clientName}
                          template="payment_reminder"
                          className="btn btn--sm btn--secondary"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="balm">
                  <td colSpan={3}><span className="balm__k">TOTAL OWED</span></td>
                  <td className="num"><span className="balm__v">{rupees(totalOwed)}</span></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
