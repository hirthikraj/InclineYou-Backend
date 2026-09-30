import { Take } from '@/components/clients/assessments/Take';
import { Unavailable } from '@/components/today/Unavailable';
import { requireAssessment } from '@/lib/assessments/guard';

export const metadata = { title: 'Take an assessment · Clients · InclineYou' };
export const dynamic = 'force-dynamic';

/**
 * `/clients/assessments/:id/take` — record readings and answers in the session.
 * `?from={clientId}` is the client file it was opened from, so the way back
 * leads there (contract: *Take · `…/{id}/take?from={clientId}`*).
 *
 * No `key={version}`: every save revalidates this route, and a key that changes
 * with the version would remount the form on each save and lose its state
 * (the "Saved" line). A 412's *Reload* is a real page reload instead.
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
      />
    );
  }
  const from = typeof params.from === 'string' && params.from ? params.from : null;
  return <Take data={result.data} from={from} />;
}
