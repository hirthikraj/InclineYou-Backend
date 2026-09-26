'use client';

import { useState, useTransition } from 'react';

import type { MoneyClient, MoneyPackage, MoneyTrainer } from '@/lib/money/api';
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

interface Props {
  clients: MoneyClient[];
  packages: MoneyPackage[];
  trainer: MoneyTrainer;
  /**
   * Who this is for, when the panel was opened from somewhere that already knew.
   *
   * `?record=<clientId>` on `/business` sets it, and one caller uses that: *Sell a
   * pack* / *Renew the pack* on a client's file. Those were links to `/money`,
   * which landed the trainer on a month view with this panel shut and the client's
   * name in their head rather than in the form — the fifth click of a four-click
   * job, and the one where the wrong name gets picked.
   *
   * Seeded, not pinned: the select stays enabled, because arriving here with the
   * wrong person chosen has to be recoverable without going back.
   */
  initialClientId?: string | null;
  onClose: () => void;
}

/**
 * The four ways a personal trainer in India is actually paid.
 *
 * `bank` is the brief's third mode and is new here — the column is free text
 * (`VARCHAR(30)`, V1) so it needed no migration, and `methodLabel` maps it.
 * `gym` is the fourth and is not a payment rail at all: it is *who collected*,
 * which is the thing that drives the share split, and it stays in this row
 * because from the trainer's side it is one of four answers to "how did it come
 * in".
 */
type Method = 'upi' | 'cash' | 'bank' | 'gym';
type CollectedBy = 'trainer' | 'gym';

const METHOD_LABEL: Record<Method, string> = {
  upi: 'UPI to me',
  cash: 'Cash',
  bank: 'Bank transfer',
  gym: 'Gym front office',
};

/** `2026-08-29` in the LOCAL zone — `toISOString()` is UTC and lands a trainer
 *  in IST on yesterday's date for the first five and a half hours of every day. */
function localDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The instant to stamp on the row for a date the trainer picked.
 *
 * Midday, not midnight, and not the raw parse: `new Date('2026-08-29')` is
 * parsed as UTC midnight, which is 05:30 on the 29th in IST but the 28th in
 * every zone west of London. Local midday is the one choice that lands on the
 * chosen day everywhere.
 *
 * Today keeps the real clock time, because a payment recorded now happened now
 * and the payments list orders by it.
 */
function paidAtFor(dateStr: string, now: number): number {
  if (dateStr === localDate(now)) return now;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return now;
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
}

/**
 * A pack you can still put money against — WHICH IS NOT THE SAME AS A LIVE ONE.
 *
 * This panel used to offer `status === 'active'` packs, which worked only
 * because nothing in the product ever moved a pack off 'active'. V30's lifecycle
 * sweep now closes a pack the moment its sessions run out or its validity
 * lapses, and that would have quietly broken the commonest debt in this
 * business: a client finishes all twelve sessions and still owes for four of
 * them. Under the old predicate their pack would vanish from this list and the
 * money could never be recorded against it.
 *
 * So the question is *is there money pending on it*, not *is it running*.
 * A finished pack with a balance stays here until the balance is nil; a live one
 * is always here, because a client can pay a deposit on the day they buy.
 *
 * `amountDue` is the server's figure (`PackageService.PACKAGE_COLUMNS`), so it
 * already counts both spellings of a collected payment and subtracts write-offs
 * — a written-off debt has stopped being chased, and a panel that kept offering
 * it would be asking the trainer to collect something they let go.
 */
function isBillable(p: MoneyPackage): boolean {
  return p.status === 'active' || p.amountDue > 0;
}

export function RecordPanel({
  clients,
  packages,
  trainer,
  initialClientId = null,
  onClose,
}: Props) {
  /* ── THE PANEL OWNS ITS SCRIM NOW, AND THAT IS WHAT THE EXIT NEEDED ────────
   *
   * `Business.tsx` used to render the scrim beside this panel, as siblings under
   * one `recordPanelOpen`. That was fine while closing was instant and wrong the
   * moment it stopped being: the wash and the surface leave together, and only
   * this component knows when "leaving" has finished. Two owners meant the scrim
   * would blink out on the click while the panel was still gliding.
   *
   * So the scrim moved in, which is also what every other panel in this app
   * already does. `lib/ui/dismiss.ts` holds both for as long as the transition
   * they can see actually runs. */
  const { closing, dismiss, dismissThen, ref: panelRef } = useDismiss<HTMLElement>(onClose);

  const [clientId, setClientId] = useState(initialClientId ?? '');
  /*
   * The pack is seeded too when the client has exactly one running, which is the
   * common case and the one the caller is coming from — `Sell a pack` on a file
   * with a live pack means `renew this one`. Two live packs is ambiguous and left
   * blank rather than guessed; `handlePackageChange` fills the amount either way.
   */
  const seededPackage = initialClientId
    ? packages.filter((p) => p.clientId === initialClientId && isBillable(p))
    : [];
  const [packageId, setPackageId] = useState(
    seededPackage.length === 1 ? seededPackage[0].id : '',
  );
  const [amount, setAmount] = useState(
    seededPackage.length === 1 && seededPackage[0].amountDue > 0
      ? String(seededPackage[0].amountDue)
      : '',
  );
  const [method, setMethod] = useState<Method>('upi');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  /*
   * The date the money changed hands, defaulted to today and almost never
   * touched — which is the whole design of this field. Trainers catch up on a
   * Sunday, and "they paid on Thursday" has to be recordable without it becoming a
   * step in the common path. It writes `paid_at`, so a back-dated payment lands
   * in the right bar of the trend chart.
   */
  const [today] = useState(() => localDate(Date.now()));
  const [paidOn, setPaidOn] = useState(today);
  /*
   * The one case that is still genuinely pending: a UPI request sent to a client
   * who has not paid it yet. It used to be the ONLY case — this panel wrote every
   * row `pending` and nothing on the web could confirm one, so a trainer handed
   * cash recorded a debt and the payments list's *Collected* never moved. Now it is a
   * deliberate opt-in, off by default, and offered only where it is real.
   */
  const [awaiting, setAwaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeClients = clients.filter((c) => c.status === 'active' || c.status === 'invited');
  const selectedClient = activeClients.find((c) => c.id === clientId);
  const clientPackages = packages.filter((p) => p.clientId === clientId && isBillable(p));
  const selectedPackage = clientPackages.find((p) => p.id === packageId);

  const amountNum = parseFloat(amount) || 0;
  const gymSharePercent = trainer.gymSharePercent ?? 0;
  const collectedBy: CollectedBy = method === 'gym' ? 'gym' : 'trainer';
  const isFloor = collectedBy === 'gym' || method === 'gym';
  const gymCut = isFloor ? Math.round(amountNum * (gymSharePercent / 100)) : 0;
  const yours = amountNum - gymCut;

  // Auto-fill amount from package
  const handleClientChange = (id: string) => {
    setClientId(id);
    setPackageId('');
    setAmount('');
    setReference('');
    setNote('');
  };

  /**
   * Seeds the BALANCE, not the sticker price.
   *
   * It used to fill in `pkg.amount` — the whole pack — whatever had already been
   * collected against it. On a pack half paid for, the panel opened with double
   * what was owed already typed in, and the fastest path through the form
   * recorded it. `amountDue` is what is left, which is what the trainer is
   * standing there to collect; a pack that is square seeds blank rather than
   * zero, because ₹0 in a required money field is a thing to delete before you
   * can type.
   */
  const handlePackageChange = (id: string) => {
    setPackageId(id);
    const pkg = packages.find((p) => p.id === id);
    setAmount(pkg && pkg.amountDue > 0 ? String(pkg.amountDue) : '');
  };

  const handleSave = () => {
    if (!packageId) { setError('Select a package first.'); return; }
    if (!amountNum || amountNum <= 0) { setError('Enter a valid amount.'); return; }

    setError(null);
    startTransition(async () => {
      const result: MoneyWriteResult = await recordPayment({
        packageId,
        amount: amountNum,
        method,
        collectedBy,
        /* Omitted only when the trainer says the money has not arrived — that is
           what leaves the row `pending` for `PATCH /confirm` to settle later. */
        paidAt: showAwaiting && awaiting ? undefined : paidAtFor(paidOn, Date.now()),
        upiReference: reference || undefined,
        note: note || undefined,
      });
      if (result.ok) {
        /* A recorded payment leaves the way Cancel does. Only the success branch
           — a failure keeps the panel open with its message. */
        dismissThen(onClose);
      } else {
        setError(result.message ?? 'Something went wrong.');
      }
    });
  };

  const hasGym = trainer.gymName !== null && gymSharePercent > 0;

  /* Cash in a hand and a gym counter's slip are settled by the time they are
     typed; only a UPI or bank request can be pending. Offering "not arrived
     yet" against cash would be offering a state that cannot happen. */
  const showAwaiting = method === 'upi' || method === 'bank';
  const isAwaiting = showAwaiting && awaiting;

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
            {activeClients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          )}
        </Field>

        {/* Package picker */}
        {clientId && (
          <div className="fld mt3">
            <label className="fld__l" htmlFor="rp-package">Package</label>
            {clientPackages.length === 0 ? (
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
                  const label = p.type === 'single'
                    ? `Single session · ${rupees(p.amount)}`
                    : `${p.sessionsTotal ?? '?'}-session pack · ${rupees(p.amount)} · ${tail}`;
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
          </div>
        )}

        {/* Payment method */}
        {packageId && (
          <div className="mt3">
            <p className="fld__l" style={{ marginBottom: 8 }}>How</p>
            <div
              className="row gap2"
              role="group"
              aria-label="How the money came in"
              style={{ flexWrap: 'wrap' }}
            >
              {(['upi', 'cash', 'bank', 'gym'] as Method[]).map((m) => (
                <Chip
                  pressed={method === m}
                  key={m}
                  onClick={() => setMethod(m)}
                >
                  {METHOD_LABEL[m]}
                </Chip>
              ))}
            </div>
          </div>
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
        {(method === 'upi' || method === 'bank') && packageId && (
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

        {/* Gym split computation. Hidden while awaiting: the cut is stamped when
            the money is confirmed, and showing a split for a payment that has not
            happened states a fact about a month that has not closed. */}
        {hasGym && amountNum > 0 && packageId && !isAwaiting && (
          <Card tone="acc" className="mt4">
            <Card.Body style={{ padding: '12px 14px' }}>
              <KeyValueRow k="Billed" style={{ border: 0, padding: '4px 0' }}>{rupees(amountNum)}</KeyValueRow>
              {isFloor && (
                <KeyValueRow
                  k={<>Gym&#8217;s {gymSharePercent}%</>}
                  valueClassName="warn"
                  style={{ border: 0, padding: '4px 0' }}
                >−{rupees(gymCut)}</KeyValueRow>
              )}
              <KeyValueRow
                k="You keep"
                valueClassName="acc"
                style={{ border: 0, padding: '4px 0' }}
              >{rupees(yours)}</KeyValueRow>
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
