/**
 * Pack gauge — how much of what they bought is left.
 *
 * A count over a short bar, toned by how little remains: the house green while
 * there is room, amber at two or fewer, red at none.
 *
 * ── WHY THE BAR, WHEN THE FRACTION IS RIGHT THERE ───────────────────────────
 *
 * Because `0/24` and `20/24` are the same shape. Measured on the roster's
 * Sessions-left column, every cell is two numerals, a slash and two numerals,
 * set in the same tabular figures at the same weight and ranged right — twenty
 * three rows of identical silhouette in which the one client with nothing left
 * is not findable without reading each one. The phone card list has drawn this
 * bar since it shipped; the desk table, which is the view a trainer actually
 * triages in, drew the bare fraction.
 *
 * ── WHY IT IS NOT `Meter` ───────────────────────────────────────────────────
 *
 * `Meter` draws two or three parts OF A WHOLE and requires a `label`, because a
 * bar on its own says nothing. This draws one part and always carries its own
 * figure beside it, so the figure IS the accessible name and a `label` would be
 * the same fact announced twice. `MeterTone` is also a vocabulary about what
 * each SEGMENT is; here the tone is a threshold on a single remainder, which is
 * a different fact wearing the same three colours.
 *
 * ── AND THE TONE IS NOT ONLY COLOUR ─────────────────────────────────────────
 *
 * The bar's LENGTH carries the same fact — an empty pack draws no bar at all —
 * so the state survives for a reader who cannot separate green from red. That
 * is what the 3px is for. A toned numeral alone would not have earned it.
 *
 * ── `total` IS OPTIONAL AND THE BAR IS NOT DRAWN WITHOUT IT ─────────────────
 *
 * A pack with no stated size is a real row on this wire — an open arrangement,
 * billed per session — and a bar needs a denominator. It renders the count
 * alone rather than guessing one, which is the same refusal `Meter` makes when
 * its segments do not sum to its total: a bar that stops short has to mean
 * something.
 */
export function PackGauge({
  remaining,
  total,
  className,
}: {
  remaining: number;
  /** The pack's size. Without it there is a count and no bar — see above. */
  total?: number;
  className?: string;
}) {
  /*
   * `low` at two or fewer and `out` at none, which are `roster.ts`'s own
   * thresholds for the *Pack ends in 2 sessions* and *Pack is empty* lines. The
   * gauge and the sentence beside it are one reading, so the numbers live in
   * one place — if they drift, a row says a pack is ending in amber next to a
   * bar that is still green.
   */
  const low = remaining <= 0 ? 'out' : remaining <= 2 ? 'low' : undefined;
  const pct =
    total != null && total > 0
      ? Math.max(0, Math.min(100, Math.round((remaining / total) * 100)))
      : null;

  return (
    <span className={['pk', className].filter(Boolean).join(' ')} data-low={low}>
      <b>
        {remaining}
        {total != null && <i>/{total}</i>}
      </b>
      {pct != null && (
        /*
         * `<s>`, which the phone card chose and this keeps: it is the one
         * inline element in the set with no meaning of its own that §04 has not
         * already spent, and the rail of `text-decoration:none` in the
         * stylesheet is what cancels the browser's strike. A `<div>` here would
         * be a block inside an inline-flex column, which is what it already is,
         * announced as a paragraph break by a reader that ignores CSS.
         */
        <s className="pk__bar" aria-hidden="true">
          <s style={{ width: `${pct}%` }} />
        </s>
      )}
    </span>
  );
}
