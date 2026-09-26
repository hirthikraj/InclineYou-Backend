import { ExerciseLibrary } from '@/components/exercises/ExerciseLibrary';
import { Unavailable } from '@/components/today/Unavailable';
import { requireExercises } from '@/lib/exercises/guard';
import { parseOne, parsePage, parseSource, parseView } from '@/lib/exercises/tabs';

/**
 * `/programs/exercises` — **the library, as a tab rather than a destination.**
 *
 * It was a rail row in the `BUILD` group. It is a tab now for the reason the
 * five-destination brief gives in one line: *trainers only visit it while
 * building*. Nobody opens 1,324 exercise names to read them — they open them
 * while a template day is half-filled two clicks away, and a rail row made that
 * a trip out of the thing being built.
 *
 * The old `/exercises` route still exists and redirects here, so every link ever
 * sent still lands.
 *
 * ── THE SCREEN IS TWO VIEWS NOW, AND THE URL IS WHICH ONE ────────────────────
 *
 * *By exercises* is the flat list this always was; *By categories* is the same
 * library counted by muscle group, and a card in it is a door into the list
 * filtered. `lib/exercises/tabs.ts` carries why that is a strip rather than two
 * routes, and why the filters and the page number are in the address.
 *
 * The consequence here is that this page reads its search parameters and hands
 * them to the guard. It used to take none and always fetch the first rows: with
 * the page number in the URL, a server that ignores it is a shared link that
 * opens on page one and then jumps when the client catches up.
 */
export const metadata = { title: 'Exercise library · Fitness · InclineYou' };

export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const view = parseView(sp.view);
  const query = {
    q: parseOne(sp.q),
    group: parseOne(sp.group),
    equipment: parseOne(sp.equipment),
    source: parseSource(sp.source),
    page: parsePage(sp.page),
  };

  const result = await requireExercises(query);
  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }
  return <ExerciseLibrary data={result.data} view={view} />;
}
