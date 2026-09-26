import { ArrowDown, ChevronDown, WarnIcon } from '@/components/programs/Icons';

/**
 * Balance strip — a panel that will not fit, folded to one line.
 *
 * The disclosure summary for `.wsbal`: the week's size, and whether anything is
 * out of band. It is always in the document and `display:none` wherever the
 * panel has a column of its own, so the wide layout carries neither a duplicate
 * control nor a duplicate node in the accessibility tree.
 *
 * ── UNDER THE FLOOR IS NOT OVER THE CEILING ──────────────────────────
 *
 * This took ONE list and drew it under one amber ⚠ as *N flags*, and the panel
 * it summarises had already settled that those are two different statements:
 * over the ceiling is the risk, so it keeps amber and points up; under the
 * floor is a gap rather than a hazard, so it stays neutral and points down
 * (`BalancePanel`'s `Track`). The strip contradicted the chart it opens.
 *
 * The cost is not theoretical. On `tpl_004` — *Return to Lifting · post-injury*,
 * two days a week, deliberately low — all four groups are UNDER, and the strip
 * read **⚠ 4 flags** over a program whose volume is exactly what its author
 * intended. A warning on a legitimate pattern is a warning a trainer learns to
 * ignore, and then misses the one that meant something. That sentence is
 * `.wsd__dup`'s, about the same board.
 *
 * So two props and two readings. Neither is colour alone: each carries its own
 * glyph and its own word — *over band* / *under band* — and the glyphs are the
 * panel's, so the strip and the track a trainer opens it to read agree.
 *
 * ── WHAT IT DECIDES, AND WHAT IT DOES NOT ───────────────────────────
 *
 * It decides the SENTENCE: the singular/plural of both counts, that a clean
 * week still states its size rather than going silent, and that the flagged
 * groups arrive by name rather than as a bare number. Every one of those was a
 * decision taken once and would otherwise be retaken at each call site.
 *
 * It decides nothing about training. `total` and `flagged` come from
 * `lib/programs/balance.ts`, which owns the landmarks and states the rule this
 * component has to obey: a band is read as a RANGE, never as a target. So
 * nothing here says what the number should be — the strip reports and offers to
 * open the evidence.
 *
 * It is not a `<div>` with a chevron drawn on it. `aria-expanded` and
 * `aria-controls` are required, because the one thing a reader must be told is
 * that pressing this reveals something and where that something is.
 */
export function BalanceStrip({
  total,
  over,
  under,
  open,
  bodyId,
  onToggle,
  className,
}: {
  /** Sets in the week, from `balance.total`. */
  total: number;
  /**
   * Groups ABOVE the adaptive ceiling — `balanceFlags().high`. The risk half:
   * the week is asking more of these than it can pay for.
   */
  over: string[];
  /**
   * Groups UNDER the minimum effective volume — `balanceFlags().low`. A gap,
   * not a hazard. See the two-reading note on the component above.
   */
  under: string[];
  open: boolean;
  /** The id of the element this discloses. Required: the strip is a control. */
  bodyId: string;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      className={['wsbal__sum', className].filter(Boolean).join(' ')}
      type="button"
      aria-expanded={open}
      aria-controls={bodyId}
      onClick={onToggle}
    >
      <span className="wsbal__sumk">Balance</span>
      <span className="wsbal__sumt">
        {total} set{total === 1 ? '' : 's'}
      </span>
      {/* OVER FIRST AND ONLY OVER IS AMBER — the reading order is the panel's
          and it is unchanged. What is new is that the two readings no longer
          share a glyph or a colour.

          The groups by NAME, not just the count, in both halves —
          `balanceFlags`' own argument: *two groups are out of band* is a number
          a trainer then has to resolve against six tracks. Ellipsized by CSS
          when the strip is too narrow, never truncated by JS. */}
      {over.length > 0 && (
        <span className="wsbal__sumf">
          <WarnIcon size={12} />
          {over.length} over band
          <em>{over.join(', ')}</em>
        </span>
      )}
      {under.length > 0 && (
        <span className="wsbal__sumf wsbal__sumf--low">
          <ArrowDown size={12} />
          {under.length} under band
          <em>{under.join(', ')}</em>
        </span>
      )}
      {over.length === 0 && under.length === 0 && (
        <span className="wsbal__sumok">every group in band</span>
      )}
      <span className="wsbal__sumcv" aria-hidden="true">
        <ChevronDown size={13} />
      </span>
    </button>
  );
}
