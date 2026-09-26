'use client';

import type { ReactNode } from 'react';

import { Field } from './Field';

/**
 * Textarea — free text nobody validates. Never loses what was typed.
 *
 * The vertical-only resize is the design's, and it is right: a textarea that can
 * be dragged wider escapes the column it sits in and the form reflows around a
 * box the trainer was only trying to make taller.
 *
 * `maxLength` is deliberately not wired to a silent truncation. A note that
 * stops accepting characters mid-sentence, with no count and no message, is the
 * one failure this control cannot have — the trainer is mid-thought and has no
 * idea the end of it is being dropped. Pass `limit` and the count appears.
 */
export function Textarea({
  label,
  hint,
  error,
  width,
  limit,
  hideLabel,
  value,
  defaultValue,
  ...area
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  width?: number | string;
  /** Shows a live count. Does not truncate — it tells, it does not take. */
  limit?: number;
  /**
   * The label is said somewhere else on the screen, so draw it for readers
   * only. `Field` has taken this since it was written and `TextField` and
   * `Select` forward it; this one did not, which is the gap the client's
   * check-in found — a question set at 24px directly above its own box would
   * otherwise print the same sentence twice, 14px apart.
   *
   * CLIPPED, never dropped: `display:none` takes the accessible name with it
   * when the label is the control's only text.
   */
  hideLabel?: boolean;
  value?: string;
  defaultValue?: string;
} & Omit<React.ComponentPropsWithoutRef<'textarea'>, 'className' | 'id' | 'value' | 'defaultValue'>) {
  const length = (value ?? defaultValue ?? '').length;
  const over = limit !== undefined && length > limit;

  return (
    <Field
      label={label}
      error={error ?? (over ? `${length - limit} characters over` : undefined)}
      hint={
        limit !== undefined && !error ? (
          <>
            {hint ? <>{hint} · </> : null}
            {length}/{limit}
          </>
        ) : (
          hint
        )
      }
      width={width}
      hideLabel={hideLabel}
    >
      {(a) => (
        <textarea
          className="ctl"
          style={{ resize: 'vertical' }}
          value={value}
          defaultValue={defaultValue}
          {...a}
          {...area}
        />
      )}
    </Field>
  );
}
