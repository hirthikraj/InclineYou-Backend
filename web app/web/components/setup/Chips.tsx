'use client';

import { IconPlus } from '@/components/auth/Icons';
import { Chip as UiChip } from '@/web-components/ui/Chip';

/**
 * The chip row every pick-one and pick-many step uses — §11's `.chip`.
 *
 * One rule, and it has its own frame (5b): **at the cap the unpicked chips drop
 * to 38% and something says what a click will now do.** Never a silently dead
 * chip — a tap that does nothing is indistinguishable from a broken button, and
 * specialities is the screen where a trainer is likeliest to keep clicking.
 *
 * `aria-pressed` rather than `aria-selected`: these are toggle buttons, which is
 * what `.chip[aria-pressed="true"]` styles and what a screen reader can report a
 * state change on.
 *
 * **`dimmed` is `aria-disabled`, never `disabled`, and the distinction is the
 * whole point of the frame.** A real `disabled` takes the chip out of the tab
 * sequence, so a keyboard or screen-reader user at the cap tabs from the fifth
 * chip straight to "Add your own" and is never told the other seven exist — the
 * silent dead chip, arrived at from the other direction. `aria-disabled` keeps it
 * reachable and announced, which is what lets the line above it be read.
 *
 * `disabled` is kept for the other thing entirely: a write in flight, where the
 * control genuinely should not be reachable because the answer is already on its
 * way to the server.
 */
export function Chip({
  label,
  pressed,
  dimmed = false,
  disabled = false,
  mono = false,
  rank,
  onClick,
}: {
  label: string;
  pressed: boolean;
  /** At the cap and not chosen. Refused, but still focusable and announced. */
  dimmed?: boolean;
  /** A write is in flight. Genuinely unreachable, because the answer has gone. */
  disabled?: boolean;
  /**
   * The label is a machine string a trainer has to CHECK character by character
   * — the five UPI IDs on step 8, and nothing else in the flow. Tabular figures
   * are the whole point there; a proportional 0 beside a proportional 8 is how a
   * read-back stops being one.
   */
  mono?: boolean;
  /** Where a chosen chip stands in an ORDERED choice (1 is first): drawn as a number on the chip and said in its name. */
  rank?: number;
  onClick: () => void;
}) {
  return (
    <UiChip
      pressed={pressed}
      aria-disabled={dimmed || undefined}
      aria-label={rank ? `${label}, number ${rank}` : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {rank ? <span className="chip__rank" aria-hidden="true">{rank}</span> : null}
      {mono ? <span className="mono">{label}</span> : label}
    </UiChip>
  );
}

/**
 * The dashed escape hatch. Every catalogue in this flow can be added to.
 *
 * `.chip--ghost` ships its own pressed state (`accent-soft`, not the solid fill
 * a value chip gets) and that difference is right: a ghost chip opens a field
 * rather than being an answer, so "currently open" must not look like "chosen".
 * Step 8's *Type a different one* is the one caller that uses it.
 */
export function AddChip({
  label,
  disabled = false,
  pressed = false,
  icon = true,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  /** The hatch is open. Not an answer — see above. */
  pressed?: boolean;
  /** The plus reads as "add to a list"; step 8 replaces a value rather than
      adding to one, so it asks for the label alone. */
  icon?: boolean;
  onClick: () => void;
}) {
  return (
    <UiChip ghost pressed={pressed || undefined} disabled={disabled} onClick={onClick}>
      {icon ? <IconPlus size={12} /> : null}
      {label}
    </UiChip>
  );
}

/**
 * `className` is for the one row whose contents have a shape of their own: the
 * seven weekdays, which under 560px stop being a wrapping chip row and become a
 * seven-column grid — see `.chiprow--days` in app.css.
 */
export function ChipRow({
  children,
  top = 18,
  className,
}: {
  children: React.ReactNode;
  top?: number;
  className?: string;
}) {
  return (
    <div
      className={`row${className ? ` ${className}` : ''}`}
      style={{ flexWrap: 'wrap', gap: 8, marginTop: top }}
    >
      {children}
    </div>
  );
}
