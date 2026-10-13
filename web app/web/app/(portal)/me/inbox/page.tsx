import { MessageRow } from '@/components/portal/inbox/MessageRow';
import { TopBar } from '@/components/shell/TopBar';
import { requirePortalSession } from '@/lib/portal/session';
import { portalGet, settle } from '@/lib/portal/plan-api';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Message } from '@/web-components/ui/Message';
import { PageHeader } from '@/web-components/ui/PageHeader';

export const metadata = { title: 'From your trainer · InclineYou' };

interface MessagePage { items: { id: string; kind: string; body: string; at: number; readAt: number | null; sessionId: string | null; trainerName: string }[]; nextCursor: string | null }
interface NotePage { items: { id: string; text: string; sharedAt: number; createdAt: number; authorName: string }[]; nextCursor: string | null }

/**
 * `/me/inbox` — what the trainer wrote to you and what they chose to share (api-contract 1.2, pi-l1 and pi-l2). Two different things, kept apart:
 * a message is a line to you, a shared note is something they decided to show. Neither is a chat — there is no reply here; WhatsApp is the way back.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const { cursor } = await searchParams;
  const [m, n] = await Promise.all([
    portalGet<MessagePage>(`/v1/portal/messages?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
    portalGet<NotePage>('/v1/portal/notes?limit=20'),
  ]);
  const messages = settle(m);
  const notes = settle(n);
  const first = (session.me.trainer?.name ?? 'Your trainer').split(' ')[0];
  const wa = session.me.trainer?.whatsappUrl;

  return (
    <>
      <TopBar crumb="From your trainer" title="From your trainer" />
      <main className="main" id="main-content">
        <PageHeader className="ph--portal" title={`From ${first}`} />
        <div className="body">
          {!messages || !notes ? (
            <Message tone="warn">We couldn’t load this just now. Reload in a moment — nothing has been lost.</Message>
          ) : (
            <div className="pl">
              <Card>
                <Card.Head title="Messages" level={3} />
                <Card.Body>
                  {messages.items.length === 0 ? (
                    <EmptyState title="Nothing yet" body={`When ${first} sends you a line — after a session, or a weekly one — it’s here.`} />
                  ) : (
                    <ul className="pl__list">
                      {messages.items.map((x) => <MessageRow key={x.id} m={x} />)}
                    </ul>
                  )}
                  {messages.nextCursor && <div style={{ marginTop: 12 }}><Button variant="secondary" href={`/me/inbox?cursor=${encodeURIComponent(messages.nextCursor)}`}>Older messages</Button></div>}
                  <p className="pl__s" style={{ marginTop: 12 }}>
                    There’s no reply box here. To answer {first}, {wa ? <a href={wa} target="_blank" rel="noopener noreferrer">message them on WhatsApp</a> : 'use WhatsApp'}.
                  </p>
                </Card.Body>
              </Card>

              {notes.items.length > 0 && (
                <Card>
                  <Card.Head title="Notes shared with you" level={3} />
                  <Card.Body>
                    <ul className="pl__list">
                      {notes.items.map((x) => (
                        <li key={x.id} className="pl__ex">
                          <p className="pl__t" style={{ fontWeight: 500 }}>{x.text}</p>
                          <p className="pl__s">{x.authorName} · {new Date(x.sharedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</p>
                        </li>
                      ))}
                    </ul>
                  </Card.Body>
                </Card>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
