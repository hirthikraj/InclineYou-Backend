import { AuthShell } from '@/components/auth/AuthShell';
import { PausedWall } from '@/components/portal/PausedWall';
import { readWall, wallDate } from '@/lib/portal/wall';

export const metadata = { title: 'Your training is on hold · InclineYou' };

/** §08 · the paused wall (api-contract 1.2, p-a1). Drawn from `GET /v1/portal/me`; nothing else is readable while paused. */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const me = await readWall('paused');
  return (
    <AuthShell eyebrow="On hold" lead="Your training is paused." quote="Your history is safe. It all comes back the day your trainer picks things up again.">
      <PausedWall
        trainerName={me.trainer?.name ?? 'your trainer'}
        until={me.pausedUntil ? wallDate(me.pausedUntil) : null}
        whatsappUrl={me.trainer?.whatsappUrl ?? null}
      />
    </AuthShell>
  );
}
