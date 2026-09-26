'use client';

import { useTheme, type Theme } from './theme';

/**
 * Theme switch — dark or light, as a two-option group.
 *
 * A `ButtonGroup`, not a `Switch`, and the distinction is the one the Switch
 * entry documents: a switch answers "is this on?", and a theme is not on or
 * off. "Dark" pressed and "Light" unpressed says which of two things is true;
 * a switch labelled "Light mode" makes dark the absence of something.
 *
 * Both options carry their own word rather than one label toggling between
 * them, so the control reads the same whichever way it is set — and a screen
 * reader gets "Dark, pressed" instead of a button whose name changes under it.
 *
 * It saves the moment it moves, like every other setting on the account menu.
 * There is no Save under it.
 *
 * ── WHY IT MOVES ────────────────────────────────────────────────────────────
 *
 * The pressed option used to be a background that appeared on one button as it
 * vanished from the other — the same picture, twice, with nothing in between.
 * Nothing in the control connected the two states, so the only thing that told
 * a trainer their press had landed was the whole screen changing colour, which
 * is the RESULT and not the acknowledgement.
 *
 * So the fill became a thumb that travels: one box, drawn once by the track and
 * slid between the two cells. `data-sel` is what it steers by, and it is on the
 * track rather than on the buttons because a moving part cannot be owned by the
 * cell it is currently over — it belongs to the thing it moves within.
 *
 * The buttons keep every bit of their semantics. `aria-pressed` still says which
 * is true, both still carry their own word, and a screen reader hears exactly
 * what it heard before: the thumb is decoration over a control that has not
 * changed. app.css §THEME SWITCH draws it; `theme.ts` crossfades the palette
 * underneath on the same press.
 */
const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

export function ThemeSwitch({ className }: { className?: string }) {
  const [theme, set] = useTheme();

  return (
    <div
      className={['btngroup', 'themesw', className].filter(Boolean).join(' ')}
      role="group"
      aria-label="Colour theme"
      data-sel={theme}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className="btn btn--sm"
          aria-pressed={theme === o.value}
          onClick={() => set(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
