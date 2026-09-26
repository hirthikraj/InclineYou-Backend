'use client';

import { useMemo, useState } from 'react';

import { IconCheck, IconSearch, IconShield } from '@/components/auth/Icons';
import { AddChip, Chip, ChipRow } from '@/components/setup/Chips';
import { AddOwn } from '@/components/setup/AddOwn';
import { MAX_CERTIFICATIONS, toggleCertification } from '@/lib/profile/certifications';
import {
  CERTIFICATIONS,
  CERTIFICATIONS_COMMON,
  customId,
  labelFor,
} from '@/lib/setup/options';
import { Table, Row } from '@/web-components/ui/Table';

/**
 * THE CERTIFICATION PICKER — the catalogue, the search and the escape hatch.
 *
 * One component, two callers: setup step 4 (`CertificationsForm`) and the
 * Certifications section of `/settings/profile`. It was the setup step's body
 * until the profile screen needed the same thing, and it moved here rather than
 * being copied because a second copy is a second answer set: `lib/setup/
 * options.ts` opens by explaining what happens when two halves disagree about
 * an id — one profile carrying two spellings of one certificate, and `labelFor`
 * rendering the loser as raw text. Two copies of the PICKER is the same bug
 * arriving from inside one half.
 *
 * It is controlled and it does not save. The setup step writes on Continue; the
 * profile screen writes on Save, alongside the four identity fields. Neither
 * behaviour belongs in here.
 *
 * ## What the shape is for
 *
 * **Chips for the short head, search for the long tail.** Five chips carry the
 * answers most Indian trainers actually give, and the rest of the catalogue is
 * behind a field — because a wall of twenty chips is a wall nobody reads to the
 * end of, and the four that matter are at the top of it.
 *
 * **The phone opens a searchable sheet; a desk does not need one.** The results
 * are on the page, beside the chips. A modal for a list that fits next to the
 * thing it is filtering is a modal that has to be dismissed, and dismissing it
 * is a click spent on nothing.
 *
 * **Anything picked below appears as a chip above.** A selection made in the
 * results has to be visible after the query is cleared, or the trainer cannot
 * tell what they have chosen without searching for it again.
 *
 * **The callout is not a disclaimer.** Four of the eight platforms in the
 * teardown collect certifications and none of them verifies any of it. India
 * has no licensing requirement for personal trainers — no mandated certificate,
 * no statutory register, no protected title — so we collect what trainers hold,
 * say plainly that we have not checked it, and say the same on the profile.
 * That sentence is the point of the screen, not fine print under it.
 */
export function CertificationPicker({
  value,
  onChange,
  disabled = false,
  idPrefix = 'cert',
  children,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** A write is in flight. */
  disabled?: boolean;
  /**
   * Unique per instance. The search field and `AddOwn` both carry a `<label
   * for>`, and two pickers on one page under one prefix would give a screen
   * reader two fields with the same id — the second silently unlabelled.
   */
  idPrefix?: string;
  /** Rendered between the results and the callout — the setup step's message slot. */
  children?: React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);

  function toggle(id: string) {
    onChange(toggleCertification(value, id));
  }

  // The head of the catalogue, plus anything already chosen from the results or
  // typed. Order is deliberate everywhere in `options.ts` — by how often it is
  // picked, never alphabetical — so the common five keep their positions and
  // additions land after them.
  const chips = useMemo(() => {
    const ids = [...CERTIFICATIONS_COMMON];
    for (const id of value) if (!ids.includes(id)) ids.push(id);
    return ids;
  }, [value]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    return CERTIFICATIONS.filter(
      (c) => c.label.toLowerCase().includes(q) || (c.note?.toLowerCase().includes(q) ?? false),
    );
  }, [q]);

  const full = value.length >= MAX_CERTIFICATIONS;

  return (
    <>
      <ChipRow top={20}>
        {chips.map((id) => (
          <Chip
            key={id}
            label={labelFor(id, CERTIFICATIONS)}
            pressed={value.includes(id)}
            // `aria-disabled`, never `disabled` — see `Chips.tsx`. At the cap an
            // unpicked chip stays focusable and announced, so a keyboard user is
            // told the others exist instead of tabbing straight past them.
            dimmed={full && !value.includes(id)}
            disabled={disabled}
            onClick={() => {
              if (full && !value.includes(id)) return;
              toggle(id);
            }}
          />
        ))}
        {adding ? null : (
          <AddChip label="Add your own" disabled={disabled || full} onClick={() => setAdding(true)} />
        )}
      </ChipRow>

      {full ? (
        <p className="small" style={{ marginTop: 8 }}>
          That is {MAX_CERTIFICATIONS} — the most we store. Remove one to add another.
        </p>
      ) : null}

      {adding ? (
        <AddOwn
          id={`${idPrefix}-own`}
          label="Add a certification"
          placeholder="K11 — Sports Nutrition"
          hint="Written exactly as it appears on your certificate."
          onCancel={() => setAdding(false)}
          onAdd={(label) => {
            const id = customId(label);
            if (!value.includes(id)) toggle(id);
          }}
        />
      ) : null}

      {/* A plain field, not an `.affix` group: `app.css`'s affix delta pins the
          prefix to the 44px sign-in field, and this is a 34px one. The glyph
          goes beside the label, where it costs nothing. */}
      <div className="fld" style={{ marginTop: 22, maxWidth: 420 }}>
        <label
          className="fld__l"
          htmlFor={`${idPrefix}-q`}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <IconSearch size={13} />
          Not on the list?
        </label>
        <input
          className="ctl"
          id={`${idPrefix}-q`}
          value={query}
          placeholder="Search certifications"
          autoComplete="off"
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {q ? (
        <div style={{ marginTop: 14, maxWidth: 560 }}>
          {matches.length === 0 ? (
            <p className="small">
              Nothing matches “{query.trim()}”. Add it with the chip above — we’d rather have your
              real certificate than the nearest one on our list.
            </p>
          ) : (
            <Table caption={`${matches.length} certifications matching your search`}>
              {matches.map((option) => (
                <Row
                  key={option.id}
                  selected={value.includes(option.id)}
                  cells={[{
                    key: 'option',
                    className: 'wrap',
                    content: (
                      <button
                        className="rowpick"
                        type="button"
                        aria-pressed={value.includes(option.id)}
                        disabled={disabled || (full && !value.includes(option.id))}
                        onClick={() => toggle(option.id)}
                      >
                        <span style={{ flex: 1 }}>
                          <b style={{ display: 'block', color: 'var(--tx-ink)', fontWeight: 600 }}>
                            {option.label}
                          </b>
                          {option.note ? (
                            <span style={{ fontSize: 12, color: 'var(--tx-ink-3)' }}>
                              {option.note}
                            </span>
                          ) : null}
                        </span>
                        {value.includes(option.id) ? (
                          <span style={{ color: 'var(--tx-accent-text)' }}>
                            <IconCheck size={16} />
                          </span>
                        ) : null}
                      </button>
                    ),
                  }]}
                />
              ))}
            </Table>
          )}
        </div>
      ) : null}

      {children}

      {/* Deliberately plain. This is the sentence that keeps the feature honest. */}
      <div className="trust" style={{ marginTop: 8, maxWidth: '66ch' }}>
        <IconShield size={15} />
        <span>
          <b>We don’t check these.</b> Whatever you add here is shown to clients as something you
          told us, not something we confirmed — and we say so on your profile too.
        </span>
      </div>
    </>
  );
}
