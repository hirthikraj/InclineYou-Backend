'use client';

import { Select } from '@/web-components/ui/Select';

/**
 * *COMPARE WITH…* — ONE CONTROL, DRAWN ON BOTH TABS, READING ONE PARAMETER.
 *
 * It was the Summary's alone and held in React state. Both halves of that were
 * wrong once it had to exist on the Measurements tab too:
 *
 * - **State could not survive the trip.** `PageTabs` is a strip of LINKS, so
 *   moving between the two tabs is a server render — a comparison held in a
 *   `useState` is gone by the time the trainer arrives at the panel they picked
 *   it to look at. It is `?cmp=` now, and the tab links carry it.
 * - **Two copies would drift.** The obvious repair is a second `<Select>` on
 *   the other tab, with its own option list built from the same array a
 *   slightly different way — which is how one control ends up offering the
 *   check-in you are reading on one tab and not the other. One component,
 *   imported twice.
 *
 * ── THE CHECK-IN YOU ARE READING IS NOT IN THE LIST ─────────────────────────
 *
 * Offering it would draw a column of zeroes under a heading that says the same
 * date twice. The filtering is here rather than at the call-sites for the
 * reason above: it is the rule, not a detail of one screen.
 */
export function CompareSelect({
  returned,
  currentId,
  value,
  onChange,
  className,
}: {
  /** Every check-in this client has had back, newest first. */
  returned: { id: string; at: string }[];
  /** The one being read. Dropped from the options. */
  currentId: string;
  value: string | null;
  onChange: (id: string | null) => void;
  className?: string;
}) {
  const others = returned.filter((r) => r.id !== currentId);
  if (others.length === 0) return null;

  return (
    <span className={['asmv__cmp', className].filter(Boolean).join(' ')}>
      {/* The label is CLIPPED and not dropped — trap 5: a `select` whose only
          text is its options has no accessible name at all, and `display:none`
          on the label would take it with it. */}
      <Select
        label="Compare with"
        hideLabel
        /* NO `width` PROP. It lands as an inline style, and trap 2 is that an
           inline style outranks every selector including a media query —
           MEASURED at 320, this control stood 6px past its card and a rung
           written to release it would have lost. The width is in `app.css`. */
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        options={[
          /* *Nothing* rather than an empty first option, and it says what
             choosing it does: this list's default is a real state — one
             check-in, read on its own — and not an unanswered question. */
          { value: '', label: 'Compare with…' },
          ...others.map((r) => ({ value: r.id, label: DATE.format(new Date(r.at)) })),
        ]}
      />
    </span>
  );
}

const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
