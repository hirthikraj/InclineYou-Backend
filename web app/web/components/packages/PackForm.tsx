'use client';

import { useState } from 'react';

import { Chip, ChipRow } from '@/components/setup/Chips';
import type { PriceListPack } from '@/lib/packs/compute';
import type { PackWrite } from '@/lib/packs/api';
import { MONTH_DAYS, SERVICES, serviceLabel, type PackBasis, type PackService } from '@/lib/packs/vocab';
import { rupees } from '@/lib/today/time';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { TextField } from '@/web-components/ui/Field';

/**
 * ONE FORM FOR EVERY PACK, IN THE v1 VOCABULARY.
 *
 * `PackSheet` (the setup flow's) speaks the older three-way *session pack ·
 * monthly · single* and cannot say *where* a pack is delivered, which is half of
 * what v1 stores. This one speaks `service` + `basis` directly — and the two are
 * translated at the edge by `lib/packs/vocab.ts`, so neither screen holds a
 * mixture.
 *
 * ── A GYM PACK'S SHARE IS ENTERED ONCE, AND THE GYM'S PART IS NEVER TYPED ─────
 *
 * The trainer states what THEY get — a percentage of the price, or a fixed
 * amount — because that is the number in their agreement with the gym. The gym's
 * part is the remainder and is only ever shown ("Gym keeps ₹3,600, worked out
 * for you"): a second field for it would be a second place to disagree with the
 * first, and the server derives it on every read for the same reason.
 */
type ShareKind = 'percent' | 'amount';

const digits = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);

export function PackForm({
  owner,
  gymName,
  pending,
  seed,
  error,
  onSubmit,
  onCancel,
}: {
  owner: 'trainer' | 'gym';
  gymName: string | null;
  pending: boolean;
  seed: PriceListPack | null;
  /** A refusal from the last attempt, drawn inside the form so it is next to the field it is about. */
  error?: string | null;
  onSubmit: (fields: PackWrite) => void;
  onCancel: () => void;
}) {
  const theirs = owner === 'gym';
  const whose = gymName ?? 'the gym';

  const [service, setService] = useState<PackService>(seed?.service ?? 'floor');
  const [basis, setBasis] = useState<PackBasis>(seed?.basis ?? 'sessions');
  const [sessions, setSessions] = useState(seed?.sessions != null ? String(seed.sessions) : '12');
  const [validity, setValidity] = useState(
    seed?.validityDays != null ? String(seed.validityDays) : '',
  );
  const [amount, setAmount] = useState(seed?.amount ? String(seed.amount) : '');
  const [name, setName] = useState(seed?.name ?? '');
  const [shareKind, setShareKind] = useState<ShareKind>(
    seed?.trainerShareAmount != null ? 'amount' : 'percent',
  );
  const [share, setShare] = useState(
    seed?.trainerSharePercent != null
      ? String(seed.trainerSharePercent)
      : seed?.trainerShareAmount != null
        ? String(seed.trainerShareAmount)
        : '',
  );

  /* A gym pack is in-person by the schema's own check (`pack_gym_floor`), and
     programming has no sessions to count (`programming` is a period pack). */
  const effectiveService: PackService = theirs ? 'floor' : service;
  const effectiveBasis: PackBasis = effectiveService === 'programming' ? 'period' : basis;

  const count = Number(digits(sessions, 3)) || 0;
  const price = Number(digits(amount, 7)) || 0;
  const days = Number(digits(validity, 4)) || null;
  const shareNum = Number(digits(share, shareKind === 'percent' ? 3 : 7));

  const trainerPart = !theirs || share === ''
    ? null
    : shareKind === 'percent' ? Math.round((price * shareNum) / 100) : shareNum;
  const gymPart = trainerPart === null ? null : price - trainerPart;
  const shareOk = !theirs
    || (share !== '' && (shareKind === 'percent' ? shareNum <= 100 : shareNum <= price));

  const per = effectiveBasis === 'sessions' && count > 0 ? Math.round((trainerPart ?? price) / count) : null;
  const valid = price > 0 && shareOk && (effectiveBasis === 'period' || count > 0);

  const autoName = effectiveBasis === 'period'
    ? `${effectiveService === 'programming' ? 'Programming' : 'Monthly'}${theirs ? ` · ${whose}` : ''}`
    : `${count || 0} sessions${theirs ? ` · ${whose}` : effectiveService === 'floor' ? '' : ` · ${serviceLabel(effectiveService)}`}`;

  function submit() {
    const base: PackWrite = {
      name: name.trim() || autoName,
      service: effectiveService,
      basis: effectiveBasis,
      sessions: effectiveBasis === 'sessions' ? count : null,
      // A period pack must say how long it lasts; a session block may be open-ended.
      validityDays: effectiveBasis === 'period' ? days ?? MONTH_DAYS : days,
      amount: price,
    };
    onSubmit(theirs
      ? {
          ...base,
          // Both keys, one of them null: the PATCH is by key presence, and switching
          // from a percentage to a fixed amount has to clear the other.
          trainerSharePercent: shareKind === 'percent' ? shareNum : null,
          trainerShareAmount: shareKind === 'amount' ? shareNum : null,
        }
      : base);
  }

  return (
    <Card
      title={seed
        ? theirs ? `Edit this ${whose} package` : 'Edit this pack'
        : theirs ? `A package ${whose} sells` : 'A pack you sell'}
      className="pk__panel"
    >
      {!theirs && (
        <>
          <p className="fld__l" style={{ marginBottom: 6 }}>Where it is delivered</p>
          <ChipRow top={0}>
            {SERVICES.map((s) => (
              <Chip
                key={s.id}
                label={s.label}
                pressed={service === s.id}
                onClick={() => setService(s.id)}
              />
            ))}
          </ChipRow>
          <p className="small" style={{ color: 'var(--tx-ink-3)', marginTop: 6 }}>
            {SERVICES.find((s) => s.id === service)?.note}
          </p>
        </>
      )}

      {effectiveService !== 'programming' && (
        <>
          <p className="fld__l" style={{ margin: '14px 0 6px' }}>What it covers</p>
          <ChipRow top={0}>
            <Chip label="A block of sessions" pressed={basis === 'sessions'} onClick={() => setBasis('sessions')} />
            <Chip label="A period of time" pressed={basis === 'period'} onClick={() => setBasis('period')} />
          </ChipRow>
        </>
      )}

      <div className="fldrow" style={{ marginTop: 16 }}>
        {effectiveBasis === 'sessions' && (
          <TextField
            label="How many sessions"
            id="pk-n"
            numeric
            className="fld--w1"
            inputMode="numeric"
            value={sessions}
            placeholder="12"
            onChange={(e) => setSessions(digits(e.target.value, 3))}
          />
        )}

        <div className="fld fld--w2">
          <label className="fld__l" htmlFor="pk-a">
            {theirs ? `What ${whose} charges` : 'Price'}
          </label>
          <div className="affix">
            <span className="affix__p">₹</span>
            <input
              className="ctl ctl--num"
              id="pk-a"
              inputMode="numeric"
              value={amount}
              placeholder="9000"
              onChange={(e) => setAmount(digits(e.target.value, 7))}
            />
          </div>
          {per != null && per > 0 ? (
            <span className="fld__h" style={{ color: 'var(--tx-accent-text)', fontWeight: 600 }}>
              {rupees(per)} a session{theirs ? ' to you' : ''}
            </span>
          ) : null}
        </div>

        <TextField
          label={effectiveBasis === 'period'
            ? 'Valid for, in days'
            : <>Valid for, in days{' '}<span style={{ fontWeight: 400, color: 'var(--tx-ink-3)' }}>optional</span></>}
          id="pk-v"
          numeric
          className="fld--w1"
          inputMode="numeric"
          value={validity}
          placeholder={effectiveBasis === 'period' ? String(MONTH_DAYS) : 'No expiry'}
          onChange={(e) => setValidity(digits(e.target.value, 4))}
        />

        <TextField
          label={<>Call it <span style={{ fontWeight: 400, color: 'var(--tx-ink-3)' }}>optional</span></>}
          id="pk-name"
          className="fld--w3"
          value={name}
          placeholder={autoName}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {theirs && (
        <div style={{ marginTop: 18 }}>
          <p className="fld__l" style={{ marginBottom: 6 }}>What you get from it</p>
          <ChipRow top={0}>
            <Chip label="A share of the price" pressed={shareKind === 'percent'} onClick={() => { setShareKind('percent'); setShare(''); }} />
            <Chip label="A fixed amount" pressed={shareKind === 'amount'} onClick={() => { setShareKind('amount'); setShare(''); }} />
          </ChipRow>
          <div className="fldrow" style={{ marginTop: 12 }}>
            <div className="fld fld--w2">
              <label className="fld__l" htmlFor="pk-share">
                {shareKind === 'percent' ? 'You get, of the price' : 'You get, per sale'}
              </label>
              <div className="affix">
                <span className="affix__p">{shareKind === 'percent' ? '%' : '₹'}</span>
                <input
                  className="ctl ctl--num"
                  id="pk-share"
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
            </div>
          </div>
          {trainerPart !== null && gymPart !== null && shareOk && price > 0 && (
            <p className="small" style={{ marginTop: 10, fontWeight: 600 }} role="status">
              You get {rupees(trainerPart)} · {whose} keeps {rupees(gymPart)}{' '}
              <span style={{ fontWeight: 400, color: 'var(--tx-ink-3)' }}>(worked out for you)</span>
            </p>
          )}
        </div>
      )}

      <p className="small" style={{ marginTop: 14, maxWidth: '64ch' }}>
        {theirs ? (
          <>
            This is the gym’s price, not yours — put down what their counter actually charges. The
            gym’s part is whatever is left after yours, so it is never typed.
          </>
        ) : (
          <>
            Changing a price here never changes a pack somebody already bought. What they paid is
            what they paid.
          </>
        )}
      </p>

      {error && (
        <p className="msg msg--err" style={{ marginTop: 12 }} role="alert">
          <span>{error}</span>
        </p>
      )}

      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <Button variant="primary" disabled={!valid || pending} onClick={submit}>
          {seed ? 'Save' : theirs ? 'Add this package' : 'Add this pack'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
