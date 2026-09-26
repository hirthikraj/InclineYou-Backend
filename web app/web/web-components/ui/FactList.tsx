import type { ReactNode } from 'react';

/**
 * FACT LIST — a stored record read back, one line per field.
 * Catalogue entry `c-factlist`, `.facts`.
 *
 * ── IT IS NOT `KeyValue`, AND THE WEIGHT RUNS THE OTHER WAY ─────────────────
 *
 * `.kv` sets its key in the body face at the value's own size, with a fixed 80px
 * key track and `flex-wrap:nowrap` — right for a settings list, where the label
 * is the content and the value is a state. A RECORD is the opposite: *170 cm* is
 * the content and *Height* is the index to it, so the figure takes the weight,
 * the size and the right-hand edge, and the label is what is allowed to wrap.
 *
 * That is the whole reason this is a second family and not a `.kv` variant. The
 * two were one class for a week and the 80px track was the tell — *Mobile
 * number* wrapped to three lines inside it while `+91 98411 03288` had 200px of
 * room, which is the layout reading the record backwards.
 *
 * ── WHY IT IS A COMPONENT NOW ───────────────────────────────────────────────
 *
 * It was `FactRow` in `PersonalTab.tsx`, a local function drawing `.cffact__r` —
 * exactly the condition the catalogue exists to end, and the rename off the
 * `cf` (client file) prefix is the second half of that: a family named after the
 * one screen that has it so far is a family the next screen re-writes. Nothing
 * about a stored record is client-file-specific.
 *
 * It briefly carried an `info` prop — a ringed `i` with a tooltip — which was
 * there for the two metabolism rows and nothing else: a DERIVED figure has to
 * say where it came from, a typed-in one does not. Those rows went on 15 Sep
 * 2026 and the affordance went with them rather than staying as a hook for a
 * caller that may never arrive.
 *
 * ── THE SECOND LINE, AND WHAT IT IS FOR ─────────────────────────────────────
 *
 * `note` is the qualifier under a figure — *42 years old* under a birth day, the
 * day a weight was taken under the weight. Lighter and smaller than the value
 * on purpose: the figure is the part that changes and the part the eye is
 * looking for. It is a slot rather than something the caller appends to
 * `children`, so the two can never be set at the same size by accident.
 */
export function FactList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={['facts', className].filter(Boolean).join(' ')}>{children}</div>;
}

function Row({
  /** The label. The part that may wrap. */
  k,
  /** The figure. The part that must not. */
  children,
  /** The qualifier under the figure — a date, an age, a unit in words. */
  note,
  stack = false,
}: {
  k: ReactNode;
  children: ReactNode;
  note?: ReactNode;
  /**
   * THE ONE ROW WHOSE VALUE IS A SENTENCE.
   *
   * `.facts__v` is `white-space:nowrap` and right-aligned, which is the whole
   * contract of this family: the figure must not wrap and the label may. A
   * returned check-in breaks that in one place and one place only — *Which lift
   * felt strongest this block?* is answered in a line and a half of prose, and
   * a nowrap value 300px wide inside a 420px card is trap 9 arriving through a
   * different door.
   *
   * So the row stacks: the label keeps its size and its ink, the value drops
   * under it, keeps its weight, and is allowed to wrap. It is NOT a second
   * component — the weight still runs the record's way round, the value is
   * still the content and the label still the index to it, which is the
   * argument this file opens with. What changes is the axis.
   */
  stack?: boolean;
}) {
  return (
    <div className={stack ? 'facts__r facts__r--stack' : 'facts__r'}>
      <span className="facts__k">{k}</span>
      <span className="facts__v">
        {children}
        {note ? <span className="facts__on">{note}</span> : null}
      </span>
    </div>
  );
}

/**
 * The value when the record does not hold one.
 *
 * An em dash in `--tx-ink-3`, and it is a part rather than something each
 * call-site types, because the three renderings this replaced were `—`, `-` and
 * an empty string — and an empty string is the one that reads as a row that
 * failed to load rather than a field nobody has filled in.
 */
function Blank() {
  return <span className="facts__none">&mdash;</span>;
}

FactList.Row = Row;
FactList.Blank = Blank;
