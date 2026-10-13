import Link from 'next/link';

import { num, when } from '@/components/portal/plan/format';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle, type DoneItemWire } from '@/lib/portal/plan-api';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Message } from '@/web-components/ui/Message';
import { Tag } from '@/web-components/ui/Tag';

export const metadata = { title: 'History · InclineYou' };

/** `/me/progress/history` — the sessions done, of either kind, newest first; each opens its recap (api-contract 1.2, pp-l6). */
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const { cursor } = await searchParams;
  const zone = session.me.myDetails?.timezone ?? 'Asia/Kolkata';
  const first = (session.me.trainer?.name ?? 'Your trainer').split(' ')[0];
  const page = settle(await portalGet<{ items: DoneItemWire[]; nextCursor: string | null }>(`/v1/portal/sessions?state=done&limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`));
  if (!page) return <div className="body"><Message tone="warn">We couldn’t load your sessions just now. Reload in a moment.</Message></div>;

  return (
    <div className="body">
      <div className="pl">
        {page.items.length === 0 ? (
          <EmptyState title="No sessions yet" body="Every session you finish — with or without your trainer — is listed here to open." />
        ) : (
          page.items.map((s) => {
            const w = when(s.at, zone);
            return (
              <Card key={s.id}>
                <Card.Body>
                  <div className="pl__row">
                    <div>
                      <h2 className="pl__h"><Link href={`/me/session/${s.id}`}>{s.workoutName ?? 'Workout'}</Link></h2>
                      <p className="pl__s">{w.day} · {s.loggedBy === 'trainer' ? `with ${first}` : 'on your own'} · {s.setsDone} sets{s.volumeKg > 0 ? ` · ${num(s.volumeKg)} kg` : ''}</p>
                    </div>
                    <div className="pl__tags">
                      {s.newBests > 0 && <Tag tone="pr">{s.newBests === 1 ? 'New best' : `${s.newBests} new bests`}</Tag>}
                      {s.recapUnread && <Tag tone="info">Note from {first}</Tag>}
                    </div>
                  </div>
                </Card.Body>
              </Card>
            );
          })
        )}
        {page.nextCursor && <div><Button variant="secondary" href={`/me/progress/history?cursor=${encodeURIComponent(page.nextCursor)}`}>Older sessions</Button></div>}
      </div>
    </div>
  );
}
