import { LoadFailed } from '@/components/portal/LoadFailed';
import { day } from '@/components/portal/plan/format';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle, type PastItemWire } from '@/lib/portal/plan-api';
import { pastPlanHref } from '@/lib/portal/plan-tabs';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { ListRow, ListRows } from '@/web-components/ui/ListRow';

export const metadata = { title: 'Past plans · InclineYou' };

/**
 * `/me/plan/history` — plans that finished, newest first, each readable after a new one starts (api-contract 1.2, pp-l2).
 *
 * One card of `ListRow`s, where it was a card per plan with an 18px heading each. The sessions count is a COUNT of what was done, never
 * a fraction of what was planned — AGENTS.md: no adherence figure anywhere on this tab.
 */
export const dynamic = 'force-dynamic';

const LONG: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

export default async function Page({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const { cursor } = await searchParams;
  const page = settle(
    await portalGet<{ items: PastItemWire[]; nextCursor: string | null }>(
      `/v1/portal/plan/history?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  );
  if (!page) return <LoadFailed what="your past plans" retryHref="/me/plan/history" />;

  return (
    <div className="body">
      <div className="portal col gap4">
        {page.items.length === 0 ? (
          <EmptyState title="No finished plans yet" body="When a plan wraps up it stays here to read, even after the next one starts." />
        ) : (
          <Card>
            <CardHead title="Past plans">
              <span className="small ink3">newest first</span>
            </CardHead>
            <CardBody flush>
              <ListRows label="Your past plans">
                {page.items.map((p) => (
                  <ListRow
                    key={p.id}
                    href={pastPlanHref(p.id)}
                    title={p.name}
                    sub={[
                      `${p.weeks} ${p.weeks === 1 ? 'week' : 'weeks'}`,
                      [p.startDate ? day(p.startDate, LONG) : null, p.endDate ? day(p.endDate, LONG) : null].filter(Boolean).join(' – ') || null,
                      `${p.sessionsDone} ${p.sessionsDone === 1 ? 'session' : 'sessions'} done`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                ))}
              </ListRows>
            </CardBody>
          </Card>
        )}
        {page.nextCursor && (
          <div>
            <Button variant="secondary" href={`/me/plan/history?cursor=${encodeURIComponent(page.nextCursor)}`}>
              Older plans
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
