import type { CSSProperties, ReactNode } from 'react';

/**
 * Inline message — one line about the screen, not about a field.
 *
 * ── THE BOUNDARY WITH `Field`'s ERROR, WHICH IS THE POINT ───────────────────
 *
 * `.fld__e` is what went wrong with THIS control: it hangs off one input, it is
 * named by that input's `aria-describedby`, and a reader hears it when it lands
 * on the field. This is what went wrong with the SUBMISSION — the server said
 * no, the team is at its seat limit — and it belongs to the form, sitting where
 * the eye goes next, between the last field and the button.
 *
 * They were being conflated, in both directions. `ui/Field.tsx` used to render
 * its error in `.fld__h` (the hint class, grey), and `Team.tsx` grew its own
 * `.form-err` in `app/styles/app.css` for the form-level case — while §04 has
 * had `.msg` for it all along, used twenty-nine times across the auth screens
 * and the setup flow. Two answers to a question the design system had already
 * answered.
 *
 * ── WHY IT HAD NO COMPONENT ─────────────────────────────────────────────────
 *
 * No reason anybody wrote down. `.msg` is one of the most-used classes in §04
 * and it had no file in `ui/` and no row in `registry.ts`, so every screen that
 * needed one copied the markup — and the one screen that did not copy it
 * invented a replacement instead. That is the shape the catalogue exists to
 * prevent, arriving from the direction the catalogue was not looking.
 *
 * ── THE ICON IS NOT DECORATION ──────────────────────────────────────────────
 *
 * `.msg` is `display: flex` with a `gap: 8px` and a `min-height: 38px` — the
 * space is reserved for a glyph whether or not one is passed. Colour alone
 * carries the difference between a warning and a confirmation, and colour alone
 * is gone for anyone who cannot separate the two hues, so a message that means
 * something should say it twice: the tone and the glyph.
 */
export type MessageTone = 'err' | 'warn' | 'ok';

export function Message({
  tone,
  icon,
  alert,
  className,
  style,
  children,
}: {
  tone?: MessageTone;
  /** The glyph, at 15px. `.msg` reserves its place either way. */
  icon?: ReactNode;
  /**
   * Announce it. An error that appears in response to pressing Save is news; a
   * standing note about the screen is not, and a live region that re-reads the
   * latter on every unrelated update is noise. Off by default for that reason.
   */
  alert?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      className={['msg', tone ? `msg--${tone}` : null, className].filter(Boolean).join(' ')}
      style={style}
      role={alert ? 'alert' : undefined}
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}
