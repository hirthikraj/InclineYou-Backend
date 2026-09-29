'use client';

import { useState, useTransition } from 'react';

import { rupees } from '@/lib/today/time';
import { useToast } from '@/lib/toast/store';
import { methodLabel, packName, unusedShare } from '@/lib/clients/billing';
import type { ClientPackageWire, ClientPaymentWire } from '@/lib/clients/client-api';
import { editPayment, refundPack, removePayment, writeOffOwed } from '@/lib/clients/package-actions';

import { num } from './shared';
import { AffixField } from '@/web-components/ui/AffixField';
import { Button } from '@/web-components/ui/Button';
import { TextField } from '@/web-components/ui/Field';
import { Modal, ModalHost } from '@/web-components/ui/Modal';
import { Select } from '@/web-components/ui/Select';

/**
 * THE MONEY BOOK'S CORRECTING WRITES (api-contract 1.1 R73).
 *
 * The schema always held refunds, package-level write-offs and payments
 * recorded by mistake; the contract had no way to write them, so a payment
 * typed wrong could only be left wrong. Four sheets, each a confirm, because
 * every one of them changes what a client is said to owe or to have paid:
 *
 *   · Write off what's owed — forgive a pack's dues, pending rows included
 *   · Refund — money back on a fully paid pack; final, and the pack closes
 *   · Edit — correct a row, only in the fields its status allows
 *   · Delete — a row recorded by mistake; the pack's balance goes back up
 *
 * Each create carries an id minted when the sheet opens, so a retried tap
 * answers the row the first attempt made (Conventions · Ids & retries).
 */

const METHODS = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
];

function useWrite(onDone: () => void, success: (ok: boolean, message?: string) => void) {
  const [busy, start] = useTransition();
  return {
    busy,
    run: (fn: () => Promise<{ ok: boolean; message?: string }>) =>
      start(async () => {
        const r = await fn();
        success(r.ok, r.message);
        if (r.ok) onDone();
      }),
  };
}

/* ── write off what's owed ──────────────────────────────────────────────── */

export function WriteOffOwedSheet({
  clientId,
  pkg,
  onClose,
}: {
  clientId: string;
  pkg: ClientPackageWire;
  onClose: () => void;
}) {
  const toast = useToast();
  const [id] = useState(() => crypto.randomUUID());
  const [note, setNote] = useState('');
  const owed = num(pkg.amountDue);
  const { busy, run } = useWrite(onClose, (ok, message) =>
    toast.show(
      ok
        ? { tone: 'ok', variant: 'receipt', title: `${rupees(owed)} written off`, body: 'The pack keeps running.' }
        : { tone: 'danger', title: 'The write-off did not go through', body: message },
    ),
  );
  return (
    <ModalHost onClose={onClose} cover="frame" initialFocus="#wo-note">
      <Modal
        title={`Write off ${rupees(owed)} on ${packName(pkg)}?`}
        confirm={{
          label: busy ? 'Writing off…' : 'Write it off',
          danger: true,
          onClick: () => run(() => writeOffOwed(clientId, pkg.id, { id, amount: null, note })),
        }}
        cancel={{ label: 'Keep chasing it', onClick: onClose }}
      >
        <p style={{ marginTop: 0 }}>
          Everything still owed on this pack, including any payment you were expecting, stops
          being chased. It is not a payment — it never counts as collected — and nothing is
          deleted. Forgiving money is not ending the deal: the pack keeps its sessions.
        </p>
        <TextField
          label={<>Why <span className="ink3">· optional</span></>}
          id="wo-note"
          className="mt3"
          value={note}
          maxLength={500}
          placeholder="Moved away"
          onChange={(e) => setNote(e.target.value)}
        />
      </Modal>
    </ModalHost>
  );
}

/* ── refund ─────────────────────────────────────────────────────────────── */

export function RefundSheet({
  clientId,
  clientType,
  pkg,
  now,
  onClose,
}: {
  clientId: string;
  clientType: 'independent' | 'gym';
  pkg: ClientPackageWire;
  now: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const gym = clientType === 'gym';
  const [id] = useState(() => crypto.randomUUID());
  const paid = num(pkg.amountPaid);
  /* Pre-filled with the unused share of what was paid; the server only checks
     the bounds (> 0, ≤ what was paid). */
  const [amount, setAmount] = useState(String(unusedShare(pkg, now)));
  const [method, setMethod] = useState('upi');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0 && value <= paid;
  const { busy, run } = useWrite(onClose, (ok, message) =>
    toast.show(
      ok
        ? { tone: 'ok', variant: 'receipt', title: `${rupees(value)} refunded`, body: 'The pack is closed.' }
        : { tone: 'danger', title: 'The refund did not go through', body: message },
    ),
  );
  return (
    <ModalHost onClose={onClose} cover="frame" initialFocus="#rf-amount">
      <Modal
        title={`Refund ${packName(pkg)}`}
        foot={
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button
              variant="danger"
              disabled={!valid || busy}
              onClick={() =>
                run(() =>
                  refundPack(clientId, pkg.id, {
                    id,
                    amount: value.toFixed(2),
                    method: gym ? null : method,
                    reference,
                    note,
                  }),
                )
              }
            >
              {busy ? 'Refunding…' : `Refund ${valid ? rupees(value) : ''}`}
            </Button>
          </>
        }
      >
        <p style={{ marginTop: 0 }}>
          <b>This is final.</b> The pack closes as refunded and never reopens, and the refund
          can&rsquo;t be edited or deleted afterwards. Sessions still booked stay in the diary but
          are no longer charged — cancel them if the client is leaving.
        </p>
        <AffixField
          label="Amount"
          unit="rupees"
          affix="₹"
          id="rf-amount"
          type="number"
          min="1"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint={value > paid ? `${rupees(paid)} is all that was paid.` : 'Pre-filled with the unused share of the pack.'}
        />
        {gym ? (
          <p className="small mt3" style={{ color: 'var(--tx-ink-3)' }}>
            <b>The gym refunds it.</b> It collected, so it pays back.
          </p>
        ) : (
          <>
            <Select label="Paid back by" className="mt3" value={method}
              onChange={(e) => setMethod(e.target.value)} options={METHODS} />
            {method !== 'cash' && (
              <TextField label={<>Reference <span className="ink3">· optional</span></>} className="mt3"
                value={reference} maxLength={64} onChange={(e) => setReference(e.target.value)} />
            )}
          </>
        )}
        <TextField label={<>Why <span className="ink3">· optional</span></>} className="mt3" value={note}
          maxLength={500} placeholder="Moved to Pune" onChange={(e) => setNote(e.target.value)} />
      </Modal>
    </ModalHost>
  );
}

/* ── edit a payment typed wrong ─────────────────────────────────────────── */

/** `yyyy-MM-dd` of an instant, in the browser's calendar — the date input's shape. */
function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function EditPaymentSheet({
  clientId,
  clientType,
  payment,
  onClose,
}: {
  clientId: string;
  clientType: 'independent' | 'gym';
  payment: ClientPaymentWire;
  onClose: () => void;
}) {
  const toast = useToast();
  const gym = clientType === 'gym';
  /* Which fields, by status (contract A7): a write-off is an amount and a note;
     a pending row has no date yet; a refund is never edited. */
  const offRow = payment.status === 'write_off';
  const paidRow = payment.status === 'paid';
  const [amount, setAmount] = useState(String(num(payment.amount)));
  const [method, setMethod] = useState<string>(payment.method ?? 'upi');
  const [reference, setReference] = useState(payment.reference ?? '');
  const [paidOn, setPaidOn] = useState(payment.paidAt ? dayOf(payment.paidAt) : '');
  const [note, setNote] = useState(payment.note ?? '');
  /* The server refuses a future paidAt; the picker stops at today. */
  const [today] = useState(() => dayOf(Date.now()));
  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0;

  /* Only what changed goes out, so a correction to the amount cannot clobber a
     note someone else fixed a minute ago — and If-Match catches the rest. */
  function patch() {
    const out: { amount?: string; method?: string | null; reference?: string | null; paidAt?: number; note?: string | null } = {};
    if (value !== num(payment.amount)) out.amount = value.toFixed(2);
    if (!offRow && !gym && method !== payment.method) out.method = method;
    const ref = method === 'cash' ? null : reference.trim() || null;
    if (!offRow && !gym && ref !== payment.reference) out.reference = ref;
    if (paidRow && paidOn && paidOn !== dayOf(payment.paidAt ?? 0)) {
      const [y, m, d] = paidOn.split('-').map(Number);
      out.paidAt = new Date(y, m - 1, d, 12).getTime();
    }
    if ((note.trim() || null) !== (payment.note ?? null)) out.note = note.trim() || null;
    return out;
  }

  const { busy, run } = useWrite(onClose, (ok, message) =>
    toast.show(
      ok
        ? { tone: 'ok', variant: 'receipt', title: 'Payment corrected' }
        : { tone: 'danger', title: 'That correction did not go through', body: message },
    ),
  );

  return (
    <ModalHost onClose={onClose} cover="frame" initialFocus="#ep-amount">
      <Modal
        title={`Correct ${rupees(num(payment.amount))}`}
        foot={
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!valid || busy}
              onClick={() => {
                const body = patch();
                if (Object.keys(body).length === 0) return onClose();
                run(() => editPayment(clientId, payment.id, body, payment.version));
              }}
            >
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <AffixField label="Amount" unit="rupees" affix="₹" id="ep-amount" type="number" min="1" step="1"
          value={amount} onChange={(e) => setAmount(e.target.value)}
          hint="Money against the wrong pack is deleted and recorded again — a payment's pack never moves." />
        {!offRow && !gym && (
          <>
            <Select label="Paid by" className="mt3" value={method}
              onChange={(e) => setMethod(e.target.value)} options={METHODS} />
            {method !== 'cash' && (
              <TextField label="Reference" className="mt3" value={reference} maxLength={64}
                onChange={(e) => setReference(e.target.value)} />
            )}
          </>
        )}
        {!offRow && gym && (
          <p className="small mt3" style={{ color: 'var(--tx-ink-3)' }}>Collected by the gym — no method to correct.</p>
        )}
        {paidRow && (
          <div className="fld mt3">
            <label className="fld__l" htmlFor="ep-date">Paid on</label>
            <input className="ctl" id="ep-date" type="date" value={paidOn} max={today}
              onChange={(e) => setPaidOn(e.target.value)} />
          </div>
        )}
        <TextField label={<>Note <span className="ink3">· optional</span></>} className="mt3" value={note}
          maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </Modal>
    </ModalHost>
  );
}

/* ── delete one recorded by mistake ─────────────────────────────────────── */

export function DeletePaymentSheet({
  clientId,
  payment,
  onClose,
}: {
  clientId: string;
  payment: ClientPaymentWire;
  onClose: () => void;
}) {
  const toast = useToast();
  const { busy, run } = useWrite(onClose, (ok, message) =>
    toast.show(
      ok
        ? { tone: 'ok', variant: 'receipt', title: `${rupees(num(payment.amount))} deleted` }
        : { tone: 'danger', title: 'That payment was not deleted', body: message },
    ),
  );
  return (
    <ModalHost onClose={onClose} cover="frame">
      <Modal
        title={`Delete ${rupees(num(payment.amount))}${payment.method ? ` by ${methodLabel(payment.method)}` : ''}?`}
        confirm={{
          label: busy ? 'Deleting…' : 'Delete it',
          danger: true,
          onClick: () => run(() => removePayment(clientId, payment.id)),
        }}
        cancel={{ label: 'Keep it', onClick: onClose }}
      >
        For a payment recorded by mistake. It leaves the ledger and every total, and the
        pack&rsquo;s balance goes back up by the same amount. If the money did move and the
        figure is wrong, correct it instead.
      </Modal>
    </ModalHost>
  );
}
