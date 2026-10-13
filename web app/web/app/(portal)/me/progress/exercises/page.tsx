import Link from 'next/link';

import { day, num } from '@/components/portal/plan/format';
import { effortUnit, loadUnit } from '@/components/portal/workout/units';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle, type ExerciseItemWire } from '@/lib/portal/plan-api';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Message } from '@/web-components/ui/Message';

export const metadata = { title: 'Exercises · InclineYou' };

/** `/me/progress/exercises` — everything the client has trained, most recent first, with the best set (api-contract 1.2, pp-l4). */
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const { cursor } = await searchParams;
  const page = settle(await portalGet<{ items: ExerciseItemWire[]; nextCursor: string | null }>(`/v1/portal/progress/exercises?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`));
  if (!page) return <div className="body"><Message tone="warn">We couldn’t load your exercises just now. Reload in a moment.</Message></div>;

  return (
    <div className="body">
      <div className="pl">
        {page.items.length === 0 ? (
          <EmptyState title="No exercises yet" body="Once you’ve finished a session, each movement you did appears here with your best set." />
        ) : (
          page.items.map((e) => {
            const unit = loadUnit('weight');
            const b = e.best;
            const bestLine = [b.loadValue !== null ? `${num(b.loadValue)} ${unit}` : null, b.effortValue !== null ? `${num(b.effortValue)} ${b.loadValue !== null && !b.e1rm ? effortUnit('reps') : 'reps'}` : null].filter(Boolean).join(' × ');
            return (
              <Card key={e.exerciseId}>
                <Card.Body>
                  <h2 className="pl__h"><Link href={`/me/progress/exercises/${e.exerciseId}`}>{e.name}</Link></h2>
                  <p className="pl__s">
                    {e.target ? `${e.target} · ` : ''}{e.sessions} {e.sessions === 1 ? 'session' : 'sessions'} · last {day(e.lastOn)}
                  </p>
                  <p className="pl__s">Best: {bestLine}{b.e1rm ? ` · est. ${num(b.e1rm)} kg` : ''}</p>
                </Card.Body>
              </Card>
            );
          })
        )}
        {page.nextCursor && <div><Button variant="secondary" href={`/me/progress/exercises?cursor=${encodeURIComponent(page.nextCursor)}`}>More exercises</Button></div>}
      </div>
    </div>
  );
}
