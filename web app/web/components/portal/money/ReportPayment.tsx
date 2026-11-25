'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { reportPayment, withdrawReport } from '@/lib/claims/actions';
import { newId } from '@/lib/ids';
import { claimDay, cleanReference, type PaymentClaimWire } from '@/lib/claims/types';
import { AffixField } from '@/web-components/ui/AffixField';
import { Button } from '@/web-components/ui/Button';
import { DateField } from '@/web-components/ui/DateField';
import { TextField } from '@/web-components/ui/Field';
import { Modal, ModalHost } from '@/web-components/ui/Modal';
import { Select } from '@/web-components/ui/Select';
import { Tag } from '@/web-components/ui/Tag';

/**
 * "I'VE PAID" — the client's half (V50; pm-a1, pm-a2).
 *
 * The client paid by UPI (or at the gym's desk) and says so: which pack (or none, if they paid before one was sold), how
 * much, the day, and the UPI reference if they have it — optional, because plenty of people pay and close the app. It
 * changes nothing owed: the trainer confirms it, and the screen says so in those words. Neutral throughout, the money
 * screen's rule: no red, no nudge, nothing that reads as a demand.
 */

export interface OwedPack {
  packageId: string;
  name: string;
  amountDue: string;
  dueDate?: string;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount);
}

export function ReportPaymentButton({
  owed,
  partPayments,
  gymName,
  trainerFirstName,
  currency,
  openOnArrival,
  waitingByPack,
}: {
  owed: OwedPack[];
  partPayments: boolean;
  /** A gym client pays the gym's desk. */
  gymName: string | null;
  trainerFirstName: string;
  currency: string;
  /** `?report=1` — Home's *I've paid* lands on an open sheet. */
  openOnArrival: boolean;
  /** What other open reports already say was paid on each pack, so the default amount is what is really left. */
  waitingByPack: Record<string, number>;
}) {
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(openOnArrival);

  // A one-shot parameter is stripped once read, or pressing Home's button again is a navigation to the same URL (trap 26).
  useEffect(() => {
    if (openOnArrival) router.replace(path, { scroll: false });
  }, [openOnArrival, path, router]);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>I’ve paid</Button>
      {open && (
        <ReportSheet owed={owed} partPayments={partPayments} gymName={gymName} trainerFirstName={trainerFirstName}
          currency={currency} waitingByPack={waitingByPack} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function ReportSheet({ owed, partPayments, gymName, trainerFirstName, currency, waitingByPack, onClose }: {
  owed: OwedPack[];
  partPayments: boolean;
  gymName: string | null;
  trainerFirstName: string;
  currency: string;
  waitingByPack: Record<string, number>;
  onClose: () => void;
}) {
  const router = useRouter();
  // Minted once per opening and kept across retries: a double tap, or a retry after a timeout, is one report.
  const [id] = useState(() => newId());
  const [max] = useState(today);
  const left = (p: OwedPack) => Math.max(0, Number(p.amountDue) - (waitingByPack[p.packageId] ?? 0));
  const [packageId, setPackageId] = useState(owed.length === 1 ? owed[0].packageId : owed.length === 0 ? '' : owed[0].packageId);
  const pack = owed.find((p) => p.packageId === packageId) ?? null;
  const [amount, setAmount] = useState(() => (pack ? String(left(pack)) : ''));
  const [paidOn, setPaidOn] = useState(max);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, start] = useTransition();

  const value = Number(amount);
  const room = pack ? left(pack) : null;
  const wholeOnly = pack !== null && !partPayments;
  const valid = Number.isFinite(value) && value > 0 && (room === null || value <= room) && (!wholeOnly || value === room);

  function pick(next: string) {
    setPackageId(next);
    const p = owed.find((x) => x.packageId === next);
    setAmount(p ? String(left(p)) : '');
  }

  function submit() {
    setError(null);
    start(async () => {
      const r = await reportPayment({
        id, packageId: packageId || null, amount: value.toFixed(2), paidOn,
        reference: cleanReference(reference), note: note.trim() || null,
      });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  if (done) {
    return (
      <ModalHost onClose={onClose} cover="frame">
        <Modal title="Sent to your trainer" foot={<Button variant="primary" onClick={onClose}>Done</Button>}>
          <p>{trainerFirstName} will check it {gymName ? `with ${gymName}` : 'in their UPI app'} and confirm it. It shows as waiting until then.</p>
        </Modal>
      </ModalHost>
    );
  }

  return (
    <ModalHost onClose={onClose} cover="frame" initialFocus="#rp-amount">
      <Modal
        sheet
        title={gymName ? `I paid at ${gymName}` : `I paid ${trainerFirstName}`}
        foot={
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!valid || busy} onClick={submit}>{busy ? 'Sending…' : 'Send'}</Button>
          </>
        }
      >
        <p className="small ink2">{trainerFirstName} confirms it once it arrives — nothing changes until then.</p>
        {owed.length > 1 && (
          <Select label="What it was for" className="mt3" value={packageId} onChange={(e) => pick(e.target.value)}
            options={[
              ...owed.map((p) => ({ value: p.packageId, label: `${p.name} · ${money(left(p), currency)} left` })),
              { value: '', label: 'Something new — not one of these' },
            ]} />
        )}
        {owed.length === 1 && <p className="small mt3">For <b>{owed[0].name}</b> · {money(left(owed[0]), currency)} left</p>}
        {owed.length === 0 && <p className="small mt3">Nothing is owed right now, so this goes to {trainerFirstName} as an advance for your next pack.</p>}
        <AffixField label="Amount you paid" unit="rupees" affix="₹" id="rp-amount" type="number" min="1" step="1" className="mt3"
          value={amount} onChange={(e) => setAmount(e.target.value)} disabled={wholeOnly}
          hint={wholeOnly ? `${trainerFirstName} takes the whole of it in one go.` : room !== null && value > room ? `${money(room, currency)} is all that’s left on this pack.` : undefined} />
        <div className="fld mt3">
          <label className="fld__l" htmlFor="rp-date">Paid on</label>
          <DateField id="rp-date" label="Paid on" block value={paidOn} max={max} onChange={setPaidOn} />
        </div>
        <TextField className="mt3" label={<>{gymName ? 'Receipt number' : 'UPI reference'} <span className="ink3">· optional</span></>}
          value={reference} maxLength={64} inputMode={gymName ? 'text' : 'numeric'} placeholder={gymName ? 'From the gym’s receipt' : '12-digit UTR from your UPI app'}
          onChange={(e) => setReference(e.target.value)} />
        <TextField className="mt3" label={<>Note <span className="ink3">· optional</span></>} value={note} maxLength={280}
          placeholder="Paid on GPay" onChange={(e) => setNote(e.target.value)} />
        {error && <div className="msg msg--err mt3"><span>{error}</span></div>}
      </Modal>
    </ModalHost>
  );
}

const STATE: Record<PaymentClaimWire['status'], { label: string; tone: 'neutral' | 'ok' | 'warn' | 'info' }> = {
  open: { label: 'Waiting to be confirmed', tone: 'info' },
  confirmed: { label: 'Confirmed', tone: 'ok' },
  declined: { label: 'Not received yet', tone: 'warn' },
  withdrawn: { label: 'Taken back', tone: 'neutral' },
};

/** The client's reports — waiting, and those decided in the last 30 days. A waiting one can be taken back. */
export function ReportList({ claims, currency, trainerFirstName, now }: {
  claims: PaymentClaimWire[];
  currency: string;
  trainerFirstName: string;
  now: number;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const shown = claims.filter((c) => c.status !== 'withdrawn');
  if (shown.length === 0) return null;
  return (
    <ul className="pl__list pclm">
      {shown.map((c) => {
        const st = STATE[c.status];
        return (
          <li key={c.id} className="pclm__row">
            <div>
              <p className="pl__t">{money(Number(c.amount), currency)}</p>
              <p className="pl__s">{claimDay(c.paidOn, now)} · {c.packageName ?? 'advance'}{c.reference ? ` · ${c.reference}` : ''}</p>
              {c.status === 'declined' && (
                <p className="pl__s">{trainerFirstName}: {c.declineReason ? `“${c.declineReason}”` : 'hasn’t received it yet. Check with them.'}</p>
              )}
            </div>
            <div className="pl__tags">
              <Tag tone={st.tone}>{st.label}</Tag>
              {c.status === 'open' && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => start(async () => {
                  setError(null);
                  const r = await withdrawReport(c.id);
                  if (!r.ok) setError(r.message ?? 'That didn’t go through.');
                  else router.refresh();
                })}>Take back</Button>
              )}
            </div>
          </li>
        );
      })}
      {error && <li><div className="msg msg--err"><span>{error}</span></div></li>}
    </ul>
  );
}
