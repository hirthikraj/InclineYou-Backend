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

import type { ConsoleDataX } from '@/lib/sessionlog/api';
import { PLATE_STEP_KG, floorTime, stampDate, trim1 } from '@/lib/log/log';
import { TopBar } from '@/components/shell/TopBar';
import { FinishLog } from './FinishLog';
import { Back } from './Icons';
import { Button } from '@/web-components/ui/Button';
import { Strip } from '@/web-components/ui/Strip';
import { Card } from '@/web-components/ui/Card';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { Table, Row } from '@/web-components/ui/Table';
import { Why } from '@/web-components/ui/Why';

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
export function Bests({ data }: { data: ConsoleDataX }) {
  const { view } = data;
  const cells = view.bests;
  const real = cells.filter((b) => b.verdict === 'record' || b.verdict === 'quiet').length;
  const loud = cells.filter((b) => b.verdict === 'record').length;

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
        title={view.clientName}
      />
      <main className="main" id="main-content">
        <PageHeader
          title={<>{view.clientName}
            {view.planHead ? <> &middot; {view.planHead}</> : null}</>}
          sub={<>{stampDate(view.sessionDate)} &middot;{' '}
            {view.endedAt ? 'logged and closed' : 'logged, not yet closed'}</>}
          crumbs={<nav className="crumbs" aria-label="Breadcrumb">
              <Link href="/programs/workouts">Workouts</Link>
              <i aria-hidden="true">/</i>
              <Link href={`/sessions/${data.routeId}/log`}>{view.clientName}</Link>
              <i aria-hidden="true">/</i>
              <b>Top sets</b>
            </nav>}
          actions={<><Button href={`/sessions/${data.routeId}/log`} variant="secondary">
              <Back /> Back to the log
            </Button>
            <FinishLog routeId={data.routeId} workoutId={data.view.workoutId} /></>}
        />

        <div className="body">
          {/* The console's own strip, and it has to be the SAME four cells:
              this page is one click from it and a figure that changed on the
              way would read as a different session. `c-strip` plus `floorTime`
              is what makes that structural rather than a promise — it was two
              copies of the markup, and the minutes were formatted twice. */}
          <Strip>
            <Strip.Cell value={view.setsLogged} of={view.setsPlanned} label="sets logged" />
            <Strip.Cell value={view.volumeKg.toLocaleString('en-IN')} unit="kg" label="moved" />
            {view.minutes === null ? (
              <Strip.Cell value="—" label="left open" />
            ) : (
              <Strip.Cell {...floorTime(view.minutes)} label="on the floor" />
            )}
            {data.pack ? (
              <Strip.Cell value={data.pack.remaining} of={data.pack.total} label="pack, unchanged" />
            ) : (
              <Strip.Cell value="—" label="no session pack" />
            )}
          </Strip>

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
            <Card
              title="The three tests, in order"
              flush
            >
              {/* No `columns`: the three tests are read in order, not compared
                  down a column, so there is no header row to invent. */}
              <Table
                caption="The three tests a top set has to pass to count as a record"
                style={{ width: '100%', borderCollapse: 'collapse' }}
              >
                <Row
                  cells={[
                    { key: 'n', content: '1', className: 'mono', style: { width: 44 } },
                    { key: 'test', content: 'There has to be an earlier session', className: 'strong' },
                    {
                      key: 'why',
                      className: 'wrap',
                      content: (
                        <>
                          A first log is never a record. It is the number to beat, not a number
                          beaten.
                        </>
                      ),
                    },
                  ]}
                />
                <Row
                  cells={[
                    { key: 'n', content: '2', className: 'mono' },
                    { key: 'test', content: 'It has to beat the old number', className: 'strong' },
                    {
                      key: 'why',
                      className: 'wrap',
                      content: (
                        <>
                          Matching is not beating. A top set that equals the old best gets nothing at
                          all.
                        </>
                      ),
                    },
                  ]}
                />
                <Row
                  cells={[
                    { key: 'n', content: '3', className: 'mono' },
                    { key: 'test', content: 'Only the top set is checked', className: 'strong' },
                    {
                      key: 'why',
                      className: 'wrap',
                      content: (
                        <>
                          So a warm-up can never make one — and the gold sits on the heaviest set, not
                          on the last set they did.
                        </>
                      ),
                    },
                  ]}
                />
              </Table>
            </Card>

            <div>
              <Why heading="And then the plate" tone="warn">
                <p>
                  A fourth test, and it decides whether the client’s phone buzzes rather than whether the
                  record is real: a jump smaller than the <b>smallest plate in the room</b> is not a
                  session&rsquo;s worth of progress, it is a typo or a half plate.{' '}
                  <code>plateStepKg</code> is {trim1(PLATE_STEP_KG)} kg here and{' '}
                  <b>1.25 in some gyms</b>, so it is per-gym — the one number on this screen that
                  changes when the trainer changes building.
                </p>
              </Why>
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
