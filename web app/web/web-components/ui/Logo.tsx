import type { CSSProperties } from 'react';

/**
 * InclineYou — the mark and the lockup.
 *
 * Both are lifted from `identity.html`, which is the identity's source of
 * truth: three ascending chevrons, the bottom two in the lockup's own ink at
 * 24% and 48%, the top one in the accent. Stroke 6.5 on a 48-unit grid, mitred
 * and butt-capped — the corners are sharp and the ends are square, and both of
 * those are the mark rather than an accident of the renderer.
 *
 * ── ONE LOCKUP, NOT THREE ───────────────────────────────────────────────────
 *
 * The rail, the sign-in shell and the setup rail each hand-built the arrangement
 * with their own pixel values — `gap:11`, `fontSize:16`, `letterSpacing:-.02em`
 * repeated inline twice and a fourth set in `.rail__word`. None of them agreed,
 * and none of them could be re-sized without editing three files. `.lk` in §04
 * takes one number, `--cap`, and derives the rest; this renders it.
 *
 * ── HALF THE LOCKUP INHERITS, HALF IS FIXED — HENCE NO `tone` PROP ─────────
 *
 * *Incline* and the two faded chevrons are `currentColor`: they take the ink of
 * wherever the lockup is put, so the light and dark palettes need no branch
 * here. *You* and the top chevron are `--lk-a`, which §04 points at
 * `--tx-wordmark`: the brand lime at H76° S86% in both themes, lit for its
 * ground — L63% (#C6F24E) on dark, L28% (#64850A) on light. Same hue, same
 * saturation, different lightness, so *You* never changes COLOUR. Only
 * *Incline* does, and it does it by inheriting whatever ink it is sitting on.
 *
 * `.lk--ink` is the one escape hatch, for a lockup put ON the lime plate, where
 * lime-on-lime would be nothing at all. The old mark hard-coded `#0A0B0D` for
 * exactly the opposite reason — it could only ever sit on the lime tile.
 */
export function Mark({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g strokeWidth="6.5" strokeLinejoin="miter" strokeLinecap="butt">
        <path d="M10 42 L24 30 L38 42" stroke="currentColor" opacity=".24" />
        <path d="M10 32 L24 20 L38 32" stroke="currentColor" opacity=".48" />
        <path d="M10 22 L24 10 L38 22" stroke="var(--lk-a, currentColor)" />
      </g>
    </svg>
  );
}

/**
 * The full lockup — mark plus wordmark.
 *
 * `cap` is the one dial. It sets the wordmark's size in pixels and the mark and
 * the gap follow from it, so `cap={17}` in a 56px bar and `cap={58}` on a splash
 * are the same object at two sizes rather than two arrangements.
 *
 * The wordmark is one `<span>` with *You* inside it rather than two siblings,
 * so it cannot be broken across a line or read as two words by anything parsing
 * the document. `aria-label` on the whole lockup names it once; the mark is
 * `aria-hidden` because it is the same word said twice.
 */
export function Logo({
  cap = 17,
  variant = 'full',
  className,
  style,
}: {
  /** Wordmark size in px. The mark is 1.30× it and the gap 0.40×. */
  cap?: number;
  /** `mark` drops the wordmark; `stacked` puts it under the mark. */
  variant?: 'full' | 'stacked' | 'mark';
  className?: string;
  style?: CSSProperties;
}) {
  const cls = ['lk', variant === 'stacked' ? 'lk--stack' : null, className]
    .filter(Boolean)
    .join(' ');

  if (variant === 'mark') {
    return (
      <span
        className={cls}
        style={{ ['--cap' as string]: `${cap}px`, ...style }}
        role="img"
        aria-label="InclineYou"
      >
        <Mark className="lk__m" />
      </span>
    );
  }

  return (
    <span className={cls} style={{ ['--cap' as string]: `${cap}px`, ...style }}>
      <Mark className="lk__m" />
      <span className="lk__w">
        Incline<span className="lk__you">You</span>
      </span>
    </span>
  );
}
