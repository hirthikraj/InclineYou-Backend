'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { startLog } from '@/lib/log/actions';
import { isoDay, type PickRow, type PickView } from '@/lib/log/log';
import { TopBar } from '@/components/shell/TopBar';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { Why } from '@/web-components/ui/Why';

/**
 * FRAME 5a — WHO IS THIS FOR?
 *
 * One question, asked once. Not what kind of workout, not which program, not
 * when — all three are answerable from **who**, and asking is how a two-tap
 * action becomes a five-tap one.
 *
 * ── THREE GROUPS, AND THE THIRD IS THE FINDING ──────────────────────────────
 *
 * Every logger in the teardown assumes a workout belongs to a booking or a saved
 * routine. **ABC Trainerize is the only one of them that lets a trainer log on
 * the web at all, and it requires the session to be on the client's calendar
 * first.** In a gym where the trainer is on the floor, a client turning up on a
 * day they do not normally train is a Tuesday — and logging is allowed to
 * happen before programming exists. Before booking, too.
 *
 * ── AND WHY *STILL OPEN* IS FIRST ───────────────────────────────────────────
 *
 * A trainer who logs four clients a morning has logs on the go, and coming back
 * to one is the commonest reason to press this at all. Nothing is started from
 * that group — it goes straight back in, at the set it was left on. Two logs
 * open at once is a supported state, not a warning: one phone, one desk, four
 * clients between six and nine.
 */
export function PickSession({ data }: { data: PickView }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  /**
   * Starting a log, which is not marking a session done.
   *
   * `POST /v1/workouts` and never `POST /v1/sessions/{id}/done` — the second
   * would decrement the client's pack before a single set was typed, which is
   * the rule this whole screen sits under: a pack moves on done or no-show,
   * never on booked.
   */
  const start = (row: PickRow) => {
    setBusy(row.clientId);
    setMessage(null);
    startTransition(async () => {
      const result = await startLog({
        clientId: row.clientId,
        sessionId: row.sessionId,
        programId: null,
        sessionDate: isoDay(Date.now()),
      });
      setBusy(null);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      router.push(`/sessions/${row.sessionId ?? result.id}/log`);
    });
  };

  const group = (
    title: string,
    hint: string,
    rows: PickRow[],
    kind: 'open' | 'start',
  ) =>
    rows.length ? (
      <>
        <h2 className="micro" style={{ margin: '18px 0 7px' }}>
          {title}
          <span
            className="ink3"
            style={{ marginLeft: 8, letterSpacing: 0, textTransform: 'none', fontFamily: 'var(--tx-font)' }}
          >
            {hint}
          </span>
        </h2>
        <div className="lgl">
          {rows.map((row) => (
            <div className="lrow" key={`${kind}-${row.clientId}`}>
              <span className="lrow__m" style={{ flex: 1 }}>
                <span className="lrow__t">{row.name}</span>
                <span className="lrow__s">{row.meta}</span>
              </span>
              {kind === 'open' ? (
                <Button href={row.href} variant="secondary" size="sm">{row.verb}</Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => start(row)}
                >
                  {busy === row.clientId ? 'Starting…' : row.verb}
                </Button>
              )}
            </div>
          ))}
        </div>
      </>
    ) : null;

  const nobody = !data.open.length && !data.booked.length && !data.everybody.length;

  return (
    <>
      {/* No client chosen yet — this screen is where one is. The heading is the
          screen, so the bar says it and the `<h1>` stands down. */}
      <TopBar crumb="Sessions" title="Who is this for?" />
      <main className="main" id="main-content">
        <PageHeader
          title="Who is this for?"
          sub="One question, and it decides everything else"
          crumbs={<nav className="crumbs" aria-label="Breadcrumb">
              <Link href="/programs/workouts">Workouts</Link>
              <i aria-hidden="true">/</i>
              <b>New log</b>
            </nav>}
        />

        <div className="body">
          <div className="wk2 wk2--pick" style={{ maxWidth: 1060 }}>
            <div>
              <p className="note" style={{ marginTop: 0 }}>
                Not what kind of workout, not which program, not when — all three are answerable from{' '}
                <b>who</b>, and asking is how a two-tap action becomes a five-tap one.
              </p>

              {group('Still open', 'logs on the go', data.open, 'open')}
              {group('Booked today', 'opens against the booking', data.booked, 'start')}
              {group('Everybody else', 'no booking needed', data.everybody, 'start')}

              {nobody ? (
                <p className="small ink3" style={{ marginTop: 18 }}>
                  Nobody on the roster yet. <Link href="/clients/new">Add a client</Link> and this
                  screen fills itself.
                </p>
              ) : null}

              {data.everybody.length ? (
                <p className="small" style={{ marginTop: 9 }}>
                  Sorted by who trained most recently, because those are the people most likely to
                  be standing in front of you.
                </p>
              ) : null}

              {message ? (
                <p className="msg msg--err" role="alert" style={{ marginTop: 12 }}>{message}</p>
              ) : null}
            </div>

            <div>
              <Why heading="The third group is the finding">
                <p>
                  Every logger in the teardown assumes a workout belongs to a booking or a saved
                  routine. <b>ABC Trainerize is the only one that lets a trainer log on the web at
                  all, and it requires the session to be on the client&rsquo;s calendar first.</b>{' '}
                  In a gym where the trainer is on the floor, a client turning up on a day they do
                  not normally train is a Tuesday — and logging is allowed to happen before
                  programming exists. Before booking, too.
                </p>
              </Why>

              <Card
                title={<>Why <i>Still open</i> is first</>}
                style={{ marginTop: 12 }}
              >
                <p className="small">
                  A trainer who logs four clients a morning has logs on the go, and coming back to
                  one is the commonest reason to press this at all. Nothing is started from that
                  group — it goes straight back in, at the set it was left on.
                </p>
                <p className="small" style={{ marginTop: 9 }}>
                  Two logs open at once is a supported state, not a warning. One phone, one desk,
                  four clients between six and nine.
                </p>
              </Card>

              <p className="small" style={{ marginTop: 12 }}>
                Starting a log does not touch anybody&rsquo;s pack.{' '}
                <b className="ink">A pack moves on done or no-show, never on booked</b> — the tap
                that moves it is on the finish screen, after the sets are in.
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
