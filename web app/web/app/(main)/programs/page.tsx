import { Programs } from '@/components/programs/Programs';
import { Unavailable } from '@/components/today/Unavailable';
import { requireShelf } from '@/lib/programs/guard';

/**
 * `/programs` — **what the clients do**, with nothing open.
 *
 * The shelf beside an empty pane. Opening one is `/programs/:id`, which is a
 * real route rather than a piece of client state, for the client file's reason:
 * the back button works between programs, a trainer can send somebody a link to
 * one, and the open program cannot disagree with the URL because there is only
 * one of them.
 *
 * `/programs/exercises` is a sibling STATIC segment and wins over `[templateId]`
 * by the App Router's own precedence, which is safe here only because a template
 * id is a uuid and can never be the literal string "exercises". Worth knowing
 * before anybody adds a second static child.
 */
export const metadata = { title: 'Programs · X REP' };

export default async function Page() {
  const result = await requireShelf();
  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind === 'missing' ? 'refused' : result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }
  return <Programs data={result.data} open={null} />;
}
