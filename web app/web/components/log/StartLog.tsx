'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { startLog } from '@/lib/log/actions';
import { isoDay, stampDate } from '@/lib/log/log';
import { TopBar } from '@/components/shell/TopBar';
import { Play } from '@/components/shell/Icons';

/**
 * A BOOKING WITH NO LOG BEHIND IT, WHICH IS NOT AN ERROR.
 *
 * Every session in the diary is in this state until somebody starts it, so a
 * 404 here would be the ordinary case rendered as a bug. `/sessions/:id/log` is
 * a place; arriving before the log exists just means the place is empty.
 *
 * **Starting one does not move her pack.** `POST /v1/workouts` and never
 * `POST /v1/sessions/{id}/done` — the second creates the same log AND
 * decrements the pack, and §09's rule is that a pack moves on *done* or
 * *no-show*, never on *booked*. The tap that moves it is on the finish screen,
 * after the sets are in.
 */
export function StartLog({
  routeId,
  session,
  clientName,
  programId,
}: {
  routeId: string;
  session: { id: string; clientId: string; scheduledAt: number; dayLabel: string | null; status: string };
  clientName: string;
  programId: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const at = new Date(session.scheduledAt);
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;

  const begin = () => {
    setBusy(true);
    setMessage(null);
    startTransition(async () => {
      const result = await startLog({
        clientId: session.clientId,
        sessionId: session.id,
        programId,
        sessionDate: isoDay(session.scheduledAt),
      });
      setBusy(false);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      router.replace(`/sessions/${routeId}/log`);
      router.refresh();
    });
  };

  return (
    <>
      <TopBar crumb="Sessions" onSearch={() => {}} />
      <main className="main" id="main-content">
        <div className="ph">
          <div className="ph__row">
            <div>
              <nav className="crumbs" aria-label="Breadcrumb">
                <Link href="/sessions">Sessions</Link>
                <i aria-hidden="true">/</i>
                <b>{clientName}</b>
              </nav>
              <h1 className="ph__t">
                {clientName}
                {session.dayLabel ? <> &middot; {session.dayLabel}</> : null}
              </h1>
              <p className="ph__sub">
                {stampDate(isoDay(session.scheduledAt))} {time} &middot; booked, not started
              </p>
            </div>
          </div>
        </div>

        <div className="body">
          <div className="wk2 wk2--pick" style={{ maxWidth: 1040 }}>
            <div>
              <div className="empty" style={{ minHeight: 0, padding: '34px 0 26px', alignItems: 'flex-start', textAlign: 'left' }}>
                <p className="empty__t">Nothing logged against this session yet</p>
                <p className="empty__b" style={{ maxWidth: '48ch' }}>
                  The booking is there and the log is not, which is where every session sits until
                  somebody starts it. Starting one seeds the grid from{' '}
                  {programId ? 'her program' : 'nothing — she has no live plan'}, and writes a set
                  the moment you tick one.
                </p>
              </div>

              <div className="row" style={{ gap: 9, flexWrap: 'wrap' }}>
                <button className="btn btn--primary btn--lg" type="button" disabled={busy} onClick={begin}>
                  <Play size={16} /> {busy ? 'Starting…' : 'Start the log'}
                </button>
                <Link className="btn btn--secondary btn--lg" href={`/sessions/${session.id}`}>
                  The booking
                </Link>
              </div>

              {message ? (
                <p className="msg msg--err" role="alert" style={{ marginTop: 12 }}>{message}</p>
              ) : null}
            </div>

            <div className="why">
              <p className="why__k">Starting a log does not move her pack</p>
              <p>
                A pack moves on <i>done</i> or <i>no-show</i>, never on <i>booked</i> — and the tap
                that moves it is on the finish screen, after the sets are in. This creates the log
                and nothing else.
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
