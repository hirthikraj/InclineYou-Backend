import { PackagesPage } from '@/components/business/PackagesPage';
import { Unavailable } from '@/components/today/Unavailable';
import { requirePacks } from '@/lib/packs/guard';

/**
 * `/business/packages` — the price list. Four calls of its own and none of the
 * money book; `components/business/PackagesPage.tsx` says why that matters.
 *
 * `?from=new-client` is the detour flag from step 2 of *add a client*.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Packages · Business · InclineYou' };

export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await props.searchParams;
  const packs = await requirePacks();

  if (!packs.ok) {
    return (
      <Unavailable
        kind={packs.kind}
        status={packs.kind === 'refused' ? packs.status : undefined}
      />
    );
  }

  return <PackagesPage data={packs.data} fromNewClient={q.from === 'new-client'} />;
}
