import { ExerciseLibrary } from '@/components/exercises/ExerciseLibrary';
import { Unavailable } from '@/components/today/Unavailable';
import { requireExercises } from '@/lib/exercises/guard';

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
 */
export const metadata = { title: 'Exercises · Programs · X REP' };

export default async function Page() {
  const result = await requireExercises();
  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }
  return <ExerciseLibrary data={result.data} />;
}
