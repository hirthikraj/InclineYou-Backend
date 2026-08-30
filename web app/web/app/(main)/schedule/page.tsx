import { Schedule } from '@/components/schedule/Schedule';
import { Unavailable } from '@/components/today/Unavailable';
import { requireSchedule } from '@/lib/schedule/guard';
import { crumbFor, parseAnchor, parseView } from '@/lib/schedule/view';

/**
 * Frames 1a–4c of `webapp-schedule.html` — the week, the day, the month, the
 * booking form — as three VIEWS of one route rather than three screens. Which one
 * is drawn is decided by the URL and not by the shape of the data, which is the
 * opposite of `/today`'s rule and is right for the opposite reason: Today's four
 * states are facts about the day, and these three are a thing the trainer chose.
 *
 * Frames 5a and 5b (the drag and its ten-second undo) ARE built, as
 * select-then-place — `Schedule.tsx` carries the argument, and the ten seconds are
 * carried in full. Frame 7a (the eight-week bulk pattern) and frame 8a (the
 * working-hours table) are not: 8a is `/settings/hours`, which is its own route
 * and still a placeholder, and 7a writes a series and belongs with it.
 *
 * `force-dynamic` because the grid is a snapshot of a minute and `getSchedule`
 * reads a cookie; without it Next would try to prerender a page whose subject is
 * which week it is.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(props: PageProps<'/schedule'>) {
  const q = await props.searchParams;
  const view = parseView(first(q.view));
  const anchor = parseAnchor(first(q.d)) ?? Date.now();
  // The tab title names the range, so a trainer with three weeks open in three
  // tabs can tell them apart without switching to each one.
  return { title: `${crumbFor(view, anchor)} · Schedule · X REP` };
}

/**
 * `parseAnchor` returns NULL for a missing or malformed `d`, and the null is
 * resolved inside `requireSchedule` rather than here.
 *
 * That is not tidiness. A page component is subject to React's purity rule, and
 * `Date.now()` in one is a value that changes between the render and its replay
 * — the same class of bug the workflow runtime forbids `Date.now()` for. The
 * clock belongs to the request, which is what the guard is. `generateMetadata`
 * is not a component, so it may read it directly.
 */
export default async function Page(props: PageProps<'/schedule'>) {
  const q = await props.searchParams;
  const view = parseView(first(q.view));

  const result = await requireSchedule(view, parseAnchor(first(q.d)));
  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }
  return <Schedule data={result.data} />;
}

/**
 * A repeated query parameter is a list, and both halves of `?view=day&view=week`
 * are equally real to the URL. Taking the first is arbitrary and that is fine —
 * `parseView` falls back to the default for anything it does not recognise, so
 * the worst a hand-mangled URL can do is open the week.
 */
function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
