import { notFound } from 'next/navigation';

import { Console } from '@/components/log/Console';
import { StartLog } from '@/components/log/StartLog';
import { Unavailable } from '@/components/today/Unavailable';
import { requireConsole } from '@/lib/log/guard';

/**
 * Frame 1a · `/sessions/:id/log` — the console.
 *
 * `?ex=` is the exercise in focus, `?set=` the open set panel, `?add=1` the add
 * panel and `?swap=` the swap. *A place gets a URL, a moment does not* — and the
 * exercise in focus IS a place, because a trainer with a half-typed row and an
 * accidental reload should land back on it.
 *
 * **`?plus=` is gone.** It held every exercise added to today's grid that had no
 * set in it yet, because `workout_exercise` had no REST route and there was
 * nothing to write the card to. There is one now, so an added card is a row on
 * the server and survives a reload the way it always should have — on any
 * device, not just the tab that added it.
 */
export const dynamic = 'force-dynamic';

/* No `searchParams`: every query this screen uses is read on the client with
   `useSearchParams`, and the one the server needed — `?plus=` — is gone. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const result = await requireConsole(id);

  if (result.ok) return <Console data={result.data} />;

  if (result.kind === 'not_started') {
    return (
      <StartLog
        routeId={id}
        session={result.start.session}
        clientName={result.start.clientName}
        programId={result.start.programId}
      />
    );
  }
  if (result.kind === 'not_found') notFound();
  return (
    <Unavailable
      kind={result.kind}
      status={result.kind === 'refused' ? result.status : undefined}
    />
  );
}
