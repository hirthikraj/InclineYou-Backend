'use client';

import { useEffect, useState } from 'react';

import { Opt, Step } from '@/components/packages/PackPanel';
import { Glyph } from '@/components/shell/Icons';
import type { PayoutInput } from '@/lib/business/actions';
import type { Arrangement, Payout } from '@/lib/business/types';
import { useDismiss } from '@/lib/ui/dismiss';
import { Button } from '@/web-components/ui/Button';

/**
 * THE TWO FORMS ON THE GYM PAGE, AS PANELS.
 *
 * Both used to open inside the card they belonged to, which pushed the balance
 * the trainer had just acted on down the page and, on a phone, put a four-field
 * form in the middle of a scroll. They are the Packages panel's own shell now
 * (`.panel xl-panel pkx-panel`: a side panel on a desk, a bottom sheet under
 * 900px) and ask one question at a time with the same `Step` and `Opt`, so a
 * trainer learns one way of answering on this product's money screens.
 */
export type TermsKind = 'minimum' | 'basic' | 'share';

const KIND: { id: TermsKind; title: string; note: string }[] = [
  { id: 'minimum', title: 'A minimum a month', note: 'At least this, or your share if that is more' },
  { id: 'basic', title: 'A basic fee plus your share', note: 'A fixed fee, and your share on top' },
  { id: 'share', title: 'Your share only', note: 'Nothing fixed' },
];

const METHODS: { id: NonNullable<Payout['method']>; title: string }[] = [
  { id: 'bank_transfer', title: 'Bank transfer' },
  { id: 'upi', title: 'UPI' },
  { id: 'cash', title: 'Cash' },
];

const digits = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);

function Shell({
  title,
  label,
  onClose,
  footer,
  error,
  children,
}: {
  title: string;
  label: string;
  onClose: () => void;
  footer: (dismiss: () => void) => React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
}) {
  const { closing, dismiss, ref } = useDismiss<HTMLDivElement>(onClose);

  /* Focus lands on the panel, not a field: on a phone a focused input opens the
     keyboard over the sheet that was just asked for. */
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dismiss, ref]);

  return (
    <>
      <button
        className={`scrim scrim--soft${closing ? ' scrim--out' : ''}`}
        type="button"
        aria-label={`Close ${label}`}
        onClick={dismiss}
      />
      <div
        ref={ref}
        tabIndex={-1}
        className={`panel xl-panel pkx-panel${closing ? ' panel--out' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <div className="panel__hd">
          <span className="panel__t">{title}</span>
          <Button
            variant="ghost"
            iconOnly
            label="Close"
            onClick={dismiss}
            style={{ marginLeft: 'auto' }}
            title={undefined}
            icon={<Glyph size={14} d="M18 6 6 18M6 6l12 12" />}
          />
        </div>
        <div className="panel__body">
          {children}
          {error && <p className="msg msg--err" style={{ marginTop: 12 }} role="alert"><span>{error}</span></p>}
        </div>
        <div className="panel__foot">{footer(dismiss)}</div>
      </div>
    </>
  );
}

export function TermsPanel({
  fixing,
  defaultMonth,
  gym,
  pending,
  error,
  onSave,
  onClose,
}: {
  fixing: Arrangement | null;
  defaultMonth: string;
  gym: string;
  pending: boolean;
  error?: string | null;
  onSave: (v: { id: string; baseKind: 'minimum' | 'basic' | null; baseAmount: number; startsMonth: string; note: string | null }) => void;
  onClose: () => void;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [kind, setKind] = useState<TermsKind>(fixing?.baseKind ?? (fixing ? 'share' : 'minimum'));
  const [amount, setAmount] = useState(fixing && fixing.baseAmount > 0 ? String(fixing.baseAmount) : '');
  const [month, setMonth] = useState(fixing?.startsMonth ?? defaultMonth);
  const [note, setNote] = useState(fixing?.note ?? '');

  const base = Number(digits(amount, 7)) || 0;
  const valid = (kind === 'share' || base > 0) && /^\d{4}-\d{2}$/.test(month);

  let n = 0;
  return (
    <Shell
      title={fixing ? 'Fix these terms' : 'Pay terms'}
      label={fixing ? 'Fix these pay terms' : 'Set pay terms'}
      onClose={onClose}
      error={error}
      footer={(dismiss) => (
        <>
          <Button variant="ghost" onClick={dismiss}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!valid || pending}
            onClick={() => onSave({
              id,
              baseKind: kind === 'share' ? null : kind,
              baseAmount: kind === 'share' ? 0 : base,
              startsMonth: month,
              note: note.trim() || null,
            })}
          >
            {pending ? 'Saving…' : fixing ? 'Save' : 'Save terms'}
          </Button>
        </>
      )}
    >
      <Step n={++n} title={`What does ${gym} pay you?`}>
        <div className="pkx-opts" role="radiogroup" aria-label="What the gym pays you">
          {KIND.map((k) => (
            <Opt key={k.id} on={kind === k.id} title={k.title} note={k.note} onClick={() => setKind(k.id)} />
          ))}
        </div>
      </Step>

      {kind !== 'share' && (
        <Step n={++n} title={kind === 'minimum' ? 'What is the minimum?' : 'What is the basic fee?'}>
          <div className="fld">
            <label className="fld__l vh" htmlFor="gp-base">Per month</label>
            <div className="affix">
              <span className="affix__p">₹</span>
              <input className="ctl ctl--num pkx-num" id="gp-base" inputMode="numeric" value={amount} placeholder="15000"
                onChange={(e) => setAmount(digits(e.target.value, 7))} />
            </div>
            <span className="fld__h">Per month.</span>
          </div>
        </Step>
      )}

      {!fixing && (
        <Step n={++n} title="From which month?">
          <div className="fld">
            <label className="fld__l vh" htmlFor="gp-month">From month</label>
            <input className="ctl pkx-num" id="gp-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <span className="fld__h">Earlier months keep the terms they were earned under.</span>
          </div>
        </Step>
      )}

      <Step n={++n} title="Anything to remember?">
        <div className="fld">
          <label className="fld__l vh" htmlFor="gp-note">Note</label>
          <input className="ctl" id="gp-note" value={note} maxLength={500} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
        </div>
      </Step>
    </Shell>
  );
}

export function PayoutPanel({
  editing,
  now,
  gym,
  pending,
  error,
  onSave,
  onClose,
}: {
  editing: Payout | null;
  now: number;
  gym: string;
  pending: boolean;
  error?: string | null;
  onSave: (v: PayoutInput, id: string) => void;
  onClose: () => void;
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

  const value = Number(digits(amount, 7)) || 0;
  const valid = value > 0 && date !== '';

  let n = 0;
  return (
    <Shell
      title={editing ? 'Fix this payout' : 'Record a payout'}
      label={editing ? 'Fix this payout' : 'Record a payout'}
      onClose={onClose}
      error={error}
      footer={(dismiss) => (
        <>
          <Button variant="ghost" onClick={dismiss}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!valid || pending}
            onClick={() => onSave({
              amount: value,
              method,
              reference: method === 'cash' ? null : reference.trim() || null,
              // Midday on the chosen day, so the date survives any time zone on its way to the server.
              receivedAt: Math.min(new Date(`${date}T12:00:00`).getTime(), now),
              note: note.trim() || null,
            }, id)}
          >
            {pending ? 'Saving…' : editing ? 'Save' : 'Record payout'}
          </Button>
        </>
      )}
    >
      <Step n={++n} title={`How did ${gym} pay?`}>
        <div className="pkx-chips" role="radiogroup" aria-label="How it was paid">
          {METHODS.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={method === m.id} className="pkx-chip" onClick={() => setMethod(m.id)}>
              {m.title}
            </button>
          ))}
        </div>
      </Step>

      <Step n={++n} title="How much did you receive?">
        <div className="fld">
          <label className="fld__l vh" htmlFor="gpo-amt">Amount received</label>
          <div className="affix">
            <span className="affix__p">₹</span>
            <input className="ctl ctl--num pkx-num" id="gpo-amt" inputMode="numeric" value={amount} placeholder="10000"
              onChange={(e) => setAmount(digits(e.target.value, 7))} />
          </div>
          <span className="fld__h">It is applied to the oldest month still owed, because gyms pay in parts.</span>
        </div>
      </Step>

      <Step n={++n} title="When?">
        <div className="fld">
          <label className="fld__l vh" htmlFor="gpo-date">Received on</label>
          <input className="ctl pkx-num" id="gpo-date" type="date" value={date} max={day(now)} onChange={(e) => setDate(e.target.value)} />
        </div>
      </Step>

      <Step n={++n} title="Anything to remember?">
        {method !== 'cash' && (
          <div className="fld" style={{ marginBottom: 10 }}>
            <label className="fld__l" htmlFor="gpo-ref">Reference <span className="pkx-opt">optional</span></label>
            <input className="ctl" id="gpo-ref" value={reference} maxLength={64} onChange={(e) => setReference(e.target.value)} />
          </div>
        )}
        <div className="fld">
          <label className="fld__l" htmlFor="gpo-note">Note <span className="pkx-opt">optional</span></label>
          <input className="ctl" id="gpo-note" value={note} maxLength={500} placeholder="Part of September, rest to follow" onChange={(e) => setNote(e.target.value)} />
        </div>
      </Step>
    </Shell>
  );
}
