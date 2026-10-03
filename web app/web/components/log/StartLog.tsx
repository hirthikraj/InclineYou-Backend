'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { startLog } from '@/lib/sessionlog/actions';
import { isoDay, stampDate } from '@/lib/log/log';
import { TopBar } from '@/components/shell/TopBar';
import { Play } from '@/components/shell/Icons';
import { Button } from '@/web-components/ui/Button';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { Why } from '@/web-components/ui/Why';

/**
 * A BOOKING WITH NO LOG BEHIND IT, WHICH IS NOT AN ERROR.
 *
 * Every session in the diary is in this state until somebody starts it, so a
 * 404 here would be the ordinary case rendered as a bug. `/sessions/:id/log` is
 * a place; arriving before the log exists just means the place is empty.
 *
 * **Starting one does not move the pack.** `POST /v1/sessions/{id}/start` and
 * never `POST /v1/sessions/{id}/done` — the second closes the log AND
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
      <TopBar
        crumb="Sessions"
        /* Six screens in this flow pass the crumb *Sessions* — it names the
           flow, and it is the wrong thing for a 390px header to say when the
           one fact the trainer needs at the top is whose session this is.
           `screenTitle` would derive *Sessions* from it, so the title is
           stated. The `<h1>` under it keeps the plan head the bar has no room
           for, which is why these screens are not `.ph--named`. */
        title={clientName}
      />
      <main className="main" id="main-content">
        <PageHeader
          title={<>{clientName}
            {session.dayLabel ? <> &middot; {session.dayLabel}</> : null}</>}
          sub={<>{stampDate(isoDay(session.scheduledAt))} {time} &middot; booked, not started</>}
          crumbs={<nav className="crumbs" aria-label="Breadcrumb">
              <Link href="/programs/workouts">Workouts</Link>
              <i aria-hidden="true">/</i>
              <b>{clientName}</b>
            </nav>}
        />

        <div className="body">
          <div className="wk2 wk2--pick" style={{ maxWidth: 1040 }}>
            <div>
              <div className="empty" style={{ minHeight: 0, padding: '34px 0 26px', alignItems: 'flex-start', textAlign: 'left' }}>
                <p className="empty__t">Nothing logged against this session yet</p>
                <p className="empty__b" style={{ maxWidth: '48ch' }}>
                  The booking is there and the log is not, which is where every session sits until
                  somebody starts it. Starting one seeds the grid from{' '}
                  {programId
                    ? `${clientName.split(' ')[0]}’s program`
                    : `nothing — ${clientName.split(' ')[0]} has no live plan`}
                  , and writes a set the moment you tick one.
                </p>
              </div>

              <div className="row" style={{ gap: 9, flexWrap: 'wrap' }}>
                <Button variant="primary" size="lg" disabled={busy} onClick={begin}>
                  <Play size={16} /> {busy ? 'Starting…' : 'Start the log'}
                </Button>
                <Button href={`/sessions/${session.id}`} variant="secondary" size="lg">
                  The booking
                </Button>
              </div>

              {message ? (
                <p className="msg msg--err" role="alert" style={{ marginTop: 12 }}>{message}</p>
              ) : null}
            </div>

            <Why heading="Starting a log does not move the pack">
              <p>
                A pack moves on <i>done</i> or <i>no-show</i>, never on <i>booked</i> — and the tap
                that moves it is on the finish screen, after the sets are in. This creates the log
                and nothing else.
              </p>
            </Why>
          </div>
        </div>
      </main>
    </>
  );
}
