'use client';

import { useState } from 'react';

import { autoName, perSession, rupees, type PackType } from '@/lib/setup/money';
import { Chip, ChipRow } from './Chips';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { TextField } from '@/web-components/ui/Field';

export interface PackFields {
  name: string;
  type: PackType;
  sessions: number | null;
  amount: number;
  validityDays: number | null;
}

/**
 * Defining a pack — the price list entry, not a sale.
 *
 * **The per-session figure is computed live and shown under the price**, because
 * that is the number a trainer actually negotiates with and the one nobody works
 * out on paper. It is never typed: a field for it would be a field that can
 * disagree with the two numbers above it.
 *
 * A panel rather than the phone's bottom sheet. Adding two or three packs is the
 * common case, and a modal that has to be opened and dismissed three times is
 * three dismissals a desk does not need to spend.
 *
 * **Shared by setup step 7 and `/packages`, because they are the same question
 * asked at two moments** — *what do you sell?* The phone's `PackSheet` carries
 * the identical note and the identical reason, and a second copy of four fields
 * and three chips is a second place the per-session rule has to be got right.
 *
 * `seed` is what makes it serve both. Absent, this is the add form it has always
 * been; present, it opens on an existing price. It is read ONCE, at mount — so a
 * caller editing a list must `key` this component by the pack's id, or clicking
 * a second row would re-open the first one's numbers.
 */
export function PackSheet({
  owner,
  gymName,
  pending,
  seed,
  submitLabel,
  onAdd,
  onCancel,
}: {
  owner: 'trainer' | 'gym';
  gymName: string | null;
  pending: boolean;
  /** An existing price to open on. Read at mount only — `key` by its id. */
  seed?: PackFields | null;
  /** Overrides "Add this pack" / "Add this package" when editing. */
  submitLabel?: string;
  onAdd: (fields: PackFields) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<PackType>(seed?.type ?? 'session_pack');
  const [sessions, setSessions] = useState(seed?.sessions != null ? String(seed.sessions) : '12');
  const [amount, setAmount] = useState(seed?.amount ? String(seed.amount) : '');
  const [validity, setValidity] = useState(seed?.validityDays != null ? String(seed.validityDays) : '');
  const [name, setName] = useState(seed?.name ?? '');

  const count = type === 'single' ? 1 : Number(sessions.replace(/\D/g, '')) || 0;
  const price = Number(amount.replace(/\D/g, '')) || 0;
  const per = perSession({ type, sessions: count, amount: price });
  const valid = price > 0 && (type === 'monthly' || count > 0);
  const label = autoName(type, count);

  const theirs = owner === 'gym';
  const whose = gymName ?? 'the gym';

  return (
    /* `.pk__panel` and NOT `style={{marginTop,maxWidth}}`. An inline declaration
       outranks every selector including a media query, and `/packages` docks this
       form to the bottom of the screen below 900px — with the width inline that
       rule could never have applied, which is the shape of six bugs this project
       has already recorded. The class carries both numbers unchanged, so setup
       step 7 renders exactly as it did. */
    <Card
      title={<>{seed
            ? theirs
              ? `Edit this ${whose} package`
              : 'Edit this pack'
            : theirs
              ? `A package ${whose} sells`
              : 'A pack you sell'}</>}
      className="pk__panel"
    >
      {/* The flow's `Chip`, not a raw `.chip` button. Same markup today —
          which is the problem: two definitions of the same control drift on
          the next change, and the `aria-disabled` cap rule and the pressed
          state both live in the component. */}
      <ChipRow top={0}>
        {(
          [
            ['session_pack', 'Session pack'],
            ['monthly', 'Monthly'],
            ['single', 'Single session'],
          ] as [PackType, string][]
        ).map(([id, text]) => (
          <Chip key={id} label={text} pressed={type === id} onClick={() => setType(id)} />
        ))}
      </ChipRow>

      {/* `.fldrow`, not `.row`: the four fields were pinned at 150–190px
          inline, and an inline width outranks a media query — so on a phone
          they overflowed the card instead of stacking in it. The widths are
          classes in app.css now, and under 560px each field takes a line. */}
      <div className="fldrow" style={{ marginTop: 16 }}>
        {type === 'session_pack' ? (
          <TextField
            label="How many sessions"
            id="pk-n"
            numeric
            className="fld--w1"
            inputMode="numeric"
            value={sessions}
            placeholder="16"
            onChange={(e) => setSessions(e.target.value.replace(/\D/g, '').slice(0, 3))}
          />
        ) : null}

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
              placeholder="6000"
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))}
            />
          </div>
          {per != null && per > 0 ? (
            <span className="fld__h" style={{ color: 'var(--tx-accent-text)', fontWeight: 600 }}>
              {rupees(per)} a session
            </span>
          ) : null}
        </div>

        {/* The unit is in the label, not in a suffix. §07's `.affix` is a
            PREFIX only — `.affix .ctl` hard-codes `0 r2 r2 0`, so an affix on
            the right leaves the input's left corners square and its right
            corners rounded under the unit. Faking it with four inline
            overrides is how a stylesheet acquires a second, undocumented
            affix; the label carries it instead. */}
        <TextField
          label={<>Valid for, in days{' '}
            <span style={{ fontWeight: 400, color: 'var(--tx-ink-3)' }}>optional</span></>}
          id="pk-v"
          numeric
          className="fld--w1"
          inputMode="numeric"
          value={validity}
          placeholder="No expiry"
          onChange={(e) => setValidity(e.target.value.replace(/\D/g, '').slice(0, 4))}
        />

        <TextField
          label={<>Call it <span style={{ fontWeight: 400, color: 'var(--tx-ink-3)' }}>optional</span></>}
          id="pk-name"
          className="fld--w3"
          value={name}
          placeholder={label}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <p className="small" style={{ marginTop: 14, maxWidth: '64ch' }}>
        {theirs ? (
          <>
            This is the gym’s price, not yours — put down what their counter actually charges. Your
            cut of it is your gym share, and you can’t discount a price you don’t set.
          </>
        ) : (
          <>
            Changing a price here never changes a pack somebody already bought. What they paid is
            what they paid.
          </>
        )}
      </p>

      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <Button
          variant="primary"
          disabled={!valid || pending}
          onClick={() =>
            onAdd({
              name: name.trim() || label,
              type,
              sessions: type === 'monthly' ? null : count,
              amount: price,
              validityDays: Number(validity.replace(/\D/g, '')) || null,
            })
          }
        >
          {submitLabel ?? (theirs ? 'Add this package' : 'Add this pack')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
