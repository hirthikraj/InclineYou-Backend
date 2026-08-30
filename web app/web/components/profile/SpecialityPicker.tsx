'use client';

import { useMemo, useState } from 'react';

import { AddChip, Chip, ChipRow } from '@/components/setup/Chips';
import { AddOwn } from '@/components/setup/AddOwn';
import { SPECIALITIES, SPECIALITY_CAP, customId, labelFor } from '@/lib/setup/options';

/**
 * THE SPECIALITY PICKER — twelve chips, a cap of five, and an escape hatch.
 *
 * One component, two callers: setup step 3 (`SpecialitiesForm`) and the
 * Specialities tab of `/settings/profile`. Extracted rather than copied for the
 * reason `lib/setup/options.ts` opens with — two versions of one answer set is
 * how a profile ends up carrying two spellings of one answer.
 *
 * **The cap is the point, and it is the whole control.** A trainer who "does
 * everything" tells a client nothing, so it is 5 of 12, the counter is live, and
 * at the cap the unpicked chips drop to 38% with a line above saying what a
 * click will now do. That counter and that line are in here rather than in
 * either caller, because they are the state of this control and not of the
 * screen around it.
 *
 * **Never a silently dead chip.** At the cap an unpicked chip refuses and says
 * why; it is `aria-disabled` and not `disabled`, so a keyboard user still
 * reaches it and is told the other seven exist instead of tabbing past them —
 * see `Chips.tsx`, which carries the rest of that argument.
 *
 * **And the refusal never drops an old answer to make room.** Silently
 * un-picking the oldest choice would be the app editing an answer the trainer
 * did not ask it to touch, which is worse than a refused click that explains
 * itself.
 *
 * ## Every chosen id gets a chip, including ones this catalogue has never heard
 * of
 *
 * MEASURED BUG, and it only exists on the profile. In setup the value can only
 * have come from these twelve chips or from `AddOwn`, so drawing the catalogue
 * plus the `custom:` entries covered every case. On `/settings/profile` the
 * value comes from the **server**, which holds whatever the phone, an older
 * catalogue or a seed script last wrote — and both seed scripts write
 * `fat_loss` and `post_natal`, which are neither catalogue entries (those are
 * `weight_loss` and `natal`) nor `custom:` ids.
 *
 * Drawn the old way those two were **invisible and still counted**: the meter
 * read 3/5 above one pressed chip, the trainer could not remove what they could
 * not see, and Save wrote them straight back. So the row is the catalogue plus
 * anything else chosen, which is what `CertificationPicker` already did — an id
 * with no label renders as itself, which is ugly and honest and removable,
 * where hiding it was none of the three.
 */
export function SpecialityPicker({
  value,
  onChange,
  disabled = false,
  idPrefix = 'spec',
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** A write is in flight. */
  disabled?: boolean;
  /**
   * Unique per instance — `AddOwn` carries a `<label for>`, and two hatches on
   * one page under one prefix leave the second field silently unlabelled.
   */
  idPrefix?: string;
}) {
  const [adding, setAdding] = useState(false);

  const atCap = value.length >= SPECIALITY_CAP;

  // The catalogue, then anything chosen that is not in it — a typed answer, or
  // an id written by something other than this screen. Either way an answer
  // that disappears into a counter is not an answer.
  const chips = useMemo(() => {
    const ids = SPECIALITIES.map((o) => o.id);
    for (const id of value) if (!ids.includes(id)) ids.push(id);
    return ids;
  }, [value]);

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((x) => x !== id));
      return;
    }
    if (atCap) return;
    onChange([...value, id]);
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
        <span className={`tag${atCap ? ' tag--acc' : ''}`}>
          {value.length}/{SPECIALITY_CAP}
        </span>
        {atCap ? (
          <span className="small" style={{ color: 'var(--tx-warn)' }}>
            That’s {SPECIALITY_CAP}. Click one of the chosen to swap it out.
          </span>
        ) : null}
      </div>

      <ChipRow>
        {chips.map((id) => (
          <Chip
            key={id}
            label={labelFor(id, SPECIALITIES)}
            pressed={value.includes(id)}
            dimmed={atCap && !value.includes(id)}
            disabled={disabled}
            onClick={() => toggle(id)}
          />
        ))}
        {adding ? null : (
          <AddChip
            label="Add your own"
            disabled={disabled || atCap}
            onClick={() => setAdding(true)}
          />
        )}
      </ChipRow>

      {adding ? (
        <AddOwn
          id={`${idPrefix}-own`}
          label="Add a speciality"
          placeholder="Kettlebell training"
          hint="Shown on your profile exactly as you type it."
          onCancel={() => setAdding(false)}
          // Toggle would REMOVE an entry that is already there — typing
          // something you already picked must not silently unpick it.
          onAdd={(label) => {
            const id = customId(label);
            if (!value.includes(id)) toggle(id);
          }}
        />
      ) : null}
    </>
  );
}
