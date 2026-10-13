import Link from 'next/link';

import { day } from '@/components/portal/plan/format';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle, type PastItemWire } from '@/lib/portal/plan-api';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Message } from '@/web-components/ui/Message';

export const metadata = { title: 'Past plans · InclineYou' };

/** `/me/plan/history` — plans that finished, newest first, each readable after a new one starts (api-contract 1.2, pp-l2). */
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const { cursor } = await searchParams;
  const page = settle(await portalGet<{ items: PastItemWire[]; nextCursor: string | null }>(`/v1/portal/plan/history?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`));
  if (!page) return <div className="body"><Message tone="warn">We couldn’t load your past plans just now. Reload in a moment.</Message></div>;

  return (
    <div className="body">
      <div className="pl">
        {page.items.length === 0 ? (
          <EmptyState title="No finished plans yet" body="When a plan wraps up it stays here to read, even after the next one starts." />
        ) : (
          page.items.map((p) => (
            <Card key={p.id}>
              <Card.Body>
                <h2 className="pl__h"><Link href={`/me/plan/history/${p.id}`}>{p.name}</Link></h2>
                <p className="pl__s">
                  {p.weeks} weeks{p.startDate ? ` · ${day(p.startDate, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                  {p.endDate ? ` – ${day(p.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''} · {p.sessionsDone} {p.sessionsDone === 1 ? 'session' : 'sessions'} done
                </p>
              </Card.Body>
            </Card>
          ))
        )}
        {page.nextCursor && <div><Button variant="secondary" href={`/me/plan/history?cursor=${encodeURIComponent(page.nextCursor)}`}>Older plans</Button></div>}
      </div>
    </div>
  );
}
