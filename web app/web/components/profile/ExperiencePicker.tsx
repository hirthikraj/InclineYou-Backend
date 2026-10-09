'use client';

import { useRef } from 'react';

import { EXPERIENCE_BANDS } from '@/lib/setup/options';

/**
 * How long a trainer has been coaching — ONE of five bands.
 *
 * It was five `aria-pressed` chips, which is the grammar of independent toggles: a
 * screen reader heard "button, not pressed" five times and never *one of five*, the
 * arrow keys did nothing, and the whole decision on the screen was drawn at the
 * smallest size on it. It is a labelled radio group now, drawn as option cards (the
 * Packages panel's `pkx-o`, so a trainer meets one way of choosing between a few
 * things): one tab stop, the arrow keys move AND choose, as a radio group does, and
 * the picked card says so with a tick as well as a stroke.
 *
 * Shared by setup step 3 and Settings, deliberately — see `CertificationPicker`.
 */
export function ExperiencePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const n = EXPERIENCE_BANDS.length;
  const current = EXPERIENCE_BANDS.findIndex((b) => b.id === value);

  function move(to: number) {
    const i = (to + n) % n;
    onChange(EXPERIENCE_BANDS[i].id);
    refs.current[i]?.focus();
  }

  return (
    <div
      className="xpk"
      role="radiogroup"
      aria-label="How long you have been coaching"
      onKeyDown={(e) => {
        const at = current < 0 ? 0 : current;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(at + 1); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(current < 0 ? n - 1 : at - 1); }
        else if (e.key === 'Home') { e.preventDefault(); move(0); }
        else if (e.key === 'End') { e.preventDefault(); move(n - 1); }
      }}
    >
      {EXPERIENCE_BANDS.map((band, i) => {
        const on = value === band.id;
        return (
          <button
            key={band.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={on}
            /* a radio group is ONE tab stop: the chosen card, or the first when none is chosen */
            tabIndex={on || (current < 0 && i === 0) ? 0 : -1}
            className="pkx-o xpk__o"
            disabled={disabled}
            onClick={() => onChange(band.id)}
          >
            <b>{band.label}</b>
          </button>
        );
      })}
    </div>
  );
}
