import { PACK_EXPIRING_DAYS } from '@/lib/today/deck';

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
  ended = false,
  daysLeft = null,
  inline = false,
  className,
}: {
  remaining: number;
  /** The pack's size. Without it there is a count and no bar — see above. */
  total?: number;
  /**
   * The pack ran past its end date (22 Nov 2026). Its sessions are LOST, so it draws no bar — a 9/12 bar on an ended pack
   * read as a healthy one — and says *Ended* with what went unused.
   */
  ended?: boolean;
  /** Days to the pack's end date. Within `PACK_EXPIRING_DAYS` it is toned as low whatever the count says. */
  daysLeft?: number | null;
  /** One line, "6 of 12 left", for a card's text column — the phone roster, where no column header names the figure. */
  inline?: boolean;
  className?: string;
}) {
  const dateNear = daysLeft != null && daysLeft <= PACK_EXPIRING_DAYS;
  const low = ended ? 'ended' : remaining <= 0 ? 'out' : remaining <= 2 || dateNear ? 'low' : undefined;
  const cls = ['pk', inline ? 'pk--inline' : null, className].filter(Boolean).join(' ');

  if (ended) {
    return (
      <span className={cls} data-low={low}>
        <b>Ended</b>
        {remaining > 0 && <span className="pk__note">{remaining} unused</span>}
      </span>
    );
  }
  const pct =
    total != null && total > 0
      ? Math.max(0, Math.min(100, Math.round((remaining / total) * 100)))
      : null;

  return (
    <span className={cls} data-low={low}>
      {inline ? (
        <b>
          {remaining}
          {total != null && <i> of {total}</i>} left
        </b>
      ) : (
        <b>
          {remaining}
          {total != null && <i>/{total}</i>}
        </b>
      )}
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
