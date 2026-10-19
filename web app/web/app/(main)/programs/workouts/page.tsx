import { Workouts } from '@/components/programs/Workouts';
import { Unavailable } from '@/components/today/Unavailable';
import { parseView } from '@/lib/sessions/tabs';
import { requireSessions } from '@/lib/sessions/guard';
import { getWorkoutTemplates } from '@/lib/workouts/api';
import type { WorkoutTemplateSummaryWire } from '@/lib/workouts/api';

/**
 * `/programs/workouts` — **Fitness' second page**, and the screen that had no
 * door.
 *
 * This was `app/(main)/sessions/page.tsx`, which still exists and now
 * `permanentRedirect`s here. `Workouts.tsx` carries the argument for the move;
 * the short version is that the list was orphaned when *Sessions* correctly
 * stopped being a rail row, and a page of a section is the surface it wanted all
 * along.
 *
 * `force-dynamic` for the reason the old route had it: every bucket on this
 * screen is a statement about `now` — what is still ahead, what has already
 * happened, and what went past its slot unmarked — and the guard reads a cookie.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Workouts · Fitness · InclineYou',
};

export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await props.searchParams;
  /* `?view=` IS the tab — `lib/sessions/tabs.ts` carries the argument. The
     server reads it for ONE decision: whether to fetch the template shelf. The
     rest of the address (`page`, `mode`, `days`) and every later tab or page
     switch are `Workouts`' own, read off `useSearchParams` and moved with
     `history.pushState`, so they never come back here. */
  const view = parseView(q.view);
  /* THE SHELF IS READ ONLY FOR ITS OWN TAB. It used to be read beside the
     sessions on every visit, for a tab most visits never open — one backend call
     in four that drew nothing. On any other tab `Workouts` asks for it the first
     time the trainer switches to it. It still cannot fail the page: a shelf that
     could not be read is the Templates tab's empty state, where an
     `Unavailable` over the whole screen would take the other three tabs down
     with it. `requireSessions` keeps the guard it had. */
  const [result, templates] = await Promise.all([
    requireSessions(),
    view === 'templates' ? readTemplates() : null,
  ]);
  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }
  return <Workouts data={result.data} templates={templates} />;
}

/** `[]` on anything going wrong — see the note above. A refusal that matters
 *  (an expired token) is caught by `requireSessions` beside it, which
 *  redirects. */
async function readTemplates(): Promise<WorkoutTemplateSummaryWire[]> {
  try {
    return await getWorkoutTemplates();
  } catch {
    return [];
  }
}
