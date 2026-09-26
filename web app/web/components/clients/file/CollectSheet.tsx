'use client';

import { useState, useTransition } from 'react';

import { markPaid, recordPayment } from '@/lib/money/actions';
import { rupees } from '@/lib/today/time';
import { useToast } from '@/lib/toast/store';
import { methodLabel } from '@/lib/clients/billing';
import type { ClientPackageWire, ClientPaymentWire } from '@/lib/clients/client-api';

import { num } from './shared';
import { AffixField } from '@/web-components/ui/AffixField';
import { Button } from '@/web-components/ui/Button';
import { Modal, ModalHost } from '@/web-components/ui/Modal';
import { Select } from '@/web-components/ui/Select';
import { TextField } from '@/web-components/ui/Field';

/**
 * MONEY IN, FROM THE SCREEN THE TRAINER IS ALREADY ON.
 *
 * The Payments tab shipped read-only. It could show ₹6,400 six days overdue and
 * offer nothing at all to do about it: the one button on the tab was *Sell a
 * pack*, and it rendered only for a client with no pack, so the tab was mute
 * for exactly the client it was most urgent for. Everything needed already
 * existed one screen away, in the money book — `recordPayment`, `markPaid`, and
 * a panel nobody could reach from here.
 *
 * ── ONE SHEET, TWO JOBS, BECAUSE THEY ARE ONE QUESTION ──────────────────────
 *
 * *Settle this invoice* and *record a payment against the pack* are the same
 * three questions — how much, how, and what reference — and the only difference
 * is whether a `pending` row already exists to attach the answer to. So the
 * sheet takes an optional `settling` row and picks the writer:
 *
 *   settling  →  `markPaid`       the row becomes paid, and the server stamps
 *                                 the gym's cut at that instant
 *   otherwise →  `recordPayment`  a new row against the pack
 *
 * Two sheets would have been two copies of a money form, and the second one
 * written is the one that forgets to ask for the method — which is exactly the
 * defect `markPaid`'s own docstring is written against: a confirmed row with
 * `method = null` draws an em-dash where *how did they pay me* should be.
 *
 * ── THE AMOUNT IS PRE-FILLED AND STILL EDITABLE ─────────────────────────────
 *
 * Part payments are normal — half now, half at the end of the month — and a
 * form that hard-codes the balance makes the common case one tap and the real
 * case impossible. The balance is the default because it is right most of the
 * time, not because it is the only allowed answer.
 *
 * ── AND *GYM FRONT OFFICE* IS A METHOD, NOT A CHOICE ABOUT THE SPLIT ────────
 *
 * Picking it sets `collectedBy: 'gym'`, which is what makes the server stamp
 * the 30%. It is offered only where there IS a gym on the profile: a
 * `collectedBy` of `gym` on an independent trainer's book is a cut of nothing,
 * recorded against nobody.
 */

const METHODS = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank transfer' },
] as const;

export function CollectSheet({
  pkg,
  settling,
  clientName,
  gymName,
  onClose,
}: {
  /** The pack the money is against. */
  pkg: ClientPackageWire;
  /** The pending row being settled, or null to write a fresh one. */
  settling: ClientPaymentWire | null;
  clientName: string;
  /** The gym on the trainer's profile, or null. Decides one option. */
  gymName: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [busy, startWrite] = useTransition();

  const owed = settling
    ? num(settling.amount)
    : pkg.amountDue != null
      ? num(pkg.amountDue)
      : Math.max(0, num(pkg.amount) - num(pkg.amountPaid));

  const [amount, setAmount] = useState(owed > 0 ? String(owed) : '');
  const [method, setMethod] = useState<string>('upi');
  const [reference, setReference] = useState('');

  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0;
  const first = clientName.split(' ')[0];

  /* A reference exists for a transfer and cannot exist for cash — the seed
     refuses to stamp one on a cash row for the same reason, and a cash payment
     carrying a UPI reference is a row nobody can reconcile. */
  const wantsReference = method === 'upi' || method === 'bank';

  function submit() {
    if (!valid) return;
    startWrite(async () => {
      const result = settling
        ? await markPaid(settling.id, {
            method,
            ...(reference.trim() ? { upiReference: reference.trim() } : {}),
          })
        : await recordPayment({
            packageId: pkg.id,
            amount: value,
            method,
            collectedBy: method === 'gym' ? 'gym' : 'trainer',
            paidAt: Date.now(),
            ...(reference.trim() ? { upiReference: reference.trim() } : {}),
          });

      if (result.ok) {
        toast.show({
          tone: 'ok',
          variant: 'receipt',
          title: `${rupees(value)} from ${first}`,
          /* `methodLabel`, not the raw value and not a lower-cased label. The
             first version printed *paid by upi* - the enum, in a sentence, on
             the one line confirming money moved. `UPI` is an initialism and
             `Cash` is a word; one map decides both, and the same map draws the
             ledger's own column. */
          body: `Paid by ${methodLabel(method) ?? method}.`,
        });
        onClose();
      } else {
        toast.show({
          tone: 'danger',
          title: 'That payment was not recorded',
          body: result.message ?? 'Nothing changed.',
        });
      }
    });
  }

  return (
    <ModalHost onClose={onClose} cover="frame" initialFocus="#cs-amount">
      <Modal
        title={settling ? `Settle ${rupees(owed)}` : `Record a payment from ${first}`}
        foot={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={!valid || busy}>
              {busy ? 'Recording…' : settling ? 'Mark it paid' : 'Record it'}
            </Button>
          </>
        }
      >
        <AffixField
          label="Amount"
          unit="rupees"
          affix="₹"
          id="cs-amount"
          type="number"
          min="1"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint={
            owed > 0 && value > 0 && value < owed
              ? `${rupees(owed - value)} will still be outstanding on this pack.`
              : owed > 0
                ? `${rupees(owed)} is outstanding.`
                : 'Nothing is outstanding on this pack — this will be recorded on top.'
          }
        />

        <Select
          label="Paid by"
          className="mt3"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          options={[
            ...METHODS.map((m) => ({ value: m.value, label: m.label })),
            ...(gymName ? [{ value: 'gym', label: `${gymName} front office` }] : []),
          ]}
        />

        {wantsReference && (
          <TextField
            label="Reference"
            className="mt3"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="UPI483920117"
            hint="The bank's own reference. Optional, and the one thing a client can quote back at you."
          />
        )}
      </Modal>
    </ModalHost>
  );
}
