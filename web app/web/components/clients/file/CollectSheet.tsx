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
 * ── THE AMOUNT IS PRE-FILLED AND CAPPED ─────────────────────────────────────
 *
 * Part payments are normal — half now, half at the end of the month — so the
 * amount is editable. What it cannot be is more than is owed: v1 has no credit
 * balance, so the server refuses an overpayment (409 PAYMENT_OVER_DUE, R26) and
 * the sheet says "₹X is all that's owed on this pack" before it is asked. An
 * advance for the next pack is recorded by selling that pack first.
 *
 * ── AND WHO COLLECTED IS NOT A CHOICE ───────────────────────────────────────
 *
 * The database stamps `collectedBy` from the client's type and freezes it
 * (R75). For a gym client the sheet shows *Gym collected* read-only and sends
 * no method; for an independent one it asks how.
 */

const METHODS = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
] as const;

export function CollectSheet({
  pkg,
  settling,
  clientName,
  clientType,
  onClose,
}: {
  /** The pack the money is against. */
  pkg: ClientPackageWire;
  /** The pending row being settled, or null to write a fresh one. */
  settling: ClientPaymentWire | null;
  clientName: string;
  clientType: 'independent' | 'gym';
  onClose: () => void;
}) {
  const toast = useToast();
  const [busy, startWrite] = useTransition();
  const gym = clientType === 'gym';

  /* Minted when the sheet opens, kept across retries — a retried tap answers
     the payment the first one recorded. */
  const [paymentId] = useState(() => crypto.randomUUID());

  const due = num(pkg.amountDue);
  const owed = settling ? num(settling.amount) : due;

  const [amount, setAmount] = useState(owed > 0 ? String(owed) : '');
  const [method, setMethod] = useState<string>(settling?.method ?? 'upi');
  const [reference, setReference] = useState(settling?.reference ?? '');
  /* Money expected but not in hand yet — a UPI request sent, a promise for
     Friday. It is still owed until it is marked paid. */
  const [awaiting, setAwaiting] = useState(false);

  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0 && (settling !== null || value <= due);
  const first = clientName.split(' ')[0];

  /* A reference exists for a transfer and cannot exist for cash. */
  const wantsReference = !gym && (method === 'upi' || method === 'bank_transfer');

  function submit() {
    if (!valid) return;
    startWrite(async () => {
      const how = gym ? null : method;
      const ref = wantsReference && reference.trim() ? reference.trim() : undefined;
      const result = settling
        ? await markPaid(settling.id, { method: how, ...(ref ? { upiReference: ref } : {}) })
        : await recordPayment({
            id: paymentId,
            packageId: pkg.id,
            amount: value,
            method: how,
            ...(awaiting ? {} : { paidAt: Date.now() }),
            ...(ref ? { upiReference: ref } : {}),
          });

      if (result.ok) {
        toast.show({
          tone: 'ok',
          variant: 'receipt',
          title: awaiting ? `${rupees(value)} expected from ${first}` : `${rupees(value)} from ${first}`,
          /* `methodLabel`, not the raw value — *paid by upi* is the enum in a sentence. */
          body: gym ? 'Collected by the gym.' : awaiting ? 'Still owed until you mark it paid.' : `Paid by ${methodLabel(how) ?? how}.`,
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
        title={settling ? `Settle ${rupees(owed)}` : `Take a payment from ${first}`}
        foot={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={!valid || busy}>
              {busy ? 'Recording…' : settling ? 'Mark it paid' : awaiting ? 'Record it as expected' : 'Record it'}
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
          inputMode="numeric"
          min="1"
          step="1"
          value={amount}
          disabled={settling !== null}
          onChange={(e) => setAmount(e.target.value)}
          hint={
            settling
              ? 'The amount that was expected. Correct it from the row menu if it was different.'
              : due <= 0
                ? 'Nothing is owed on this pack. An advance is recorded by selling the next pack first.'
                : value > due
                  ? `${rupees(due)} is all that's owed on this pack.`
                  : value > 0 && value < due
                    ? `${rupees(due - value)} will still be owed on this pack.`
                    : `${rupees(due)} is owed.`
          }
        />

        {gym ? (
          <p className="small mt3" style={{ color: 'var(--tx-ink-3)' }}>
            <b>Gym collected.</b> {first} pays at the gym&rsquo;s desk, so there is no method to pick.
          </p>
        ) : (
          <Select
            label="Paid by"
            className="mt3"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            options={METHODS.map((m) => ({ value: m.value, label: m.label }))}
          />
        )}

        {wantsReference && (
          <TextField
            label="Reference"
            className="mt3"
            value={reference}
            maxLength={64}
            onChange={(e) => setReference(e.target.value)}
            placeholder="UPI483920117"
            hint="The bank's own reference. Optional, and the one thing a client can quote back at you."
          />
        )}

        {!settling && (
          <label className="small mt3 cs__await" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={awaiting} onChange={(e) => setAwaiting(e.target.checked)} />
            Not received yet — record it as expected
          </label>
        )}
      </Modal>
    </ModalHost>
  );
}
