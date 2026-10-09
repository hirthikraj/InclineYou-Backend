import { Assessment } from '@/components/clients/assessments/Assessment';
import { Unavailable } from '@/components/today/Unavailable';
import { parseAssessmentTab, parseCompare } from '@/lib/assessments/address';
import { requireAssessment } from '@/lib/assessments/guard';

export const metadata = { title: 'Assessment · Clients · InclineYou' };

/**
 * `force-dynamic` for the list's own reason: the guard reads a cookie, and
 * three of the four states this row can be in are statements about `now`.
 */
export const dynamic = 'force-dynamic';

/**
 * `/clients/assessments/:id` — one check-in, read.
 *
 * ── THE SIBLING THAT BEATS IT ───────────────────────────────────────────────
 *
 * `templates/` beside this folder is a STATIC child and wins by App Router
 * precedence (trap 24), so a check-in whose id were the string `templates`
 * would be unreachable from here. Every id on this wire is `asm_` + digits and
 * a uuid on the real one — safe, and only safe because it was checked, which is
 * the same sentence the list's own page carries about `/clients/assessments`
 * beating `/clients/[clientId]`.
 */
export default async function Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, params] = await Promise.all([props.params, props.searchParams]);
  const result = await requireAssessment(id);

  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
        kicker="CHECK-IN"
        what="this check-in"
        back={{ href: '/clients/assessments', label: 'Back to assessments' }}
      />
    );
  }

  return (
    <Assessment
      data={result.data}
      tab={parseAssessmentTab(params.tab)}
      compareId={parseCompare(params.cmp)}
    />
  );
}
