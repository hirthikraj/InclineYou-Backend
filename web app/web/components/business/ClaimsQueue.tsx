'use client';

import { useEffect, useState, useTransition } from 'react';

import { loadPackagesForPanel } from '@/lib/business/actions';
import type { PickablePackage } from '@/lib/business/types';
import { confirmClaim, declineClaim, reopenClaim, undoConfirm } from '@/lib/claims/actions';
import { claimDay, cleanReference, type PaymentClaimWire } from '@/lib/claims/types';
import { rupees } from '@/lib/today/time';
import { useToast } from '@/lib/toast/store';
import { AffixField } from '@/web-components/ui/AffixField';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { DateField } from '@/web-components/ui/DateField';
import { TextField } from '@/web-components/ui/Field';
import { Modal, ModalHost } from '@/web-components/ui/Modal';
import { Select } from '@/web-components/ui/Select';
import { Tag } from '@/web-components/ui/Tag';

/**
 * TO CONFIRM — the clients who say they've paid (V50; `release/business-module-plan.html`).
 *
 * A client paid by UPI (or at the gym's desk) and tapped *I've paid* in their portal. Nothing counts as paid until the
 * trainer says so here: **Confirm** records an ordinary payment (with Undo, which is deleting that payment — the claim goes
 * back to waiting), **Not received** tells the client, with a reason if one is given (Undo puts it back in the queue).
 *
 * Drawn first on the Business Overview and on Payments, and drawn NOT AT ALL when the queue is empty — an empty "to
 * confirm" card is a box asking the trainer to check that nothing is there. `claims === null` (the read failed) draws
 * nothing too, rather than claiming the queue is clear.
 *
 * The UTR is optional on both sides: the client's is pre-filled and the trainer may keep, change or clear it. A gym
 * client's claim is "paid at the gym" — no method, no reference, because the money is at the gym's desk.
 */
export function ClaimsQueue({ claims, now, onChanged }: {
  claims: PaymentClaimWire[] | null;
  now: number;
  /** Called after a confirm, a decline or an Undo — a page holding its own copy of the book (Payments) reloads it. */
  onChanged?: () => void;
}) {
  const [list, setList] = useState(claims ?? []);
  const [seen, setSeen] = useState(claims);
  const [confirming, setConfirming] = useState<PaymentClaimWire | null>(null);
  const [declining, setDeclining] = useState<PaymentClaimWire | null>(null);
  // A new server read (revalidation) replaces the list — adjusted during render, never synced in an effect (trap 21).
  if (claims !== seen) {
    setSeen(claims);
    setList(claims ?? []);
  }
  if (list.length === 0) return null;

  const total = list.reduce((s, c) => s + Number(c.amount), 0);
  const drop = (id: string) => {
    setList((l) => l.filter((c) => c.id !== id));
    onChanged?.();
  };
  const putBack = (c: PaymentClaimWire) => {
    setList((l) => (l.some((x) => x.id === c.id) ? l : [...l, c].sort((a, b) => a.createdAt - b.createdAt)));
    onChanged?.();
  };

  return (
    // `#to-confirm` is the headline tile's target; `.body` is the scroller, so the margin is on the target (trap 16).
    <div id="to-confirm" className="clq__at">
    <Card as="section" className="clq">
      <Card.Head title="To confirm" actions={<Tag tone="warn">{list.length} · {rupees(total)}</Tag>} />
      <Card.Body>
        <p className="small clq__lede">These clients say they’ve paid. Check your UPI app or the gym, then confirm — nothing counts until you do.</p>
        <ul className="clq__list">
          {list.map((c) => (
            <li key={c.id} className="clq__row">
              <div className="clq__who">
                <a className="clq__name" href={`/clients/${c.clientId}/payments`}>{c.clientName}</a>
                <p className="small">
                  <b>{rupees(Number(c.amount))}</b>
                  {' · '}{c.collector === 'gym' ? 'paid at the gym' : 'UPI'}{' · '}{claimDay(c.paidOn, now)}
                  {' · '}{c.packageName ?? 'before a pack was sold'}
                </p>
                {(c.reference || c.note) && (
                  <p className="small clq__more">
                    {c.reference && <>Ref <span className="mono">{c.reference}</span></>}
                    {c.reference && c.note ? ' · ' : ''}
                    {c.note && <>“{c.note}”</>}
                  </p>
                )}
              </div>
              <div className="clq__acts">
                <Button variant="ghost" size="sm" onClick={() => setDeclining(c)}>Not received</Button>
                <Button variant="primary" size="sm" onClick={() => setConfirming(c)}>Confirm</Button>
              </div>
            </li>
          ))}
        </ul>
      </Card.Body>
      {confirming && (
        <ConfirmSheet claim={confirming} onClose={() => setConfirming(null)}
          onDone={(c) => drop(c.id)} onUndone={putBack} />
      )}
      {declining && (
        <DeclineSheet claim={declining} onClose={() => setDeclining(null)}
          onDone={(c) => drop(c.id)} onUndone={putBack} />
      )}
    </Card>
    </div>
  );
}

const METHODS = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
];

function ConfirmSheet({ claim, onClose, onDone, onUndone }: {
  claim: PaymentClaimWire;
  onClose: () => void;
  onDone: (c: PaymentClaimWire) => void;
  onUndone: (c: PaymentClaimWire) => void;
}) {
  const toast = useToast();
  const gym = claim.collector === 'gym';
  const [amount, setAmount] = useState(String(Number(claim.amount)));
  const [method, setMethod] = useState<'upi' | 'cash' | 'bank_transfer'>('upi');
  const [reference, setReference] = useState(claim.reference ?? '');
  const [paidOn, setPaidOn] = useState(claim.paidOn);
  const [today] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [packageId, setPackageId] = useState(claim.packageId ?? '');
  const [packs, setPacks] = useState<PickablePackage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const needsPack = claim.packageId === null;

  // A claim made before any pack: the packs that owe money are the ones it can be recorded against.
  useEffect(() => {
    if (!needsPack) return;
    let off = false;
    void loadPackagesForPanel(claim.clientId).then((r) => {
      if (off) return;
      const owing = r.ok ? r.data.filter((p) => p.amountDue > 0) : [];
      setPacks(owing);
      if (owing.length === 1) setPackageId(owing[0].id);
    });
    return () => { off = true; };
  }, [needsPack, claim.clientId]);

  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0 && (!needsPack || packageId !== '');

  function submit() {
    setError(null);
    const body: Parameters<typeof confirmClaim>[1] = {};
    if (value !== Number(claim.amount)) body.amount = value.toFixed(2);
    if (needsPack) body.packageId = packageId;
    if (!gym) {
      body.method = method;
      body.reference = method === 'cash' ? null : cleanReference(reference);
    }
    if (paidOn !== claim.paidOn) {
      const [y, m, d] = paidOn.split('-').map(Number);
      body.paidAt = new Date(y, m - 1, d, 12).getTime();
    }
    start(async () => {
      const r = await confirmClaim(claim.id, body);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      onDone(claim);
      onClose();
      toast.show({
        tone: 'ok', variant: 'receipt',
        title: <><b>{rupees(value)} confirmed</b> from {claim.clientName}</>,
        action: {
          label: 'Undo',
          onClick: () => {
            void undoConfirm(r.data.paymentId).then((u) => {
              if (u.ok) onUndone(claim);
              else toast.show({ tone: 'danger', title: 'That undo did not go through', body: u.message });
            });
          },
        },
      });
    });
  }

  return (
    <ModalHost onClose={onClose} cover="frame" initialFocus="#clq-amount">
      <Modal
        sheet
        title={`Confirm ${claim.clientName}’s payment`}
        foot={
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!valid || busy} onClick={submit}>{busy ? 'Confirming…' : 'Confirm'}</Button>
          </>
        }
      >
        <p className="small">
          {gym ? 'They say they paid at the gym' : 'They say they paid you'} on {claimDay(claim.paidOn, Date.parse(today))}.
          {' '}Change anything that isn’t how it arrived.
        </p>
        {needsPack && (
          packs === null ? <p className="small mt3">Finding their packs…</p>
            : packs.length === 0 ? (
              <div className="msg msg--warn mt3">
                <span>
                  <b>They paid before a pack was sold.</b> Sell the pack this pays for, then confirm it here.{' '}
                  <a href={`/business/payments?record=${claim.clientId}`}>Sell a pack</a>
                </span>
              </div>
            ) : (
              <Select label="Which pack it pays for" className="mt3" value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
                options={[{ value: '', label: 'Choose a pack' }, ...packs.map((p) => ({ value: p.id, label: `${p.name} · ${rupees(p.amountDue)} owed` }))]} />
            )
        )}
        <AffixField label="Amount received" unit="rupees" affix="₹" id="clq-amount" type="number" min="1" step="1" className="mt3"
          value={amount} onChange={(e) => setAmount(e.target.value)} />
        {!gym && (
          <>
            <Select label="Paid by" className="mt3" value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)} options={METHODS} />
            {method !== 'cash' && (
              <TextField label={<>UPI reference <span className="ink3">· optional</span></>} className="mt3" value={reference}
                maxLength={64} inputMode="numeric" placeholder="12-digit UTR" onChange={(e) => setReference(e.target.value)} />
            )}
          </>
        )}
        {gym && claim.reference && <p className="small mt3">Their receipt reference: <span className="mono">{claim.reference}</span></p>}
        <div className="fld mt3">
          <label className="fld__l" htmlFor="clq-date">Paid on</label>
          <DateField id="clq-date" label="Paid on" block value={paidOn} max={today} onChange={setPaidOn} />
        </div>
        {error && <div className="msg msg--err mt3"><span>{error}</span></div>}
      </Modal>
    </ModalHost>
  );
}

function DeclineSheet({ claim, onClose, onDone, onUndone }: {
  claim: PaymentClaimWire;
  onClose: () => void;
  onDone: (c: PaymentClaimWire) => void;
  onUndone: (c: PaymentClaimWire) => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const r = await declineClaim(claim.id, reason.trim() || null);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      onDone(claim);
      onClose();
      toast.show({
        tone: 'neutral', variant: 'receipt',
        title: <><b>Marked not received</b> — {claim.clientName} will see it</>,
        action: {
          label: 'Undo',
          onClick: () => {
            void reopenClaim(claim.id).then((u) => {
              if (u.ok) onUndone(claim);
              else toast.show({ tone: 'danger', title: 'That undo did not go through', body: u.message });
            });
          },
        },
      });
    });
  }

  return (
    <ModalHost onClose={onClose} cover="frame" initialFocus="#clq-reason">
      <Modal
        title={`Not received from ${claim.clientName}?`}
        foot={
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Mark not received'}</Button>
          </>
        }
      >
        <p className="small">{rupees(Number(claim.amount))} stays owed. {claim.clientName} sees that you haven’t received it yet.</p>
        <TextField id="clq-reason" label={<>Tell them why <span className="ink3">· optional</span></>} className="mt3" value={reason}
          maxLength={280} placeholder="Not in my account yet — can you send the screenshot?" onChange={(e) => setReason(e.target.value)} />
        {error && <div className="msg msg--err mt3"><span>{error}</span></div>}
      </Modal>
    </ModalHost>
  );
}
