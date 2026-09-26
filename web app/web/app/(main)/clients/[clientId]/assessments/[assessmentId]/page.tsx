import { notFound } from 'next/navigation';

import { Assessment } from '@/components/clients/assessments/Assessment';
import { Unavailable } from '@/components/today/Unavailable';
import { parseAssessmentTab, parseCompare } from '@/lib/assessments/address';
import { requireAssessment } from '@/lib/assessments/guard';

export const metadata = { title: 'Check-in · Clients · InclineYou' };

/**
 * `force-dynamic`, for the reason both of this screen's addresses carry: the
 * guard reads a cookie, and three of the four states a check-in can be in are
 * statements about `now`.
 */
export const dynamic = 'force-dynamic';

/**
 * `/clients/:clientId/assessments/:assessmentId` — one check-in, read INSIDE
 * the file of the person it was asked of.
 *
 * ── WHY THIS EXISTS BESIDE `/clients/assessments/:id` ───────────────────────
 *
 * The check-ins tab used to send its rows to the book-wide address, and the
 * screen that arrived had one way back: *Assessments*, the list of everyone.
 * A trainer four clicks into Meera's file pressed Back and landed among forty
 * strangers, and the crumb above the check-in never said whose it was. The row
 * they clicked was in a person's file; the screen it opened had forgotten the
 * person.
 *
 * So the scope is in the path. Same guard, same payload, same component — the
 * `within` prop turns the crumb, the phone's title and the tab strip's links
 * back toward this file, and `assessmentBase` in `address.ts` carries the
 * argument for the path over a `?from=`.
 *
 * ── AND IT DOES NOT COLLIDE WITH THE BOOK-WIDE ROUTE ────────────────────────
 *
 * Trap 24, for once in its harmless direction. `/clients/assessments` is a
 * STATIC child of `/clients` and beats `[clientId]` by App Router precedence,
 * so `/clients/assessments/asm_007` is the book-wide screen and can never be
 * read as a client id of `assessments` — which is also why no client id may
 * ever be that string, a fact the list's own page already checked and states.
 * This route sits one segment deeper and is reachable only by a real id.
 *
 * ── THE PAIR IS CHECKED, WHICH IS NOT PARANOIA ──────────────────────────────
 *
 * `/clients/cli_002/assessments/asm_007` where `asm_007` is Meera's would draw
 * Meera's tapes and her eleven sentences about her sleep under a crumb naming
 * somebody else, and every door on the screen would lead into the wrong file.
 * The ids are both in the URL and the payload names its own client, so the
 * mismatch is one comparison — and a 404 rather than a redirect to the right
 * file, because the address asked a question about a client that has no true
 * answer, and quietly answering a different one is how a trainer ends up
 * certain they read a number they never read.
 */
export default async function Page(props: {
  params: Promise<{ clientId: string; assessmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ clientId, assessmentId }, params] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const result = await requireAssessment(assessmentId);

  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }

  if (result.data.client?.id !== clientId) notFound();

  return (
    <Assessment
      data={result.data}
      tab={parseAssessmentTab(params.tab)}
      compareId={parseCompare(params.cmp)}
      within={clientId}
    />
  );
}
