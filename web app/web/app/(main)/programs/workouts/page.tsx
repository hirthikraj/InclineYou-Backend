import { Workouts } from '@/components/programs/Workouts';
import { Unavailable } from '@/components/today/Unavailable';
import { parseDays, parseMode, parsePage, parseView } from '@/lib/sessions/tabs';
import { requireSessions } from '@/lib/sessions/guard';
import { getWorkoutTemplates } from '@/lib/workouts/api';
import type { WorkoutTemplateWire } from '@/lib/workouts/api';

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
  /* `?view=` IS the tab now, not a one-shot that names the one to open on —
     `lib/sessions/tabs.ts` carries the argument. All four views still come out
     of this one read; the parameter only says which of them is drawn. */
  const view = parseView(q.view);
  /* THE REST OF THE ADDRESS. `?page=` is the one that matters today — the three
     session tabs are paged now, and a server that ignored the number would
     serve page one to a shared link and then jump when the client caught up,
     which is `/programs/exercises`' own note on the same parameter. `mode` and
     `days` are parsed here because the address is defined in one place and read
     in one place; nothing on the strip writes them yet. */
  const query = {
    mode: parseMode(q.mode),
    days: parseDays(q.days),
    page: parsePage(q.page),
  };
  /* TWO READS, IN PARALLEL, AND THE SECOND CANNOT FAIL THE PAGE. The three
     session buckets are what this screen is; the workout-template shelf is one
     of its four tabs. A shelf that could not be read is an empty shelf with a
     way to write one — the Templates tab's own empty state — where an
     `Unavailable` over the whole screen would take the other three tabs down
     with it. `requireSessions` keeps the guard it had. */
  const [result, templates] = await Promise.all([requireSessions(), readTemplates()]);
  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }
  return <Workouts data={result.data} view={view} query={query} templates={templates} />;
}

/** `[]` on anything going wrong — see the note above. A refusal that matters
 *  (an expired token) is caught by `requireSessions` beside it, which
 *  redirects. */
async function readTemplates(): Promise<WorkoutTemplateWire[]> {
  try {
    return await getWorkoutTemplates();
  } catch {
    return [];
  }
}
