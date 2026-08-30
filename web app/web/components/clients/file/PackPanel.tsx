'use client';

import { useMemo, useState, useTransition } from 'react';

import { rupees } from '@/lib/today/time';
import type { ClientPackageWire, PriceListPackWire } from '@/lib/clients/client-api';
import { assignPackage, renewPack } from '@/lib/clients/package-actions';

import { num } from './shared';

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
 * Choosing a pack fills in the type, the session count, the price and the
 * validity window, and — the part that was missing — writes `package.pack_id`.
 * V11 added that column and nothing had ever written it, which is why
 * `pack.activeClients` (the count that makes retiring a price a decision rather
 * than a click) has been reading zero for every pack on every trainer's list.
 *
 * Everything stays editable after the pick. A trainer who discounts is not
 * fighting the form: the amount is theirs to change, and what they knocked off
 * goes into `discountAmount`, which is why the row can later say the price was
 * ₹9,000 and this client paid ₹8,000 without either figure being a lie.
 *
 * ── RENEW IS NOT THIS FORM ──────────────────────────────────────────────────
 *
 * It is one button, elsewhere — see `PaymentsTab`. This panel's renew mode
 * exists only for the renewal where something CHANGED, which is the uncommon
 * one. The common one must never become a form: a trainer renewing a client
 * while standing next to them has about forty seconds, and every field between
 * them and the sale is a reason to do it later and then not at all.
 */

interface Props {
  clientId: string;
  clientName: string;
  priceList: PriceListPackWire[];
  /** Present in renew mode: the pack being repeated. Absent when selling fresh. */
  renewing?: ClientPackageWire | null;
  onClose: () => void;
}

type PackType = 'session_pack' | 'monthly' | 'single';

const TYPE_LABEL: Record<PackType, string> = {
  session_pack: 'A block of sessions',
  monthly: 'Monthly, unlimited',
  single: 'One session',
};

export function PackPanel({ clientId, clientName, priceList, renewing = null, onClose }: Props) {
  const isRenewal = renewing !== null;

  /*
   * Renewing seeds from the pack being repeated, not from the price list — the
   * client's terms may have been discounted or hand-typed, and a renewal that
   * quietly restored the list price would raise somebody's fee without saying so.
   */
  const [packId, setPackId] = useState<string>(
    (isRenewal ? renewing?.packId : null) ?? '',
  );
  const [type, setType] = useState<PackType>(
    asType(isRenewal ? renewing?.type : 'session_pack'),
  );
  const [sessions, setSessions] = useState<string>(
    isRenewal && renewing?.sessionsTotal != null ? String(renewing.sessionsTotal) : '',
  );
  const [amount, setAmount] = useState<string>(
    isRenewal && renewing?.amount != null ? String(num(renewing.amount)) : '',
  );
  const [startDate, setStartDate] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = useMemo(
    () => priceList.find((p) => p.id === packId) ?? null,
    [priceList, packId],
  );

  const amountNum = Number(amount) || 0;
  const listPrice = chosen ? num(chosen.amount) : 0;
  /*
   * What was knocked off, and it is only ever a discount when a LIST price
   * exists to knock it off. A hand-typed sale has no reference price, so there
   * is nothing to record the difference from — `discountAmount` stays null
   * rather than being invented from zero.
   */
  const discount = chosen && listPrice > amountNum && amountNum > 0 ? listPrice - amountNum : 0;

  const validityDays = chosen?.validityDays ?? null;

  function choosePack(id: string): void {
    setPackId(id);
    const pack = priceList.find((p) => p.id === id);
    if (!pack) return;
    setType(asType(pack.type));
    setSessions(pack.sessions != null ? String(pack.sessions) : '');
    setAmount(String(num(pack.amount)));
  }

  function submit(): void {
    if (!(amountNum > 0)) {
      setError('A pack needs a price.');
      return;
    }
    if (type === 'session_pack' && !(Number(sessions) > 0)) {
      setError('How many sessions is in this pack?');
      return;
    }
    setError(null);

    startTransition(async () => {
      const terms = {
        packId: packId || null,
        sessionsTotal: type === 'monthly' ? null : Number(sessions) || null,
        amount: amountNum,
        discountAmount: discount > 0 ? discount : null,
        dueDate: dueDate || null,
      };
      const result = isRenewal && renewing
        ? await renewPack(clientId, renewing.id, terms)
        : await assignPackage(clientId, {
            ...terms,
            type,
            startDate: startDate || null,
          });
      if (result.ok) onClose();
      else setError(result.message ?? 'Something went wrong.');
    });
  }

  return (
    <aside
      className="panel"
      role="dialog"
      aria-label={isRenewal ? 'Renew this pack' : 'Sell a pack'}
      style={{ position: 'fixed', right: 0, top: 0, height: '100dvh', width: 420, zIndex: 30 }}
    >
      <div className="panel__hd">
        <span className="panel__t">{isRenewal ? 'Renew the pack' : 'Sell a pack'}</span>
        <span style={{ flex: 1 }} />
        <button
          className="btn btn--icon btn--ghost"
          type="button"
          aria-label="Close"
          onClick={onClose}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="panel__body">
        <p className="small" style={{ color: 'var(--tx-ink-3)' }}>
          {isRenewal
            ? `A new pack for ${clientName}, on these terms. The old one stays on their file exactly as it is.`
            : `A new pack for ${clientName}. Until there is one, every session is off the books.`}
        </p>

        {/* ── The price list ────────────────────────────────────────────── */}
        {priceList.length > 0 ? (
          <div className="fld mt3">
            <label className="fld__l" htmlFor="pp-pack">
              From your price list
            </label>
            <select
              className="ctl"
              id="pp-pack"
              value={packId}
              onChange={(e) => choosePack(e.target.value)}
            >
              <option value="">Type the terms myself…</option>
              {priceList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {rupees(num(p.amount))}
                  {p.sessions ? ` · ${p.sessions} sessions` : ''}
                  {p.validityDays ? ` · ${p.validityDays} days` : ''}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="msg msg--warn mt3">
            <span>
              Your price list is empty. You can type the terms here, but setting the
              prices once on Business · Packages makes this one tap next time.
            </span>
          </p>
        )}

        {/* ── Type ─────────────────────────────────────────────────────── */}
        <div className="fld mt3">
          <label className="fld__l" htmlFor="pp-type">
            What kind
          </label>
          <select
            className="ctl"
            id="pp-type"
            value={type}
            /* Disabled on a renewal: changing the kind is not a renewal, it is a
               different pack. Selling one is the honest way to do that. */
            disabled={isRenewal}
            onChange={(e) => setType(asType(e.target.value))}
          >
            {(Object.keys(TYPE_LABEL) as PackType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        {/* ── Sessions ─────────────────────────────────────────────────── */}
        {type !== 'monthly' && (
          <div className="fld mt3">
            <label className="fld__l" htmlFor="pp-sessions">
              How many sessions
            </label>
            <input
              className="ctl ctl--num"
              id="pp-sessions"
              type="number"
              min="1"
              step="1"
              value={sessions}
              disabled={type === 'single'}
              onChange={(e) => setSessions(e.target.value)}
              placeholder="12"
            />
          </div>
        )}

        {/* ── Price ────────────────────────────────────────────────────── */}
        <div className="fld mt3">
          <label className="fld__l" htmlFor="pp-amount">
            Price
          </label>
          <div className="affix">
            <span className="affix__p">₹</span>
            <input
              className="ctl ctl--num"
              id="pp-amount"
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={chosen ? String(listPrice) : '0'}
            />
          </div>
          {discount > 0 && (
            <p className="small" style={{ marginTop: 6, color: 'var(--tx-ink-3)' }}>
              {rupees(discount)} off the list price of {rupees(listPrice)}. Recorded on
              the sale, so this client&rsquo;s file stays honest about both figures — and
              nobody else is re-quoted.
            </p>
          )}
          {type === 'session_pack' && amountNum > 0 && Number(sessions) > 0 && (
            <p className="small" style={{ marginTop: 6, color: 'var(--tx-ink-3)' }}>
              {rupees(Math.round(amountNum / Number(sessions)))} a session.
            </p>
          )}
        </div>

        {/* ── When it starts ───────────────────────────────────────────── */}
        {isRenewal ? (
          <p className="small mt3" style={{ color: 'var(--tx-ink-3)' }}>
            {renewing?.endDate
              ? `Starts the day the current pack runs out, so ${clientName} is not charged twice for the same fortnight. If it has already lapsed, it starts today.`
              : 'Starts today. The current pack has no expiry, so there is nothing to continue from.'}
          </p>
        ) : (
          <div className="fld mt3">
            <label className="fld__l" htmlFor="pp-start">
              Starts
            </label>
            <input
              className="ctl"
              id="pp-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <p className="small" style={{ marginTop: 6, color: 'var(--tx-ink-3)' }}>
              {validityDays
                ? `Leave it blank for today. This pack runs ${validityDays} days from the start.`
                : 'Leave it blank for today.'}
            </p>
          </div>
        )}

        {/* ── When the money is owed ───────────────────────────────────── */}
        <div className="fld mt3">
          <label className="fld__l" htmlFor="pp-due">
            Money owed by <span className="ink3">· optional</span>
          </label>
          <input
            className="ctl"
            id="pp-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <p className="small" style={{ marginTop: 6, color: 'var(--tx-ink-3)' }}>
            Without a date there is no such thing as &ldquo;11 days late&rdquo;, and the
            money book cannot chase it. Blank reads as owed, not overdue.
          </p>
        </div>

        {error && (
          <p className="msg msg--warn mt3" role="alert">
            <span>{error}</span>
          </p>
        )}

        <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
          <button
            className="btn btn--primary"
            type="button"
            disabled={pending}
            onClick={submit}
          >
            {pending ? 'Saving…' : isRenewal ? 'Renew it' : 'Sell it'}
          </button>
          <button className="btn btn--ghost" type="button" disabled={pending} onClick={onClose}>
            Cancel
          </button>
        </div>

        <p className="small" style={{ marginTop: 14, color: 'var(--tx-ink-3)' }}>
          This records the SALE, not the money. Take the payment in the money book —
          part of it is fine, and the rest stays outstanding on this pack.
        </p>
      </div>
    </aside>
  );
}

/** Unrecognised degrades to the commonest kind, as `lib/packs/api.ts` does. */
function asType(value: string | null | undefined): PackType {
  return value === 'monthly' || value === 'single' ? value : 'session_pack';
}
