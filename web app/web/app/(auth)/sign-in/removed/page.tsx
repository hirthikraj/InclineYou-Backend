import { AuthShell } from '@/components/auth/AuthShell';
import { RemovedWall } from '@/components/portal/RemovedWall';
import { readWall, wallDate } from '@/lib/portal/wall';

export const metadata = { title: 'That arrangement has ended · InclineYou' };

/** §08 · the removed wall (api-contract 1.2, p-a1 and p-a4). The trainer's name only: the person has left, so nothing else of theirs is shown. */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const me = await readWall('removed');
  return (
    <AuthShell eyebrow="Arrangement ended" lead="This one has ended." quote="Nothing went wrong with your number. It simply isn’t attached to a trainer right now.">
      <RemovedWall
        trainerName={me.trainer?.name ?? 'your trainer'}
        by={me.removedBy ?? 'trainer'}
        on={me.removedAt ? wallDate(me.removedAt) : null}
        seen={me.acknowledgedAt !== undefined}
      />
    </AuthShell>
  );
}
