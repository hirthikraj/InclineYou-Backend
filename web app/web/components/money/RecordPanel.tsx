'use client';

import { useEffect, useState, useTransition } from 'react';

import { loadClientsForPanel, loadPackagesForPanel } from '@/lib/business/actions';
import type { PickableClient, PickablePackage } from '@/lib/business/types';
import { recordPayment, type MoneyWriteResult } from '@/lib/money/actions';
import { rupees } from '@/lib/today/time';
import { Checkbox } from '@/web-components/ui/Checkbox';
import { useDismiss } from '@/lib/ui/dismiss';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Chip } from '@/web-components/ui/Chip';
import { Field, TextField } from '@/web-components/ui/Field';
import { KeyValueRow } from '@/web-components/ui/KeyValue';
import { Why } from '@/web-components/ui/Why';

/**
 * RECORD PAYMENT — a side panel, and it reads its own data.
 *
 * ── IT NO LONGER BORROWS THE PAGE'S BOOK ─────────────────────────────────────
 *
 * It used to be handed every client and every package the trainer had, and worked
 * the gym's cut out from ONE trainer-wide percentage. Both are gone. The panel
 * asks for the client list when it opens and for a client's packages when one is
 * chosen, so the page behind it holds a screenful and not the book.
 *
 * ── THE SPLIT COMES FROM THE PACKAGE, NEVER FROM A TYPED PERCENTAGE ──────────
 *
 * On a gym package the trainer's cut varies with the price — it is a percentage OR
 * a flat amount set on each package — so there is no single rate to multiply by.
 * Once a package is chosen, the panel shows what THAT package's own share makes of
 * the amount in the box: gym = amount − trainer share, derived and never typed. A
 * package with no share (an independent client\'s) shows no split at all, because
 * the trainer keeps all of it and a card saying so is noise.
 *
 * ── AND THE WAY IT WAS COLLECTED FOLLOWS THE CLIENT ──────────────────────────
 *
 * A gym client\'s money goes through the gym\'s front office, so there is no
 * method to pick and none is sent; the database stamps `collected_by` from the
 * client\'s type. An independent client\'s offers UPI, cash and bank, and no *Gym
 * front office* chip — which used to be offered to everyone, and recorded a
 * trainer-collected payment against a client who owed the gym.
 */

interface Props {
  initialClientId?: string | null;
  onClose: () => void;
  /** After a payment is saved: the page behind re-reads itself. */
  onRecorded: () => void;
}

type Method = 'upi' | 'cash' | 'bank';

const METHOD_LABEL: Record<Method, string> = {
  upi: 'UPI to me',
  cash: 'Cash',
  bank: 'Bank transfer',
};

function localDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function paidAtFor(dateStr: string, now: number): number {
  if (dateStr === localDate(now)) return now;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return now;
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
}

/** The trainer\'s fraction of a package\'s price, or null when the package has no share (all of it is theirs). */
function trainerRatio(p: PickablePackage): number | null {
  if (p.trainerSharePercent !== null) return p.trainerSharePercent / 100;
  if (p.trainerShareAmount !== null && p.amount > 0) return Math.min(1, p.trainerShareAmount / p.amount);
  return null;
}

export function RecordPanel({ initialClientId = null, onClose, onRecorded }: Props) {
  const { closing, dismiss, dismissThen, ref: panelRef } = useDismiss<HTMLElement>(onClose);

  const [clients, setClients] = useState<PickableClient[] | null>(null);
  const [clientsFailed, setClientsFailed] = useState<string | null>(null);
  /* One client's packages at a time, tagged with whose they are so a slow answer
     for the PREVIOUS choice can never be drawn under the current one. */
  const [loaded, setLoaded] = useState<{ clientId: string; packages: PickablePackage[] } | null>(null);
  const [packagesFailed, setPackagesFailed] = useState<string | null>(null);

  const [clientId, setClientId] = useState(initialClientId ?? '');
  const [packageId, setPackageId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('upi');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [today] = useState(() => localDate(Date.now()));
  const [paidOn, setPaidOn] = useState(today);
  const [awaiting, setAwaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /* A package is billable when it is running or still owes — a finished pack can
     still be owed for. The server's `amountDue` is the only measure of "owes". */
  const fetchPackages = (id: string) => {
    void loadPackagesForPanel(id).then((res) => {
      if (!res.ok) { setPackagesFailed(res.message); return; }
      setLoaded({ clientId: id, packages: res.data });
      /* The one-package case is the common one: a client on a single running pack
         has nothing to choose, so it is chosen and the amount is what is owed. */
      if (res.data.length === 1) {
        setPackageId(res.data[0].id);
        setAmount(res.data[0].amountDue > 0 ? String(res.data[0].amountDue) : '');
      }
    });
  };

  useEffect(() => {
    void loadClientsForPanel().then((res) => {
      if (res.ok) setClients(res.data);
      else setClientsFailed(res.message);
    });
    if (initialClientId) fetchPackages(initialClientId);
    // Once, on open — `fetchPackages` only closes over setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedClient = clients?.find((c) => c.id === clientId);
  const isGymClient = selectedClient?.clientType === 'gym';
  const clientPackages = loaded?.clientId === clientId ? loaded.packages : null;
  const selectedPackage = clientPackages?.find((p) => p.id === packageId);

  const amountNum = parseFloat(amount) || 0;
  const ratio = selectedPackage ? trainerRatio(selectedPackage) : null;
  const yours = ratio === null ? amountNum : Math.round(amountNum * ratio);
  const gymCut = amountNum - yours;
  const hasSplit = ratio !== null;

  const handleClientChange = (id: string) => {
    setClientId(id);
    setPackageId('');
    setAmount('');
    setReference('');
    setNote('');
    setLoaded(null);
    setPackagesFailed(null);
    if (id) fetchPackages(id);
  };

  const handlePackageChange = (id: string) => {
    setPackageId(id);
    const pkg = clientPackages?.find((p) => p.id === id);
    setAmount(pkg && pkg.amountDue > 0 ? String(pkg.amountDue) : '');
  };

  /* The way it came in. A gym client has none to choose: the front office took it. */
  const sentMethod: Method | null = isGymClient ? null : method;
  const showAwaiting = isGymClient || method === 'upi' || method === 'bank';
  const isAwaiting = showAwaiting && awaiting;

  const handleSave = () => {
    if (!packageId) { setError('Select a package first.'); return; }
    if (!amountNum || amountNum <= 0) { setError('Enter a valid amount.'); return; }

    setError(null);
    startTransition(async () => {
      const result: MoneyWriteResult = await recordPayment({
        packageId,
        amount: amountNum,
        method: sentMethod,
        /* A payment that has not arrived is recorded `pending` — no `paidAt` —
           and is settled later from its row. */
        paidAt: isAwaiting ? undefined : paidAtFor(paidOn, Date.now()),
        upiReference: sentMethod && sentMethod !== 'cash' ? reference || undefined : undefined,
        note: note || undefined,
      });
      if (result.ok) {
        onRecorded();
        dismissThen(onClose);
      } else {
        setError(result.message ?? 'Something went wrong.');
      }
    });
  };

  return (
    /* `.rp-panel` and NOT a `style` attribute, which is what this was. An inline
       `width:420` outranks every selector including a media query, so the sheet
       rule app.css writes for this panel could never have applied and at 390px
       the form rendered 30px off the left edge of the screen. The class carries
       the same four declarations at a desk; app.css's own block is where the
       phone re-decides them. */
    <>
    <button
      className={`scrim scrim--soft${closing ? ' scrim--out' : ''}`}
      type="button"
      aria-label="Close panel"
      onClick={dismiss}
    />
    <aside
      ref={panelRef}
      className={`panel rp-panel${closing ? ' panel--out' : ''}`}
      role="dialog"
      aria-label="Record payment"
    >
      <div className="panel__hd">
        <span className="panel__t">Record payment</span>
        <span style={{ flex: 1 }} />
        <button className="btn btn--icon btn--ghost" type="button" aria-label="Close" onClick={dismiss}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div className="panel__body">
        {/* Client picker */}
        <Field
          label="Client"
          id="rp-client"
        >
          {(a) => (
            <select className="ctl" {...a} value={clientId} onChange={(e) => handleClientChange(e.target.value)}>
            <option value="">Select a client…</option>
            {(clients ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.clientType === 'gym' ? ' · gym client' : ''}</option>
            ))}
          </select>
          )}
        </Field>
        {clientsFailed && <p className="msg msg--err" style={{ marginTop: 6 }}><span>{clientsFailed}</span></p>}

        {/* Package picker */}
        {clientId && (
          <div className="fld mt3">
            <label className="fld__l" htmlFor="rp-package">Package</label>
            {packagesFailed ? (
              <p className="msg msg--err" style={{ marginTop: 4 }}><span>{packagesFailed}</span></p>
            ) : clientPackages === null ? (
              <p className="small" style={{ color: 'var(--tx-ink-3)', marginTop: 4 }}>Loading their packages…</p>
            ) : clientPackages.length === 0 ? (
              <p className="small" style={{ color: 'var(--tx-ink-3)', marginTop: 4 }}>
                Nothing to record against {selectedClient?.name} — no pack running
                and nothing pending on the ones that finished. Sell a pack from
                their file first.
              </p>
            ) : (
              <select
                className="ctl"
                id="rp-package"
                value={packageId}
                onChange={(e) => handlePackageChange(e.target.value)}
              >
                <option value="">Select a package…</option>
                {clientPackages.map((p) => {
                  /* A closed pack in this list is here for its balance, so it says
                     what it owes rather than how many sessions it has left — the
                     answer to which is nought, and unhelpful. */
                  const tail =
                    p.status === 'active'
                      ? `${p.sessionsRemaining ?? '?'} left`
                      : `finished · ${rupees(p.amountDue)} still pending`;
                  const label = `${p.name} · ${rupees(p.amount)} · ${tail}`;
                  return <option key={p.id} value={p.id}>{label}</option>;
                })}
              </select>
            )}
          </div>
        )}

        {/* Amount */}
        {packageId && (
          <div className="fld mt3">
            <label className="fld__l" htmlFor="rp-amount">Amount</label>
            <div className="affix">
              <span className="affix__p">₹</span>
              <input
                className="ctl ctl--num"
                id="rp-amount"
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={selectedPackage ? String(selectedPackage.amountDue) : '0'}
              />
            </div>
            {selectedPackage && amountNum > 0 && amountNum < selectedPackage.amountDue && (
              <p className="msg msg--warn" style={{ marginTop: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                {/* The BALANCE minus this payment, not the sticker price minus it.
                    A client paying the third instalment of four was told they still
                    owed the whole pack less that instalment, which is the figure
                    they cleared two payments ago. Partial payment is the normal
                    case in this business and the panel has to count it. */}
                <span>{rupees(selectedPackage.amountDue - amountNum)} will still be pending</span>
              </p>
            )}
            {selectedPackage && amountNum > selectedPackage.amountDue && (
              <p className="msg msg--err" style={{ marginTop: 6 }}>
                {/* The database caps a package at its price, so this would be refused —
                    said here, where it can be fixed, rather than after the press. */}
                <span>
                  {selectedPackage.amountDue > 0
                    ? `Only ${rupees(selectedPackage.amountDue)} is owed on this package.`
                    : 'Nothing is owed on this package.'}
                </span>
              </p>
            )}
          </div>
        )}

        {/* Payment method — only for a client who pays the trainer directly. */}
        {packageId && !isGymClient && (
          <div className="mt3">
            <p className="fld__l" style={{ marginBottom: 8 }}>How</p>
            <div
              className="row gap2"
              role="group"
              aria-label="How the money came in"
              style={{ flexWrap: 'wrap' }}
            >
              {(['upi', 'cash', 'bank'] as Method[]).map((m) => (
                <Chip pressed={method === m} key={m} onClick={() => setMethod(m)}>
                  {METHOD_LABEL[m]}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {packageId && isGymClient && (
          <p className="small mt3" style={{ color: 'var(--tx-ink-3)' }}>
            {selectedClient?.name} pays the gym&#8217;s front office, so there is no method to pick —
            this records that the gym has the money.
          </p>
        )}

        {/* When it arrived, and whether it has.

            The date is drawn with the method rather than at the top of the form
            because it is the field that is almost always already right: today is
            the answer nine times in ten, and a control that opens correct costs
            nothing to skip. It writes `paid_at`. */}
        {packageId && (
          <div className="fld mt3">
            <label className="fld__l" htmlFor="rp-date">
              {isAwaiting ? 'Requested on' : 'Received on'}
            </label>
            <input
              className="ctl"
              id="rp-date"
              type="date"
              value={paidOn}
              max={today}
              onChange={(e) => setPaidOn(e.target.value)}
              disabled={isAwaiting}
            />
            {/* No future dates: the server clamps a forward-dated payment to now
                anyway, and a field that silently rewrites what you typed is
                worse than one that would not take it. */}
          </div>
        )}

        {showAwaiting && packageId && (
          /* `ui/Checkbox`, not a hand-built label. The input here carried NO
             class at all, so `.check` never applied and the UA painted its own
             blue box — the design system's lime one was two lines away in the
             same stylesheet and unreachable. Reported from a screenshot. */
          <Checkbox
            className="mt3"
            align="start"
            checked={awaiting}
            onChange={(e) => setAwaiting(e.target.checked)}
            label={
              <>
                <b>The money has not arrived yet.</b> It shows under <i>Pending</i>
                until you confirm it.
              </>
            }
          />
        )}

        {/* Reference — UPI and bank both have one worth keeping */}
        {!isGymClient && (method === 'upi' || method === 'bank') && packageId && (
          <div className="fld mt3">
            <label className="fld__l" htmlFor="rp-ref">
              {method === 'bank' ? 'Transaction reference (optional)' : 'UPI reference (optional)'}
            </label>
            <input
              className="ctl mono"
              id="rp-ref"
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={method === 'bank' ? 'UTR or transaction id' : 'UPI ref'}
            />
          </div>
        )}

        {/* The note. Optional on every method, which is the change — the column
            has existed since V11 and the only field that ever reached it was a
            UPI reference under a different name. */}
        {packageId && (
          <TextField
            label="Note (optional)"
            id="rp-note"
            className="mt3"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. rest of the pack, paying Tuesday"
            maxLength={280}
          />
        )}

        {/* The split, from THIS package's own share. Hidden while awaiting: the cut is
            stamped when the money is confirmed, and showing a split for a payment
            that has not happened states a fact about a month that has not closed. */}
        {hasSplit && amountNum > 0 && packageId && !isAwaiting && (
          <Card tone="acc" className="mt4">
            <Card.Body style={{ padding: '12px 14px' }}>
              <KeyValueRow k="Billed" style={{ border: 0, padding: '4px 0' }}>{rupees(amountNum)}</KeyValueRow>
              <KeyValueRow k="Gym keeps" valueClassName="warn" style={{ border: 0, padding: '4px 0' }}>
                −{rupees(gymCut)}
              </KeyValueRow>
              <KeyValueRow k="You get" valueClassName="acc" style={{ border: 0, padding: '4px 0' }}>
                {rupees(yours)}
              </KeyValueRow>
            </Card.Body>
          </Card>
        )}

        {/* Honesty note */}
        <Why heading="The money never touches us" style={{ marginTop: 14 }}>
          <p>
            Recording a payment is bookkeeping, not a transaction. InclineYou holds no balance and
            moves no money — this row says what already happened.
          </p>
        </Why>

        {/* Error */}
        {error && (
          <p className="msg msg--err" style={{ marginTop: 12 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{error}</span>
          </p>
        )}
      </div>

      {/*
        ONE SAVE BUTTON, WHERE THERE WERE TWO.

        *Save & send receipt* sent no receipt: it called `handleSave(true)`, the
        argument was never read, and there is no receipt route on the wire —
        `API.md`'s payments section has `POST`, `GET` and `confirm` and nothing
        else. A button that promises a client will be messaged, and silently is
        not, is worse than no button; the trainer believes the receipt went. It is
        gone until there is something for it to call.
      */}
      <div className="panel__foot">
        <Button variant="ghost" onClick={dismiss} disabled={isPending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={isPending || !packageId || !amountNum}
        >
          {isPending ? 'Saving…' : isAwaiting ? 'Record as pending' : 'Record payment'}
        </Button>
      </div>
    </aside>
    </>
  );
}
