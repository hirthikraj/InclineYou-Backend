/**
 * Meter — one bar, two or three parts of a whole.
 *
 * ── WHY THE SEGMENTS ARE NORMALISED HERE ────────────────────────────────────
 *
 * The design file writes the widths as percentages the author worked out:
 * `54% / 32% / 14%`. Every call-site doing that arithmetic by hand is a place
 * where the bar can quietly fail to reach its end — and a meter that stops at
 * 97% reads as a fourth, unlabelled segment.
 *
 * Passing raw amounts and letting this component divide is the fix. It also
 * makes the bar honest when the parts do not sum to the total: an explicit
 * `total` larger than the segments leaves a real gap, which is the one case
 * where a short bar means something.
 */
/**
 * ── `acc` IS THE BASE FILL, AND IT WAS UNREACHABLE ──────────────────────────
 *
 * §04 defines FIVE fills for a segment: `.meter i` is `--tx-accent`, and
 * `.ok` / `.warn` / `.danger` / `.dim` override it. The union named only the
 * four overrides, so the one the stylesheet treats as the default could not be
 * asked for — every caller had to pick a STATUS colour for something that might
 * be a plain quantity.
 *
 * That is not cosmetic. `--tx-ok` means *this went well*, so the history's
 * volume bars rendered a heavy session in success-green and a light one in less
 * of it — the product taking a side on how much somebody lifted, which is the
 * same refusal `WEIGHT_HAS_NO_TONE` makes one file over. A magnitude needs a
 * fill that is not a verdict.
 *
 * It emits no modifier class, so the base rule applies and `webapp.css` is
 * untouched.
 */
export type MeterTone = 'acc' | 'ok' | 'warn' | 'danger' | 'dim';

export function Meter({
  segments,
  total,
  size = 'md',
  label,
  describe = true,
  className,
}: {
  segments: { tone: MeterTone; value: number; label?: string }[];
  /** The whole. Defaults to the sum, which fills the bar. */
  total?: number;
  size?: 'md' | 'lg';
  /** What the bar is of. Becomes the accessible name — a bar alone says nothing. */
  label: string;
  /**
   * WHETHER THE SEGMENTS ARE READ OUT AFTER THE LABEL. On by default, because
   * *paid 62%, owed 38%* is the whole content of an ordinary meter and a bar
   * that announces only its title tells a reader nothing.
   *
   * Off for the bar whose segments are GEOMETRY rather than parts anybody
   * cares about. The assessment screen's tape bars place a lit stretch inside
   * a client's own recorded range with two spacers either side of it, so the
   * default announcement came out as *…: below 59%, this block 41%, above 0%*
   * appended to a sentence that had already said the reading, the move and the
   * range in words. The spacers are not parts of a whole; they are where the
   * mark is.
   */
  describe?: boolean;
  className?: string;
}) {
  const sum = segments.reduce((n, s) => n + Math.max(0, s.value), 0);
  const whole = total ?? sum;

  return (
    <div
      className={['meter', size === 'lg' ? 'meter--lg' : null, className].filter(Boolean).join(' ')}
      role="img"
      aria-label={
        describe
          ? `${label}: ` +
            segments
              .map(
                (s) => `${s.label ?? s.tone} ${whole > 0 ? Math.round((s.value / whole) * 100) : 0}%`,
              )
              .join(', ')
          : label
      }
    >
      {segments.map((s, i) => (
        <i
          key={i}
          /* `acc` names the base rule rather than adding one — see `MeterTone`. */
          className={s.tone === 'acc' ? undefined : s.tone}
          style={{ width: whole > 0 ? `${(Math.max(0, s.value) / whole) * 100}%` : 0 }}
        />
      ))}
    </div>
  );
}
