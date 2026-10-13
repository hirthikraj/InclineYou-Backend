import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Tag } from '@/web-components/ui/Tag';

import { day } from '../plan/format';

export interface PackageWire {
  package: { id: string; name: string; status: string; sessionsTotal?: number; sessionsUsed?: number; sessionsLeft?: number; startsOn?: string; expiresOn?: string; paused: boolean } | null;
  past: { id: string; name: string; status: string; sessionsTotal?: number; startsOn?: string; endedOn?: string }[];
  history?: { at: number; kind: string; sessions?: number; days?: number }[];
}

const KIND: Record<string, (e: { sessions?: number; days?: number }) => string> = {
  session: () => 'A session was used',
  sessions: (e) => `${(e.sessions ?? 0) > 0 ? 'Sessions added' : 'Sessions taken off'}: ${Math.abs(e.sessions ?? 0)}`,
  extend: (e) => `Extended by ${e.days} ${e.days === 1 ? 'day' : 'days'}`,
  pause: () => 'Paused',
  resume: () => 'Resumed',
  due_date: () => 'Payment date changed',
};

/** Sessions left, and until when. The number a client wants and nothing that reads as a bill: the price is behind the trainer's switch and is not on this page. */
export function PackageView({ pack, trainerFirstName, moneyVisible }: { pack: PackageWire; trainerFirstName: string; moneyVisible: boolean }) {
  const p = pack.package;
  return (
    <div className="pl">
      {!p ? (
        <EmptyState title="No package right now" body={`When ${trainerFirstName} sets one up, the sessions you have left and the date it runs to appear here.`} />
      ) : (
        <Card className="ppg__hero">
          <Card.Body>
            <p className="pl__k">{p.paused ? 'Paused' : 'Your package'}</p>
            <h1 className="pl__h">{p.name}</h1>
            {p.sessionsLeft !== undefined && p.sessionsTotal !== undefined && (
              <p className="pth__h2">{p.sessionsLeft} <span>of {p.sessionsTotal} sessions left</span></p>
            )}
            <p className="pl__s">
              {p.sessionsUsed !== undefined ? `${p.sessionsUsed} used` : ''}
              {p.startsOn ? ` · started ${day(p.startsOn, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
              {p.expiresOn ? ` · runs to ${day(p.expiresOn, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
            </p>
            {p.paused && <p className="pl__s">It’s on hold, so it isn’t counting down.</p>}
          </Card.Body>
        </Card>
      )}

      {pack.history && pack.history.length > 0 && (
        <Card>
          <Card.Head title="What moved it" level={3} />
          <Card.Body>
            <ul className="pl__list">{pack.history.slice(0, 6).map((e, i) => <HistoryRow key={`${e.at}-${i}`} e={e} />)}</ul>
            {pack.history.length > 6 && (
              <details className="pwk__steps">
                <summary>Earlier ({pack.history.length - 6})</summary>
                <ul className="pl__list" style={{ marginTop: 10 }}>{pack.history.slice(6).map((e, i) => <HistoryRow key={`${e.at}-${i}`} e={e} />)}</ul>
              </details>
            )}
          </Card.Body>
        </Card>
      )}

      {pack.past.length > 0 && (
        <Card>
          <Card.Head title="Earlier packages" level={3} />
          <Card.Body>
            <ul className="pl__list">
              {pack.past.map((x) => (
                <li key={x.id} className="pl__row">
                  <div>
                    <p className="pl__t">{x.name}</p>
                    <p className="pl__s">{x.sessionsTotal !== undefined ? `${x.sessionsTotal} sessions` : ''}{x.endedOn ? ` · ended ${day(x.endedOn, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</p>
                  </div>
                  <Tag>{x.status === 'completed' ? 'Completed' : x.status === 'expired' ? 'Ran out of time' : x.status === 'cancelled' ? 'Cancelled' : x.status === 'refunded' ? 'Refunded' : x.status}</Tag>
                </li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      )}

      {moneyVisible && <div><Button variant="secondary" href="/me/payments">What I’ve paid</Button></div>}
    </div>
  );
}

function HistoryRow({ e }: { e: { at: number; kind: string; sessions?: number; days?: number } }) {
  return (
    <li className="pl__row">
      <span className="pl__t" style={{ fontWeight: 500 }}>{(KIND[e.kind] ?? (() => 'Updated'))(e)}</span>
      <span className="pl__s">{new Date(e.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</span>
    </li>
  );
}
