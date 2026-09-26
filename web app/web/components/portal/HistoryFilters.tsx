'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { HistoryOption } from '@/lib/portal/progress';
import { Select } from '@/web-components/ui/Select';

/**
 * History's two filters — which month, and which kind of session.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * TWO CONTROLS, AND THERE USED TO BE THREE
 *
 * The range chips sat in the tab layout above these and windowed all four tabs,
 * which made this screen the one place in the portal with **two controls
 * narrowing one list**. The month had to be resolved against the range on every
 * read, *8 weeks + March* was a combination that could only ever be empty, and
 * a client narrowing one of the two could not tell which had done the hiding.
 *
 * The chips belong to Summary now — the one tab whose headline figures
 * genuinely change with a window — and these two are the whole of it:
 *
 *   · **month** — which slice to read. A place in the history.
 *   · **type** — which KIND of session, cutting across every month.
 *
 * The second is the one that could not be got any other way. A client can find
 * August by scrolling; they cannot see how their leg days have gone, because
 * the rows are interleaved three deep and no amount of scrolling separates
 * them. Month is the cheaper of the two and earns its place at scale — three
 * groups today, fourteen on a client a year in.
 *
 * ── AND NEITHER CAN NAME SOMETHING WITH NOTHING IN IT ────────────────────────
 *
 * Both option lists are derived from the history itself (see `historyMonths`),
 * so neither control can offer an empty answer. A `month` typed into the URL by
 * hand is resolved away by the page rather than trusted — the rule
 * `resolveWorkspaces` states for the workspace cookie, and for its reason: a
 * control showing a value nothing can reach is worse than one that quietly
 * returns to *all*.
 *
 * ── `replace`, AND THE PARAMS ARE MERGED ─────────────────────────────────────
 *
 * `ProgressRanges` argues both: a client who tried three filters should press
 * Back once and leave History, not four times, and `scroll:false` keeps the
 * control they just used under their thumb. Merging rather than rebuilding is
 * what keeps the two selects out of each other's way in one query string.
 */
export function HistoryFilters({
  months,
  types,
  month,
  type,
}: {
  /** Only the months this client trained in. Fewer than two draws nothing. */
  months: HistoryOption[];
  /** Only the session types on record. Fewer than two draws nothing. */
  types: HistoryOption[];
  month: string;
  type: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  /* Neither control is worth drawing over a single answer — `rangeChoices`'
     rule, applied per filter rather than to the pair, so a client with three
     months and one session type gets exactly one select. */
  const showMonth = months.length > 1;
  const showType = types.length > 1;
  if (!showMonth && !showType) return null;

  function go(key: 'month' | 'type', next: string) {
    const q = new URLSearchParams(params.toString());
    /* `all` is the default and is never written down — a URL carrying its own
       default cannot be shortened by hand, which is the call `ProgressRanges`
       makes for `?range=all` and `Schedule.tsx` for `?new=1`. */
    if (next === 'all') q.delete(key);
    else q.set(key, next);
    const query = q.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  }

  return (
    <div className="phfilter">
      {showMonth && (
        <Select
          label="Month"
          value={month}
          options={[{ value: 'all', label: 'All months' }, ...months]}
          onChange={(e) => go('month', e.target.value)}
        />
      )}
      {showType && (
        <Select
          label="Session"
          value={type}
          options={[{ value: 'all', label: 'All sessions' }, ...types]}
          onChange={(e) => go('type', e.target.value)}
        />
      )}
    </div>
  );
}
