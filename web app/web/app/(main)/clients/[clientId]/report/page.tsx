import { notFound } from 'next/navigation';

import { ClientReport } from '@/components/reports/ClientReport';
import { Unavailable } from '@/components/today/Unavailable';
import { parseWeeks } from '@/lib/reports/build';
import { requireClientReport } from '@/lib/reports/guard';

/**
 * `/clients/:id/report` — the client-facing progress card.
 *
 * A route rather than a seventh tab on the client file, and the reason is who it
 * is for. Every tab on that file is the TRAINER's view of a client: the money
 * they owe, the notes about them, the sessions they missed. This is the CLIENT's
 * view of themselves, built to leave the building — and a screen with a
 * different reader belongs at a different address, not behind a tab strip whose
 * other six are private.
 *
 * It is reached from three places, which is deliberate: the *Progress report*
 * button on the client's own file, the Progress tab beside the charts it
 * summarises, and the list at the foot of Business → Reports, where a trainer
 * thinking about retention is one thought away from wanting one.
 *
 * `weeks` is in the query string because a chosen range is a **place** — the
 * same call `/clients/:id/progress` makes for its own `range`. It also decides
 * what is FETCHED (the sessions window), which is the test `tabs.ts` sets for
 * anything that earns a place in a URL.
 *
 * `force-dynamic` for the reason every screen behind the shell has it: the guard
 * reads a cookie, and a report is a statement about a moment.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Progress report · InclineYou' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const query = await searchParams;
  const weeks = parseWeeks(query.weeks);

  const result = await requireClientReport(clientId, weeks);

  if (!result.ok) {
    if (result.kind === 'not_found') notFound();
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }

  return <ClientReport report={result.report} />;
}
