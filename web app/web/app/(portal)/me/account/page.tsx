import Link from 'next/link';

import { requirePortalSession } from '@/lib/portal/session';
import { Avatar } from '@/web-components/ui/Avatar';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';

export const metadata = { title: 'Me · InclineYou' };

/** `/me/account` — whose client you are: the trainer's card as they wrote it for you, and the doors to your own details, package, payments and messages. */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await requirePortalSession();
  if (!session.ok) return null;
  const { me } = session;
  const t = me.trainer;
  const first = (t?.name ?? 'Your trainer').split(' ')[0];

  return (
    <div className="body">
      <div className="pl">
        {t && (
          <Card>
            <Card.Body>
              <div className="pth__who">
                <Avatar name={t.name} size="lg" />
                <div>
                  <p className="pl__k">Your trainer</p>
                  <h1 className="pl__h">{t.name}</h1>
                  {t.headline && <p className="pl__s">{t.headline}</p>}
                </div>
              </div>
              {t.bio && <p className="pl__q">{t.bio}</p>}
              <div className="pl__tags">
                {t.specialities?.slice(0, 5).map((s) => <Tag key={s}>{s.replace(/_/g, ' ')}</Tag>)}
              </div>
              <div className="pwk__actions">
                {t.whatsappUrl && <Button variant="primary" href={t.whatsappUrl} target="_blank" rel="noopener noreferrer">Message {first} on WhatsApp</Button>}
                {t.instagramHandle && <Button variant="ghost" href={`https://www.instagram.com/${t.instagramHandle.replace(/^@/, '')}/`} target="_blank" rel="noopener noreferrer">Instagram</Button>}
              </div>
            </Card.Body>
          </Card>
        )}

        <Card>
          <Card.Head title="Yours" level={3} />
          <Card.Body>
            <ul className="pl__list">
              <li className="pl__row"><Link href="/me/details" className="pl__t">Your details</Link><span className="pl__s">Name, goal, height, time zone</span></li>
              <li className="pl__row"><Link href="/me/package" className="pl__t">Your package</Link><span className="pl__s">Sessions left, and until when</span></li>
              {me.moneyVisible && <li className="pl__row"><Link href="/me/payments" className="pl__t">Payments</Link><span className="pl__s">What you’ve paid</span></li>}
              <li className="pl__row"><Link href="/me/inbox" className="pl__t">From {first}</Link><span className="pl__s">Messages and shared notes{me.unreadNotices > 0 ? ` · ${me.unreadNotices} new` : ''}</span></li>
            </ul>
          </Card.Body>
        </Card>
      </div>
    </div>
  );
}
