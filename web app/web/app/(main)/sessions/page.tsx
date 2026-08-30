import { Sessions } from '@/components/sessions/Sessions';
import { Unavailable } from '@/components/today/Unavailable';
import { requireSessions } from '@/lib/sessions/guard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sessions · X REP',
};

export default async function Page() {
  const result = await requireSessions();
  if (!result.ok) {
    return (
      <Unavailable
        kind={result.kind}
        status={result.kind === 'refused' ? result.status : undefined}
      />
    );
  }
  return <Sessions data={result.data} />;
}
