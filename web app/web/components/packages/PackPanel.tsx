'use client';

import { useEffect, useState } from 'react';

import { Glyph } from '@/components/shell/Icons';
import type { PriceListPack } from '@/lib/packs/compute';
import type { PackWrite } from '@/lib/packs/api';
import {
  MONTH_DAYS,
  PERIOD_CHOICES,
  SERVICES,
  VALIDITY_CHOICES,
  periodLabel,
  serviceLabel,
  type PackBasis,
  type PackService,
} from '@/lib/packs/vocab';
import { useDismiss } from '@/lib/ui/dismiss';
import { rupees } from '@/lib/today/time';
import { Button } from '@/web-components/ui/Button';

/**
 * THE PACK PANEL — one question at a time, in the order a trainer would say it
 * out loud: *who sells it, what is it, how is it counted, what does it cost, what
 * do I keep, what do I call it.*
 *
 * It replaces `PackForm`, which was one row of four fields with the owner decided
 * by which card's *Add a pack* had been pressed. Two things were wrong with that.
 * The owner was a side effect of a button position rather than an answer, so a
 * trainer with a gym had to know in advance which of two lists to add to; and the
 * name came first in the markup though it is the one thing the other answers can
 * write for you.
 *
 * ── WHAT EACH ANSWER DOES TO THE NEXT ────────────────────────────────────────
 *
 * **A gym pack is in person** (`pack_gym_floor`), so choosing the gym settles the
 * service and the step says so instead of offering three choices the server would
 * refuse. **Programming has no sessions** — it is always a period — so it takes
 * the *how is it counted* step with it and says why. And **the share is the
 * trainer's own number only**: a percentage of the price or a fixed ₹ cut, never
 * what the gym keeps, which is worked out and shown as the remainder.
 *
 * ── THE NAME FOLLOWS THE ANSWERS UNTIL THE TRAINER TOUCHES IT ─────────────────
 *
 * `12 sessions · Home visit` writes itself from the terms. Typing in the field
 * takes it over for good, so a considered name is never overwritten by a later
 * change to the count.
 *
 * It is the same `.panel` the exercise library's create form uses, and `xl-panel`
 * is what turns it into a bottom sheet under 900px.
 */
type ShareKind = 'percent' | 'amount';

const digits = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);

export interface PackPreset {
  service: PackService;
  basis: PackBasis;
  sessions: number | null;
  validityDays: number | null;
}

export function PackPanel({
  gymName,
  startOwner,
  seed,
  preset,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  /** The gym on the profile. Null means there is no second owner to ask about. */
  gymName: string | null;
  startOwner: 'trainer' | 'gym';
  seed: PriceListPack | null;
  preset: PackPreset | null;
  pending: boolean;
  error?: string | null;
  onSubmit: (fields: PackWrite, owner: 'trainer' | 'gym') => void;
  onClose: () => void;
}) {
  const editing = seed !== null;
  const from = seed ?? preset;
  const whose = gymName ?? 'the gym';

  const [owner, setOwner] = useState<'trainer' | 'gym'>(seed?.owner ?? startOwner);
  const theirs = owner === 'gym';

  const [service, setService] = useState<PackService>(from?.service ?? 'floor');
  const [basis, setBasis] = useState<PackBasis>(from?.basis ?? 'sessions');
  const [sessions, setSessions] = useState(from?.sessions != null ? String(from.sessions) : '12');
  const [validity, setValidity] = useState<number | null>(from?.validityDays ?? null);
  /* A stored length that is not one of the chips (45 days) reopens in the box, so
     an edit never shows a period with nothing pressed. */
  const [customDays, setCustomDays] = useState(
    from?.basis === 'period' && from.validityDays != null
      && !PERIOD_CHOICES.some((p) => p.days === from.validityDays)
      ? String(from.validityDays)
      : '',
  );
  const [amount, setAmount] = useState(seed?.amount ? String(seed.amount) : '');
  const [name, setName] = useState(seed?.name ?? '');
  const [nameTouched, setNameTouched] = useState(editing);
  const [shareKind, setShareKind] = useState<ShareKind>(seed?.trainerShareAmount != null ? 'amount' : 'percent');
  const [share, setShare] = useState(
    seed?.trainerSharePercent != null
      ? String(seed.trainerSharePercent)
      : seed?.trainerShareAmount != null ? String(seed.trainerShareAmount) : '',
  );

  const { closing, dismiss, ref: panelRef } = useDismiss<HTMLDivElement>(onClose);

  /* Focus lands on the panel, not a field: on a phone a focused input opens the
     keyboard over the sheet that was just asked for. Escape closes. */
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dismiss, panelRef]);

  /* The schema's own two rules: a gym pack is in person, programming is a period. */
  const effService: PackService = theirs ? 'floor' : service;
  const effBasis: PackBasis = effService === 'programming' ? 'period' : basis;

  const count = Number(digits(sessions, 3)) || 0;
  const price = Number(digits(amount, 7)) || 0;
  const custom = Number(digits(customDays, 4)) || null;
  /* A period pack must say its length; the chips and the custom box are one answer. */
  const periodDays = effBasis === 'period' ? (custom ?? validity ?? MONTH_DAYS) : null;
  const shareNum = Number(digits(share, shareKind === 'percent' ? 3 : 7));

  const mine = !theirs || share === ''
    ? null
    : shareKind === 'percent' ? Math.round((price * shareNum) / 100) : shareNum;
  const gymPart = mine === null ? null : price - mine;
  const shareOk = !theirs
    || (share !== '' && (shareKind === 'percent' ? shareNum <= 100 : shareNum <= price));

  const per = effBasis === 'sessions' && count > 0 ? Math.round((mine ?? price) / count) : null;
  const valid = price > 0 && shareOk && (effBasis === 'period' ? (periodDays ?? 0) > 0 : count > 0);

  const autoName = effBasis === 'period'
    ? `${effService === 'programming' ? 'Programming' : serviceLabel(effService)} · ${periodLabel(periodDays ?? MONTH_DAYS)}${theirs ? ` · ${whose}` : ''}`
    : `${count || 0} ${count === 1 ? 'session' : 'sessions'}${theirs ? ` · ${whose}` : effService === 'floor' ? '' : ` · ${serviceLabel(effService)}`}`;
  const shownName = nameTouched ? name : autoName;

  function submit() {
    const base: PackWrite = {
      name: shownName.trim() || autoName,
      service: effService,
      basis: effBasis,
      sessions: effBasis === 'sessions' ? count : null,
      validityDays: effBasis === 'period' ? periodDays : validity,
      amount: price,
    };
    onSubmit(
      theirs
        ? {
            ...base,
            // Both keys, one null: the PATCH is by key presence, so changing
            // from a percentage to a fixed amount has to clear the other.
            trainerSharePercent: shareKind === 'percent' ? shareNum : null,
            trainerShareAmount: shareKind === 'amount' ? shareNum : null,
          }
        : base,
      owner,
    );
  }

  /* Numbering counts only the steps drawn, so a trainer with no gym sees 1–5. */
  let step = 0;
  const n = () => ++step;

  return (
    <>
      <button
        className={`scrim scrim--soft${closing ? ' scrim--out' : ''}`}
        type="button"
        aria-label="Close the pack panel"
        onClick={dismiss}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`panel xl-panel pkx-panel${closing ? ' panel--out' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit this pack' : 'New pack'}
      >
        <div className="panel__hd">
          <span className="panel__t">{editing ? 'Edit pack' : 'New pack'}</span>
          <Button
            variant="ghost"
            iconOnly
            label="Close"
            onClick={dismiss}
            style={{ marginLeft: 'auto' }}
            title={undefined}
            icon={<Glyph size={14} d="M18 6 6 18M6 6l12 12" />}
          />
        </div>

        <div className="panel__body">
          {!editing && gymName && (
            <Step n={n()} title="Who sells it?">
              <div className="pkx-opts" role="radiogroup" aria-label="Who sells it">
                <Opt on={!theirs} title="Me" note="Your own price, paid to you" onClick={() => setOwner('trainer')} />
                <Opt on={theirs} title={gymName} note="The gym’s counter price" onClick={() => setOwner('gym')} />
              </div>
            </Step>
          )}

          <Step n={n()} title="What does the client get?">
            {theirs ? (
              <p className="pkx-fixed">
                <b>In person</b> — a gym pack is always on the gym floor, so there is nothing to pick.
              </p>
            ) : (
              <>
                <div className="pkx-opts pkx-opts--4" role="radiogroup" aria-label="What the client gets">
                  {SERVICES.map((s) => (
                    <Opt key={s.id} on={service === s.id} title={s.label} note={s.note} onClick={() => setService(s.id)} />
                  ))}
                </div>
              </>
            )}
          </Step>

          <Step n={n()} title="How is it counted?">
            {effService === 'programming' ? (
              <p className="pkx-fixed">
                <b>A length of time</b> — a plan has no sessions to count, the client trains on their own.
              </p>
            ) : (
              <div className="pkx-opts" role="radiogroup" aria-label="How it is counted">
                <Opt on={basis === 'sessions'} title="A number of sessions" note="12 sessions, 1 session" onClick={() => setBasis('sessions')} />
                <Opt on={basis === 'period'} title="A length of time" note="A month, 12 weeks" onClick={() => setBasis('period')} />
              </div>
            )}

            {effBasis === 'sessions' ? (
              <div className="pkx-sub">
                <div className="fld">
                  <label className="fld__l" htmlFor="pkx-n">Total sessions</label>
                  <input
                    className="ctl ctl--num pkx-num"
                    id="pkx-n"
                    inputMode="numeric"
                    value={sessions}
                    placeholder="12"
                    onChange={(e) => setSessions(digits(e.target.value, 3))}
                  />
                </div>
                <p className="fld__l pkx-l">Good for <span className="pkx-opt">optional</span></p>
                <div className="pkx-chips" role="radiogroup" aria-label="How long the sessions last">
                  {VALIDITY_CHOICES.map((v) => (
                    <button
                      key={String(v.days)}
                      type="button"
                      role="radio"
                      aria-checked={validity === v.days}
                      className="pkx-chip"
                      onClick={() => setValidity(v.days)}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="pkx-sub">
                <p className="fld__l pkx-l">How long does it run?</p>
                <div className="pkx-chips" role="radiogroup" aria-label="How long it runs">
                  {PERIOD_CHOICES.map((p) => (
                    <button
                      key={p.days}
                      type="button"
                      role="radio"
                      aria-checked={custom === null && (validity ?? MONTH_DAYS) === p.days}
                      className="pkx-chip"
                      onClick={() => { setCustomDays(''); setValidity(p.days); }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="fld pkx-custom">
                  <label className="fld__l" htmlFor="pkx-d">Or a number of days</label>
                  <input
                    className="ctl ctl--num pkx-num"
                    id="pkx-d"
                    inputMode="numeric"
                    value={customDays}
                    placeholder="45"
                    onChange={(e) => setCustomDays(digits(e.target.value, 4))}
                  />
                </div>
              </div>
            )}
          </Step>

          <Step n={n()} title={theirs ? `What does ${whose} charge?` : 'What does it cost?'}>
            <div className="fld">
              <label className="fld__l vh" htmlFor="pkx-a">Price</label>
              <div className="affix">
                <span className="affix__p">₹</span>
                <input
                  className="ctl ctl--num pkx-num"
                  id="pkx-a"
                  inputMode="numeric"
                  value={amount}
                  placeholder="9000"
                  onChange={(e) => setAmount(digits(e.target.value, 7))}
                />
              </div>
              {per != null && per > 0 && (
                <span className="pkx-live" role="status">{rupees(per)} a session{theirs ? ' to you' : ''}</span>
              )}
            </div>
          </Step>

          {theirs && (
            <Step n={n()} title="What is your share?">
              <div className="pkx-opts" role="radiogroup" aria-label="How your share is stated">
                <Opt on={shareKind === 'percent'} title="A percentage" note="Of what is collected" onClick={() => { setShareKind('percent'); setShare(''); }} />
                <Opt on={shareKind === 'amount'} title="A fixed ₹ amount" note="Per sale" onClick={() => { setShareKind('amount'); setShare(''); }} />
              </div>
              <div className="fld pkx-sub">
                <label className="fld__l" htmlFor="pkx-share">
                  {shareKind === 'percent' ? 'Your share, of the price' : 'Your share, per sale'}
                </label>
                <div className="affix">
                  <span className="affix__p">{shareKind === 'percent' ? '%' : '₹'}</span>
                  <input
                    className="ctl ctl--num pkx-num"
                    id="pkx-share"
                    inputMode="numeric"
                    value={share}
                    placeholder={shareKind === 'percent' ? '60' : '5400'}
                    aria-invalid={share !== '' && !shareOk}
                    onChange={(e) => setShare(digits(e.target.value, shareKind === 'percent' ? 3 : 7))}
                  />
                </div>
                {share !== '' && !shareOk && (
                  <span className="fld__e">
                    {shareKind === 'percent' ? 'A share is at most 100%.' : 'Your part cannot be more than the price.'}
                  </span>
                )}
                {mine !== null && gymPart !== null && shareOk && price > 0 && (
                  <span className="pkx-live" role="status">
                    You keep {rupees(mine)} · {whose} keeps {rupees(gymPart)}
                  </span>
                )}
              </div>
              <p className="pkx-hint">You only state your own number. The gym’s part is whatever is left, so it is never typed.</p>
            </Step>
          )}

          <Step n={n()} title="What do you call it?">
            <div className="fld">
              <label className="fld__l vh" htmlFor="pkx-name">Name</label>
              <input
                className="ctl"
                id="pkx-name"
                value={shownName}
                maxLength={80}
                onChange={(e) => { setNameTouched(true); setName(e.target.value); }}
              />
              {!nameTouched && <span className="fld__h">Written from your answers. Change it if you like.</span>}
            </div>
          </Step>

          <p className="pkx-hint">
            {editing
              ? 'Saving changes the price list only. Packs already sold keep exactly what was paid.'
              : 'Changing a price later never changes a pack somebody already bought.'}
          </p>

          {error && (
            <p className="msg msg--err" style={{ marginTop: 12 }} role="alert"><span>{error}</span></p>
          )}
        </div>

        <div className="panel__foot">
          <Button variant="ghost" onClick={dismiss}>Cancel</Button>
          <Button variant="primary" disabled={!valid || pending} onClick={submit}>
            {pending ? 'Saving…' : editing ? 'Save' : 'Add pack'}
          </Button>
        </div>
      </div>
    </>
  );
}

export function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="pkx-step">
      <h3 className="pkx-q">{n > 0 && <span className="pkx-n" aria-hidden="true">{n}</span>}{title}</h3>
      {children}
    </section>
  );
}

export function Opt({ on, title, note, onClick }: { on: boolean; title: string; note: string; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={on} className="pkx-o" onClick={onClick}>
      <b>{title}</b>
      <span>{note}</span>
    </button>
  );
}
