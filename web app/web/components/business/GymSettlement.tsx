'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import {
  fixArrangement,
  fixPayout,
  recordPayout,
  removeArrangement,
  removePayout,
  setArrangement,
  type Written,
} from '@/lib/business/actions';
import type { Arrangement, GymSettlement as Settlement, Payout } from '@/lib/business/types';
import { rupees } from '@/lib/today/time';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';
import { PayoutPanel, TermsPanel } from './GymPanels';

/**
 * WHAT THE GYM OWES YOU — the page's reason to exist, so it leads.
 *
 * The page used to open on four tiles about the current month, which on the
 * fourth of a month all read ₹0, and kept the one figure a trainer opens it for
 * (*₹6,000 still to come from the gym*) in the third card down. It is the hero
 * now: the balance, the verb a trainer reaches for most (*Record a payout*, the
 * only primary on the page) and the terms the balance was worked out under.
 *
 * `children` is the page's own middle — the period's figures and the pack table —
 * so the order reads *what you are owed → how this period came out → how the
 * owing was built up → what has been paid*, while the open panel and the
 * messages stay owned by one component.
 *
 * ── THE FORMS ARE PANELS ─────────────────────────────────────────────────────
 *
 * `GymPanels.tsx`. Opening one inside the card pushed the balance the trainer had
 * just acted on off the screen; the panel leaves it where it is.
 */
type Kind = 'minimum' | 'basic' | null;

const METHOD_LABEL: Record<NonNullable<Payout['method']>, string> = {
  upi: 'UPI',
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
};

function monthName(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, (mo ?? 1) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function termsParts(a: Arrangement): { text: string; from: string } {
  const from = `From ${monthName(a.startsMonth)}${a.endsMonth ? ` to ${monthName(a.endsMonth)}` : ''}`;
  if (a.baseKind === 'minimum') return { text: `At least ${rupees(a.baseAmount)} a month, or your share if that is more`, from };
  if (a.baseKind === 'basic') return { text: `${rupees(a.baseAmount)} a month plus your share`, from };
  return { text: 'Your share only', from };
}

const dateOf = (ms: number) =>
  new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function GymSettlement({
  gymName,
  settlement,
  now,
  onChanged,
  children,
}: {
  gymName: string | null;
  settlement: Settlement | null;
  now: number;
  onChanged: () => Promise<void>;
  children?: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [form, setForm] = useState<
    | { kind: 'terms'; fixing: Arrangement | null }
    | { kind: 'payout'; editing: Payout | null }
    | null
  >(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [tray, setTray] = useState(false);

  const name = gymName ?? 'the gym';
  const thisMonth = new Date(now);
  const thisMonthKey = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, '0')}`;

  /* A refusal stays in the open panel, beside the answers it is about; a success
     closes it and says so above the hero. */
  function run<T>(work: () => Promise<Written<T>>, done: string) {
    setMessage(null);
    setPanelError(null);
    startTransition(async () => {
      const result = await work();
      if (result.ok) {
        setForm(null);
        setConfirming(null);
        setTray(false);
        setMessage({ tone: 'ok', text: done });
        await onChanged();
      } else if (form) {
        setPanelError(result.message);
      } else {
        setMessage({ tone: 'err', text: result.message });
      }
    });
  }

  function openForm(next: NonNullable<typeof form>) {
    setMessage(null);
    setPanelError(null);
    setTray(false);
    setForm(next);
  }

  const arrangement = settlement?.arrangement ?? null;
  /* A base can be fixed only while it has not started: once its month has begun
     the base is history and the server answers ARRANGEMENT_STARTED. Offering a
     control that can only be refused is worse than not drawing it. */
  const canFix = arrangement !== null && arrangement.startsMonth >= thisMonthKey;
  const terms = arrangement ? termsParts(arrangement) : null;

  return (
    <>
      {message && (
        <p
          className={message.tone === 'err' ? 'msg msg--err' : 'msg msg--ok'}
          style={{ marginBottom: 12 }}
          role={message.tone === 'err' ? 'alert' : 'status'}
        >
          <span>{message.text}</span>
        </p>
      )}

      {settlement === null ? (
        <section className="gsx-hero gsx-hero--setup">
          <div>
            <p className="gsx-k">Pay terms</p>
            <h2 className="gsx-t1">Set up pay terms with {name}</h2>
            <p className="gsx-p">
              Does {name} pay you a minimum, a basic fee, or just your share of what it collects? Say so once and
              this page works out, month by month, what it owes you and what is still unpaid.
            </p>
            {gymName === null && (
              <p className="gsx-p">Add your gym first, on the <Link href="/business/packages">packages page</Link>.</p>
            )}
          </div>
          <Button variant="primary" disabled={pending || gymName === null} onClick={() => openForm({ kind: 'terms', fixing: null })}>
            Set up pay terms
          </Button>
        </section>
      ) : (
        <section className="gsx-hero">
          <div className="gsx-hero__bal">
            <p className="gsx-k">What {name} owes you</p>
            <p className="gsx-amt">{rupees(settlement.balanceDue)}</p>
            <p className="gsx-sub">
              {settlement.balanceDue > 0 ? 'Still to come, over closed months' : 'Nothing outstanding over closed months'}
            </p>
            {arrangement && (
              <Button variant="primary" disabled={pending} onClick={() => openForm({ kind: 'payout', editing: null })}>
                Record a payout
              </Button>
            )}
          </div>

          {arrangement && terms && (
            <div className="gsx-hero__terms">
              <p className="gsx-k">Pay terms</p>
              <p className="gsx-terms">{terms.text}</p>
              <p className="gsx-sub">{terms.from}</p>
              {arrangement.note && <p className="gsx-sub">{arrangement.note}</p>}

              {confirming === arrangement.id ? (
                <div className="gsx-ask" role="group" aria-label="Delete these terms">
                  <p>The months they covered fall back to your share only.</p>
                  <span className="gsx-acts">
                    <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => removeArrangement(arrangement.id), 'Terms deleted.')}>
                      Delete them
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>Keep</Button>
                  </span>
                </div>
              ) : (
                <span className="gsx-acts">
                  <Button variant="secondary" size="sm" disabled={pending} onClick={() => openForm({ kind: 'terms', fixing: null })}>
                    Set new terms
                  </Button>
                  <Button variant="ghost" size="sm" aria-expanded={tray} onClick={() => setTray(!tray)}>More</Button>
                </span>
              )}
              {tray && confirming !== arrangement.id && (
                <span className="gsx-acts gsx-acts--tray">
                  {canFix && (
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => openForm({ kind: 'terms', fixing: arrangement })}>
                      Fix these terms
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => { setTray(false); setConfirming(arrangement.id); }}>
                    Delete terms
                  </Button>
                </span>
              )}
            </div>
          )}
        </section>
      )}

      {children}

      {settlement !== null && settlement.months.length > 0 && (
        <Card className="mt4">
          <Card.Head title="Month by month" />
          <Card.Body flush>
            <div className="tblwrap">
              <table className="tbl gsx-tbl">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="num">Clients</th>
                    <th className="num">Your share collected</th>
                    <th className="num">Owed</th>
                    <th className="num">Received</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {settlement.months.map((m) => (
                    <tr key={m.month}>
                      <td data-l="">
                        <b>{monthName(m.month)}</b>
                        {m.soFar && <Tag style={{ marginLeft: 8 }}>so far</Tag>}
                      </td>
                      <td className="num" data-l="Clients">{m.clients}</td>
                      <td className="num" data-l="Your share">{rupees(m.yourShare)}</td>
                      <td className="num" data-l="Owed">{m.soFar ? '—' : rupees(m.owed)}</td>
                      <td className="num" data-l="Received">{rupees(m.received)}</td>
                      <td className="num" data-l="Balance">{m.balance === null ? '—' : rupees(m.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card.Body>
          {/* Both lines moved from above the table to below it and got shorter:
              the explanation is for a reader who has just met two totals, so it
              follows the numbers rather than standing in front of them. */}
          <Card.Body style={{ borderTop: '1px solid var(--tx-line)' }}>
            <p className="gsx-note">
              Counted when the money landed, so a month can differ from the figures above, which count when a pack
              was sold. A minimum is not owed until its month closes, and payouts are applied to the oldest month first.
            </p>
          </Card.Body>
        </Card>
      )}

      {settlement !== null && (
        <Card className="mt4">
          <Card.Head title="Payouts received">
            <Tag>{settlement.recentPayouts.length}</Tag>
          </Card.Head>
          {settlement.recentPayouts.length === 0 ? (
            <Card.Body>
              <p className="gsx-note">
                Nothing recorded yet. When {name} pays you, record it and the balance moves at once.
              </p>
            </Card.Body>
          ) : (
            <ul className="gsx-po" role="list">
              {settlement.recentPayouts.map((p) => (
                <li key={p.id} className="gsx-po__r">
                  <span className="gsx-po__main">
                    <b className="gsx-po__amt">{rupees(p.amount)}</b>
                    <span className="gsx-po__when">{dateOf(p.receivedAt)}</span>
                  </span>
                  <span className="gsx-po__sub">
                    {[p.method && METHOD_LABEL[p.method], p.reference, p.note].filter(Boolean).join(' · ') || 'No details'}
                  </span>
                  <span className="gsx-acts gsx-po__acts">
                    {confirming === p.id ? (
                      <>
                        <span className="gsx-po__ask">The balance moves back.</span>
                        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => removePayout(p.id), 'Payout deleted.')}>
                          Delete it
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>Keep</Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" disabled={pending} aria-label={`Edit the ${rupees(p.amount)} payout`} onClick={() => openForm({ kind: 'payout', editing: p })}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" disabled={pending} aria-label={`Delete the ${rupees(p.amount)} payout`} onClick={() => setConfirming(p.id)}>
                          Delete
                        </Button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {form?.kind === 'terms' && (
        <TermsPanel
          key={form.fixing?.id ?? 'new'}
          fixing={form.fixing}
          defaultMonth={thisMonthKey}
          gym={name}
          pending={pending}
          error={panelError}
          onClose={() => { setForm(null); setPanelError(null); }}
          onSave={(v) =>
            form.fixing
              ? run(() => fixArrangement(form.fixing!.id, v.baseKind === form.fixing!.baseKind && v.baseAmount === form.fixing!.baseAmount
                  ? { note: v.note }
                  : { baseKind: v.baseKind as Kind, baseAmount: v.baseAmount, note: v.note }), 'Terms fixed.')
              : run(() => setArrangement({ id: v.id, baseKind: v.baseKind, baseAmount: v.baseAmount, startsMonth: v.startsMonth, note: v.note }),
                  settlement === null ? 'Pay terms saved.' : 'New terms saved.')
          }
        />
      )}
      {form?.kind === 'payout' && (
        <PayoutPanel
          key={form.editing?.id ?? 'new'}
          editing={form.editing}
          now={now}
          gym={name}
          pending={pending}
          error={panelError}
          onClose={() => { setForm(null); setPanelError(null); }}
          onSave={(v, id) =>
            form.editing
              ? run(() => fixPayout(form.editing!.id, v), 'Payout corrected.')
              : run(() => recordPayout({ ...v, id }), 'Payout recorded.')
          }
        />
      )}
    </>
  );
}
