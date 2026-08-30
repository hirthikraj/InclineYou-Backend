'use client';

/*
 * A client component only because of `<TopBar onSearch>`.
 *
 * This page is otherwise pure presentation — it takes `data` and renders it —
 * but `TopBar` is a client component and `onSearch` is a function prop, which a
 * server component cannot pass across the boundary. It threw *Event handlers
 * cannot be passed to Client Component props* and the route 500'd. Every other
 * caller of `TopBar` is already a client component; this was the one that was
 * not.
 */
import Link from 'next/link';

import type { ConsoleData } from '@/lib/log/api';
import { PLATE_STEP_KG, stampDate, trim1 } from '@/lib/log/log';
import { TopBar } from '@/components/shell/TopBar';
import { FinishLog } from './FinishLog';
import { Back } from './Icons';

/**
 * FRAME 2a — FOUR TOP SETS, FOUR DIFFERENT ANSWERS.
 *
 * `Verdict` has five members — `record | quiet | matched | first | none` — and
 * the page this replaces drew one badge, **PR**. Missing were the three that are
 * the whole design of the badge: a real record deliberately NOT announced, a top
 * set that MATCHED and therefore is not a record, and a FIRST log, which can
 * never be one.
 *
 * **The two that are not records get nothing**, because a badge that appears for
 * matching is a badge that means nothing. Gold is cheap to hand out and
 * worthless once it is.
 *
 * ── AND THE THRESHOLD IS ON THE SCREEN ──────────────────────────────────────
 *
 * A trainer who forwards five records a week has taught a client that records
 * mean nothing. The fourth test — the plate — decides whether the client's phone
 * buzzes rather than whether the record is real, and it is stated here rather
 * than hidden in a help page, because **a threshold nobody can see is a
 * threshold nobody trusts.**
 *
 * Its own route, because a trainer opens it after the session and wants to be
 * able to link to it.
 */
export function Bests({ data }: { data: ConsoleData }) {
  const { view } = data;
  const cells = view.bests;
  const real = cells.filter((b) => b.verdict === 'record' || b.verdict === 'quiet').length;
  const loud = cells.filter((b) => b.verdict === 'record').length;

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
                <Link href={`/sessions/${data.routeId}/log`}>{view.clientName}</Link>
                <i aria-hidden="true">/</i>
                <b>Top sets</b>
              </nav>
              <h1 className="ph__t">
                {view.clientName}
                {view.planHead ? <> &middot; {view.planHead}</> : null}
              </h1>
              <p className="ph__sub">
                {stampDate(view.sessionDate)} &middot;{' '}
                {view.endedAt ? 'logged and closed' : 'logged, not yet closed'}
              </p>
            </div>
            <div className="ph__acts">
              <Link className="btn btn--secondary" href={`/sessions/${data.routeId}/log`}>
                <Back /> Back to the log
              </Link>
              <FinishLog routeId={data.routeId} workoutId={data.view.workoutId} />
            </div>
          </div>
        </div>

        <div className="body">
          <div className="strip">
            <div>
              <b>{view.setsLogged}<span className="ink3" style={{ fontSize: 14 }}>/{view.setsPlanned}</span></b>
              <i>sets logged</i>
            </div>
            <div>
              <b>{view.volumeKg.toLocaleString('en-IN')}</b>
              <i>kg moved</i>
            </div>
            <div>
              <b>
                {view.minutes === null ? '—' : view.minutes}
                {view.minutes === null ? null : (
                  <span className="ink3" style={{ fontSize: 14 }}> min</span>
                )}
              </b>
              <i>{view.minutes === null ? 'left open' : 'on the floor'}</i>
            </div>
            <div>
              <b>
                {data.pack
                  ? <>{data.pack.remaining}<span className="ink3" style={{ fontSize: 14 }}>/{data.pack.total}</span></>
                  : '—'}
              </b>
              <i>{data.pack ? 'pack, unchanged' : 'no session pack'}</i>
            </div>
          </div>

          <h2 className="micro" style={{ margin: '14px 0 8px' }}>
            {cells.length} top set{cells.length === 1 ? '' : 's'} checked &middot; {real} genuine
            record{real === 1 ? '' : 's'} &middot; {loud} worth sending
          </h2>

          {cells.length ? (
            <div
              className="vrd"
              style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, cells.length))},minmax(0,1fr))` }}
            >
              {cells.map((b) => (
                <div
                  className={`vrd__c${b.verdict === 'record' ? ' vrd__c--gold' : b.verdict === 'quiet' ? ' vrd__c--quiet' : ''}`}
                  key={b.exerciseId}
                >
                  <p className="vrd__k">
                    {b.verdict === 'record'
                      ? 'A RECORD'
                      : b.verdict === 'quiet'
                        ? 'A RECORD, QUIETLY'
                        : b.verdict === 'matched'
                          ? 'MATCHED'
                          : 'HER FIRST'}
                  </p>
                  <p className="small" style={{ color: 'var(--tx-ink-2)' }}>{b.name}</p>
                  <p className="vrd__v">{b.value}</p>
                  <p className="small mono" style={{ fontSize: 11 }}>
                    {b.was}
                    {b.delta ? <> &middot; <b className="ink">{b.delta}</b></> : null}
                  </p>
                  <p className="vrd__b">{b.why}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="small ink3">
              Nothing logged yet, so there is nothing to check. A verdict needs a top set.
            </p>
          )}

          <div className="wk2 wk2--wide" style={{ marginTop: 14 }}>
            <div className="card">
              <div className="card__hd">
                <h2 className="card__t">The three tests, in order</h2>
              </div>
              <div className="card__b card__b--flush">
                <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <td style={{ width: 44 }} className="mono">1</td>
                      <td className="strong">There has to be an earlier session</td>
                      <td className="wrap">
                        A first log is never a record. It is the number to beat, not a number
                        beaten.
                      </td>
                    </tr>
                    <tr>
                      <td className="mono">2</td>
                      <td className="strong">It has to beat the old number</td>
                      <td className="wrap">
                        Matching is not beating. A top set that equals the old best gets nothing at
                        all.
                      </td>
                    </tr>
                    <tr>
                      <td className="mono">3</td>
                      <td className="strong">Only the top set is checked</td>
                      <td className="wrap">
                        So a warm-up can never make one — and the gold sits on the heaviest set, not
                        on the last set she did.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="why why--warn">
                <p className="why__k">And then the plate</p>
                <p>
                  A fourth test, and it decides whether her phone buzzes rather than whether the
                  record is real: a jump smaller than the <b>smallest plate in the room</b> is not a
                  session&rsquo;s worth of progress, it is a typo or a half plate.{' '}
                  <code>plateStepKg</code> is {trim1(PLATE_STEP_KG)} kg here and{' '}
                  <b>1.25 in some gyms</b>, so it is per-gym — the one number on this screen that
                  changes when the trainer changes building.
                </p>
              </div>
              <p className="small" style={{ marginTop: 12 }}>
                A trainer who forwards five records a week has taught a client that records mean
                nothing. Of {cells.length} candidate{cells.length === 1 ? '' : 's'} today,{' '}
                <b>{loud}</b> {loud === 1 ? 'is' : 'are'} worth saying out loud — and the threshold
                is stated on the screen rather than hidden in a help page, because a threshold
                nobody can see is a threshold nobody trusts.
              </p>
              <p className="small" style={{ marginTop: 10 }}>
                No screen lets a trainer say which gym they are in yet, so this is the default and it
                is written down rather than assumed.
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
