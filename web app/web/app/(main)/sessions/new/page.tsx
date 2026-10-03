import { PickSession } from '@/components/log/PickSession';
import { Unavailable } from '@/components/today/Unavailable';
import { requirePicker } from '@/lib/sessionlog/guard';

/** Frame 5a · `/sessions/new` — who is this for. Three groups, and the third
    needs no booking. */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const result = await requirePicker();
  if (!result.ok) {
    if (result.kind === 'not_found') return <Unavailable kind="refused" status={404} />;
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }
  return <PickSession data={result.data} />;
}
