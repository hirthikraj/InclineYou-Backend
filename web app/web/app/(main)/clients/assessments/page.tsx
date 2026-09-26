import { Assessments } from '@/components/clients/assessments/Assessments';
import { Unavailable } from '@/components/today/Unavailable';
import { parseQuery } from '@/lib/assessments/address';
import { requireAssessments } from '@/lib/assessments/guard';

export const metadata = { title: 'Assessments · Clients · InclineYou' };

/**
 * `force-dynamic` for the reason every list on this half has it: the guard
 * reads a cookie, and three of the four states a row can be in are statements
 * about `now` — what is still ahead, what came back, and what went past its
 * date unanswered.
 */
export const dynamic = 'force-dynamic';

/**
 * `/clients/assessments` — the second page of the Clients section.
 *
 * ── A STATIC CHILD OF `[clientId]`, WHICH IS SAFE AND IS NOT AN ACCIDENT ────
 *
 * Trap 24: a static child of a dynamic segment wins by App Router precedence,
 * exactly as `/programs/exercises` beats `[templateId]`. So this route claims
 * `/clients/assessments` away from `/clients/[clientId]`, and it is only safe
 * because a client id can never be that string — every one of them is
 * `cli_` + digits on this wire and a uuid on the real one. Both are safe; both
 * are only safe because something checked.
 */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseQuery(await props.searchParams);
  const result = await requireAssessments(query);

  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }

  return <Assessments data={result.data} query={query} />;
}
