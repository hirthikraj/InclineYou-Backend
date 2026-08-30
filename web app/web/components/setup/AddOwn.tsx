'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * "Add your own" — the escape hatch behind every dashed chip.
 *
 * Every catalogue in this flow is a best guess at what Indian trainers hold and
 * speak, and **a catalogue that cannot be added to quietly tells the people it
 * missed that they do not exist.** One field, one button, no taxonomy.
 *
 * The phone puts this in a bottom sheet, because a phone has nowhere else to
 * put it. A desk has the room beside the chips, so it is an inline row rather
 * than a modal: a dialog for one text field is a dialog that has to be
 * dismissed, and dismissing it is a click a trainer spends on nothing.
 *
 * Anything typed here is stored with a `custom:` id (`lib/setup/options.ts`), so
 * it never collides with a catalogue entry and the label survives without a
 * lookup table.
 */
export function AddOwn({
  id = 'add-own',
  label,
  placeholder,
  hint,
  onAdd,
  onCancel,
}: {
  /**
   * The field's id, and the `<label for>` that points at it. Defaults to the
   * one every setup step uses, because a step only ever opens one hatch.
   * `/settings/profile` is the first screen that will hold several — one per
   * catalogue section — and two fields sharing an id leaves the second one
   * unlabelled to a screen reader with nothing visibly wrong.
   */
  id?: string;
  label: string;
  placeholder: string;
  hint: string;
  /** Receives the trimmed label. Deduping is the caller's job. */
  onAdd: (label: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const trimmed = value.trim();

  function submit() {
    if (!trimmed) return;
    onAdd(trimmed);
    setValue('');
    onCancel();
  }

  return (
    <div className="fld" style={{ marginTop: 16, maxWidth: 420 }}>
      <label className="fld__l" htmlFor={id}>
        {label}
      </label>
      {/* Wraps, and the input is a flex item rather than a `width:100%` block.
          `.ctl` is `width:100%`, which as a flex basis is the whole row — so
          with wrapping on it would have pushed Add and Cancel onto their own
          line at every width. A real basis lets the three share a row on a desk
          and stack only when they genuinely cannot. */}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input
          className="ctl"
          id={id}
          ref={input}
          style={{ flex: '1 1 160px', width: 'auto', minWidth: 0 }}
          value={value}
          maxLength={40}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Not a `<form>`: this sits inside the step's own form, and a
              // nested submit would fire Continue instead of adding the entry.
              e.preventDefault();
              submit();
            }
            if (e.key === 'Escape') onCancel();
          }}
        />
        <button className="btn btn--secondary" type="button" disabled={!trimmed} onClick={submit}>
          Add
        </button>
        <button className="btn btn--ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <span className="fld__h">{hint}</span>
    </div>
  );
}
