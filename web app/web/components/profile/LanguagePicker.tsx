'use client';

import { useMemo, useState } from 'react';

import { AddChip, Chip, ChipRow } from '@/components/setup/Chips';
import { AddOwn } from '@/components/setup/AddOwn';
import { LANGUAGES, LANGUAGES_ON_CARD, customId, labelFor } from '@/lib/setup/options';
import { Tag } from '@/web-components/ui/Tag';

/**
 * THE LANGUAGE PICKER — ten chips, no cap, and the free differentiator.
 *
 * One component, two callers: setup step 5 (`LanguagesForm`) and the Languages
 * tab of `/settings/profile`.
 *
 * **Zero of the eight platforms in the teardown ask this.** In a market where a
 * client may specifically want a Tamil- or Marathi-speaking coach, it is one
 * field no competitor can match, and the reason the rail's hint for the setup
 * step that renders this is "nobody else asks".
 *
 * **No cap, deliberately.** Someone who genuinely coaches in five languages
 * should be able to say so; the argument that caps specialities — "does
 * everything" tells a client nothing — does not apply, because a language is a
 * fact about what a session sounds like rather than a claim about breadth. The
 * only ceiling is the server's 25, which no honest answer will reach.
 *
 * Tamil leads because nothing in `options.ts` is alphabetical: every list there
 * is ordered by how often an Indian trainer actually picks it.
 *
 * Every chosen id gets a chip, catalogue or not — see `SpecialityPicker`, where
 * the seed data that proved why is named. A stored id this list has never heard
 * of must be visible and removable rather than invisible and re-saved.
 */
export function LanguagePicker({
  value,
  onChange,
  disabled = false,
  idPrefix = 'lang',
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** A write is in flight. */
  disabled?: boolean;
  /** Unique per instance — see `SpecialityPicker`. */
  idPrefix?: string;
}) {
  const [adding, setAdding] = useState(false);

  const chips = useMemo(() => {
    const ids = LANGUAGES.map((o) => o.id);
    for (const id of value) if (!ids.includes(id)) ids.push(id);
    return ids;
  }, [value]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  return (
    <>
      {/* The profile card names the first FOUR and counts the rest, so which four is a decision the trainer is making whether or
          not they know it. The chips carry their place, and this line says what the place is for. */}
      <div className="spk__count">
        {value.length > 0 ? <Tag>{value.length}</Tag> : null}
        <span className="small">
          {value.length > LANGUAGES_ON_CARD
            ? `Your profile names the first ${LANGUAGES_ON_CARD}. Unpick and re-pick to change which.`
            : `The first ${LANGUAGES_ON_CARD} are named on your profile, in the order you pick them.`}
        </span>
      </div>

      <div role="group" aria-label="Languages">
        <ChipRow>
          {chips.map((id) => (
            <Chip
              key={id}
              label={labelFor(id, LANGUAGES)}
              pressed={value.includes(id)}
              rank={value.includes(id) ? value.indexOf(id) + 1 : undefined}
              disabled={disabled}
              onClick={() => toggle(id)}
            />
          ))}
          {adding ? null : (
            <AddChip label="Another language" disabled={disabled} onClick={() => setAdding(true)} />
          )}
        </ChipRow>
      </div>

      {adding ? (
        <AddOwn
          id={`${idPrefix}-own`}
          label="Another language"
          placeholder="Odia"
          hint="Clients searching in this language will find you."
          onCancel={() => setAdding(false)}
          onAdd={(label) => {
            const id = customId(label);
            if (!value.includes(id)) toggle(id);
          }}
        />
      ) : null}
    </>
  );
}
