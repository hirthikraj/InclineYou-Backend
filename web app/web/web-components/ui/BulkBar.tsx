'use client';

import type { ReactNode } from 'react';

import { CheckboxCell } from './Checkbox';

/**
 * Bulk bar — replaces the toolbar, in place, once rows are selected.
 *
 * In place is the specification: it takes the toolbar's position rather than
 * appearing above or below it, so nothing on the screen moves when a checkbox
 * is ticked. A bar that pushes the table down by 48px makes the row under the
 * pointer a different row.
 *
 * ── IT HAS TO SAY THE COUNT OUT LOUD ────────────────────────────────────────
 *
 * The bar appearing is a visual event. `role="status"` with `aria-live` is what
 * turns it into an announced one — "3 clients selected" — and the count is why:
 * a trainer about to archive in bulk needs the number before the verb, not
 * after the confirm.
 *
 * The leading checkbox is indeterminate whenever some but not all are selected,
 * which is the one state the header checkbox exists to show and the one JSX
 * silently drops. `CheckboxCell` sets it through a ref.
 *
 * ── AND IT COUNTS IN THE RIGHT NOUN ─────────────────────────────────────────
 *
 * `noun` is the PLURAL and the select-all always wants it — *Select all 5
 * programs* — but the count does not: ticking one row announced *1 programs
 * selected*, which is the bar's most-read line getting its own grammar wrong.
 * `one` is the singular, optional, and where a caller does not pass it nothing
 * changes. Not derived by trimming an `s`: this bar will eventually count
 * people.
 */
export function BulkBar({
  count,
  total,
  noun,
  one,
  onSelectAll,
  actions,
  /** Drawn in place, for a specimen. */
  inline,
  className,
}: {
  count: number;
  total: number;
  /** "clients", "payments" — plural, and it is said in the announcement. */
  noun: string;
  /** "client", "payment" — the count's noun where exactly one is ticked. */
  one?: string;
  onSelectAll?: () => void;
  actions: ReactNode;
  inline?: boolean;
  className?: string;
}) {
  return (
    <div
      className={['bulk', className].filter(Boolean).join(' ')}
      style={inline ? { position: 'static', borderRadius: 'var(--tx-r2)' } : undefined}
    >
      <CheckboxCell
        /* `one` here too: a list of one draws *Select all 1 workout templates*
           otherwise, which is the same grammar slip the count had. */
        label={`Select all ${total} ${total === 1 ? one ?? noun : noun}`}
        checked={count === total && total > 0}
        indeterminate={count > 0 && count < total}
        onChange={onSelectAll}
      />
      {/* THE COUNT IS A FIGURE AND THE NOUN IS A WORD, and they were one 13.5px
          bold string set from an INLINE STYLE — which is trap 2 twice over: an
          inline `fontSize` outranks every selector including a media query, so
          no stylesheet could ever have restyled the one line this bar exists to
          say, and 13.5px bold made the number the same weight and the same face
          as the label beside it.

          Split, the figure takes the table's own numeric treatment — mono,
          tabular, a step up — which is what `.ptrow__f` gives every other number
          on this screen, so the bar's count reads as one of the column's figures
          rather than as a sentence about them. The noun steps down and tracks
          out. The announced text is unchanged: `role="status"` reads the
          concatenation, and it still says *2 programs selected*. */}
      {/* The live region is the COUNT alone: it was the whole bar, so the select-all checkbox and the action
          button sat inside a `role="status"` and were re-read on every change. */}
      <b className="bulk__n" role="status" aria-live="polite">
        <span className="bulk__c">{count}</span>{' '}
        {count === 1 ? (one ?? noun) : noun} selected
      </b>
      <span className="bulk__acts">{actions}</span>
    </div>
  );
}
