'use client';

import { useMemo, useState, useTransition } from 'react';

import { TimeField } from '@/components/shell/TimeField';
import { formatMinuteValue, parseMinuteValue, rupees } from '@/lib/today/time';
import {
  dayFromIsoDate,
  layoutSessions,
  slotMinutes,
  type StandingSlot,
} from '@/lib/clients/booking';
import type { ClientPackageWire, PriceListPackWire } from '@/lib/clients/client-api';
import { assignPackage, renewPack } from '@/lib/clients/package-actions';

import { dateStr, num } from './shared';
import { useDismiss } from '@/lib/ui/dismiss';
import { Button } from '@/web-components/ui/Button';
import { Chip } from '@/web-components/ui/Chip';
import { Field, TextField } from '@/web-components/ui/Field';
import { Message } from '@/web-components/ui/Message';

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
  /**
   * The client's standing week as it stands, `0 = Monday`. Seeds the day picker
   * so selling a second pack to somebody who has trained Tuesdays and Fridays
   * for a year opens with Tuesday and Friday already pressed — the trainer
   * confirms a rhythm rather than re-declaring one.
   */
  weeklySchedule?: Array<{ templateDay: number; weekday: number; time: string }> | null;
  /** How long their sessions run, for the read-out and for the rows booked. */
  sessionDurationMinutes?: number | null;
  /**
   * The server's clock, threaded down from the page.
   *
   * Not `Date.now()` in the body: the read-out below is derived during render
   * and a clock read there is an impure call whose value changes under an
   * unrelated re-render — the lint rule that catches it is the same one
   * `lib/today` exists downstream of. The dates this previews are days apart,
   * so a page-load-old clock costs nothing and a stable render is worth it.
   */
  now: number;
  /** Present in renew mode: the pack being repeated. Absent when selling fresh. */
  renewing?: ClientPackageWire | null;
  onClose: () => void;
}

type PackType = 'session_pack' | 'monthly' | 'single';

/**
 * 1 = Monday … 7 = Sunday, indexed by that number.
 *
 * The empty first cell is not padding for its own sake: a standing slot's
 * weekday is 1-based (`lib/clients/booking.ts` states the convention and why
 * this product has two), and an array whose index IS that weekday is the only
 * shape where `WEEKDAYS[slot.weekday]` cannot be off by one. The alternative —
 * a seven-element array and a `+ 1` at every use — is the arithmetic that was
 * already wrong in two other pickers.
 */
const WEEKDAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The weekdays themselves, for the chip row. */
const WEEK = [1, 2, 3, 4, 5, 6, 7];

/**
 * The pattern a trainer would have typed, so the picker opens nearly right.
 *
 * The same table `AssignPanel.seedSchedule` uses and for the reason written
 * there: an even spread across seven days gives Mon/Thu/Sun for three days,
 * which nobody trains. Three is Mon/Wed/Fri, four is Mon/Tue/Thu/Fri, six rests
 * Sunday. Only reached when the client has no rhythm yet — anyone who has one
 * seeds from it.
 */
const PATTERNS: Record<number, number[]> = {
  1: [1],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
  7: [1, 2, 3, 4, 5, 6, 7],
};

const TYPE_LABEL: Record<PackType, string> = {
  session_pack: 'A block of sessions',
  monthly: 'Monthly, unlimited',
  single: 'One session',
};

export function PackPanel({
  clientId,
  clientName,
  priceList,
  weeklySchedule = null,
  sessionDurationMinutes = null,
  now,
  renewing = null,
  onClose,
}: Props) {
  const isRenewal = renewing !== null;

  /* `lib/ui/dismiss.ts` — the panel puts its closed state back, waits for the
     transition that starts, and only then lets the file unmount it. */
  const { closing, dismiss, dismissThen, ref: panelRef } = useDismiss<HTMLElement>(onClose);

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

  /*
   * ── THE DAYS, WHICH ARE WHAT MAKE THIS A SALE AND NOT A NUMBER ────────────
   *
   * Seeded from the client's standing week if they have one, because selling a
   * second pack to somebody who has trained Tuesday and Friday for a year should
   * open on Tuesday and Friday. An empty week seeds nothing: a trainer who has
   * not had the days conversation yet must not have one invented for them and
   * silently booked — `PATTERNS` only comes out when they press *Suggest*.
   *
   * Keyed by weekday so the same day cannot be picked twice. Two sessions on one
   * morning is the arrangement `AssignPanel` already refuses in its own picker.
   */
  const [days, setDays] = useState<Record<number, string>>(() => {
    const seed: Record<number, string> = {};
    for (const slot of weeklySchedule ?? []) {
      if (slot.weekday >= 1 && slot.weekday <= 7) seed[slot.weekday] = slot.time;
    }
    return seed;
  });

  const picked = useMemo(
    () => Object.keys(days).map(Number).sort((a, b) => a - b),
    [days],
  );

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

  /* The standing week as the server will store it. `templateDay` is the ordinal
     — Day 1 is the first day of THIS client's week, which is what an ordinal day
     means once a weekday has been chosen for it. */
  const slots = useMemo<StandingSlot[]>(
    () => picked.map((weekday, i) => ({ templateDay: i + 1, weekday, time: days[weekday] })),
    [picked, days],
  );

  /*
   * ── THE DATES, BEFORE THE SALE AND NOT AFTER IT ───────────────────────────
   *
   * The same `layoutSessions` the server runs to write the rows, so what the
   * trainer reads out to the client and what lands in the diary cannot be two
   * different arrangements. Its own note carries why it stops at the pack's
   * expiry instead of squeezing the remainder in somewhere — and that shortfall
   * is exactly what this read-out exists to put in front of somebody while the
   * terms are still editable.
   */
  const plan = useMemo(() => {
    if (isRenewal || slots.length === 0) return null;
    const count = type === 'monthly' ? null : Number(sessions) || null;
    const from = Math.max(now, dayFromIsoDate(startDate) ?? 0);
    /* The pack's own window, and only its own: a sale is not a renewal, so there
       is no earlier pack whose end date could bound this one. A pack with no
       validity has no end, and `layoutSessions` then stops on the count alone. */
    const until =
      validityDays !== null ? from + validityDays * 24 * 60 * 60 * 1000 : null;
    const booked = layoutSessions({ slots, from, count, until });
    return {
      booked,
      count,
      /* Short by this many, because the validity window closes before the pack
         is used up. A real number a trainer can act on: sell a longer pack, add
         a day, or know now that they will be extending it in November. */
      short: count === null ? 0 : Math.max(0, count - booked.length),
    };
  }, [isRenewal, slots, type, sessions, startDate, validityDays, now]);

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
            /* An empty week is sent as null rather than `[]`, and the difference
               is the whole contract: null means *leave their week alone*, and a
               renewal or a second pack then books on the rhythm they already
               have. `[]` would read as *they train no days*. */
            weeklySchedule: slots.length > 0 ? slots : null,
            sessionDurationMinutes: sessionDurationMinutes ?? null,
          });
      /* `dismissThen`, not `onClose`: a sold pack is the panel's success exit and
         it should leave the way Cancel does rather than blinking out. The failure
         branch keeps the panel, which is why the wrap is on this line and not
         around `submit`. */
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
        <button
          className="btn btn--icon btn--ghost"
          type="button"
          aria-label="Close"
          onClick={dismiss}
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
          <Field
            label="From your price list"
            id="pp-pack"
            className="mt3"
          >
            {(a) => (
              <select className="ctl" {...a} value={packId} onChange={(e) => choosePack(e.target.value)}>
              <option value="">Type the terms myself…</option>
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
              Your price list is empty. You can type the terms here, but setting the
              prices once on Business · Packages makes this one tap next time.
            </span>
          </p>
        )}

        {/* ── Type ─────────────────────────────────────────────────────── */}
        <Field
          label="What kind"
          id="pp-type"
          className="mt3"
        >
          {(a) => (
            <select className="ctl" {...a} value={type} /* Disabled on a renewal: changing the kind is not a renewal, it is a
               different pack. Selling one is the honest way to do that. */ disabled={isRenewal} onChange={(e) => setType(asType(e.target.value))}>
            {(Object.keys(TYPE_LABEL) as PackType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          )}
        </Field>

        {/* ── Sessions ─────────────────────────────────────────────────── */}
        {type !== 'monthly' && (
          <TextField
            label="How many sessions"
            id="pp-sessions"
            numeric
            className="mt3"
            type="number"
            min="1"
            step="1"
            value={sessions}
            disabled={type === 'single'}
            onChange={(e) => setSessions(e.target.value)}
            placeholder="12"
          />
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

        {/* ── WHEN THEY TRAIN — the half a sale used to leave out ─────────
            Drawn only on a sale. A renewal repeats a rhythm that is already
            agreed and already in the diary, and asking a trainer to re-pick
            Tuesday and Friday to repeat a pack is the form the renew note at
            the top of this file exists to refuse. */}
        {!isRenewal && (
          <div className="fld mt3">
            <label className="fld__l" id="pp-days-l">
              Which days, and when
              {picked.length > 0 && (
                <span className="ink3">
                  {' '}· {picked.length} a week
                </span>
              )}
            </label>
            <div className="tools" role="group" aria-labelledby="pp-days-l">
              {WEEK.map(weekday => {
                const on = days[weekday] !== undefined;
                return (
                  <Chip
                    key={weekday}
                    pressed={on}
                    onClick={() =>
                      setDays((prev) => {
                        const next = { ...prev };
                        if (on) delete next[weekday];
                        /* 6am, and the same default `AssignPanel` seeds. A time
                           they change beats a blank they have to fill four
                           times, and it is the hour most floor work starts. */
                        else next[weekday] = '06:00';
                        return next;
                      })
                    }
                  >
                    {WEEKDAYS[weekday]}
                  </Chip>
                );
              })}
            </div>

            {picked.length === 0 ? (
              <p className="small" style={{ marginTop: 8, color: 'var(--tx-ink-3)' }}>
                Pick the days you agreed and this sale books every session in the
                pack — otherwise it records the money and leaves the diary empty,
                which is how a pack ends up half-used in November.{' '}
                {type === 'session_pack' && Number(sessions) > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setDays(() => {
                        /* A twelve-session pack is about eight weeks of work at
                           the rhythm most clients buy, so the count implies a
                           frequency — and the trainer corrects it in one tap if
                           this client is the exception. Clamped to six: nobody
                           is sold a seven-day week by a guess. */
                        const per = Math.min(6, Math.max(1, Math.round(Number(sessions) / 8) || 3));
                        const seed: Record<number, string> = {};
                        for (const wd of PATTERNS[per] ?? PATTERNS[3]) seed[wd] = '06:00';
                        return seed;
                      })
                    }
                  >
                    Suggest a pattern
                  </Button>
                )}
              </p>
            ) : (
              <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                {picked.map((weekday) => (
                  <div
                    key={weekday}
                    style={{ display: 'flex', alignItems: 'center', gap: 9 }}
                  >
                    <span className="small" style={{ width: 34, color: 'var(--tx-ink-2)' }}>
                      {WEEKDAYS[weekday]}
                    </span>
                    {/* `<input type="time">` went from this app for the reason
                        `AssignPanel` records: it draws a 24-hour field from the
                        browser's locale beside a product that says 6:00 AM
                        everywhere. Slots are STORED as `HH:MM` and this adapts. */}
                    <TimeField
                      label={`Time on ${WEEKDAYS[weekday]}`}
                      value={parseMinuteValue(days[weekday]) ?? slotMinutes(days[weekday])}
                      onChange={(minute) =>
                        setDays((prev) => ({ ...prev, [weekday]: formatMinuteValue(minute) }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            {/* ── WHAT THIS WILL ACTUALLY BOOK ────────────────────────────
                The first date and the last date are the two facts a client
                asks about, and a trainer who can read them out before taking
                the money is having a different conversation from one who
                finds out in week seven that the pack expires first. */}
            {plan && plan.booked.length > 0 && (
              <p className="small" style={{ marginTop: 8, color: 'var(--tx-ink-3)' }}>
                Books <b>{plan.booked.length}</b>{' '}
                {plan.booked.length === 1 ? 'session' : 'sessions'}
                {sessionDurationMinutes ? ` of ${sessionDurationMinutes} minutes` : ''} —
                first on {dateStr(plan.booked[0].at)}, last on{' '}
                {dateStr(plan.booked[plan.booked.length - 1].at)}.
                {plan.count === null && ' Four weeks out; a monthly has no count to run down.'}
              </p>
            )}
            {plan && plan.short > 0 && (
              <Message tone="warn" className="mt3">
                Only {plan.booked.length} of {plan.count} fit before this pack expires
                on {validityDays ? `day ${validityDays}` : 'its end date'}. Sell a longer
                validity, add a day to the week, or expect to extend it — the sale
                still goes through either way.
              </Message>
            )}
          </div>
        )}

        {/* ── When the payment is due ───────────────────────────────────── */}
        <div className="fld mt3">
          <label className="fld__l" htmlFor="pp-due">
            Payment due by <span className="ink3">· optional</span>
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
            money book cannot chase it. Blank reads as pending, not overdue.
          </p>
        </div>

        {error && (
          <p className="msg msg--warn mt3" role="alert">
            <span>{error}</span>
          </p>
        )}

        <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
          <Button
            variant="primary"
            disabled={pending}
            onClick={submit}
          >
            {pending ? 'Saving…' : isRenewal ? 'Renew it' : 'Sell it'}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={dismiss}>
            Cancel
          </Button>
        </div>

        <p className="small" style={{ marginTop: 14, color: 'var(--tx-ink-3)' }}>
          This records the SALE, not the money. Take the payment in the money book —
          part of it is fine, and the rest stays pending on this pack.
          {!isRenewal && picked.length > 0 && (
            <> The sessions go straight into the schedule; move or cancel any of them
            there without touching the pack.</>
          )}
        </p>
      </div>
    </aside>
  );
}

/** Unrecognised degrades to the commonest kind, as `lib/packs/api.ts` does. */
function asType(value: string | null | undefined): PackType {
  return value === 'monthly' || value === 'single' ? value : 'session_pack';
}
