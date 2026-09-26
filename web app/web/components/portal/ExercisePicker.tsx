'use client';

import { useRouter } from 'next/navigation';

import { exerciseHref } from '@/lib/portal/progress-tabs';
import { Select } from '@/web-components/ui/Select';

/**
 * Jump straight to another movement, without going back to the list.
 *
 * ── ASKED FOR, AND IT BELONGS HERE RATHER THAN ON THE OVERVIEW ──────────────
 *
 * *"Maybe we can provide a dropdown of all exercises applicable to quickly go
 * to that screen."* On the overview it would be a second way to do what every
 * row already does — the dead control this shell keeps deleting. On a DETAIL
 * screen it is the only way: without it, comparing two movements is
 * back → scroll → tap, three actions for a question a client asks constantly
 * (*is my row moving like my bench is?*).
 *
 * ── A NATIVE `<select>`, WHICH IS THE POINT ON A PHONE ──────────────────────
 *
 * Seventeen options in a custom listbox is a scroller inside a scroller; the
 * platform picker is a full-height wheel with type-ahead that the client
 * already knows. `ui/Select` is the design system's, so this inherits §04's
 * field chrome and the `::picker(select)` styling the dropdown pass added.
 *
 * ── AND IT NAVIGATES ON CHANGE, WITH NO SUBMIT ──────────────────────────────
 *
 * A select whose value only takes effect after a second control is a select
 * that has to explain itself. The one real cost is that a keyboard user moving
 * through options with the arrow keys fires a navigation per option on some
 * platforms — which is why the value is compared before pushing, so the
 * re-select of the current movement costs nothing.
 */
export function ExercisePicker({
  current,
  options,
}: {
  current: string;
  /** Every movement with a logged set, in the list's own order. */
  options: { id: string; name: string }[];
}) {
  const router = useRouter();

  if (options.length < 2) return null;

  return (
    <Select
      label="Another movement"
      value={current}
      options={options.map((o) => ({ value: o.id, label: o.name }))}
      onChange={(e) => {
        const next = e.target.value;
        if (next && next !== current) router.push(exerciseHref(next));
      }}
    />
  );
}
