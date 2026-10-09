import { ExerciseLibraryPage } from '@/components/exercises/LibraryPage';
import { Unavailable } from '@/components/today/Unavailable';
import { requireExercises } from '@/lib/exercises/guard';
import { parseQuery } from '@/lib/exercises/tabs';

export const metadata = { title: 'Exercise library · Fitness · InclineYou' };

/**
 * `/programs/exercises` — the library, in three ways in (`lib/exercises/tabs.ts`).
 * Every choice is in the address, so this reads it, asks the server for what that
 * state needs and nothing more, and hands the answer down.
 */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseQuery(await props.searchParams);

  const result = await requireExercises(query);
  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }
  return <ExerciseLibraryPage data={result.data} />;
}
