import type { ReactNode } from 'react';

/**
 * Notice bar — a full-width band above a surface, saying what is true of it.
 *
 * ── WHAT IT IS NOT, WHICH IS THREE OTHER THINGS THE CATALOGUE ALREADY HAS ──
 *
 * `Message` (`.msg`) is the app answering a SUBMISSION — the server said no,
 * the team is at its seat limit — and it sits between the last field and the
 * button, inside a form. `Toast` is a receipt for something that just finished.
 * `EmptyState` replaces a surface that has nothing in it.
 *
 * This is none of those. It is a CONDITION of a surface that still draws: the
 * schedule is in move-mode and the next click means something different; no
 * working hours are set so nothing is hatched; this range holds no sessions but
 * the track under it is still bookable. The surface stays, and the bar says what
 * is true of it — which is exactly why it is not an `EmptyState`, and why the
 * empty-range case reaches for this instead. A grid with nothing in it is still
 * seven columns a trainer can click to book into; replacing it with a centred
 * illustration would take the fastest booking path off the screen at the one
 * moment it is the only thing left to do there.
 *
 * ── WHY IT IS A COMPONENT NOW, AND NOT AT THE SECOND CALL-SITE ─────────────
 *
 * `.sch__moving` and `.sch__nohours` in app.css were this bar twice — identical
 * geometry, identical face, two fills — and the second was already a copy of the
 * first. Two is a coincidence; the schedule's empty-range band would have been
 * the third, in the same file, with the same declarations, which is the drift
 * the catalogue exists to catch. So the pattern is extracted at the moment a
 * third call-site asks for it, which is the rule `SetRows`, `Stat`, `Table` and
 * `PhoneChange` were each extended under: extend or promote rather than copy.
 *
 * Both originals now render through this, and every value in `.ntc` is theirs
 * unchanged, so the conversion is provably a no-op on what was already drawn.
 *
 * ── THE TONE IS WHAT THE BAR IS, NOT WHAT COLOUR IT IS ─────────────────────
 *
 *   `accent`  a MODE the reader is in and can leave. It changes what the next
 *             click does, so it is the loud one, and it should be announced.
 *   `info`    a standing condition of the screen. True when the screen loaded
 *             and true after; not news, so it is quiet and it is not announced.
 *
 * ── `live` IS OFF BY DEFAULT, FOR `Message`'s REASON ───────────────────────
 *
 * A bar that appears because the trainer pressed *Move* is news and has to
 * reach a reader who is not looking at the grid. A bar that has been sitting
 * there since the page loaded is not, and a live region that re-reads it every
 * time the clock ticks is the noise `EmptyState` declines for its own two
 * non-filtered kinds.
 */
export function NoticeBar({
  tone = 'info',
  icon,
  live,
  action,
  className,
  children,
}: {
  tone?: 'accent' | 'info';
  /** The glyph, at 14px. Unlike `.msg`, no space is reserved when it is absent —
   *  this bar is a sentence and a verb, and a 14px hole before a sentence that
   *  never has an icon reads as a missing one. */
  icon?: ReactNode;
  /** Announce it. See the note above: true for a mode, false for a condition. */
  live?: boolean;
  /** At most one, and it goes to the far end. Two verbs in a band is a toolbar. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={['ntc', `ntc--${tone}`, className].filter(Boolean).join(' ')}
      role={live ? 'status' : undefined}
    >
      {icon}
      {/* The sentence is its own element so `.ntc`'s `gap` separates it from the
          glyph and the button, and so the button's `margin-left:auto` has
          something to push off. A bare text node would take neither. */}
      <span>{children}</span>
      {action}
    </div>
  );
}
