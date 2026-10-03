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
  type PayoutInput,
  type Written,
} from '@/lib/business/actions';
import type { Arrangement, GymSettlement as Settlement, Payout } from '@/lib/business/types';
import { Chip, ChipRow } from '@/components/setup/Chips';
import { rupees } from '@/lib/today/time';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';
import { TextField } from '@/web-components/ui/Field';

/**
 * WHAT THE GYM OWES YOU — the pay terms, the months against them, and the payouts.
 *
 * ── THE BALANCE IS A SUM, STORED NOWHERE ─────────────────────────────────────
 *
 * The server computes it on every read: per closed month, *owed* is the larger of
 * the base and your share (a **minimum**), the base plus your share (a **basic**
 * fee) or just your share (no base), and what the gym has paid is poured into the
 * months oldest first — gyms pay in parts and rarely say which month. So editing
 * or deleting a payout moves the balance at once, and nothing here keeps a second
 * copy that could disagree.
 *
 * The month still running owes NOTHING yet: a minimum is not owed on the 3rd. It
 * is drawn *so far* with no balance, and only closed months add up to what is due.
 *
 * ── THREE KINDS OF TERMS, ONE QUESTION ───────────────────────────────────────
 *
 * Does the gym pay a floor under your share (*a minimum*), pay a fee on top of it
 * (*a basic fee*), or just your share? Past months keep the terms they were earned
 * under: new terms close the running ones the month before they begin.
 */
type Kind = 'minimum' | 'basic' | null;

const KIND_LABEL: Record<'minimum' | 'basic' | 'share', string> = {
  minimum: 'A minimum per month',
  basic: 'A basic fee plus your share',
  share: 'Your share only',
};

const METHOD_LABEL: Record<NonNullable<Payout['method']>, string> = {
  upi: 'UPI',
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
};

function monthName(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, (mo ?? 1) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function termsSentence(a: Arrangement): string {
  const from = `from ${monthName(a.startsMonth)}${a.endsMonth ? ` to ${monthName(a.endsMonth)}` : ''}`;
  if (a.baseKind === 'minimum') return `At least ${rupees(a.baseAmount)} a month, or your share if that is more · ${from}`;
  if (a.baseKind === 'basic') return `${rupees(a.baseAmount)} a month plus your share · ${from}`;
  return `Your share only · ${from}`;
}

export function GymSettlement({
  gymName,
  settlement,
  now,
  onChanged,
}: {
  gymName: string | null;
  settlement: Settlement | null;
  now: number;
  onChanged: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState<
    | { kind: 'terms'; fixing: Arrangement | null }
    | { kind: 'payout'; editing: Payout | null }
    | null
  >(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const name = gymName ?? 'the gym';
  const thisMonth = new Date(now);
  const thisMonthKey = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, '0')}`;

  /** Run a write; on success close the form and re-read the page, on refusal say why and keep the form. */
  function run<T>(work: () => Promise<Written<T>>, done: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await work();
      if (result.ok) {
        setForm(null);
        setConfirming(null);
        setMessage({ tone: 'ok', text: done });
        await onChanged();
      } else {
        setMessage({ tone: 'err', text: result.message });
      }
    });
  }

  const arrangement = settlement?.arrangement ?? null;
  /* Fixing is offered only while the terms' first month has not ended; after that
     the base is history and the server answers ARRANGEMENT_STARTED. Offering a
     control that can only be refused is worse than not drawing it. */
  const canFix = arrangement !== null && arrangement.startsMonth >= thisMonthKey;

  return (
    <Card className="mt4">
      <Card.Head
        title={`What ${name} owes you`}
        actions={
          <>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => { setMessage(null); setForm({ kind: 'terms', fixing: null }); }}>
              {arrangement ? 'Set new terms' : 'Set up pay terms'}
            </Button>
            {arrangement && (
              <Button variant="secondary" size="sm" disabled={pending} onClick={() => { setMessage(null); setForm({ kind: 'payout', editing: null }); }}>
                Record a payout
              </Button>
            )}
          </>
        }
      />

      {message && (
        <Card.Body>
          <p className={message.tone === 'err' ? 'msg msg--err' : 'msg msg--ok'} role={message.tone === 'err' ? 'alert' : 'status'}>
            <span>{message.text}</span>
          </p>
        </Card.Body>
      )}

      {settlement === null ? (
        <Card.Body>
          <p className="empty__t" style={{ marginBottom: 6 }}>Set up pay terms with {name}</p>
          <p className="empty__b">
            Does {name} pay you a minimum, a basic fee, or just your share of what it collects? Say so once and
            this page works out, month by month, what it owes you and what is still unpaid.
          </p>
          {gymName === null && (
            <p className="small" style={{ marginTop: 8 }}>
              Add your gym first, on the <Link href="/business/packages">packages page</Link>.
            </p>
          )}
        </Card.Body>
      ) : (
        <>
          <Card.Body>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <p className="small" style={{ color: 'var(--tx-ink-3)' }}>Owed over closed months</p>
                <p style={{ fontSize: 28, fontWeight: 700 }}>{rupees(settlement.balanceDue)}</p>
                <p className="small" style={{ color: 'var(--tx-ink-3)' }}>
                  {settlement.balanceDue > 0 ? 'Still to come from the gym' : 'Nothing outstanding'}
                </p>
              </div>
              {arrangement && (
                <div style={{ maxWidth: '46ch' }}>
                  <p className="small" style={{ color: 'var(--tx-ink-3)' }}>Pay terms</p>
                  <p className="small" style={{ lineHeight: 1.6 }}>{termsSentence(arrangement)}</p>
                  {arrangement.note && <p className="small" style={{ color: 'var(--tx-ink-3)' }}>{arrangement.note}</p>}
                  <span className="row" style={{ gap: 6, marginTop: 6 }}>
                    {canFix && (
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => { setMessage(null); setForm({ kind: 'terms', fixing: arrangement }); }}>
                        Fix these terms
                      </Button>
                    )}
                    {confirming === arrangement.id ? (
                      <>
                        <span className="small" style={{ color: 'var(--tx-ink-3)' }}>The months they covered fall back to your share only.</span>
                        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => removeArrangement(arrangement.id), 'Terms deleted.')}>
                          Delete them
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>Keep</Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(arrangement.id)}>
                        Delete terms
                      </Button>
                    )}
                  </span>
                </div>
              )}
            </div>
          </Card.Body>

          {form?.kind === 'terms' && (
            <Card.Body style={{ borderTop: '1px solid var(--tx-line)' }}>
              <TermsForm
                key={form.fixing?.id ?? 'new'}
                fixing={form.fixing}
                defaultMonth={thisMonthKey}
                pending={pending}
                onCancel={() => setForm(null)}
                onSave={(v) =>
                  form.fixing
                    ? run(() => fixArrangement(form.fixing!.id, v.baseKind === (form.fixing!.baseKind) && v.baseAmount === form.fixing!.baseAmount
                        ? { note: v.note }
                        : { baseKind: v.baseKind, baseAmount: v.baseAmount, note: v.note }), 'Terms fixed.')
                    : run(() => setArrangement({ id: v.id, baseKind: v.baseKind, baseAmount: v.baseAmount, startsMonth: v.startsMonth, note: v.note }), 'New terms saved.')
                }
              />
            </Card.Body>
          )}

          {settlement.months.length > 0 && (
            <Card.Body flush style={{ borderTop: '1px solid var(--tx-line)' }}>
              <p className="small" style={{ padding: '10px 16px 0', color: 'var(--tx-ink-3)', lineHeight: 1.6 }}>
                <b style={{ color: 'var(--tx-ink)' }}>Collected through the gym desk.</b> The figures at the top of
                the page count what was billed in the month a pack was sold; this table counts money when it
                landed, so one month can read differently in the two.
              </p>
              <div className="tblwrap">
                <table className="tbl pk__tbl">
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
              <p className="small" style={{ padding: '10px 16px', color: 'var(--tx-ink-3)', lineHeight: 1.6 }}>
                The running month owes nothing yet — a minimum is not owed on the 3rd. What the gym has paid is
                applied to the oldest month first, because gyms pay in parts and rarely say which month.
              </p>
            </Card.Body>
          )}

          <Card.Body style={{ borderTop: '1px solid var(--tx-line)' }}>
            <p className="fld__l" style={{ marginBottom: 8 }}>Payouts received</p>
            {form?.kind === 'payout' && (
              <PayoutForm
                key={form.editing?.id ?? 'new'}
                editing={form.editing}
                now={now}
                pending={pending}
                onCancel={() => setForm(null)}
                onSave={(v, id) =>
                  form.editing
                    ? run(() => fixPayout(form.editing!.id, v), 'Payout corrected.')
                    : run(() => recordPayout({ ...v, id }), 'Payout recorded.')
                }
              />
            )}
            {settlement.recentPayouts.length === 0 ? (
              <p className="small" style={{ color: 'var(--tx-ink-3)' }}>
                Nothing recorded yet. When {name} pays you, record it here and the balance moves at once.
              </p>
            ) : (
              settlement.recentPayouts.map((p) => (
                <div className="kv" key={p.id} style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap', display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span>
                    <b>{rupees(p.amount)}</b>{' '}
                    <span className="small" style={{ color: 'var(--tx-ink-3)' }}>
                      {new Date(p.receivedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {p.method && ` · ${METHOD_LABEL[p.method]}`}
                      {p.reference && ` · ${p.reference}`}
                      {p.note && ` · ${p.note}`}
                    </span>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    {confirming === p.id ? (
                      <>
                        <span className="small" style={{ color: 'var(--tx-ink-3)' }}>The balance moves back.</span>
                        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => removePayout(p.id), 'Payout deleted.')}>
                          Delete it
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>Keep</Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" disabled={pending} onClick={() => { setMessage(null); setForm({ kind: 'payout', editing: p }); }}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(p.id)}>
                          Delete
                        </Button>
                      </>
                    )}
                  </span>
                </div>
              ))
            )}
          </Card.Body>
        </>
      )}

      {/* With no settlement at all the terms form still has to open from the header. */}
      {settlement === null && form?.kind === 'terms' && (
        <Card.Body style={{ borderTop: '1px solid var(--tx-line)' }}>
          <TermsForm
            key="new"
            fixing={null}
            defaultMonth={thisMonthKey}
            pending={pending}
            onCancel={() => setForm(null)}
            onSave={(v) => run(() => setArrangement({ id: v.id, baseKind: v.baseKind, baseAmount: v.baseAmount, startsMonth: v.startsMonth, note: v.note }), 'Pay terms saved.')}
          />
        </Card.Body>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- the forms ── */

function TermsForm({
  fixing,
  defaultMonth,
  pending,
  onCancel,
  onSave,
}: {
  fixing: Arrangement | null;
  defaultMonth: string;
  pending: boolean;
  onCancel: () => void;
  onSave: (v: { id: string; baseKind: Kind; baseAmount: number; startsMonth: string; note: string | null }) => void;
}) {
  /* Minted when the form opens, so a retried save replays the same create. */
  const [id] = useState(() => crypto.randomUUID());
  const [kind, setKind] = useState<'minimum' | 'basic' | 'share'>(fixing?.baseKind ?? (fixing ? 'share' : 'minimum'));
  const [amount, setAmount] = useState(fixing && fixing.baseAmount > 0 ? String(fixing.baseAmount) : '');
  const [month, setMonth] = useState(fixing?.startsMonth ?? defaultMonth);
  const [note, setNote] = useState(fixing?.note ?? '');

  const base = Number(amount.replace(/\D/g, '')) || 0;
  const valid = (kind === 'share' || base > 0) && /^\d{4}-\d{2}$/.test(month);

  return (
    <div>
      <p className="fld__l" style={{ marginBottom: 6 }}>{fixing ? 'Fix these terms' : 'What the gym pays you'}</p>
      <ChipRow top={0}>
        {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => (
          <Chip key={k} label={KIND_LABEL[k]} pressed={kind === k} onClick={() => setKind(k)} />
        ))}
      </ChipRow>
      <div className="fldrow" style={{ marginTop: 14 }}>
        {kind !== 'share' && (
          <div className="fld fld--w2">
            <label className="fld__l" htmlFor="ga-base">{kind === 'minimum' ? 'The minimum, per month' : 'The basic fee, per month'}</label>
            <div className="affix">
              <span className="affix__p">₹</span>
              <input className="ctl ctl--num" id="ga-base" inputMode="numeric" value={amount} placeholder="15000"
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))} />
            </div>
          </div>
        )}
        {!fixing && (
          <TextField
            label="From month"
            id="ga-month"
            type="month"
            className="fld--w2"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            hint="Earlier months keep the terms they were earned under."
          />
        )}
        <TextField label={<>Note <span style={{ fontWeight: 400, color: 'var(--tx-ink-3)' }}>optional</span></>} id="ga-note"
          className="fld--w3" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <Button variant="primary" disabled={!valid || pending}
          onClick={() => onSave({ id, baseKind: kind === 'share' ? null : kind, baseAmount: kind === 'share' ? 0 : base, startsMonth: month, note: note.trim() || null })}>
          {pending ? 'Saving…' : fixing ? 'Save' : 'Save terms'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function PayoutForm({
  editing,
  now,
  pending,
  onCancel,
  onSave,
}: {
  editing: Payout | null;
  now: number;
  pending: boolean;
  onCancel: () => void;
  onSave: (v: PayoutInput, id: string) => void;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const day = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [method, setMethod] = useState<Payout['method']>(editing?.method ?? 'bank_transfer');
  const [reference, setReference] = useState(editing?.reference ?? '');
  const [date, setDate] = useState(day(editing?.receivedAt ?? now));
  const [note, setNote] = useState(editing?.note ?? '');

  const value = Number(amount.replace(/\D/g, '')) || 0;
  const valid = value > 0 && date !== '';

  return (
    <div style={{ marginBottom: 12 }}>
      <ChipRow top={0}>
        {(Object.keys(METHOD_LABEL) as NonNullable<Payout['method']>[]).map((m) => (
          <Chip key={m} label={METHOD_LABEL[m]} pressed={method === m} onClick={() => setMethod(m)} />
        ))}
      </ChipRow>
      <div className="fldrow" style={{ marginTop: 12 }}>
        <div className="fld fld--w2">
          <label className="fld__l" htmlFor="tp-amt">Amount received</label>
          <div className="affix">
            <span className="affix__p">₹</span>
            <input className="ctl ctl--num" id="tp-amt" inputMode="numeric" value={amount} placeholder="10000"
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))} />
          </div>
        </div>
        <TextField label="Received on" id="tp-date" type="date" className="fld--w2" value={date} max={day(now)}
          onChange={(e) => setDate(e.target.value)} />
        {method !== 'cash' && (
          <TextField label={<>Reference <span style={{ fontWeight: 400, color: 'var(--tx-ink-3)' }}>optional</span></>} id="tp-ref"
            className="fld--w2" value={reference} maxLength={64} onChange={(e) => setReference(e.target.value)} />
        )}
        <TextField label={<>Note <span style={{ fontWeight: 400, color: 'var(--tx-ink-3)' }}>optional</span></>} id="tp-note"
          className="fld--w3" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <Button variant="primary" disabled={!valid || pending}
          onClick={() => onSave({
            amount: value,
            method,
            reference: method === 'cash' ? null : reference.trim() || null,
            // Midday on the chosen day, so the date survives any time zone on its way to the server.
            receivedAt: Math.min(new Date(`${date}T12:00:00`).getTime(), now),
            note: note.trim() || null,
          }, id)}>
          {pending ? 'Saving…' : editing ? 'Save' : 'Record payout'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
