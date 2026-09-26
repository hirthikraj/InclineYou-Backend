/**
 * Count badge — a number of things a trainer can act on.
 *
 * Two rules the type enforces, because both were being broken by hand:
 *
 * `label` is required. A bare "13" beside an icon is a number with no noun; a
 * screen reader gets "thirteen" and nothing else. The digits stay visual and
 * the sentence goes to `aria-label`.
 *
 * A zero renders nothing at all. "0" is not a count a trainer can act on, and
 * a badge that is sometimes zero trains the eye to stop seeing the badge.
 */
export function CountBadge({
  n,
  label,
  tone = 'neutral',
  className,
}: {
  n: number;
  /** What the number counts, as a sentence: "13 clients need you today". */
  label: string;
  tone?: 'neutral' | 'acc' | 'alert';
  className?: string;
}) {
  if (n <= 0) return null;

  return (
    <span
      className={['rail__n', tone === 'neutral' ? null : `rail__n--${tone}`, className].filter(Boolean).join(' ')}
      aria-label={label}
    >
      {/* Capped, not truncated: past a point the exact number stops changing what
          anyone does about it, and four digits break the pill's width. */}
      {n > 99 ? '99+' : n}
    </span>
  );
}
