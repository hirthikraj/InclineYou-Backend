'use client';

import { useRef } from 'react';

import { CODE_LENGTH } from '@/lib/auth/policy';

/**
 * §05 · ONE REAL INPUT, SIX DRAWN SLOTS.
 *
 * The mobile spec forbids the alternative in as many words — "one real input
 * under six slots, never six inputs" — and the reasons are all recovery ones:
 * six inputs break paste, break `autocomplete="one-time-code"`, and give a
 * screen reader six unlabelled fields to announce instead of one labelled by
 * the headline. The input here spans the row, is transparent, and the slots are
 * `aria-hidden`.
 *
 * The caret is the slot carrying the focus ring rather than a text cursor,
 * because a real caret inside a 52px box reads as a cursor in the wrong place.
 */
export function OtpInput({
  value,
  onChange,
  onSubmit,
  state,
  labelledBy,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Enter, once six digits are present. */
  onSubmit?: () => void;
  /** What the slots say about the last answer. `err` keeps the digits. */
  state: 'idle' | 'err' | 'ok';
  labelledBy: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const digits = value.slice(0, CODE_LENGTH);

  return (
    <div className="otp" onClick={() => inputRef.current?.focus()}>
      <input
        ref={inputRef}
        className="otp__in"
        // The three attributes that make an SMS code arrive by itself. Chrome
        // and Safari both key the autofill suggestion off `one-time-code`.
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={CODE_LENGTH}
        aria-labelledby={labelledBy}
        value={digits}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && digits.length === CODE_LENGTH) {
            e.preventDefault();
            onSubmit?.();
          }
        }}
      />
      {Array.from({ length: CODE_LENGTH }, (_, i) => {
        const filled = i < digits.length;
        // The caret sits on the first empty slot, and stays on the last one
        // once all six are typed rather than falling off the end of the row.
        const isCaret = !disabled && i === Math.min(digits.length, CODE_LENGTH - 1);
        const classes = [
          'otp__s',
          filled ? 'otp__s--on' : '',
          state === 'err' ? 'otp__s--err' : '',
          state === 'ok' ? 'otp__s--ok' : '',
          state === 'idle' && isCaret ? 'otp__s--cur' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <span key={i} className={classes} aria-hidden="true">
            {digits[i] ?? ''}
          </span>
        );
      })}
    </div>
  );
}
