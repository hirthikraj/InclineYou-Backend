import { LoadFailed } from '@/components/portal/LoadFailed';
import { day, num } from '@/components/portal/plan/format';
import { effortUnit, loadUnit } from '@/components/portal/workout/units';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle, type ExerciseItemWire } from '@/lib/portal/plan-api';
import { exerciseHref } from '@/lib/portal/progress-tabs';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { ListRow, ListRowNumber, ListRows } from '@/web-components/ui/ListRow';

export const metadata = { title: 'Exercises · InclineYou' };

/**
 * `/me/progress/exercises` — everything the client has trained, most recent first, with the best set (api-contract 1.2, pp-l4).
 *
 * ONE card of rows, where it was one card per movement: twenty cards with a heading each is a page of headings, and the thing a client
 * scans this list for — *which lift, and what is my best* — sits in the same two places on every row of a `ListRow` list. The best set
 * is the trailing figure, tabular, and the whole row is the door to that movement's own screen.
 */
export const dynamic = 'force-dynamic';

function bestLine(e: ExerciseItemWire): string {
  const b = e.best;
  const load = b.loadValue !== null ? `${num(b.loadValue)} ${loadUnit('weight')}` : null;
  const effort = b.effortValue !== null ? `${num(b.effortValue)} ${b.loadValue !== null && !b.e1rm ? effortUnit('reps') : 'reps'}` : null;
  return [load, effort].filter(Boolean).join(' × ');
}

export default async function Page({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const { cursor } = await searchParams;
  const page = settle(
    await portalGet<{ items: ExerciseItemWire[]; nextCursor: string | null }>(
      `/v1/portal/progress/exercises?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  );
  if (!page) return <LoadFailed what="your exercises" retryHref="/me/progress/exercises" />;

  return (
    <div className="body">
      <div className="portal col gap4">
        {page.items.length === 0 ? (
          <EmptyState title="No exercises yet" body="Once you’ve finished a session, each movement you did appears here with your best set." />
        ) : (
          <Card className="pexl">
            <CardHead title="Every movement">
              <span className="small ink3">best set on the right</span>
            </CardHead>
            <CardBody flush>
              <ListRows label="Every movement you have trained">
                {page.items.map((e) => (
                  <ListRow
                    key={e.exerciseId}
                    href={exerciseHref(e.exerciseId)}
                    title={e.name}
                    sub={[e.target, `${e.sessions} ${e.sessions === 1 ? 'session' : 'sessions'}`, `last ${day(e.lastOn)}`].filter(Boolean).join(' · ')}
                    right={<ListRowNumber>{bestLine(e)}</ListRowNumber>}
                  />
                ))}
              </ListRows>
            </CardBody>
          </Card>
        )}
        {page.nextCursor && (
          <div>
            <Button variant="secondary" href={`/me/progress/exercises?cursor=${encodeURIComponent(page.nextCursor)}`}>
              More exercises
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
