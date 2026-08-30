'use client';

import Link from 'next/link';

import { ProgressBody, ProgressRanges, useProgressQuery } from '@/components/log/Progress';
import type { ProgressView } from '@/lib/log/log';
import type { ClientBodyMetricWire } from '@/lib/clients/client-api';

import { Blank, dateStr, longDateStr } from './shared';

/**
 * PROGRESS — TWO SCREENS THAT WERE NEVER ON THE SAME PAGE.
 *
 * The workout console's `/clients/:id/progress` (frame 4b) had the volume bars,
 * the top-set sequence, the record count and bodyweight. Body metrics — every
 * measurement, not just weight — were behind a ghost button beside the tab strip
 * that went nowhere. They are the same question asked about two kinds of number,
 * and a trainer showing a client their eight weeks was opening one and describing
 * the other from memory.
 *
 * So this tab is `ProgressBody` — the console's own component, not a second
 * rendering of it — with the measurement history under it.
 *
 * ── THE FIRST-TO-LATEST ROW IS THE ONE A CLIENT ASKS FOR ────────────────────
 *
 * "Before and after", and it is arithmetic over two rows this screen already
 * has. It is drawn per metric type and only where there are two, because a
 * single measurement has no delta and a `+0.0` against one reading is a claim
 * about a change that was never measured.
 *
 * ── AND THE DELTA HAS NO COLOUR ─────────────────────────────────────────────
 *
 * `Progress.tsx` states the rule for bodyweight and it holds for every row here:
 * the app has **no opinion** about which way a client's numbers should go, and a
 * green arrow would be one. A trainer cutting and a trainer bulking read the same
 * −2.4 kg in opposite directions, and only they know which.
 */

/** `weight` → `Weight`, `body_fat` → `Body fat`. */
function metricLabel(type: string): string {
  const words = type.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** `+2.5` / `−1.2` / null when there is nothing to compare against. */
function delta(from: number, to: number): string | null {
  const d = to - from;
  if (Math.abs(d) < 0.05) return null;
  return `${d > 0 ? '+' : '−'}${trim(Math.abs(d))}`;
}

export function ProgressTab({
  clientId,
  progress,
  bodyMetrics,
}: {
  clientId: string;
  progress: ProgressView | null;
  bodyMetrics: ClientBodyMetricWire[];
}) {
  const go = useProgressQuery(clientId);

  /* Group by type, newest first inside each group. */
  const byType = new Map<string, ClientBodyMetricWire[]>();
  for (const m of [...bodyMetrics].sort((a, b) => b.recordedAt - a.recordedAt)) {
    const list = byType.get(m.metricType);
    if (list) list.push(m);
    else byType.set(m.metricType, [m]);
  }

  /* Weight first — it is the one a client asks about — then alphabetical, so the
     order does not shuffle as measurements are added. */
  const types = [...byType.keys()].sort((a, b) => {
    if (a === 'weight') return -1;
    if (b === 'weight') return 1;
    return a.localeCompare(b);
  });

  const recent = [...bodyMetrics].sort((a, b) => b.recordedAt - a.recordedAt).slice(0, 12);

  return (
    <>
      {/* ── The tools row is drawn WHETHER OR NOT there is anything to chart, and
             that is the change that matters: *Progress report* is the one action
             on this tab, and a client with no set logs is exactly the client
             whose measurements and attendance still make a card worth sending.
             Hanging it off `progress` would have hidden it from the people it is
             most useful for. ── */}
      <div className="tools" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        {progress && <ProgressRanges range={progress.range} go={go} />}
        <span style={{ flex: 1 }} />
        {progress && (
          <span className="small" style={{ color: 'var(--tx-ink-3)' }}>
            {progress.weeks.length} week{progress.weeks.length === 1 ? '' : 's'} ·{' '}
            {progress.exerciseCount} exercise{progress.exerciseCount === 1 ? '' : 's'}
          </span>
        )}
        {/* The charts above are the trainer's reading of this client. This is the
            CLIENT's, built to leave the building — a 12-week card with the
            sessions, the measurements and the lifts that moved, and a one-tap
            share. It sits here rather than in the header because this tab is
            where a trainer is standing when they think of sending one, and the
            header's four buttons already do not fit beside a name. */}
        <Link className="btn btn--sm btn--secondary" href={`/clients/${clientId}/report`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
            <path d="M12 15V4" /><path d="M8 8l4-4 4 4" />
          </svg>
          Progress report
        </Link>
      </div>

      {progress ? (
        /* `.cfprog` scopes the narrow-window rule for `.stats--4` — see app.css.
           The console's own route keeps whatever it has; a pass about the client
           file does not get to restyle a screen it did not open. */
        <div className="cfprog">
          <ProgressBody data={progress} go={go} />
        </div>
      ) : (
        <div className="card">
          <div className="card__b">
            <Blank>Nothing logged yet — a chart needs a set behind it</Blank>
          </div>
        </div>
      )}

      {/* ── measurements ── */}
      <div
        className="cfgrid"
        style={{
          display: 'grid',
          gap: 12,
          alignItems: 'start',
          gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)',
          marginTop: 12,
        }}
      >
        <div className="card">
          <div className="card__hd">
            <h2 className="card__t">Measurements</h2>
            <span className="small mono" style={{ marginLeft: 'auto' }}>
              first → latest
            </span>
          </div>
          <div className="card__b card__b--flush">
            {types.length === 0 ? (
              <Blank>Nothing measured yet</Blank>
            ) : (
              <table className="tbl cftbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {types.map((type) => {
                    const rows = byType.get(type)!;
                    const latest = rows[0];
                    const first = rows[rows.length - 1];
                    const change = rows.length > 1 ? delta(first.value, latest.value) : null;
                    return (
                      <tr key={type}>
                        <td className="strong" style={{ width: 130 }}>
                          {metricLabel(type)}
                        </td>
                        <td className="mono" style={{ color: 'var(--tx-ink-3)', width: 120 }}>
                          {rows.length > 1 ? (
                            <>
                              {trim(first.value)} → <b className="ink">{trim(latest.value)}</b>
                            </>
                          ) : (
                            <b className="ink">{trim(latest.value)}</b>
                          )}{' '}
                          {latest.unit}
                        </td>
                        <td className="mono" style={{ width: 76 }}>
                          {change ?? <span className="ink3">—</span>}
                        </td>
                        <td style={{ color: 'var(--tx-ink-3)' }}>
                          {rows.length > 1
                            ? `${rows.length} readings · since ${dateStr(first.recordedAt)}`
                            : `one reading · ${dateStr(latest.recordedAt)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {types.length > 0 && (
            <div className="card__b" style={{ borderTop: '1px solid var(--tx-line)' }}>
              <p className="small">
                No colour and no arrow on the change, for the reason the bodyweight card
                gives: the app has <b>no opinion</b> about which way a client&rsquo;s
                numbers should go, and a green arrow would be one.
              </p>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card__hd">
            <h2 className="card__t">Recently recorded</h2>
          </div>
          <div className="card__b card__b--flush">
            {recent.length === 0 ? (
              <Blank>Nothing recorded</Blank>
            ) : (
              <table className="tbl cftbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {recent.map((m) => (
                    <tr key={m.id}>
                      <td className="mono" style={{ width: 104, color: 'var(--tx-ink-3)' }}>
                        {longDateStr(m.recordedAt)}
                      </td>
                      <td className="strong">{metricLabel(m.metricType)}</td>
                      <td className="mono tnum" style={{ textAlign: 'right' }}>
                        {trim(m.value)} <span className="ink3">{m.unit}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {bodyMetrics.length > recent.length && (
            <div className="card__b" style={{ borderTop: '1px solid var(--tx-line)' }}>
              <p className="small" style={{ color: 'var(--tx-ink-3)' }}>
                The last {recent.length} of {bodyMetrics.length}. The table beside this one
                spans all of them.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
