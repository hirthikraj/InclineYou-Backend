import { notFound } from 'next/navigation';

import { ClientPlan } from '@/components/clients/plan/ClientPlan';
import { Unavailable } from '@/components/today/Unavailable';
import { parsePlanOrigin } from '@/lib/programs/plan-origin';
import { requireClientPlan } from '@/lib/programs/guard';

/**
 * `/clients/:clientId/program/:programId` — the client's OWN copy, in the
 * builder.
 *
 * The route the two-table design has implied since templates existed and the
 * web had never drawn: assigning makes an independent copy, `ProgramRow` owns
 * its shape so that copy can be tuned for one person, and until this page the
 * only door to it was a full overwrite from the blueprint.
 *
 * `force-dynamic` for the builder's reason: this screen autosaves, and a cached
 * shell would hand the trainer back the prescription they had before their last
 * write on every soft navigation between one client's plan and another's.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ clientId: string; programId: string }>;
}) {
  const { clientId, programId } = await params;
  const result = await requireClientPlan(clientId, programId);
  return {
    title: result.ok
      ? `${result.data.client.name} · ${result.data.program.name} · InclineYou`
      : 'Plan · InclineYou',
  };
}

/**
 * `?from=programs` IS THE ONLY THING THIS SCREEN READS OUT OF THE QUERY, and it
 * changes no row — see `plan-origin.ts` for why the way back is in the address
 * rather than in the referrer, and why it is a parameter rather than a second
 * route. It is parsed here, on the server, so the crumb is in the first paint
 * and not one hydration behind the header it sits in.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string; programId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ clientId, programId }, query] = await Promise.all([params, searchParams]);
  const result = await requireClientPlan(clientId, programId);

  /* `missing` is TWO cases here and both are 404: a plan that is gone, and a
     plan reached through the wrong client's URL — `getClientPlan` refuses that
     one itself rather than drawing one person's prescription under another
     person's name. "The server said no" is the wrong sentence for either. */
  if (!result.ok && result.kind === 'missing') notFound();

  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind === 'refused' ? 'refused' : 'unreachable'}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }

  return <ClientPlan data={result.data} now={result.now} from={parsePlanOrigin(query.from)} />;
}
