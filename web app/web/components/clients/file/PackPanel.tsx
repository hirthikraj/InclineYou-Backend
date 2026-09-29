'use client';

import { useMemo, useState, useTransition } from 'react';

import { rupees } from '@/lib/today/time';
import type { ClientPackageWire, PriceListPackWire } from '@/lib/clients/client-api';
import { packName, packTerms } from '@/lib/clients/billing';
import { assignPackage, renewPack } from '@/lib/clients/package-actions';

import { num } from './shared';
import { useDismiss } from '@/lib/ui/dismiss';
import { Button } from '@/web-components/ui/Button';
import { Field, TextField } from '@/web-components/ui/Field';

/**
 * SELL A PACK, OR RENEW ONE — on the client's own file.
 *
 * ── WHY THIS COMPONENT EXISTS AT ALL ────────────────────────────────────────
 *
 * Because until this pass the web half could not sell a package. Every route to
 * it was a loop: *Renew* on the price list went to `/clients/:id/package`, which
 * redirects to `/payments`, whose *Sell a pack* went to `/business?record=:id`,
 * which opens `RecordPanel` — a panel that records a payment AGAINST a package
 * and answers "No active packages for X. Sell one first." with nothing to click.
 * `POST /v1/clients/{id}/packages` had exactly one caller in the whole app, and
 * it was `Renew` on Today's queue, which needs a pack to already exist.
 *
 * So the assigning moved onto the person it is about, and recording money stayed
 * where the money book is. Those are two different jobs and it took one panel
 * pretending to do both for that to be obvious.
 *
 * ── THE PRICE LIST IS THE FORM ──────────────────────────────────────────────
 *
 * Off the list, the pack's terms win on the server — name, service, basis,
 * count, price, validity — so the form sends the pack's id and nothing it could
 * contradict. What stays the trainer's is the price they actually charged: type
 * less than the list and the difference goes out as `discountAmount`, which is
 * why the row can later say the price was ₹9,000 and this client paid ₹8,000
 * without either figure being a lie. The stored amount is net.
 *
 * A custom sale types the terms. A gym client has none: the gym's desk sells
 * off the gym's list with the trainer's share on it, and a hand-typed pack for
 * them would carry no share (the server refuses one).
 *
 * ── IT RECORDS A SALE, NOT A DIARY ──────────────────────────────────────────
 *
 * It used to lay down the pack's sessions too. In v1 the client's week is its
 * own resource (`PUT /v1/clients/{id}/schedule`, set in the add flow) and books
 * itself; a sale is only what was bought, and the week's sessions are charged
 * against whichever live pack fits.
 *
 * ── RENEW IS NOT A FORM ─────────────────────────────────────────────────────
 *
 * The server copies the terms, so renew mode asks one thing — when it starts —
 * and a trainer renewing a client standing next to them is one tap away.
 */

interface Props {
  clientId: string;
  clientName: string;
  /** Whose list this client buys from: a gym client the gym's, an independent one yours. */
  clientType: 'independent' | 'gym';
  /** Active entries of that list. */
  priceList: PriceListPackWire[];
  /** Present in renew mode: the pack being repeated. Absent when selling fresh. */
  renewing?: ClientPackageWire | null;
  onClose: () => void;
}

const SERVICES = [
  { value: 'floor', label: 'On the floor' },
  { value: 'home_visit', label: 'Home visits' },
  { value: 'remote', label: 'Remote' },
  { value: 'programming', label: 'Programming only' },
] as const;

export function PackPanel({ clientId, clientName, clientType, priceList, renewing = null, onClose }: Props) {
  const isRenewal = renewing !== null;
  const gym = clientType === 'gym';

  /* `lib/ui/dismiss.ts` — the panel puts its closed state back, waits for the
     transition that starts, and only then lets the file unmount it. */
  const { closing, dismiss, dismissThen, ref: panelRef } = useDismiss<HTMLElement>(onClose);

  /* Minted when the sheet opens and kept across retries: a double tap or a
     retried timeout answers the package the first attempt made. */
  const [saleId] = useState(() => crypto.randomUUID());

  const [packId, setPackId] = useState<string>(gym ? (priceList[0]?.id ?? '') : '');
  const [name, setName] = useState('');
  const [service, setService] = useState<string>('floor');
  const [basis, setBasis] = useState<'sessions' | 'period'>('sessions');
  const [sessions, setSessions] = useState('');
  const [validity, setValidity] = useState('');
  const [amount, setAmount] = useState<string>(() => {
    const first = gym ? priceList[0] : null;
    return first ? String(num(first.amount)) : '';
  });
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = useMemo(() => priceList.find((p) => p.id === packId) ?? null, [priceList, packId]);
  const amountNum = Number(amount) || 0;
  const listPrice = chosen ? num(chosen.amount) : 0;
  /* Only ever a discount against a LIST price; a hand-typed sale has nothing to
     knock it off. */
  const discount = chosen && listPrice > amountNum && amountNum > 0 ? listPrice - amountNum : 0;
  const count = chosen ? chosen.sessions : basis === 'sessions' ? Number(sessions) || null : null;

  function choosePack(id: string): void {
    setPackId(id);
    const pack = priceList.find((p) => p.id === id);
    setAmount(pack ? String(num(pack.amount)) : '');
  }

  function submit(): void {
    setError(null);
    if (isRenewal && renewing) {
      startTransition(async () => {
        const result = await renewPack(clientId, renewing.id, { id: saleId, startDate: startDate || null });
        if (result.ok) dismissThen(onClose);
        else setError(result.message ?? 'Something went wrong.');
      });
      return;
    }
    if (!(amountNum > 0)) {
      setError('A pack needs a price.');
      return;
    }
    if (chosen && amountNum > listPrice) {
      setError(`The list price is ${rupees(listPrice)}. Charging more is a different pack — add it to your price list.`);
      return;
    }
    if (!chosen) {
      if (gym) {
        setError("A gym client buys off the gym's price list.");
        return;
      }
      if (!name.trim()) {
        setError('Give the pack a name — it is what the client will recognise.');
        return;
      }
      if (basis === 'sessions' && !(Number(sessions) > 0)) {
        setError('How many sessions is in this pack?');
        return;
      }
    }
    startTransition(async () => {
      const result = await assignPackage(
        clientId,
        chosen
          ? {
              id: saleId,
              packId: chosen.id,
              startDate: startDate || null,
              dueDate: dueDate || null,
              discountAmount: discount > 0 ? discount.toFixed(2) : null,
            }
          : {
              id: saleId,
              name: name.trim(),
              service,
              basis: service === 'programming' ? 'period' : basis,
              sessionsTotal: basis === 'sessions' && service !== 'programming' ? Number(sessions) : null,
              amount: amountNum.toFixed(2),
              validityDays: Number(validity) > 0 ? Number(validity) : null,
              startDate: startDate || null,
              dueDate: dueDate || null,
            },
      );
      /* `dismissThen`, not `onClose`: a sold pack is the panel's success exit and
         it should leave the way Cancel does rather than blinking out. */
      if (result.ok) dismissThen(onClose);
      else setError(result.message ?? 'Something went wrong.');
    });
  }

  return (
    <aside
      ref={panelRef}
      className={`panel${closing ? ' panel--out' : ''}`}
      role="dialog"
      aria-label={isRenewal ? 'Renew this pack' : 'Sell a pack'}
      style={{ position: 'fixed', right: 0, top: 0, height: '100dvh', width: 420, zIndex: 30 }}
    >
      <div className="panel__hd">
        <span className="panel__t">{isRenewal ? 'Renew the pack' : 'Sell a pack'}</span>
        <span style={{ flex: 1 }} />
        <button className="btn btn--icon btn--ghost" type="button" aria-label="Close" onClick={dismiss}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="panel__body">
        {isRenewal && renewing ? (
          <>
            <p className="small" style={{ color: 'var(--tx-ink-3)' }}>
              {packName(renewing)} again for {clientName} — {packTerms(renewing)}. The terms
              are copied from your price list if the pack is still on it, otherwise from
              this one. The old pack stays on their file exactly as it is.
            </p>
            <div className="fld mt3">
              <label className="fld__l" htmlFor="pp-start">Starts</label>
              <input className="ctl" id="pp-start" type="date" value={startDate}
                onChange={(e) => setStartDate(e.target.value)} />
              <p className="small" style={{ marginTop: 6, color: 'var(--tx-ink-3)' }}>
                Leave it blank for today.
              </p>
            </div>
          </>
        ) : (
          <>
            <p className="small" style={{ color: 'var(--tx-ink-3)' }}>
              A new pack for {clientName}. Until there is one, every session is off the books.
            </p>

            {/* ── The price list ─────────────────────────────────────────── */}
            {priceList.length > 0 ? (
              <Field label={gym ? "From the gym's price list" : 'From your price list'} id="pp-pack" className="mt3">
                {(a) => (
                  <select className="ctl" {...a} value={packId} onChange={(e) => choosePack(e.target.value)}>
                    {!gym && <option value="">Type the terms myself…</option>}
                    {priceList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {rupees(num(p.amount))}
                        {p.sessions ? ` · ${p.sessions} sessions` : ''}
                        {p.validityDays ? ` · ${p.validityDays} days` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            ) : (
              <p className="msg msg--warn mt3">
                <span>
                  {gym
                    ? "There is no gym pack on your price list yet. Add the gym's packs on Business · Packages, with your share on each, to sell one here."
                    : 'Your price list is empty. You can type the terms here, but setting the prices once on Business · Packages makes this one tap next time.'}
                </span>
              </p>
            )}

            {/* ── Custom terms ──────────────────────────────────────────── */}
            {!chosen && !gym && (
              <>
                <TextField label="Name" id="pp-name" className="mt3" value={name} maxLength={80}
                  placeholder="12 sessions" onChange={(e) => setName(e.target.value)} />
                <Field label="Where" id="pp-service" className="mt3">
                  {(a) => (
                    <select className="ctl" {...a} value={service} onChange={(e) => setService(e.target.value)}>
                      {SERVICES.map((sv) => <option key={sv.value} value={sv.value}>{sv.label}</option>)}
                    </select>
                  )}
                </Field>
                {service !== 'programming' && (
                  <Field label="Sold by" id="pp-basis" className="mt3">
                    {(a) => (
                      <select className="ctl" {...a} value={basis}
                        onChange={(e) => setBasis(e.target.value === 'period' ? 'period' : 'sessions')}>
                        <option value="sessions">A number of sessions</option>
                        <option value="period">A period, unlimited sessions</option>
                      </select>
                    )}
                  </Field>
                )}
                {basis === 'sessions' && service !== 'programming' && (
                  <TextField label="How many sessions" id="pp-sessions" numeric className="mt3" type="number"
                    min="1" max="500" step="1" value={sessions} placeholder="12"
                    onChange={(e) => setSessions(e.target.value)} />
                )}
                <TextField label={<>Valid for, in days <span className="ink3">· optional</span></>} id="pp-validity"
                  numeric className="mt3" type="number" min="1" max="730" step="1" value={validity}
                  placeholder="60" onChange={(e) => setValidity(e.target.value)} />
              </>
            )}

            {/* ── Price ─────────────────────────────────────────────────── */}
            <div className="fld mt3">
              <label className="fld__l" htmlFor="pp-amount">{chosen ? 'What you are charging' : 'Price'}</label>
              <div className="affix">
                <span className="affix__p">₹</span>
                <input className="ctl ctl--num" id="pp-amount" type="number" min="1" step="1" value={amount}
                  onChange={(e) => setAmount(e.target.value)} placeholder={chosen ? String(listPrice) : '0'} />
              </div>
              {discount > 0 && (
                <p className="small" style={{ marginTop: 6, color: 'var(--tx-ink-3)' }}>
                  {rupees(discount)} off the list price of {rupees(listPrice)}. Recorded on the sale, so
                  this client&rsquo;s file stays honest about both figures — and nobody else is re-quoted.
                </p>
              )}
              {amountNum > 0 && count && count > 0 && (
                <p className="small" style={{ marginTop: 6, color: 'var(--tx-ink-3)' }}>
                  {rupees(Math.round(amountNum / count))} a session.
                </p>
              )}
            </div>

            {/* ── When it starts ────────────────────────────────────────── */}
            <div className="fld mt3">
              <label className="fld__l" htmlFor="pp-start">Starts</label>
              <input className="ctl" id="pp-start" type="date" value={startDate}
                onChange={(e) => setStartDate(e.target.value)} />
              <p className="small" style={{ marginTop: 6, color: 'var(--tx-ink-3)' }}>
                {chosen?.validityDays
                  ? `Leave it blank for today. This pack runs ${chosen.validityDays} days from the start.`
                  : 'Leave it blank for today.'}
              </p>
            </div>

            {/* ── When the payment is due ───────────────────────────────── */}
            <div className="fld mt3">
              <label className="fld__l" htmlFor="pp-due">
                Payment due by <span className="ink3">· optional</span>
              </label>
              <input className="ctl" id="pp-due" type="date" value={dueDate}
                onChange={(e) => setDueDate(e.target.value)} />
              <p className="small" style={{ marginTop: 6, color: 'var(--tx-ink-3)' }}>
                Blank means due the day it starts. Without a date there is no such thing as
                &ldquo;11 days late&rdquo;.
              </p>
            </div>
          </>
        )}

        {error && (
          <p className="msg msg--warn mt3" role="alert">
            <span>{error}</span>
          </p>
        )}

        <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
          <Button variant="primary" disabled={pending} onClick={submit}>
            {pending ? 'Saving…' : isRenewal ? 'Renew it' : 'Sell it'}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={dismiss}>
            Cancel
          </Button>
        </div>

        <p className="small" style={{ marginTop: 14, color: 'var(--tx-ink-3)' }}>
          This records the SALE, not the money. Take the payment on the pack — part of it is
          fine, and the rest stays owed on it.
        </p>
      </div>
    </aside>
  );
}
