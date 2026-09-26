import { Templates } from '@/components/clients/assessments/Templates';
import { Unavailable } from '@/components/today/Unavailable';
import { requireAssessmentTemplates } from '@/lib/assessments/guard';

export const metadata = { title: 'Assessment templates · Clients · InclineYou' };

/** The guard reads a cookie, and the shelf is written to from the tab itself. */
export const dynamic = 'force-dynamic';

/**
 * `/clients/assessments/templates` — the blueprints.
 *
 * A route rather than a `?view=` on the page above it, which is the opposite of
 * what `/programs/workouts` does with its four tabs. The difference is what
 * comes back: those four are one `requireSessions()` sliced four ways, so the
 * parameter picks a panel out of a payload the browser already has. These two
 * are different reads — a paged list of thirty-three check-ins and a shelf of
 * two blueprints — and a single page fetching both to draw one would be paying
 * for the tab nobody is on. `/programs` and `/programs/certified` are the same
 * pair of shelves and are two routes for the same reason.
 */
export default async function Page() {
  const result = await requireAssessmentTemplates();

  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }

  return <Templates data={result.data} />;
}
