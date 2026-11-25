'use client';

import { NudgeButton } from '@/components/nudge/NudgeButton';
import type { OwedClient } from '@/lib/business/api';
import type { PaymentClaimWire } from '@/lib/claims/types';
import { rupees } from '@/lib/today/time';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';

/**
 * WHO OWES YOU, BY HOW LATE (23 Nov 2026, `release/business-module-plan.html`) — the Payments page's *Owed* card.
 *
 * One row per client with money left on a pack, latest first, aged the way a trainer thinks about it: not due yet · up to
 * a week late · up to a month · more than a month. Each row carries its one verb:
 *   · a client who has said *I've paid* is in *To confirm* above, so their row says so and offers no reminder — chasing
 *     somebody who has just said "paid" is the fastest way to annoy them;
 *   · a gym client's money is the gym's to collect — no reminder from the trainer's number, and *Mark paid* records that the
 *     gym has it;
 *   · everybody else: *Remind* (the payment reminder, from the trainer's own WhatsApp) and *Record*.
 *
 * `owed === null` (the read failed) draws nothing rather than claiming nobody owes anything.
 */
const AGE: Record<OwedClient['age'], { label: (d: number) => string; tone: 'neutral' | 'info' | 'warn' | 'danger' }> = {
  'not-due': { label: () => 'Not due yet', tone: 'neutral' },
  'late-7': { label: (d) => `${d} day${d === 1 ? '' : 's'} late`, tone: 'info' },
  'late-30': { label: (d) => `${d} days late`, tone: 'warn' },
  'late-more': { label: (d) => `${d} days late`, tone: 'danger' },
};

export function OwedList({ owed, claims, now, onRecord }: {
  owed: OwedClient[] | null;
  claims: PaymentClaimWire[] | null;
  now: number;
  onRecord: (clientId: string) => void;
}) {
  if (!owed || owed.length === 0) return null;
  const claimed = new Map<string, number>();
  for (const c of claims ?? []) claimed.set(c.clientId, (claimed.get(c.clientId) ?? 0) + Number(c.amount));
  const total = owed.reduce((s, r) => s + r.total, 0);
  const late = owed.filter((r) => r.age !== 'not-due');

  return (
    <div id="owed">
      <Card as="section" className="clq">
        <Card.Head title="Who owes you" actions={<Tag tone={late.length > 0 ? 'warn' : 'neutral'}>{rupees(total)}</Tag>} />
        <Card.Body>
          <ul className="clq__list">
            {owed.map((r) => {
              const age = AGE[r.age];
              const says = claimed.get(r.clientId);
              return (
                <li key={r.clientId} className="clq__row">
                  <div className="clq__who">
                    {r.clientDeleted
                      ? <span className="clq__name">{r.clientName}</span>
                      : <a className="clq__name" href={`/clients/${r.clientId}/payments`}>{r.clientName}</a>}
                    <p className="small">
                      <b>{rupees(r.total)}</b>
                      {r.oldestDue ? ` · due ${new Date(`${r.oldestDue}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ' · no due date'}
                      {r.gym ? ' · the gym collects' : ''}
                    </p>
                  </div>
                  <div className="clq__acts">
                    <Tag tone={says ? 'acc' : age.tone}>{says ? `Says paid ${rupees(says)}` : age.label(r.daysLate)}</Tag>
                    {says ? (
                      <Button variant="secondary" size="sm" href="#to-confirm">Confirm</Button>
                    ) : r.clientDeleted ? null : (
                      <>
                        {!r.gym && r.age !== 'not-due' && (
                          <NudgeButton clientId={r.clientId} clientName={r.clientName} template="payment_reminder" now={now} />
                        )}
                        <Button variant="ghost" size="sm" onClick={() => onRecord(r.clientId)}>{r.gym ? 'Mark paid' : 'Record'}</Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card.Body>
      </Card>
    </div>
  );
}
