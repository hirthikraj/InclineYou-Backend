import { LoadFailed } from '@/components/portal/LoadFailed';
import { when } from '@/components/portal/plan/format';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle, type DoneItemWire } from '@/lib/portal/plan-api';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { ListRow, ListRows } from '@/web-components/ui/ListRow';
import { Tag } from '@/web-components/ui/Tag';

export const metadata = { title: 'History · InclineYou' };

/**
 * `/me/progress/history` — the sessions done, of either kind, newest first; each opens its recap (api-contract 1.2, pp-l6).
 *
 * A card per MONTH of rows, where it was a card per session. A history is read by when, and the month is the unit a person remembers
 * a stretch of training in — *I was good in October* — so it is the heading, and each session is one `ListRow` under it. Only the
 * months on this page are drawn; a month split across two pages simply appears again at the top of the next.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const { cursor } = await searchParams;
  const zone = session.me.myDetails?.timezone ?? 'Asia/Kolkata';
  const first = (session.me.trainer?.name ?? 'Your trainer').split(' ')[0];
  const page = settle(
    await portalGet<{ items: DoneItemWire[]; nextCursor: string | null }>(
      `/v1/portal/sessions?state=done&limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  );
  if (!page) return <LoadFailed what="your sessions" retryHref="/me/progress/history" />;

  const month = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: zone });
  const groups: { label: string; items: DoneItemWire[] }[] = [];
  for (const s of page.items) {
    const label = month.format(new Date(s.at));
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(s);
    else groups.push({ label, items: [s] });
  }

  return (
    <div className="body">
      <div className="portal col gap4">
        {groups.length === 0 ? (
          <EmptyState title="No sessions yet" body={`Every session you finish — with ${first} or on your own — is listed here to open.`} />
        ) : (
          groups.map((g) => (
            <Card key={g.label}>
              <CardHead title={g.label}>
                <span className="small ink3">
                  {g.items.length} {g.items.length === 1 ? 'session' : 'sessions'}
                </span>
              </CardHead>
              <CardBody flush>
                <ListRows label={`Sessions in ${g.label}`}>
                  {g.items.map((s) => (
                    <ListRow
                      key={s.id}
                      href={`/me/session/${s.id}`}
                      title={s.workoutName ?? 'Workout'}
                      sub={[
                        when(s.at, zone).day,
                        s.loggedBy === 'trainer' ? `with ${first}` : 'on your own',
                        `${s.setsDone} ${s.setsDone === 1 ? 'set' : 'sets'}`,
                        s.volumeKg > 0 ? `${Math.round(s.volumeKg).toLocaleString('en-IN')} kg` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      right={
                        s.newBests > 0 || s.recapUnread ? (
                          <span className="pprog__tags">
                            {s.newBests > 0 && <Tag tone="pr">{s.newBests === 1 ? 'New best' : `${s.newBests} new bests`}</Tag>}
                            {s.recapUnread && <Tag tone="acc">Note from {first}</Tag>}
                          </span>
                        ) : undefined
                      }
                      rightInline
                    />
                  ))}
                </ListRows>
              </CardBody>
            </Card>
          ))
        )}
        {page.nextCursor && (
          <div>
            <Button variant="secondary" href={`/me/progress/history?cursor=${encodeURIComponent(page.nextCursor)}`}>
              Older sessions
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
